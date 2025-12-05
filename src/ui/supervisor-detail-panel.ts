// ============================================
// CLAUDE SUPERVISOR - SUPERVISOR DETAIL PANEL
// ============================================

import * as vscode from 'vscode';
import { SupervisorHierarchy } from '../supervisors/hierarchy';
import { SupervisorNode } from '../supervisors/supervisor-node';
import { Rule, Severity } from '../core/types';

// ============================================
// SUPERVISOR DETAIL PANEL PROVIDER
// ============================================

export class SupervisorDetailPanelProvider {
    private extensionUri: vscode.Uri;
    private hierarchy: SupervisorHierarchy;
    private panel?: vscode.WebviewPanel;
    private supervisorId: string;

    constructor(
        extensionUri: vscode.Uri,
        hierarchy: SupervisorHierarchy,
        supervisorId: string
    ) {
        this.extensionUri = extensionUri;
        this.hierarchy = hierarchy;
        this.supervisorId = supervisorId;
    }

    public setPanel(panel: vscode.WebviewPanel): void {
        this.panel = panel;

        panel.webview.onDidReceiveMessage(message => {
            this.handleMessage(message);
        });
    }

    private async handleMessage(message: any): Promise<void> {
        const node = this.hierarchy.findNode(this.supervisorId);
        if (!node) return;

        switch (message.command) {
            case 'toggleRule':
                node.toggleRule(message.ruleId, message.enabled);
                break;

            case 'deleteRule':
                const confirm = await vscode.window.showWarningMessage(
                    `Excluir regra "${message.ruleId}"?`,
                    'Excluir',
                    'Cancelar'
                );
                if (confirm === 'Excluir') {
                    node.removeRule(message.ruleId);
                    vscode.window.showInformationMessage('Regra excluída');
                }
                break;

            case 'editRule':
                await this.editRule(node, message.ruleId);
                break;

            case 'addRule':
                await this.addRule(node);
                break;

            case 'editKeywords':
                await this.editKeywords(node);
                break;

            case 'toggleSupervisor':
                node.setEnabled(!node.isEnabled());
                break;
        }

        if (this.panel) {
            this.panel.webview.html = this.getHtml(this.panel.webview);
        }
    }

    private async editRule(node: SupervisorNode, ruleId: string): Promise<void> {
        const rule = node.getRules().find(r => r.id === ruleId);
        if (!rule) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Descrição da regra',
            value: rule.description
        });
        if (!description) return;

        const check = await vscode.window.showInputBox({
            prompt: 'Como verificar esta regra?',
            value: rule.check
        });
        if (!check) return;

        const severityOptions = [
            { label: 'Crítica', value: 'critical' },
            { label: 'Alta', value: 'high' },
            { label: 'Média', value: 'medium' },
            { label: 'Baixa', value: 'low' }
        ];

        const severity = await vscode.window.showQuickPick(severityOptions, {
            placeHolder: 'Selecione a severidade'
        });
        if (!severity) return;

        node.updateRule(ruleId, {
            description,
            check,
            severity: severity.value as Severity
        });

        vscode.window.showInformationMessage('Regra atualizada');
    }

    private async addRule(node: SupervisorNode): Promise<void> {
        const description = await vscode.window.showInputBox({
            prompt: 'Descrição da nova regra',
            placeHolder: 'Ex: Sempre usar prepared statements em SQL'
        });
        if (!description) return;

        const check = await vscode.window.showInputBox({
            prompt: 'Como verificar esta regra?',
            placeHolder: 'Ex: Verificar concatenação de strings em queries SQL',
            value: `Verificar: ${description}`
        });
        if (!check) return;

        const severityOptions = [
            { label: 'Crítica', value: 'critical' },
            { label: 'Alta', value: 'high' },
            { label: 'Média', value: 'medium' },
            { label: 'Baixa', value: 'low' }
        ];

        const severity = await vscode.window.showQuickPick(severityOptions, {
            placeHolder: 'Selecione a severidade'
        });
        if (!severity) return;

        const newRule: Rule = {
            id: `custom-${Date.now()}`,
            description,
            check,
            severity: severity.value as Severity,
            enabled: true
        };

        node.addRule(newRule);
        vscode.window.showInformationMessage(`Regra "${description}" adicionada`);
    }

    private async editKeywords(node: SupervisorNode): Promise<void> {
        const currentKeywords = node.getKeywords().join(', ');

        const keywords = await vscode.window.showInputBox({
            prompt: 'Keywords (separadas por vírgula)',
            value: currentKeywords,
            placeHolder: 'palavra1, palavra2, palavra3'
        });

        if (keywords !== undefined) {
            const config = node.getConfig();
            config.keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
            vscode.window.showInformationMessage('Keywords atualizadas');
        }
    }

    public getHtml(webview: vscode.Webview): string {
        const node = this.hierarchy.findNode(this.supervisorId);

        if (!node) {
            return this.getErrorHtml('Supervisor não encontrado');
        }

        const config = node.getConfig();
        const rules = node.getRules();
        const parent = node.getParent();
        const alertHistory = this.hierarchy.getAlertHistory()
            .filter(a => a.supervisorName === node.getName())
            .slice(0, 10);

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.name}</title>
    <style>
        :root {
            --bg-primary: #1e1e1e;
            --bg-secondary: #252526;
            --bg-tertiary: #2d2d2d;
            --border: #3c3c3c;
            --text-primary: #cccccc;
            --text-secondary: #808080;
            --accent: #007acc;
            --success: #10b981;
            --warning: #f59e0b;
            --error: #ef4444;
            --critical: #ef4444;
            --high: #f59e0b;
            --medium: #eab308;
            --low: #3b82f6;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
            font-size: 13px;
            color: var(--text-primary);
            background: var(--bg-primary);
            padding: 20px;
            max-width: 900px;
            margin: 0 auto;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }

        .header h1 {
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .section {
            margin-bottom: 24px;
        }

        .section-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid var(--border);
        }

        .card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }

        .info-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .info-label {
            font-size: 11px;
            color: var(--text-secondary);
        }

        .info-value {
            font-size: 14px;
            font-weight: 500;
        }

        .keywords-box {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 12px;
        }

        .keyword {
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
        }

        .rule-item {
            padding: 16px;
            border-bottom: 1px solid var(--border);
        }

        .rule-item:last-child {
            border-bottom: none;
        }

        .rule-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .rule-checkbox {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }

        .rule-title {
            flex: 1;
            font-weight: 500;
        }

        .rule-title.disabled {
            color: var(--text-secondary);
            text-decoration: line-through;
        }

        .severity-badge {
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .severity-badge.critical {
            background: rgba(239, 68, 68, 0.2);
            color: var(--critical);
        }

        .severity-badge.high {
            background: rgba(245, 158, 11, 0.2);
            color: var(--high);
        }

        .severity-badge.medium {
            background: rgba(234, 179, 8, 0.2);
            color: var(--medium);
        }

        .severity-badge.low {
            background: rgba(59, 130, 246, 0.2);
            color: var(--low);
        }

        .rule-description {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 8px;
            margin-left: 30px;
        }

        .rule-actions {
            display: flex;
            gap: 8px;
            margin-left: 30px;
        }

        .btn {
            padding: 6px 12px;
            border-radius: 4px;
            border: 1px solid var(--border);
            background: var(--bg-tertiary);
            color: var(--text-primary);
            cursor: pointer;
            font-size: 11px;
        }

        .btn:hover {
            background: var(--accent);
            border-color: var(--accent);
        }

        .btn.primary {
            background: var(--accent);
            border-color: var(--accent);
        }

        .btn.small {
            padding: 4px 8px;
            font-size: 10px;
        }

        .btn.danger:hover {
            background: var(--error);
            border-color: var(--error);
        }

        .alert-item {
            padding: 12px;
            border-bottom: 1px solid var(--border);
            font-size: 12px;
        }

        .alert-item:last-child {
            border-bottom: none;
        }

        .alert-time {
            color: var(--text-secondary);
            margin-right: 8px;
        }

        .alert-message {
            color: var(--warning);
        }

        .empty-state {
            text-align: center;
            padding: 24px;
            color: var(--text-secondary);
        }

        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 6px;
        }

        .status-indicator.active { background: var(--success); }
        .status-indicator.inactive { background: var(--text-secondary); }
    </style>
</head>
<body>
    <div class="header">
        <h1>
            ${config.type === 'specialist' ? '&#128269;' : '&#128193;'}
            ${config.name}
        </h1>
        <button class="btn ${node.isEnabled() ? '' : 'primary'}" onclick="toggleSupervisor()">
            ${node.isEnabled() ? '&#9208; Desativar' : '&#9654; Ativar'}
        </button>
    </div>

    <div class="section">
        <div class="section-title">INFORMACOES</div>
        <div class="card">
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Status</span>
                    <span class="info-value">
                        <span class="status-indicator ${node.isEnabled() ? 'active' : 'inactive'}"></span>
                        ${node.isEnabled() ? 'Ativo' : 'Inativo'}
                    </span>
                </div>
                <div class="info-item">
                    <span class="info-label">Tipo</span>
                    <span class="info-value">${this.formatType(config.type)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Pai</span>
                    <span class="info-value">${parent ? parent.getName() : 'Nenhum (raiz)'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Chamadas</span>
                    <span class="info-value">${node.getCallCount()}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Alertas Disparados</span>
                    <span class="info-value">${node.getAlertCount()}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Ultima Ativacao</span>
                    <span class="info-value">${node.getLastResult() ? this.formatTime(node.getLastResult()!.timestamp) : 'Nunca'}</span>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">KEYWORDS (triggers)</div>
        <div class="card">
            <div class="keywords-box">
                ${config.keywords.length > 0
                    ? config.keywords.map(k => `<span class="keyword">${k}</span>`).join('')
                    : '<span style="color: var(--text-secondary)">Nenhuma keyword definida</span>'
                }
            </div>
            <button class="btn" onclick="editKeywords()">&#9998; Editar Keywords</button>
        </div>
    </div>

    <div class="section">
        <div class="section-title">REGRAS (${rules.length})</div>
        <div class="card" style="padding: 0;">
            ${rules.length > 0
                ? rules.map((rule, index) => this.renderRule(rule, index)).join('')
                : '<div class="empty-state">Nenhuma regra definida.<br><small>Clique em "Adicionar Regra" para criar uma.</small></div>'
            }
        </div>
        <button class="btn primary" style="margin-top: 12px;" onclick="addRule()">+ Adicionar Regra</button>
    </div>

    <div class="section">
        <div class="section-title">HISTORICO DE ALERTAS</div>
        <div class="card" style="padding: 0; max-height: 300px; overflow-y: auto;">
            ${alertHistory.length > 0
                ? alertHistory.map(alert => `
                    <div class="alert-item">
                        <span class="alert-time">${this.formatTime(alert.timestamp)}</span>
                        <span class="alert-message">${alert.message}</span>
                        <div style="margin-top: 4px; font-size: 11px; color: var(--text-secondary);">
                            "${alert.chunkPreview}"
                        </div>
                    </div>
                `).join('')
                : '<div class="empty-state">Nenhum alerta registrado ainda.</div>'
            }
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function send(command, data = {}) {
            vscode.postMessage({ command, ...data });
        }

        function toggleRule(ruleId, enabled) {
            send('toggleRule', { ruleId, enabled });
        }

        function deleteRule(ruleId) {
            send('deleteRule', { ruleId });
        }

        function editRule(ruleId) {
            send('editRule', { ruleId });
        }

        function addRule() {
            send('addRule');
        }

        function editKeywords() {
            send('editKeywords');
        }

        function toggleSupervisor() {
            send('toggleSupervisor');
        }
    </script>
</body>
</html>`;
    }

    private renderRule(rule: Rule, index: number): string {
        return `
            <div class="rule-item">
                <div class="rule-header">
                    <input type="checkbox" class="rule-checkbox"
                           ${rule.enabled ? 'checked' : ''}
                           onchange="toggleRule('${rule.id}', this.checked)">
                    <span class="rule-title ${rule.enabled ? '' : 'disabled'}">
                        ${index + 1}. ${rule.description}
                    </span>
                    <span class="severity-badge ${rule.severity}">${this.formatSeverity(rule.severity)}</span>
                </div>
                <div class="rule-description">"${rule.check}"</div>
                ${rule.exampleViolation ? `<div class="rule-description">Exemplo: "${rule.exampleViolation}"</div>` : ''}
                <div class="rule-actions">
                    <button class="btn small" onclick="editRule('${rule.id}')">&#9998;</button>
                    <button class="btn small danger" onclick="deleteRule('${rule.id}')">&#128465;</button>
                    <button class="btn small" onclick="toggleRule('${rule.id}', ${!rule.enabled})">
                        ${rule.enabled ? '&#9208;' : '&#9654;'}
                    </button>
                </div>
            </div>
        `;
    }

    private formatType(type: string): string {
        switch (type) {
            case 'router': return 'Router';
            case 'coordinator': return 'Coordinator';
            case 'specialist': return 'Specialist';
            default: return type;
        }
    }

    private formatSeverity(severity: Severity): string {
        switch (severity) {
            case Severity.CRITICAL: return 'Critica';
            case Severity.HIGH: return 'Alta';
            case Severity.MEDIUM: return 'Media';
            case Severity.LOW: return 'Baixa';
            default: return severity;
        }
    }

    private formatTime(timestamp: number): string {
        return new Date(timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    private getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: sans-serif;
            padding: 20px;
            color: #cccccc;
            background: #1e1e1e;
            text-align: center;
        }
        .error { color: #ef4444; font-size: 18px; }
    </style>
</head>
<body>
    <div class="error">${message}</div>
</body>
</html>`;
    }
}
