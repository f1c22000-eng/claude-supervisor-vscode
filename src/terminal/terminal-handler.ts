// ============================================
// CLAUDE SUPERVISOR - TERMINAL COMMAND HANDLER
// ============================================

import * as vscode from 'vscode';
import { ScopeManager } from '../scope';
import { SupervisorHierarchy } from '../supervisors/hierarchy';
import { configurator } from '../core/configurator';

// ============================================
// TYPES
// ============================================

interface TerminalCommand {
    name: string;
    description: string;
    handler: (args: string) => Promise<void>;
}

// ============================================
// TERMINAL HANDLER
// ============================================

export class TerminalHandler {
    private writeEmitter: vscode.EventEmitter<string>;
    private terminal: vscode.Terminal | undefined;
    private scopeManager: ScopeManager;
    private supervisorHierarchy: SupervisorHierarchy;
    private commands: Map<string, TerminalCommand>;
    private inputBuffer: string = '';
    private onUrgentCallback?: (message: string) => void;

    constructor(
        scopeManager: ScopeManager,
        supervisorHierarchy: SupervisorHierarchy
    ) {
        this.scopeManager = scopeManager;
        this.supervisorHierarchy = supervisorHierarchy;
        this.writeEmitter = new vscode.EventEmitter<string>();
        this.commands = new Map();
        this.registerCommands();
    }

    // ========================================
    // TERMINAL CREATION
    // ========================================

    public createTerminal(): vscode.Terminal {
        const pty: vscode.Pseudoterminal = {
            onDidWrite: this.writeEmitter.event,
            open: () => this.handleOpen(),
            close: () => this.handleClose(),
            handleInput: (data: string) => this.handleInput(data)
        };

        this.terminal = vscode.window.createTerminal({
            name: 'Claude Supervisor',
            pty
        });

        return this.terminal;
    }

    public showTerminal() {
        if (!this.terminal) {
            this.createTerminal();
        }
        this.terminal?.show();
    }

    // ========================================
    // TERMINAL EVENT HANDLERS
    // ========================================

    private handleOpen() {
        this.writeLine('\x1b[1;36m╔════════════════════════════════════════╗\x1b[0m');
        this.writeLine('\x1b[1;36m║       CLAUDE SUPERVISOR TERMINAL       ║\x1b[0m');
        this.writeLine('\x1b[1;36m╚════════════════════════════════════════╝\x1b[0m');
        this.writeLine('');
        this.writeLine('Comandos disponíveis:');
        this.writeLine('  \x1b[33m/nota <texto>\x1b[0m    - Adiciona nota sem interromper');
        this.writeLine('  \x1b[33m/escopo\x1b[0m          - Mostra escopo atual');
        this.writeLine('  \x1b[33m/regra <texto>\x1b[0m   - Adiciona regra rápida');
        this.writeLine('  \x1b[33m/urgente <texto>\x1b[0m - Interrompe e injeta mensagem');
        this.writeLine('  \x1b[33m/status\x1b[0m          - Mostra status dos supervisores');
        this.writeLine('  \x1b[33m/help\x1b[0m            - Mostra esta ajuda');
        this.writeLine('  \x1b[33m/clear\x1b[0m           - Limpa o terminal');
        this.writeLine('');
        this.writePrompt();
    }

    private handleClose() {
        this.terminal = undefined;
    }

    private async handleInput(data: string) {
        // Handle special keys
        if (data === '\r') { // Enter
            this.writeEmitter.fire('\r\n');
            await this.processCommand(this.inputBuffer.trim());
            this.inputBuffer = '';
            this.writePrompt();
        } else if (data === '\x7f') { // Backspace
            if (this.inputBuffer.length > 0) {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                this.writeEmitter.fire('\b \b');
            }
        } else if (data === '\x03') { // Ctrl+C
            this.inputBuffer = '';
            this.writeEmitter.fire('^C\r\n');
            this.writePrompt();
        } else if (data >= ' ' || data === '\t') { // Printable characters
            this.inputBuffer += data;
            this.writeEmitter.fire(data);
        }
    }

    // ========================================
    // COMMAND REGISTRATION
    // ========================================

    private registerCommands() {
        // /nota command
        this.commands.set('/nota', {
            name: '/nota',
            description: 'Adiciona nota sem interromper',
            handler: async (args: string) => {
                if (!args) {
                    this.writeError('Uso: /nota <texto da nota>');
                    return;
                }
                this.scopeManager.addNote(args);
                this.writeSuccess(`Nota adicionada: ${args}`);
            }
        });

        // /escopo command
        this.commands.set('/escopo', {
            name: '/escopo',
            description: 'Mostra escopo atual',
            handler: async () => {
                const scope = this.scopeManager.getCurrentScope();
                if (!scope) {
                    this.writeInfo('Nenhuma tarefa ativa');
                    return;
                }

                this.writeLine('');
                this.writeLine('\x1b[1;36m━━━━ ESCOPO ATUAL ━━━━\x1b[0m');
                this.writeLine(`\x1b[1mTarefa:\x1b[0m ${scope.title}`);
                this.writeLine(`\x1b[1mProgresso:\x1b[0m ${this.renderProgressBar(scope.progress)} ${scope.progress}%`);
                this.writeLine(`\x1b[1mItens pendentes:\x1b[0m ${scope.pendingItems}`);

                const task = this.scopeManager.getActiveTask();
                if (task && task.items.length > 0) {
                    this.writeLine('');
                    this.writeLine('\x1b[1mItens:\x1b[0m');
                    task.items.forEach((item: { name: string; status: string }) => {
                        const icon = item.status === 'completed' ? '\x1b[32m✓\x1b[0m' :
                                    item.status === 'in_progress' ? '\x1b[33m●\x1b[0m' : '\x1b[90m○\x1b[0m';
                        this.writeLine(`  ${icon} ${item.name}`);
                    });
                }

                const notes = this.scopeManager.getPendingNotes();
                if (notes.length > 0) {
                    this.writeLine('');
                    this.writeLine('\x1b[1mNotas pendentes:\x1b[0m');
                    notes.forEach((note: { text: string }) => {
                        this.writeLine(`  \x1b[33m•\x1b[0m ${note.text}`);
                    });
                }
            }
        });

        // /regra command
        this.commands.set('/regra', {
            name: '/regra',
            description: 'Adiciona regra rápida',
            handler: async (args: string) => {
                if (!args) {
                    this.writeError('Uso: /regra <descrição da regra>');
                    return;
                }

                this.writeInfo('Criando regra...');
                const rule = await configurator.addRuleQuick(args);

                if (rule) {
                    this.writeSuccess(`Regra criada: ${rule.description}`);
                    this.writeLine(`  Severidade: ${rule.severity}`);
                    this.writeLine(`  Verificar: ${rule.check}`);
                } else {
                    this.writeError('Falha ao criar regra');
                }
            }
        });

        // /urgente command
        this.commands.set('/urgente', {
            name: '/urgente',
            description: 'Interrompe e injeta mensagem urgente',
            handler: async (args: string) => {
                if (!args) {
                    this.writeError('Uso: /urgente <mensagem urgente>');
                    return;
                }

                // Add as urgent requirement
                this.scopeManager.addRequirement(args, 'added');

                // Trigger callback if set
                if (this.onUrgentCallback) {
                    this.onUrgentCallback(args);
                }

                this.writeWarning(`URGENTE: ${args}`);
                this.writeInfo('Mensagem enviada para o Claude Code');
            }
        });

        // /status command
        this.commands.set('/status', {
            name: '/status',
            description: 'Mostra status dos supervisores',
            handler: async () => {
                this.writeLine('');
                this.writeLine('\x1b[1;36m━━━━ STATUS DOS SUPERVISORES ━━━━\x1b[0m');

                const tree = this.supervisorHierarchy.getHierarchyTree();
                const stats = this.supervisorHierarchy.getStats();

                if (stats.totalNodes === 0) {
                    this.writeInfo('Nenhum supervisor configurado');
                    return;
                }

                this.writeLine(`\x1b[1mTotal:\x1b[0m ${stats.totalNodes} nós`);
                this.writeLine(`  • ${stats.activeNodes} ativos`);
                this.writeLine(`  • ${stats.totalRules} regras`);
                this.writeLine('');

                // Show hierarchy tree
                const printNode = (node: { name: string; enabled: boolean; rulesCount: number; children: any[] }, indent: string = '') => {
                    const status = node.enabled ? '\x1b[32m●\x1b[0m' : '\x1b[90m○\x1b[0m';
                    const rulesInfo = node.rulesCount > 0 ? ` (${node.rulesCount} regras)` : '';
                    this.writeLine(`${indent}${status} \x1b[1m${node.name}\x1b[0m${rulesInfo}`);

                    node.children.forEach((child: any, i: number) => {
                        const isLast = i === node.children.length - 1;
                        const childIndent = indent + (isLast ? '  ' : '│ ');
                        const prefix = isLast ? '└─' : '├─';
                        const childStatus = child.enabled ? '\x1b[32m●\x1b[0m' : '\x1b[90m○\x1b[0m';
                        const childRulesInfo = child.rulesCount > 0 ? ` (${child.rulesCount} regras)` : '';
                        this.writeLine(`${indent}${prefix} ${childStatus} ${child.name}${childRulesInfo}`);

                        if (child.children && child.children.length > 0) {
                            child.children.forEach((subChild: any, j: number) => {
                                const subIsLast = j === child.children.length - 1;
                                const subPrefix = subIsLast ? '└─' : '├─';
                                const subStatus = subChild.enabled ? '\x1b[32m●\x1b[0m' : '\x1b[90m○\x1b[0m';
                                const subRulesInfo = subChild.rulesCount > 0 ? ` (${subChild.rulesCount} regras)` : '';
                                this.writeLine(`${childIndent}${subPrefix} ${subStatus} ${subChild.name}${subRulesInfo}`);
                            });
                        }
                    });
                };

                printNode(tree);

                // Show stats
                this.writeLine('');
                this.writeLine('\x1b[1mEstatísticas da sessão:\x1b[0m');
                this.writeLine(`  • Chamadas: ${stats.totalCalls}`);
                this.writeLine(`  • Alertas: ${stats.totalAlerts}`);
            }
        });

        // /help command
        this.commands.set('/help', {
            name: '/help',
            description: 'Mostra ajuda',
            handler: async () => {
                this.writeLine('');
                this.writeLine('\x1b[1;36m━━━━ AJUDA ━━━━\x1b[0m');
                this.writeLine('');
                this.commands.forEach(cmd => {
                    this.writeLine(`\x1b[33m${cmd.name}\x1b[0m - ${cmd.description}`);
                });
                this.writeLine('');
                this.writeLine('Para mais informações, use /help <comando>');
            }
        });

        // /clear command
        this.commands.set('/clear', {
            name: '/clear',
            description: 'Limpa o terminal',
            handler: async () => {
                this.writeEmitter.fire('\x1b[2J\x1b[H'); // Clear screen and move to home
                this.handleOpen(); // Show welcome again
            }
        });
    }

    // ========================================
    // COMMAND PROCESSING
    // ========================================

    private async processCommand(input: string) {
        if (!input) return;

        // Check if it's a command
        if (!input.startsWith('/')) {
            this.writeError(`Comando inválido. Use /help para ver comandos disponíveis.`);
            return;
        }

        // Parse command and arguments
        const parts = input.split(' ');
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        // Find and execute command
        const command = this.commands.get(commandName);
        if (command) {
            try {
                await command.handler(args);
            } catch (error) {
                this.writeError(`Erro ao executar comando: ${error}`);
            }
        } else {
            this.writeError(`Comando desconhecido: ${commandName}`);
            this.writeInfo('Use /help para ver comandos disponíveis');
        }
    }

    // ========================================
    // OUTPUT HELPERS
    // ========================================

    private writePrompt() {
        this.writeEmitter.fire('\x1b[36msupervisor>\x1b[0m ');
    }

    private writeLine(text: string) {
        this.writeEmitter.fire(text + '\r\n');
    }

    private writeSuccess(text: string) {
        this.writeLine(`\x1b[32m✓\x1b[0m ${text}`);
    }

    private writeError(text: string) {
        this.writeLine(`\x1b[31m✗\x1b[0m ${text}`);
    }

    private writeWarning(text: string) {
        this.writeLine(`\x1b[33m⚠\x1b[0m ${text}`);
    }

    private writeInfo(text: string) {
        this.writeLine(`\x1b[36mℹ\x1b[0m ${text}`);
    }

    private renderProgressBar(percent: number): string {
        const width = 20;
        const filled = Math.round((percent / 100) * width);
        const empty = width - filled;
        const filledColor = percent === 100 ? '\x1b[32m' : '\x1b[33m';
        return `${filledColor}[${'█'.repeat(filled)}${'\x1b[90m'}${'░'.repeat(empty)}${filledColor}]\x1b[0m`;
    }

    // ========================================
    // CALLBACKS
    // ========================================

    public onUrgent(callback: (message: string) => void) {
        this.onUrgentCallback = callback;
    }

    // ========================================
    // CLEANUP
    // ========================================

    public dispose() {
        this.terminal?.dispose();
        this.writeEmitter.dispose();
    }
}
