// ============================================
// CLAUDE SUPERVISOR - SUPERVISORS PANEL
// ============================================

import * as vscode from 'vscode';
import { SupervisorHierarchy } from '../supervisors/hierarchy';
import { SupervisorNode } from '../supervisors/supervisor-node';
import { SupervisorDetailPanelProvider } from './supervisor-detail-panel';

// ============================================
// SUPERVISORS PANEL PROVIDER
// ============================================

export class SupervisorsPanelProvider {
    private extensionUri: vscode.Uri;
    private hierarchy: SupervisorHierarchy;
    private panel?: vscode.WebviewPanel;

    constructor(extensionUri: vscode.Uri, hierarchy: SupervisorHierarchy) {
        this.extensionUri = extensionUri;
        this.hierarchy = hierarchy;
    }

    public setPanel(panel: vscode.WebviewPanel): void {
        this.panel = panel;

        panel.webview.onDidReceiveMessage(message => {
            this.handleMessage(message);
        });

        this.hierarchy.on('analysis_complete', () => {
            if (this.panel) {
                this.panel.webview.html = this.getHtml(this.panel.webview);
            }
        });
    }

    private handleMessage(message: any): void {
        switch (message.command) {
            case 'openSupervisor':
                this.openSupervisorDetail(message.id);
                break;
            case 'toggleSupervisor':
                // Check if supervisor is always active
                if (this.hierarchy.isAlwaysActive(message.id)) {
                    vscode.window.showWarningMessage(
                        'Este supervisor é sempre ativo e não pode ser desativado. ' +
                        'Ele é essencial para detectar comportamentos problemáticos.'
                    );
                    return;
                }
                const node = this.hierarchy.findNode(message.id);
                if (node) {
                    node.setEnabled(!node.isEnabled());
                    if (this.panel) {
                        this.panel.webview.html = this.getHtml(this.panel.webview);
                    }
                }
                break;
            case 'loadExamples':
                this.hierarchy.loadExampleSupervisors();
                vscode.window.showInformationMessage('Supervisores de exemplo carregados!');
                if (this.panel) {
                    this.panel.webview.html = this.getHtml(this.panel.webview);
                }
                break;
            case 'importDocs':
                vscode.commands.executeCommand('claudeSupervisor.importDocs');
                break;
            case 'clearAll':
                this.hierarchy.clearAllSupervisors();
                vscode.window.showInformationMessage('Todos os supervisores removidos');
                if (this.panel) {
                    this.panel.webview.html = this.getHtml(this.panel.webview);
                }
                break;
        }
    }

    private openSupervisorDetail(supervisorId: string): void {
        const node = this.hierarchy.findNode(supervisorId);
        if (!node) {
            vscode.window.showErrorMessage(`Supervisor "${supervisorId}" não encontrado`);
            return;
        }

        const detailPanel = vscode.window.createWebviewPanel(
            `claudeSupervisor.supervisorDetail.${supervisorId}`,
            `Supervisor: ${node.getName()}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        const provider = new SupervisorDetailPanelProvider(
            this.extensionUri,
            this.hierarchy,
            supervisorId
        );

        detailPanel.webview.html = provider.getHtml(detailPanel.webview);
        provider.setPanel(detailPanel);
    }

    public getHtml(webview: vscode.Webview): string {
        const stats = this.hierarchy.getStats();
        const tree = this.hierarchy.getHierarchyTree();

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supervisores</title>
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

        .header h1 { font-size: 18px; font-weight: 600; }

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

        .tree-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
        }

        .tree-node {
            margin-left: 20px;
        }

        .tree-node.root {
            margin-left: 0;
        }

        .tree-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            margin: 4px 0;
            border-radius: 4px;
            cursor: pointer;
        }

        .tree-item:hover {
            background: var(--bg-tertiary);
        }

        .tree-icon {
            font-size: 14px;
        }

        .tree-name {
            flex: 1;
        }

        .tree-status {
            font-size: 10px;
        }

        .tree-btn {
            padding: 2px 6px;
            font-size: 10px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            border-radius: 3px;
            color: var(--text-primary);
            cursor: pointer;
        }

        .tree-btn:hover {
            background: var(--accent);
        }

        .tree-rules {
            color: var(--text-secondary);
            font-size: 11px;
        }

        .tree-locked {
            font-size: 12px;
            margin-left: 4px;
            color: var(--warning);
        }

        .activity-list {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px;
            max-height: 300px;
            overflow-y: auto;
        }

        .activity-item {
            display: flex;
            gap: 12px;
            padding: 8px;
            border-bottom: 1px solid var(--border);
            font-size: 12px;
        }

        .activity-item:last-child { border-bottom: none; }

        .activity-time {
            color: var(--text-secondary);
            min-width: 70px;
        }

        .activity-path {
            flex: 1;
        }

        .activity-status {
            min-width: 60px;
            text-align: right;
        }

        .activity-status.ok { color: var(--success); }
        .activity-status.alert { color: var(--warning); }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 24px;
        }

        .stat-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
            text-align: center;
        }

        .stat-value {
            font-size: 24px;
            font-weight: 600;
            color: var(--accent);
        }

        .stat-label {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        .actions {
            display: flex;
            gap: 8px;
        }

        .btn {
            padding: 8px 16px;
            border-radius: 4px;
            border: 1px solid var(--border);
            background: var(--bg-secondary);
            color: var(--text-primary);
            cursor: pointer;
            font-size: 12px;
        }

        .btn:hover { background: var(--accent); border-color: var(--accent); }

        .legend {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 12px;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
        }

        .empty-state h2 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--text-primary);
        }

        .empty-state p {
            color: var(--text-secondary);
            margin-bottom: 24px;
            line-height: 1.5;
        }

        .empty-state .actions {
            justify-content: center;
        }

        .btn-primary {
            background: var(--accent);
            border-color: var(--accent);
        }

        .btn-primary:hover {
            background: #0062a3;
        }

        .btn-secondary {
            background: transparent;
            border: 1px dashed var(--border);
        }

        .btn-secondary:hover {
            border-style: solid;
            background: var(--bg-tertiary);
        }

        .btn-danger {
            color: var(--error);
            border-color: var(--error);
        }

        .btn-danger:hover {
            background: var(--error);
            color: white;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 SUPERVISORES</h1>
    </div>

    ${this.hierarchy.hasConfiguredSupervisors() ? `
    <div class="section">
        <div class="section-title">HIERARQUIA</div>
        <div class="tree-container">
            ${this.renderTree(tree)}
        </div>
        <div class="legend">[►] = Clique para abrir detalhes | [🔒] = Supervisor sempre ativo (não pode ser desativado)</div>
    </div>
    ` : `
    <div class="section">
        <div class="section-title">HIERARQUIA</div>
        <div class="tree-container">
            <div class="empty-state">
                <h2>Nenhum supervisor configurado</h2>
                <p>
                    Importe documentos para criar supervisores automaticamente<br>
                    ou carregue os exemplos para testar o sistema.
                </p>
                <div class="actions">
                    <button class="btn btn-primary" onclick="send('importDocs')">📄 Importar Documentos</button>
                    <button class="btn btn-secondary" onclick="send('loadExamples')">📚 Carregar Exemplos</button>
                </div>
            </div>
        </div>
    </div>
    `}

    <div class="section">
        <div class="section-title">ATIVIDADE RECENTE</div>
        <div class="activity-list">
            ${stats.totalCalls > 0 ? `
            <div class="activity-item">
                <span class="activity-time">${this.formatTime(Date.now())}</span>
                <span class="activity-path">Última análise</span>
                <span class="activity-status ok">${stats.totalAlerts > 0 ? '⚠️ Alertas: ' + stats.totalAlerts : '✅ OK'}</span>
            </div>
            ` : `
            <div style="text-align: center; padding: 16px; color: var(--text-secondary);">
                Nenhuma atividade registrada.<br>
                <small>A atividade aparecerá quando o Claude Code estiver ativo.</small>
            </div>
            `}
        </div>
    </div>

    <div class="section">
        <div class="section-title">ESTATÍSTICAS DA SESSÃO</div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${stats.totalCalls}</div>
                <div class="stat-label">Total de análises</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalAlerts}</div>
                <div class="stat-label">Alertas gerados</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalCalls > 0 ? Math.round((1 - stats.totalAlerts / stats.totalCalls) * 100) : 100}%</div>
                <div class="stat-label">Taxa de OK</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalCalls > 0 ? '~200ms' : '-'}</div>
                <div class="stat-label">Tempo médio</div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">AÇÕES</div>
        <div class="actions">
            <button class="btn" onclick="send('addRule')">+ Nova Regra</button>
            <button class="btn" onclick="send('addSupervisor')">+ Novo Supervisor</button>
            <button class="btn" onclick="send('importDocs')">📄 Importar Docs</button>
            ${this.hierarchy.hasConfiguredSupervisors() ? `
            <button class="btn btn-secondary" onclick="send('loadExamples')">📚 Exemplos</button>
            <button class="btn btn-danger" onclick="if(confirm('Remover TODOS os supervisores?')) send('clearAll')">🗑️ Limpar Tudo</button>
            ` : ''}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function send(command, data) {
            vscode.postMessage({ command, ...data });
        }

        function openSupervisor(id) {
            send('openSupervisor', { id });
        }

        function toggleSupervisor(id) {
            send('toggleSupervisor', { id });
        }
    </script>
</body>
</html>`;
    }

    private renderTree(node: any, depth: number = 0): string {
        const icon = node.type === 'router' ? '📁' :
                    node.type === 'coordinator' ? '📁' : '🔍';

        const children = node.children || [];
        const isAlwaysActive = this.hierarchy.isAlwaysActive(node.id);

        return `
            <div class="tree-node ${depth === 0 ? 'root' : ''}">
                <div class="tree-item" onclick="openSupervisor('${node.id}')">
                    <span class="tree-icon">${icon}</span>
                    <span class="tree-name">${node.name}</span>
                    ${isAlwaysActive ? '<span class="tree-locked" title="Supervisor sempre ativo (não pode ser desativado)">🔒</span>' : ''}
                    ${node.rulesCount > 0 ? `<span class="tree-rules">(${node.rulesCount} regras)</span>` : ''}
                    <span class="tree-status">${node.enabled ? '🟢' : '⚪'}</span>
                    <button class="tree-btn" onclick="event.stopPropagation(); openSupervisor('${node.id}')">►</button>
                </div>
                ${children.map((child: any) => this.renderTree(child, depth + 1)).join('')}
            </div>
        `;
    }

    private formatTime(timestamp: number): string {
        return new Date(timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}
