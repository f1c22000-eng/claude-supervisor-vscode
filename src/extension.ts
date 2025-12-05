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
import { ConnectionStatus } from './core/types';

// ============================================
// GLOBAL STATE
// ============================================

let isActive = false;
let sidebarProvider: SidebarProvider;
let interceptorManager: InterceptorManager;
let scopeManager: ScopeManager;
let supervisorHierarchy: SupervisorHierarchy;
let terminalHandler: TerminalHandler;
let statusBarItem: vscode.StatusBarItem;

// ============================================
// ACTIVATION
// ============================================

export async function activate(context: vscode.ExtensionContext) {
    try {
        console.log(`${EXTENSION_NAME} is activating...`);

        // Initialize configuration manager
        configManager.initialize(context);
        console.log('Config manager initialized');

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

        // Connect interceptor to supervisor hierarchy
        interceptorManager.on('thinking_chunk', async (chunk: any) => {
            try {
                const task = scopeManager.getActiveTask();
                const progress = scopeManager.getProgress();

                // === AUTOMATIC SCOPE DETECTION ===
                // Try to extract scope information from the thinking
                if (chunk.content) {
                    const scopeInfo = scopeManager.extractScopeFromMessage(chunk.content);
                    if (scopeInfo && scopeInfo.items && scopeInfo.items.length > 0) {
                        // If we found items and no active task, create one with the items
                        if (!task) {
                            scopeManager.createTask(
                                `Tarefa detectada: ${scopeInfo.items.length} itens`,
                                scopeInfo.items
                            );
                            console.log(`[Scope] Auto-detected task with ${scopeInfo.items.length} items`);
                        } else {
                            // If task exists, add items to it
                            for (const item of scopeInfo.items) {
                                scopeManager.addItem(item);
                            }
                            console.log(`[Scope] Auto-detected ${scopeInfo.items.length} items added to existing task`);
                        }
                    }
                }

                // Run supervisor analysis on the thinking chunk
                const result = await supervisorHierarchy.analyzeThinking(chunk, {
                    originalRequest: task?.title || 'Tarefa não definida',
                    progress: `${progress.percentage}%`
                });

                // Handle alerts
                for (const supervisorResult of result.results) {
                    if (supervisorResult.status === 'alert') {
                        vscode.window.showWarningMessage(
                            `⚠️ ${supervisorResult.supervisorName}: ${supervisorResult.message}`,
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

        // Set up terminal urgent callback
        terminalHandler.onUrgent((message) => {
            vscode.window.showWarningMessage(`URGENTE: ${message}`, 'OK');
        });

        // Initialize sidebar provider
        sidebarProvider = new SidebarProvider(context.extensionUri, {
            interceptor: interceptorManager,
            scope: scopeManager,
            supervisors: supervisorHierarchy,
            api: anthropicClient
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
            const configProvider = new ConfigPanelProvider(context.extensionUri);
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
