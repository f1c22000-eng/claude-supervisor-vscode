// ============================================
// CLAUDE SUPERVISOR - HOOKS GENERATOR
// ============================================
// Generates .claude/hooks.json for workspace

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// HOOKS CONFIGURATION
// ============================================

interface HookEntry {
    matcher: string;
    command: string;
}

interface HooksConfig {
    hooks: {
        stop?: HookEntry[];
        [key: string]: HookEntry[] | undefined;
    };
}

// ============================================
// HOOKS GENERATOR
// ============================================

export class HooksGenerator {
    private extensionPath: string;
    private hookServerPort: number;

    constructor(extensionPath: string, hookServerPort: number = 18899) {
        this.extensionPath = extensionPath;
        this.hookServerPort = hookServerPort;
    }

    /**
     * Update the port used for hook communication
     */
    public setPort(port: number): void {
        this.hookServerPort = port;
    }

    /**
     * Generate hooks.json for the current workspace
     */
    public async generateHooksConfig(): Promise<boolean> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            console.log('[HooksGenerator] No workspace folder found');
            return false;
        }

        const claudeDir = path.join(workspaceFolder.uri.fsPath, '.claude');
        const hooksPath = path.join(claudeDir, 'hooks.json');

        try {
            // Create .claude directory if it doesn't exist
            if (!fs.existsSync(claudeDir)) {
                fs.mkdirSync(claudeDir, { recursive: true });
            }

            // Get path to hook script
            const hookScriptPath = this.getHookScriptPath();

            // Generate hooks config
            const config: HooksConfig = {
                hooks: {
                    stop: [
                        {
                            matcher: '.*',
                            command: `node "${hookScriptPath}"`
                        }
                    ]
                }
            };

            // Check if hooks.json already exists
            let existingConfig: HooksConfig | null = null;
            if (fs.existsSync(hooksPath)) {
                try {
                    const content = fs.readFileSync(hooksPath, 'utf8');
                    existingConfig = JSON.parse(content);
                } catch (e) {
                    // Invalid JSON, will be overwritten
                }
            }

            // Merge with existing config if present
            if (existingConfig) {
                // Add or update stop hook
                if (!existingConfig.hooks) {
                    existingConfig.hooks = {};
                }
                existingConfig.hooks.stop = config.hooks.stop;
                config.hooks = existingConfig.hooks;
            }

            // Write hooks.json
            fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
            console.log(`[HooksGenerator] Generated hooks.json at ${hooksPath}`);

            return true;

        } catch (error) {
            console.error('[HooksGenerator] Failed to generate hooks.json:', error);
            return false;
        }
    }

    /**
     * Remove supervisor hook from workspace
     */
    public async removeHooksConfig(): Promise<boolean> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        const hooksPath = path.join(workspaceFolder.uri.fsPath, '.claude', 'hooks.json');

        try {
            if (fs.existsSync(hooksPath)) {
                const content = fs.readFileSync(hooksPath, 'utf8');
                const config: HooksConfig = JSON.parse(content);

                // Remove stop hook
                delete config.hooks.stop;

                // If no hooks left, delete the file
                if (Object.keys(config.hooks).length === 0) {
                    fs.unlinkSync(hooksPath);
                } else {
                    fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
                }

                console.log('[HooksGenerator] Removed supervisor hook from hooks.json');
            }

            return true;

        } catch (error) {
            console.error('[HooksGenerator] Failed to remove hooks:', error);
            return false;
        }
    }

    /**
     * Check if hooks are configured for current workspace
     */
    public isHooksConfigured(): boolean {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        const hooksPath = path.join(workspaceFolder.uri.fsPath, '.claude', 'hooks.json');

        try {
            if (!fs.existsSync(hooksPath)) {
                return false;
            }

            const content = fs.readFileSync(hooksPath, 'utf8');
            const config: HooksConfig = JSON.parse(content);

            // Check if stop hook exists and contains our hook
            const stopHooks = config.hooks?.stop || [];
            return stopHooks.some(h => h.command.includes('supervisor-hook'));

        } catch (error) {
            return false;
        }
    }

    /**
     * Get the path to the hook script
     */
    private getHookScriptPath(): string {
        // Try multiple locations
        const possiblePaths = [
            // In extension's scripts folder
            path.join(this.extensionPath, 'scripts', 'supervisor-hook.js'),
            // In out folder (compiled)
            path.join(this.extensionPath, 'out', 'scripts', 'supervisor-hook.js'),
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }

        // Default to expected location
        return path.join(this.extensionPath, 'scripts', 'supervisor-hook.js');
    }

    /**
     * Generate environment setup instructions
     */
    public getSetupInstructions(): string {
        return `
Para ativar o hook de supervisão, adicione ao seu ambiente:

CLAUDE_SUPERVISOR_PORT=${this.hookServerPort}

O hook vai bloquear paradas prematuras quando:
- A tarefa não está completa (itens pendentes)
- Há alertas críticos não resolvidos

Use /bypass no terminal para forçar parada se necessário.
        `.trim();
    }
}
