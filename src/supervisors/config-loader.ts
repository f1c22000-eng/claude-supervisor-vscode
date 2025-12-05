// ============================================
// CLAUDE SUPERVISOR - CONFIG LOADER
// ============================================

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { SupervisorConfig, SupervisorType, Rule, Severity } from '../core/types';

// ============================================
// YAML STRUCTURE INTERFACES
// ============================================

interface YamlRule {
    id: string;
    description: string;
    severity: string;
    check: string;
    example_violation?: string;
    enabled?: boolean;
}

interface YamlSupervisor {
    name: string;
    type: string;
    parent?: string;
    keywords?: string[];
    rules?: YamlRule[];
    enabled?: boolean;
}

interface YamlConfig {
    project: string;
    version?: string;
    supervisors: YamlSupervisor[];
}

// ============================================
// CONFIG LOADER
// ============================================

export class ConfigLoader {
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();

    // ========================================
    // LOADING
    // ========================================

    public async loadFromFile(filePath: string): Promise<SupervisorConfig[]> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return this.parseYaml(content);
        } catch (error) {
            console.error(`Failed to load config from ${filePath}:`, error);
            throw error;
        }
    }

    public async loadFromDirectory(dirPath: string): Promise<Map<string, SupervisorConfig[]>> {
        const result = new Map<string, SupervisorConfig[]>();

        try {
            const files = fs.readdirSync(dirPath).filter(f =>
                f.endsWith('.yaml') || f.endsWith('.yml')
            );

            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const configs = await this.loadFromFile(filePath);
                result.set(filePath, configs);
            }
        } catch (error) {
            console.error(`Failed to load configs from directory ${dirPath}:`, error);
        }

        return result;
    }

    // ========================================
    // PARSING
    // ========================================

    private parseYaml(content: string): SupervisorConfig[] {
        const parsed = YAML.parse(content) as YamlConfig;

        if (!parsed || !parsed.supervisors) {
            return [];
        }

        return parsed.supervisors.map(s => this.convertToSupervisorConfig(s, parsed.project));
    }

    private convertToSupervisorConfig(yaml: YamlSupervisor, projectName: string): SupervisorConfig {
        return {
            id: this.generateId(projectName, yaml.name),
            name: yaml.name,
            type: this.parseType(yaml.type),
            parentId: yaml.parent ? this.generateId(projectName, yaml.parent) : undefined,
            keywords: yaml.keywords || [],
            rules: (yaml.rules || []).map(r => this.convertToRule(r)),
            enabled: yaml.enabled !== false
        };
    }

    private convertToRule(yaml: YamlRule): Rule {
        return {
            id: yaml.id,
            description: yaml.description,
            severity: this.parseSeverity(yaml.severity),
            check: yaml.check,
            exampleViolation: yaml.example_violation,
            enabled: yaml.enabled !== false
        };
    }

    private generateId(projectName: string, supervisorName: string): string {
        return `${projectName.toLowerCase()}-${supervisorName.toLowerCase().replace(/\s+/g, '-')}`;
    }

    private parseType(type: string): SupervisorType {
        switch (type.toLowerCase()) {
            case 'router':
                return SupervisorType.ROUTER;
            case 'coordinator':
                return SupervisorType.COORDINATOR;
            case 'specialist':
            default:
                return SupervisorType.SPECIALIST;
        }
    }

    private parseSeverity(severity: string): Severity {
        switch (severity.toLowerCase()) {
            case 'critical':
                return Severity.CRITICAL;
            case 'high':
                return Severity.HIGH;
            case 'medium':
                return Severity.MEDIUM;
            case 'low':
            default:
                return Severity.LOW;
        }
    }

    // ========================================
    // VALIDATION
    // ========================================

    public validateConfig(config: SupervisorConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!config.id) {
            errors.push('ID é obrigatório');
        }

        if (!config.name) {
            errors.push('Nome é obrigatório');
        }

        if (!config.type) {
            errors.push('Tipo é obrigatório');
        }

        for (const rule of config.rules) {
            if (!rule.id) {
                errors.push(`Regra sem ID em ${config.name}`);
            }
            if (!rule.description) {
                errors.push(`Regra ${rule.id} sem descrição`);
            }
            if (!rule.check) {
                errors.push(`Regra ${rule.id} sem check`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ========================================
    // GENERATION
    // ========================================

    public generateYaml(configs: SupervisorConfig[], projectName: string): string {
        const yamlConfig: YamlConfig = {
            project: projectName,
            version: '1.0',
            supervisors: configs.map(c => this.convertToYamlSupervisor(c))
        };

        return YAML.stringify(yamlConfig, {
            indent: 2,
            lineWidth: 0
        });
    }

    private convertToYamlSupervisor(config: SupervisorConfig): YamlSupervisor {
        return {
            name: config.name,
            type: config.type,
            parent: config.parentId,
            keywords: config.keywords.length > 0 ? config.keywords : undefined,
            rules: config.rules.length > 0 ? config.rules.map(r => ({
                id: r.id,
                description: r.description,
                severity: r.severity,
                check: r.check,
                example_violation: r.exampleViolation,
                enabled: r.enabled
            })) : undefined,
            enabled: config.enabled
        };
    }

    // ========================================
    // FILE WATCHING
    // ========================================

    public watchFile(
        filePath: string,
        callback: (configs: SupervisorConfig[]) => void
    ): vscode.Disposable {
        const watcher = vscode.workspace.createFileSystemWatcher(filePath);

        watcher.onDidChange(async () => {
            try {
                const configs = await this.loadFromFile(filePath);
                callback(configs);
            } catch (error) {
                console.error(`Error reloading config from ${filePath}:`, error);
            }
        });

        this.watchers.set(filePath, watcher);

        return {
            dispose: () => {
                watcher.dispose();
                this.watchers.delete(filePath);
            }
        };
    }

    public stopWatching(filePath: string): void {
        const watcher = this.watchers.get(filePath);
        if (watcher) {
            watcher.dispose();
            this.watchers.delete(filePath);
        }
    }

    public stopAllWatching(): void {
        for (const [path, watcher] of this.watchers) {
            watcher.dispose();
        }
        this.watchers.clear();
    }
}
