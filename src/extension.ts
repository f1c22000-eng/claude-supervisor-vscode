// ============================================
// CLAUDE SUPERVISOR - PONTO DE ENTRADA
// ============================================

import * as vscode from 'vscode';
import { configManager } from './core/config';
import { anthropicClient } from './core/api';
import { COMMANDS, EXTENSION_NAME } from './core/constants';
import { SidebarProvider } from './ui/sidebar-provider';
import { ScopePanelProvider } from './ui/scope-panel';
import { SupervisorsPanelProvider } from './ui/supervisors-panel';
import { MonitorPanelProvider } from './ui/monitor-panel';
import { ConfigPanelProvider } from './ui/config-panel';
import { ImportPanelProvider } from './ui/import-panel';
import { InterceptorManager } from './interceptor';
import { ScopeManager } from './scope';
import { SupervisorHierarchy } from './supervisors/hierarchy';
import { TerminalHandler } from './terminal';
import { ConnectionStatus, AlertStatus, Severity } from './core/types';
import { initPatternLearner } from './core/pattern-learner';
import { HookServer, HooksGenerator } from './hooks';
import { costTracker } from './core/cost-tracker';
import { scopeDetector } from './supervisors';

// ============================================
// GLOBAL STATE
// ============================================

let isActive = false;
let terminalEnvConfigured = false;
let sidebarProvider: SidebarProvider;
let interceptorManager: InterceptorManager;
let scopeManager: ScopeManager;
let supervisorHierarchy: SupervisorHierarchy;
let terminalHandler: TerminalHandler;
let hookServer: HookServer;
let hooksGenerator: HooksGenerator;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel | undefined;

// Helper function to log to output channel
export function log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${message}`;
    console.log(formatted);
    outputChannel?.appendLine(formatted);
}

// ============================================
// ACTIVATION
// ============================================

export async function activate(context: vscode.ExtensionContext) {
    try {
        // Create output channel for debugging
        outputChannel = vscode.window.createOutputChannel('Claude Supervisor');
        context.subscriptions.push(outputChannel);

        log(`${EXTENSION_NAME} is activating...`);

        // Initialize configuration manager
        configManager.initialize(context);
        console.log('Config manager initialized');

        // Auto-configure terminal environment for Claude Code proxy
        await configureTerminalEnvironment();

        // Initialize API client (don't fail if no key)
        let apiInitialized = false;
        try {
            apiInitialized = await anthropicClient.initialize();
            console.log('API client initialized:', apiInitialized);
        } catch (err) {
            console.log('API client init skipped (no key)');
        }

        // Create status bar item
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = COMMANDS.TOGGLE;
        updateStatusBar(ConnectionStatus.DISCONNECTED);
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
        console.log('Status bar created');

        // Initialize managers
        interceptorManager = new InterceptorManager();
        scopeManager = new ScopeManager(context);
        supervisorHierarchy = new SupervisorHierarchy();
        terminalHandler = new TerminalHandler(scopeManager, supervisorHierarchy);

        // Initialize hook server for Claude Code integration
        hookServer = new HookServer();
        hooksGenerator = new HooksGenerator(context.extensionPath, hookServer.getPort());

        // Check for stale session data and prompt user
        const hasOldTask = scopeManager.getActiveTask() !== null;
        const hasOldAlerts = supervisorHierarchy.getAlertHistory().length > 0;
        const hasOldCosts = costTracker.getCosts().session.calls > 0;

        if (hasOldTask || hasOldAlerts || hasOldCosts) {
            // Prompt user to restore or start fresh
            const choice = await vscode.window.showInformationMessage(
                'Dados de sessão anterior detectados. Deseja restaurar ou iniciar nova sessão?',
                'Restaurar',
                'Nova Sessão'
            );

            if (choice === 'Nova Sessão') {
                scopeManager.clearState();
                scopeManager.resetCompletionDetector();
                supervisorHierarchy.clearAlertHistory();
                costTracker.resetSession();
                interceptorManager.resetStats();
                scopeDetector.clearBuffers(); // Clear AI detection buffers
                log('Nova sessão iniciada - dados anteriores limpos');
            } else {
                log('Sessão anterior restaurada');
            }
        }

        // Set up hook server callbacks
        hookServer.setProgressCallback(() => {
            const canComplete = scopeManager.canComplete();
            return {
                percentage: scopeManager.getProgress().percentage,
                pendingItems: canComplete.pendingItems,
                pendingCount: canComplete.pendingCount
            };
        });

        hookServer.setAlertsCallback(() => {
            const history = supervisorHierarchy.getAlertHistory();
            // For now, consider recent alerts (last 5 minutes) as pending
            const recentAlerts = history.filter(a =>
                Date.now() - a.timestamp < 5 * 60 * 1000 && a.status === 'alert'
            );
            return {
                alerts: recentAlerts.map(a => ({
                    id: a.id,
                    supervisorId: a.supervisorName,
                    supervisorName: a.supervisorName,
                    ruleId: '',
                    severity: 'high' as any,
                    message: a.message,
                    thinkingSnippet: a.chunkPreview,
                    status: 'pending' as any,
                    timestamp: a.timestamp
                })),
                criticalCount: recentAlerts.filter(a => a.message.toLowerCase().includes('crítico')).length
            };
        });

        // Hook server events
        hookServer.on('stop_check', (data: any) => {
            log(`🛑 STOP CHECK: allow=${data.response.allow}, message=${data.response.message}`);
        });

        hookServer.on('bypass_requested', () => {
            log('⚠️ BYPASS REQUESTED: Next stop will be allowed');
            vscode.window.showWarningMessage('Bypass ativado: próxima parada será permitida');
        });

        // Initialize pattern learner for automatic behavior pattern learning
        const patternLearner = initPatternLearner(context);
        console.log(`Pattern learner initialized: ${patternLearner.getStats().learnedPatterns} learned patterns`);

        console.log('Managers initialized');

        // Load core behavior supervisors (always active)
        // These detect problematic behaviors like premature conclusions, hardcoded values, etc.
        supervisorHierarchy.setExtensionPath(context.extensionPath);
        await supervisorHierarchy.loadCoreBehaviorSupervisors();
        console.log(`Core behavior supervisors loaded: ${supervisorHierarchy.getAlwaysActiveCount()} always-active`);

        // Load project-specific supervisors for current workspace
        const currentProject = configManager.getCurrentWorkspaceProject();
        if (currentProject) {
            console.log(`[Extension] Detected project for workspace: ${currentProject.name}`);
            // Load project supervisors
            for (const supervisor of currentProject.supervisors) {
                supervisorHierarchy.addSupervisorFromConfig(supervisor);
            }
            console.log(`[Extension] Loaded ${currentProject.supervisors.length} supervisors from project "${currentProject.name}"`);
        } else {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                console.log(`[Extension] No project configured for workspace: ${workspaceFolder.uri.fsPath}`);
            }
        }

        // Listen for workspace folder changes to reload supervisors automatically
        context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                console.log('[Extension] Workspace folders changed');

                // Clear project-specific supervisors (keep core behavior ones)
                supervisorHierarchy.clearAllSupervisors();
                await supervisorHierarchy.loadCoreBehaviorSupervisors();
                console.log('[Extension] Reloaded core behavior supervisors');

                // Check if new workspace has a configured project
                const newProject = configManager.getCurrentWorkspaceProject();
                if (newProject) {
                    console.log(`[Extension] Loading project for new workspace: ${newProject.name}`);
                    for (const supervisor of newProject.supervisors) {
                        supervisorHierarchy.addSupervisorFromConfig(supervisor);
                    }
                    console.log(`[Extension] Loaded ${newProject.supervisors.length} supervisors from project "${newProject.name}"`);
                    vscode.window.showInformationMessage(
                        `Projeto "${newProject.name}" carregado com ${newProject.supervisors.length} supervisores`
                    );
                } else {
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (workspaceFolder) {
                        console.log(`[Extension] No project configured for new workspace: ${workspaceFolder.uri.fsPath}`);
                        vscode.window.showInformationMessage(
                            'Nenhum projeto configurado para este workspace. Clique em "Novo Projeto" para criar.'
                        );
                    }
                }
            })
        );

        // DEBUG: Log proxy events
        interceptorManager.on('proxy_started', (info: any) => {
            log(`🚀 PROXY STARTED: ${info.host}:${info.port}`);
            outputChannel?.show(true); // Show the output channel
        });

        // Log ALL requests that arrive at the proxy
        interceptorManager.on('request_received', (data: any) => {
            log(`📨 REQUEST RECEIVED: ${data.method} ${data.url}`);
        });

        // Log SSE stream events
        interceptorManager.on('sse_stream_start', (data: any) => {
            log(`🌊 SSE STREAM STARTED: request #${data.requestId}`);
        });

        interceptorManager.on('sse_raw_data', (data: any) => {
            log(`📦 SSE DATA: ${data.length} bytes, hasThinking=${data.hasThinking}`);
            // Always show preview to understand what's coming
            log(`   Preview: ${data.preview?.replace(/\n/g, ' ').substring(0, 150)}`);
        });

        interceptorManager.on('thinking_injected', (data: any) => {
            log(`💉 THINKING INJECTED: model=${data.model}, budget=${data.budget} tokens`);
        });

        interceptorManager.on('request_intercepted', (data: any) => {
            log(`📥 REQUEST INTERCEPTED: ${data.data?.substring(0, 100)}...`);
        });

        interceptorManager.on('thinking_delta', (data: any) => {
            log(`💭 THINKING DELTA: ${data.text?.substring(0, 50)}...`);
        });

        interceptorManager.on('message_start', (data: any) => {
            log(`📨 MESSAGE START: ${JSON.stringify(data)}`);
        });

        interceptorManager.on('usage', (data: any) => {
            log(`📊 USAGE: input=${data.inputTokens}, output=${data.outputTokens}`);
        });

        // Connect interceptor to supervisor hierarchy
        interceptorManager.on('thinking_chunk', async (chunk: any) => {
            try {
                // DEBUG: Log when we receive a thinking chunk
                log(`🧠 THINKING CHUNK RECEIVED: ${chunk.content?.substring(0, 100)}...`);

                const task = scopeManager.getActiveTask();
                const progress = scopeManager.getProgress();

                // === AUTOMATIC SCOPE DETECTION (AI-powered) ===
                // Use Haiku to detect scope items from thinking
                if (chunk.content && chunk.content.length > 20) {
                    try {
                        const scopeResult = await scopeDetector.detectScope(chunk.content);

                        if (scopeResult.items.length > 0 && scopeResult.confidence >= 0.5) {
                            log(`🔍 SCOPE DETECTED: ${scopeResult.items.length} items (confidence: ${(scopeResult.confidence * 100).toFixed(0)}%)`);

                            // If no active task, create one with the items
                            if (!task) {
                                scopeManager.createTask(
                                    `Tarefa detectada: ${scopeResult.items.length} itens`,
                                    scopeResult.items
                                );
                                log(`[Scope] Auto-detected task with ${scopeResult.items.length} items`);
                            } else {
                                // If task exists, add new items to it
                                const existingItems = task.items.map(i => i.name.toLowerCase());
                                for (const item of scopeResult.items) {
                                    if (!existingItems.includes(item.toLowerCase())) {
                                        scopeManager.addItem(item);
                                    }
                                }
                                log(`[Scope] Auto-detected items added to existing task`);
                            }

                            // Refresh sidebar
                            sidebarProvider?.refreshAsync();
                        }
                    } catch (scopeError) {
                        console.error('[Scope] Error in AI scope detection:', scopeError);
                    }
                }

                // Run supervisor analysis on the thinking chunk
                const result = await supervisorHierarchy.analyzeThinking(chunk, {
                    originalRequest: task?.title || 'Tarefa não definida',
                    progress: `${progress.percentage}`,
                    hasActiveTask: task !== null
                });

                // Log escalation info
                if (result.escalationCount && result.escalationCount > 0) {
                    log(`🔄 ESCALATION: ${result.escalationCount} análise(s) escalada(s) para Sonnet`);
                }

                // Handle alerts
                for (const supervisorResult of result.results) {
                    if (supervisorResult.status === 'alert') {
                        const confidenceStr = supervisorResult.confidence
                            ? ` [${supervisorResult.confidence}%]`
                            : '';
                        const escalatedStr = supervisorResult.escalated
                            ? ' [Escalado]'
                            : '';

                        vscode.window.showWarningMessage(
                            `⚠️ ${supervisorResult.supervisorName}${confidenceStr}${escalatedStr}: ${supervisorResult.message}`,
                            'Ver Detalhes'
                        ).then(selection => {
                            if (selection === 'Ver Detalhes') {
                                vscode.commands.executeCommand(COMMANDS.OPEN_MONITOR);
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('Error analyzing thinking chunk:', error);
            }
        });
        console.log('Interceptor connected to supervisors');

        // Connect interceptor to scope manager for output processing (auto-completion)
        interceptorManager.on('response_chunk', async (chunk: any) => {
            try {
                log(`📝 RESPONSE CHUNK: ${chunk.content?.substring(0, 80)}...`);

                // Process output to detect completed items using AI
                if (chunk.content && chunk.content.length > 10) {
                    const task = scopeManager.getActiveTask();

                    if (task && task.items.length > 0) {
                        try {
                            // Use AI-powered completion detection
                            const completionResult = await scopeDetector.detectCompletion(
                                chunk.content,
                                task.items
                            );

                            if (completionResult.completedItems.length > 0 || completionResult.isGlobalComplete) {
                                log(`✅ AI COMPLETION DETECTED: ${completionResult.completedItems.length} items, global=${completionResult.isGlobalComplete}`);

                                // Convert to matches and mark items complete
                                const matches = scopeDetector.convertToMatches(completionResult, task.items);

                                for (const match of matches) {
                                    if (match.itemId) {
                                        scopeManager.markItemComplete(match.itemId, match.evidence);
                                    }
                                }

                                if (matches.length > 0) {
                                    log(`✅ MARKED COMPLETE: ${matches.map(m => m.itemName).join(', ')}`);
                                    // Update sidebar
                                    sidebarProvider?.refreshAsync();
                                }
                            }
                        } catch (completionError) {
                            // Log error and continue - don't fallback to regex (which fails anyway)
                            console.error('[Completion] AI detection failed, skipping chunk:', completionError);
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing response chunk:', error);
            }
        });

        interceptorManager.on('response_complete', (data: any) => {
            log(`📋 RESPONSE COMPLETE: ${data.inputTokens} in, ${data.outputTokens} out`);

            // Track costs
            if (data.inputTokens > 0 || data.outputTokens > 0) {
                costTracker.trackCall(
                    data.model || 'claude-3-5-sonnet-20241022',
                    data.inputTokens || 0,
                    data.outputTokens || 0
                );

                const costs = costTracker.getFormattedCosts();
                log(`💰 COSTS: Session=${costs.session}, Today=${costs.daily}`);
            }

            // Log final progress
            const progress = scopeManager.getProgress();
            log(`📊 PROGRESS: ${progress.completed}/${progress.total} (${progress.percentage}%)`);

            // Update sidebar with new costs
            sidebarProvider?.refreshAsync();
        });

        // Cost alerts
        costTracker.on('cost_alert', (data: any) => {
            log(`💸 COST ALERT: ${data.message}`);
            vscode.window.showWarningMessage(`💰 ${data.message}`);
        });

        costTracker.on('cost_limit', (data: any) => {
            log(`🚨 COST LIMIT: ${data.message}`);
            vscode.window.showErrorMessage(`🚨 ${data.message}`);
        });

        console.log('Response processing connected to scope manager');

        // Set up terminal urgent callback
        terminalHandler.onUrgent((message) => {
            vscode.window.showWarningMessage(`URGENTE: ${message}`, 'OK');
        });

        // Initialize sidebar provider
        sidebarProvider = new SidebarProvider(context.extensionUri, {
            interceptor: interceptorManager,
            scope: scopeManager,
            supervisors: supervisorHierarchy,
            api: anthropicClient,
            hooks: hookServer
        });
        console.log('Sidebar provider created');

        // Register sidebar webview
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                'claudeSupervisor.sidebar',
                sidebarProvider
            )
        );
        console.log('Sidebar registered');

        // Register commands
        registerCommands(context);
        console.log('Commands registered');

        // Listen for configuration changes
        context.subscriptions.push(
            configManager.onConfigChange(async () => {
                // Check if API key is still valid
                const apiKey = await configManager.getApiKey();
                const isApiValid = apiKey && apiKey.startsWith('sk-ant-');

                if (!isApiValid) {
                    // API key was removed or invalidated - stop everything
                    console.log('API key removed/invalid - stopping system');
                    anthropicClient.clearClient();

                    if (isActive) {
                        interceptorManager.stop();
                        isActive = false;
                    }
                    updateStatusBar(ConnectionStatus.DISCONNECTED);
                } else if (isActive) {
                    // API key changed but still valid - reinitialize
                    await anthropicClient.initialize();
                }

                // Always refresh sidebar to reflect changes
                sidebarProvider.refreshAsync();
            })
        );

        // Auto-connect if API is ready and autoConnect is enabled
        const config = configManager.getConfig();
        if (config.autoConnect && apiInitialized) {
            console.log('Auto-connecting (API ready and autoConnect enabled)...');
            try {
                await interceptorManager.start();
                isActive = true;
                updateStatusBar(ConnectionStatus.CONNECTED);
                console.log('Auto-connected successfully');
            } catch (error) {
                console.error('Auto-connect failed:', error);
                // Don't show error to user on auto-connect failure
            }
        }

        console.log(`${EXTENSION_NAME} activated successfully`);

    } catch (error) {
        console.error(`${EXTENSION_NAME} activation failed:`, error);
        vscode.window.showErrorMessage(`Claude Supervisor failed to activate: ${error}`);
    }
}

// ============================================
// DEACTIVATION
// ============================================

export function deactivate() {
    console.log(`${EXTENSION_NAME} is deactivating...`);

    if (interceptorManager) {
        interceptorManager.stop();
    }

    if (terminalHandler) {
        terminalHandler.dispose();
    }

    isActive = false;
}

// ============================================
// COMMAND REGISTRATION
// ============================================

function registerCommands(context: vscode.ExtensionContext) {
    // Toggle system
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.TOGGLE, async () => {
            await toggleSystem(!isActive);
        })
    );

    // Open Scope Manager
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.OPEN_SCOPE, () => {
            openPanel(context, 'scope');
        })
    );

    // Open Supervisors
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.OPEN_SUPERVISORS, () => {
            openPanel(context, 'supervisors');
        })
    );

    // Open Monitor
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.OPEN_MONITOR, () => {
            openPanel(context, 'monitor');
        })
    );

    // Open Configuration
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.OPEN_CONFIG, () => {
            openPanel(context, 'config');
        })
    );

    // Add Note
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.ADD_NOTE, async () => {
            const note = await vscode.window.showInputBox({
                prompt: 'Digite a nota (não interrompe o Claude)',
                placeHolder: 'Ex: Adicionar validação de email'
            });

            if (note) {
                scopeManager.addNote(note);
                vscode.window.showInformationMessage(`Nota adicionada: ${note}`);
            }
        })
    );

    // Add Rule
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.ADD_RULE, async () => {
            // Get rule description
            const description = await vscode.window.showInputBox({
                prompt: 'Digite a descrição da regra',
                placeHolder: 'Ex: Sempre usar prepared statements em SQL'
            });

            if (!description) return;

            // Get severity
            const severityOptions = [
                { label: '🔴 Crítica', value: 'critical' },
                { label: '🟠 Alta', value: 'high' },
                { label: '🟡 Média', value: 'medium' },
                { label: '🔵 Baixa', value: 'low' }
            ];

            const severity = await vscode.window.showQuickPick(severityOptions, {
                placeHolder: 'Selecione a severidade'
            });

            if (!severity) return;

            // Get check instruction
            const check = await vscode.window.showInputBox({
                prompt: 'Como verificar esta regra?',
                placeHolder: 'Ex: Verificar concatenação de strings em queries SQL',
                value: `Verificar: ${description}`
            });

            if (!check) return;

            // Create rule
            const ruleId = `custom-${Date.now()}`;
            const newRule = {
                id: ruleId,
                description,
                severity: severity.value as any,
                check,
                enabled: true
            };

            // Add to behavior coordinator's completeness specialist
            const router = supervisorHierarchy.getRouter();
            const behaviorCoord = router.getChildren().find(c => c.getId() === 'coord-behavior');
            if (behaviorCoord) {
                const completenessSpec = behaviorCoord.getChildren().find(c => c.getId() === 'spec-completeness');
                if (completenessSpec) {
                    completenessSpec.addRule(newRule);
                    vscode.window.showInformationMessage(
                        `✅ Regra "${description}" adicionada com severidade ${severity.label}`
                    );
                    return;
                }
            }

            // Fallback: create a custom specialist if structure doesn't exist
            vscode.window.showWarningMessage(
                'Estrutura de supervisores não encontrada. Use o painel de Supervisores para adicionar regras.'
            );
        })
    );

    // Show Scope
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.SHOW_SCOPE, () => {
            const scope = scopeManager.getCurrentScope();
            if (scope) {
                vscode.window.showInformationMessage(
                    `Tarefa: ${scope.title}\nProgresso: ${scope.progress}%\nItens pendentes: ${scope.pendingItems}`
                );
            } else {
                vscode.window.showInformationMessage('Nenhuma tarefa ativa');
            }
        })
    );

    // Import Documents
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.IMPORT_DOCS, () => {
            openPanel(context, 'import');
        })
    );

    // Open Terminal
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.OPEN_TERMINAL, () => {
            terminalHandler.showTerminal();
        })
    );

    // Configure Terminal Environment (manual trigger)
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.CONFIGURE_TERMINAL_ENV, async () => {
            await configureTerminalEnvironment(true); // Force reconfigure
        })
    );

    // Launch Supervised Claude CLI
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.LAUNCH_SUPERVISED_CLAUDE, () => {
            terminalHandler.launchSupervisedClaude();
        })
    );

    // Bypass next stop check (for hooks)
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.BYPASS_STOP, () => {
            hookServer.allowNextStop();
            vscode.window.showInformationMessage('Bypass ativado: próxima parada será permitida');
        })
    );

    // Setup hooks for workspace
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.SETUP_HOOKS, async () => {
            const success = await hooksGenerator.generateHooksConfig();
            if (success) {
                vscode.window.showInformationMessage('Hooks configurados com sucesso! Reinicie o Claude Code para ativar.');
            } else {
                vscode.window.showErrorMessage('Falha ao configurar hooks. Verifique o workspace.');
            }
        })
    );

    // Remove hooks from workspace
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.REMOVE_HOOKS, async () => {
            const success = await hooksGenerator.removeHooksConfig();
            if (success) {
                vscode.window.showInformationMessage('Hooks removidos. Reinicie o Claude Code para desativar.');
            } else {
                vscode.window.showErrorMessage('Falha ao remover hooks.');
            }
        })
    );

    // New session (clear tasks and alerts, keep costs)
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.NEW_SESSION, () => {
            scopeManager.clearState();
            scopeManager.resetCompletionDetector();
            supervisorHierarchy.clearAlertHistory();
            scopeDetector.clearBuffers(); // Clear AI detection buffers
            vscode.window.showInformationMessage('Nova sessão iniciada. Tarefas e alertas limpos.');
            sidebarProvider.refresh();
        })
    );

    // Reset costs (session only, keeps daily)
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.RESET_COSTS, async () => {
            const choice = await vscode.window.showQuickPick(
                ['Resetar Sessão', 'Resetar Tudo (Sessão + Dia)'],
                { placeHolder: 'O que deseja resetar?' }
            );

            if (choice === 'Resetar Sessão') {
                costTracker.resetSession();
                vscode.window.showInformationMessage('Custos da sessão resetados.');
            } else if (choice === 'Resetar Tudo (Sessão + Dia)') {
                costTracker.resetAll();
                vscode.window.showInformationMessage('Todos os custos resetados.');
            }
            sidebarProvider.refresh();
        })
    );
}

// ============================================
// SYSTEM TOGGLE
// ============================================

async function toggleSystem(activate: boolean) {
    if (activate) {
        // Check if API key is configured
        if (!configManager.isApiKeyConfigured()) {
            const result = await vscode.window.showWarningMessage(
                'API Key não configurada. Deseja configurar agora?',
                'Configurar',
                'Cancelar'
            );

            if (result === 'Configurar') {
                vscode.commands.executeCommand(COMMANDS.OPEN_CONFIG);
            }
            return;
        }

        // Initialize API client
        const initialized = await anthropicClient.initialize();
        if (!initialized) {
            vscode.window.showErrorMessage('Falha ao inicializar cliente API');
            return;
        }

        // Start interceptor
        const started = await interceptorManager.start();

        // Start hook server for Claude Code integration
        const hookStarted = await hookServer.start();
        if (hookStarted) {
            // Update hooks generator with actual port
            hooksGenerator.setPort(hookServer.getPort());
            // Generate hooks.json for workspace
            await hooksGenerator.generateHooksConfig();
            console.log(`[Extension] Hook server started on port ${hookServer.getPort()}`);
        }

        if (started) {
            isActive = true;
            updateStatusBar(ConnectionStatus.CONNECTED);
            vscode.window.showInformationMessage('Claude Supervisor ativado');
        } else {
            updateStatusBar(ConnectionStatus.ERROR);
            vscode.window.showWarningMessage(
                'Claude Supervisor ativado, mas não foi possível conectar ao Claude Code'
            );
            isActive = true;
        }
    } else {
        interceptorManager.stop();
        await hookServer.stop();
        isActive = false;
        updateStatusBar(ConnectionStatus.DISCONNECTED);
        vscode.window.showInformationMessage('Claude Supervisor desativado');
    }

    // Update sidebar
    sidebarProvider.refresh();
}

// ============================================
// STATUS BAR
// ============================================

function updateStatusBar(status: ConnectionStatus) {
    switch (status) {
        case ConnectionStatus.CONNECTED:
            statusBarItem.text = '$(brain) Claude Supervisor: ON';
            statusBarItem.backgroundColor = undefined;
            statusBarItem.tooltip = 'Claude Supervisor ativo - Clique para desativar';
            break;
        case ConnectionStatus.CONNECTING:
            statusBarItem.text = '$(sync~spin) Claude Supervisor: Conectando...';
            statusBarItem.backgroundColor = undefined;
            statusBarItem.tooltip = 'Conectando ao Claude Code...';
            break;
        case ConnectionStatus.ERROR:
            statusBarItem.text = '$(warning) Claude Supervisor: Erro';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            statusBarItem.tooltip = 'Erro na conexão - Clique para tentar novamente';
            break;
        default:
            statusBarItem.text = '$(brain) Claude Supervisor: OFF';
            statusBarItem.backgroundColor = undefined;
            statusBarItem.tooltip = 'Claude Supervisor inativo - Clique para ativar';
    }
}

// ============================================
// PANEL MANAGEMENT
// ============================================

function openPanel(context: vscode.ExtensionContext, type: string) {
    const panel = vscode.window.createWebviewPanel(
        `claudeSupervisor.${type}Panel`,
        getPanelTitle(type),
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media')
            ]
        }
    );

    // Set panel content based on type
    switch (type) {
        case 'scope':
            const scopeProvider = new ScopePanelProvider(context.extensionUri, scopeManager);
            panel.webview.html = scopeProvider.getHtml(panel.webview);
            scopeProvider.setPanel(panel);
            break;
        case 'supervisors':
            const supervisorsProvider = new SupervisorsPanelProvider(context.extensionUri, supervisorHierarchy);
            panel.webview.html = supervisorsProvider.getHtml(panel.webview);
            supervisorsProvider.setPanel(panel);
            break;
        case 'monitor':
            const monitorProvider = new MonitorPanelProvider(context.extensionUri, interceptorManager, anthropicClient, supervisorHierarchy);
            panel.webview.html = monitorProvider.getHtml(panel.webview);
            monitorProvider.setPanel(panel);
            break;
        case 'config':
            const configProvider = new ConfigPanelProvider(context.extensionUri, supervisorHierarchy);
            panel.webview.html = configProvider.getHtml(panel.webview);
            configProvider.setPanel(panel);
            break;
        case 'import':
            const importProvider = new ImportPanelProvider(context.extensionUri, supervisorHierarchy);
            panel.webview.html = importProvider.getHtml(panel.webview);
            importProvider.setPanel(panel);
            break;
    }
}

function getPanelTitle(type: string): string {
    switch (type) {
        case 'scope': return 'Gestor de Escopo';
        case 'supervisors': return 'Supervisores';
        case 'monitor': return 'Monitor';
        case 'config': return 'Configuração';
        case 'import': return 'Importar Documentos';
        default: return 'Claude Supervisor';
    }
}

// ============================================
// TERMINAL ENVIRONMENT CONFIGURATION
// ============================================

/**
 * Configures VS Code terminal environment to automatically set
 * ANTHROPIC_BASE_URL so Claude Code uses our proxy without manual setup.
 * @param forceReconfigure If true, reconfigures even if already set (for manual trigger)
 */
async function configureTerminalEnvironment(forceReconfigure: boolean = false): Promise<void> {
    const PROXY_URL = 'http://localhost:8888';
    const ENV_VAR = 'ANTHROPIC_BASE_URL';

    try {
        const config = vscode.workspace.getConfiguration('terminal.integrated.env');

        // Detect OS for the correct setting key
        const platform = process.platform;
        let envKey: string;

        if (platform === 'win32') {
            envKey = 'windows';
        } else if (platform === 'darwin') {
            envKey = 'osx';
        } else {
            envKey = 'linux';
        }

        // Get current environment settings for this platform
        const currentEnv = config.get<Record<string, string>>(envKey) || {};

        // Check if already configured
        if (currentEnv[ENV_VAR] === PROXY_URL && !forceReconfigure) {
            console.log(`[Terminal Env] ${ENV_VAR} already configured for ${envKey}`);
            terminalEnvConfigured = true;
            return;
        }

        // Check if set to a different value (user might have custom config)
        if (currentEnv[ENV_VAR] && currentEnv[ENV_VAR] !== PROXY_URL && !forceReconfigure) {
            console.log(`[Terminal Env] ${ENV_VAR} has custom value: ${currentEnv[ENV_VAR]}`);
            // Don't override user's custom configuration
            return;
        }

        // Add our proxy URL to the environment
        const newEnv = {
            ...currentEnv,
            [ENV_VAR]: PROXY_URL
        };

        // Update configuration globally (user settings)
        await config.update(envKey, newEnv, vscode.ConfigurationTarget.Global);

        terminalEnvConfigured = true;
        console.log(`[Terminal Env] Configured ${ENV_VAR}=${PROXY_URL} for ${envKey}`);

        // Show info message
        const message = forceReconfigure
            ? `Terminal reconfigurado: ${ENV_VAR}=${PROXY_URL}`
            : `Claude Supervisor: Terminal configurado automaticamente. ` +
              `Novos terminais usarão o proxy (${ENV_VAR}=${PROXY_URL}). ` +
              `Reinicie terminais abertos para aplicar.`;

        vscode.window.showInformationMessage(
            message,
            'OK',
            'Abrir Novo Terminal'
        ).then(selection => {
            if (selection === 'Abrir Novo Terminal') {
                vscode.commands.executeCommand('workbench.action.terminal.new');
            }
        });

    } catch (error) {
        console.error('[Terminal Env] Failed to configure:', error);
        if (forceReconfigure) {
            vscode.window.showErrorMessage(`Falha ao configurar terminal: ${error}`);
        }
    }
}
