// ============================================
// CLAUDE SUPERVISOR - GERENCIADOR DE CONFIGURAÇÕES
// ============================================

import * as vscode from 'vscode';
import { ExtensionConfig, ProjectConfig, SupervisorConfig } from './types';
import { EXTENSION_ID, MODELS, TIMEOUTS, LIMITS } from './constants';

// ============================================
// CONFIGURATION MANAGER
// ============================================

export class ConfigManager {
    private static instance: ConfigManager;
    private context: vscode.ExtensionContext | null = null;
    private configChangeEmitter = new vscode.EventEmitter<ExtensionConfig>();

    public readonly onConfigChange = this.configChangeEmitter.event;

    private constructor() {}

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('claudeSupervisor')) {
                this.configChangeEmitter.fire(this.getConfig());
            }
        });
    }

    // ========================================
    // EXTENSION CONFIG
    // ========================================

    public getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration('claudeSupervisor');

        return {
            apiKey: config.get<string>('apiKey', ''),
            supervisorModel: config.get<string>('supervisorModel', MODELS.HAIKU),
            configuratorModel: config.get<string>('configuratorModel', MODELS.SONNET),
            maxCallsPerHour: config.get<number>('maxCallsPerHour', 1000),
            dailyCostAlert: config.get<number>('dailyCostAlert', 5),
            dailyCostLimit: config.get<number>('dailyCostLimit', 20),
            detectScopeReduction: config.get<boolean>('detectScopeReduction', true),
            requireListBeforeRefactor: config.get<boolean>('requireListBeforeRefactor', true),
            detectProcrastination: config.get<boolean>('detectProcrastination', true),
            verifyCompleteness: config.get<boolean>('verifyCompleteness', true),
            aggressiveMode: config.get<boolean>('aggressiveMode', false),
            noteBufferSeconds: config.get<number>('noteBufferSeconds', 10)
        };
    }

    public async updateConfig<K extends keyof ExtensionConfig>(
        key: K,
        value: ExtensionConfig[K],
        global: boolean = true
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('claudeSupervisor');
        await config.update(key, value, global);
    }

    // ========================================
    // API KEY MANAGEMENT
    // ========================================

    public async getApiKey(): Promise<string> {
        // First try from VS Code secrets (more secure)
        if (this.context) {
            const secretKey = await this.context.secrets.get('anthropic-api-key');
            if (secretKey) {
                return secretKey;
            }
        }

        // Fallback to configuration
        return this.getConfig().apiKey;
    }

    public async setApiKey(apiKey: string): Promise<void> {
        if (this.context) {
            // Store in VS Code secrets (encrypted)
            await this.context.secrets.store('anthropic-api-key', apiKey);
        }

        // Also update config (but this will be stored in settings.json)
        await this.updateConfig('apiKey', apiKey);
    }

    public async clearApiKey(): Promise<void> {
        if (this.context) {
            await this.context.secrets.delete('anthropic-api-key');
        }
        await this.updateConfig('apiKey', '');
    }

    public isApiKeyConfigured(): boolean {
        return this.getConfig().apiKey.startsWith('sk-ant-');
    }

    // ========================================
    // PROJECT CONFIG MANAGEMENT
    // ========================================

    public getProjects(): ProjectConfig[] {
        if (!this.context) return [];
        return this.context.globalState.get<ProjectConfig[]>('projects', []);
    }

    public async saveProjects(projects: ProjectConfig[]): Promise<void> {
        if (this.context) {
            await this.context.globalState.update('projects', projects);
        }
    }

    public async addProject(project: ProjectConfig): Promise<void> {
        const projects = this.getProjects();
        const existingIndex = projects.findIndex(p => p.id === project.id);

        if (existingIndex >= 0) {
            projects[existingIndex] = project;
        } else {
            projects.push(project);
        }

        await this.saveProjects(projects);
    }

    public async removeProject(projectId: string): Promise<void> {
        const projects = this.getProjects().filter(p => p.id !== projectId);
        await this.saveProjects(projects);
    }

    public getProject(projectId: string): ProjectConfig | undefined {
        return this.getProjects().find(p => p.id === projectId);
    }

    // ========================================
    // WORKSPACE STATE
    // ========================================

    public getWorkspaceState<T>(key: string, defaultValue: T): T {
        if (!this.context) return defaultValue;
        return this.context.workspaceState.get<T>(key, defaultValue);
    }

    public async setWorkspaceState<T>(key: string, value: T): Promise<void> {
        if (this.context) {
            await this.context.workspaceState.update(key, value);
        }
    }

    // ========================================
    // GLOBAL STATE
    // ========================================

    public getGlobalState<T>(key: string, defaultValue: T): T {
        if (!this.context) return defaultValue;
        return this.context.globalState.get<T>(key, defaultValue);
    }

    public async setGlobalState<T>(key: string, value: T): Promise<void> {
        if (this.context) {
            await this.context.globalState.update(key, value);
        }
    }

    // ========================================
    // VALIDATION
    // ========================================

    public validateConfig(): { valid: boolean; errors: string[] } {
        const config = this.getConfig();
        const errors: string[] = [];

        if (!config.apiKey) {
            errors.push('API Key não configurada');
        } else if (!config.apiKey.startsWith('sk-ant-')) {
            errors.push('API Key inválida (deve começar com sk-ant-)');
        }

        if (config.maxCallsPerHour < 1 || config.maxCallsPerHour > 10000) {
            errors.push('Máximo de chamadas/hora deve estar entre 1 e 10000');
        }

        if (config.dailyCostAlert < 0) {
            errors.push('Alerta de custo deve ser positivo');
        }

        if (config.dailyCostLimit < config.dailyCostAlert) {
            errors.push('Limite de custo deve ser maior que alerta');
        }

        if (config.noteBufferSeconds < 1 || config.noteBufferSeconds > 60) {
            errors.push('Buffer de notas deve estar entre 1 e 60 segundos');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();
