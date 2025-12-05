// ============================================
// CLAUDE SUPERVISOR - SIDEBAR PROVIDER
// ============================================

import * as vscode from 'vscode';
import { ConnectionStatus, ApiStatus, WebViewState } from '../core/types';
import { COMMANDS, USD_TO_BRL } from '../core/constants';
import { InterceptorManager } from '../interceptor';
import { ScopeManager } from '../scope';
import { SupervisorHierarchy } from '../supervisors/hierarchy';
import { AnthropicClient } from '../core/api';
import { configManager } from '../core/config';

// ============================================
// SIDEBAR PROVIDER
// ============================================

export class SidebarProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private extensionUri: vscode.Uri;
    private managers: {
        interceptor: InterceptorManager;
        scope: ScopeManager;
        supervisors: SupervisorHierarchy;
        api: AnthropicClient;
    };

    constructor(
        extensionUri: vscode.Uri,
        managers: {
            interceptor: InterceptorManager;
            scope: ScopeManager;
            supervisors: SupervisorHierarchy;
            api: AnthropicClient;
        }
    ) {
        this.extensionUri = extensionUri;
        this.managers = managers;

        // Listen for updates from all sources
        this.managers.interceptor.on('status_change', () => this.refresh());
        this.managers.interceptor.on('stats_update', () => this.refresh());
        this.managers.scope.on('scope_event', () => this.refresh());
        this.managers.supervisors.on('analysis_complete', () => this.refresh());

        // Listen for config changes (API key, models, etc.)
        configManager.onConfigChange(() => this.refresh());
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(message => {
            this.handleMessage(message);
        });
    }

    public refresh(): void {
        if (this.view) {
            // Regenerate full HTML to ensure state consistency
            this.view.webview.html = this.getHtml(this.view.webview);
        }
    }

    public async refreshAsync(): Promise<void> {
        if (this.view) {
            // Force async refresh with fresh API key check
            this.view.webview.html = await this.getHtmlAsync(this.view.webview);
        }
    }

    private getState(): WebViewState {
        const interceptorState = this.managers.interceptor.getState();
        const task = this.managers.scope.getActiveTask();
        const supervisorStats = this.managers.supervisors.getStats();
        const apiStats = this.managers.api.getStats();

        // Determine API status - sync version checks config only
        let apiStatus: ApiStatus;
        const config = configManager.getConfig();
        if (!config.apiKey || config.apiKey.trim() === '') {
            apiStatus = ApiStatus.NOT_CONFIGURED;
        } else if (!config.apiKey.startsWith('sk-ant-')) {
            apiStatus = ApiStatus.INVALID;
        } else if (this.managers.api.isInitialized()) {
            apiStatus = ApiStatus.VALID;
        } else {
            apiStatus = ApiStatus.INVALID;
        }

        return {
            connectionStatus: interceptorState.status,
            apiStatus,
            activeTask: task,
            supervisorStats: {
                active: supervisorStats.activeNodes,
                totalRules: supervisorStats.totalRules,
                lastAnalysis: Date.now(),
                alertCount: supervisorStats.totalAlerts
            },
            apiStats,
            recentAlerts: []
        };
    }

    private async getStateAsync(): Promise<WebViewState> {
        const interceptorState = this.managers.interceptor.getState();
        const task = this.managers.scope.getActiveTask();
        const supervisorStats = this.managers.supervisors.getStats();
        const apiStats = this.managers.api.getStats();

        // Determine API status - async version checks secrets too
        let apiStatus: ApiStatus;
        const apiKey = await configManager.getApiKey();

        if (!apiKey || apiKey.trim() === '') {
            apiStatus = ApiStatus.NOT_CONFIGURED;
        } else if (!apiKey.startsWith('sk-ant-')) {
            apiStatus = ApiStatus.INVALID;
        } else if (this.managers.api.isInitialized()) {
            apiStatus = ApiStatus.VALID;
        } else {
            apiStatus = ApiStatus.INVALID;
        }

        return {
            connectionStatus: interceptorState.status,
            apiStatus,
            activeTask: task,
            supervisorStats: {
                active: supervisorStats.activeNodes,
                totalRules: supervisorStats.totalRules,
                lastAnalysis: Date.now(),
                alertCount: supervisorStats.totalAlerts
            },
            apiStats,
            recentAlerts: []
        };
    }

    private getApiStatusText(status: ApiStatus): string {
        switch (status) {
            case ApiStatus.VALID:
                return '✅ Conectada';
            case ApiStatus.NOT_CONFIGURED:
                return '❌ Não configurada';
            case ApiStatus.INVALID:
                return '❌ Inválida';
            case ApiStatus.CHECKING:
                return '🔄 Verificando...';
            default:
                return '❓ Desconhecido';
        }
    }

    private renderSupervisorItems(): string {
        const tree = this.managers.supervisors.getHierarchyTree();
        const items: string[] = [];

        // Render coordinator children (the main supervisors)
        if (tree.children && tree.children.length > 0) {
            for (const coord of tree.children) {
                const status = coord.enabled ? '🟢' : '⚪';
                items.push(`<div class="supervisor-item">${status} ${coord.name}</div>`);
            }
        }

        // If no supervisors, show placeholder
        if (items.length === 0) {
            items.push('<div class="supervisor-item" style="color: var(--text-secondary);">Nenhum supervisor</div>');
        }

        return items.join('\n                ');
    }

    private handleMessage(message: any): void {
        switch (message.command) {
            case 'openScope':
                vscode.commands.executeCommand(COMMANDS.OPEN_SCOPE);
                break;
            case 'openSupervisors':
                vscode.commands.executeCommand(COMMANDS.OPEN_SUPERVISORS);
                break;
            case 'openMonitor':
                vscode.commands.executeCommand(COMMANDS.OPEN_MONITOR);
                break;
            case 'openConfig':
                vscode.commands.executeCommand(COMMANDS.OPEN_CONFIG);
                break;
            case 'addNote':
                vscode.commands.executeCommand(COMMANDS.ADD_NOTE);
                break;
            case 'addRule':
                vscode.commands.executeCommand(COMMANDS.ADD_RULE);
                break;
            case 'importDocs':
                vscode.commands.executeCommand(COMMANDS.IMPORT_DOCS);
                break;
            case 'toggle':
                vscode.commands.executeCommand(COMMANDS.TOGGLE);
                break;
        }
    }

    private async getHtmlAsync(webview: vscode.Webview): Promise<string> {
        const state = await this.getStateAsync();
        return this.renderHtml(webview, state);
    }

    private getHtml(webview: vscode.Webview): string {
        const state = this.getState();
        return this.renderHtml(webview, state);
    }

    private renderHtml(webview: vscode.Webview, state: WebViewState): string {
        const progress = this.managers.scope.getProgress();
        const apiCostBRL = (state.apiStats.today.totalCost * USD_TO_BRL).toFixed(2);

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Supervisor</title>
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

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
            font-size: 13px;
            color: var(--text-primary);
            background: var(--bg-primary);
            padding: 12px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border);
        }

        .header h1 {
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header-actions {
            display: flex;
            gap: 8px;
        }

        .icon-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
        }

        .icon-btn:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 6px;
            margin-bottom: 12px;
            overflow: hidden;
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            user-select: none;
        }

        .section-header:hover {
            background: var(--bg-tertiary);
        }

        .section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        .status-dot.connected { background: var(--success); }
        .status-dot.warning { background: var(--warning); }
        .status-dot.error { background: var(--error); }
        .status-dot.disconnected { background: var(--text-secondary); }

        .section-content {
            padding: 12px;
            border-top: 1px solid var(--border);
            font-size: 12px;
        }

        .stat-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
        }

        .stat-label {
            color: var(--text-secondary);
        }

        .progress-bar {
            height: 6px;
            background: var(--bg-tertiary);
            border-radius: 3px;
            overflow: hidden;
            margin: 8px 0;
        }

        .progress-fill {
            height: 100%;
            background: var(--accent);
            border-radius: 3px;
            transition: width 0.3s ease;
        }

        .open-btn {
            display: block;
            width: 100%;
            padding: 6px 12px;
            margin-top: 8px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text-primary);
            cursor: pointer;
            text-align: center;
            font-size: 12px;
        }

        .open-btn:hover {
            background: var(--accent);
            border-color: var(--accent);
        }

        .actions {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-top: 16px;
        }

        .action-btn {
            padding: 8px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text-primary);
            cursor: pointer;
            font-size: 12px;
            text-align: center;
        }

        .action-btn:hover {
            background: var(--bg-tertiary);
            border-color: var(--accent);
        }

        .supervisor-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-bottom: 8px;
        }

        .supervisor-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧠 CLAUDE SUPERVISOR</h1>
        <div class="header-actions">
            <button class="icon-btn" onclick="send('openConfig')" title="Configuração">⚙️</button>
            <button class="icon-btn" onclick="send('openHelp')" title="Ajuda">?</button>
        </div>
    </div>

    ${state.apiStatus !== ApiStatus.VALID ? `
    <div class="section" style="background: linear-gradient(135deg, #1a365d, #2d3748); border-color: #4a5568;">
        <div class="section-content" style="text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">🚀</div>
            <div style="font-weight: 600; margin-bottom: 8px;">Configure para Começar</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 12px;">
                Adicione sua API Key da Anthropic para ativar a supervisão em tempo real
            </div>
            <button class="action-btn" onclick="send('openConfig')" style="width: 100%; background: var(--accent);">
                ⚙️ Configurar API Key
            </button>
        </div>
    </div>
    ` : ''}

    <div class="section">
        <div class="section-header">
            <span class="section-title">
                <span class="status-dot ${state.connectionStatus === ConnectionStatus.CONNECTED ? 'connected' : 'disconnected'}"></span>
                STATUS GERAL
            </span>
        </div>
        <div class="section-content">
            <div class="stat-row">
                <span class="stat-label">Sistema</span>
                <span>${state.connectionStatus === ConnectionStatus.CONNECTED ? '🟢 Ativo' : '⚪ Inativo'}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">API</span>
                <span>${this.getApiStatusText(state.apiStatus)}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Uso hoje</span>
                <span>${state.apiStats.today.callCount} chamadas (~R$ ${apiCostBRL})</span>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-title">
                📋 GESTOR DE ESCOPO
            </span>
            <span class="status-dot ${state.activeTask ? 'connected' : 'disconnected'}"></span>
        </div>
        <div class="section-content">
            ${state.activeTask ? `
                <div class="stat-row">
                    <span class="stat-label">Tarefa</span>
                    <span>${state.activeTask.title}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress.percentage}%"></div>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Progresso</span>
                    <span>${progress.completed}/${progress.total} (${progress.percentage}%)</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Requisitos</span>
                    <span>${state.activeTask.requirements.length} itens</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Notas pendentes</span>
                    <span>${state.activeTask.notes.filter(n => !n.action).length}</span>
                </div>
            ` : `
                <div style="color: var(--text-secondary); text-align: center; padding: 8px;">
                    Nenhuma tarefa ativa
                </div>
            `}
            <button class="open-btn" onclick="send('openScope')">Abrir ►</button>
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-title">
                🤖 SUPERVISORES
            </span>
            <span style="font-size: 11px; color: ${state.supervisorStats.active > 0 ? 'var(--success)' : 'var(--text-secondary)'};">${state.supervisorStats.active > 0 ? '🟢' : '⚪'} ${state.supervisorStats.active} ativos</span>
        </div>
        <div class="section-content">
            ${this.managers.supervisors.hasConfiguredSupervisors() ? `
            <div class="supervisor-grid">
                ${this.renderSupervisorItems()}
            </div>
            <div class="stat-row">
                <span class="stat-label">Regras ativas</span>
                <span>${state.supervisorStats.totalRules}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Alertas</span>
                <span>${state.supervisorStats.alertCount}</span>
            </div>
            ` : `
            <div style="color: var(--text-secondary); text-align: center; padding: 8px;">
                Nenhum supervisor configurado<br>
                <small>Importe documentos ou carregue exemplos</small>
            </div>
            `}
            <button class="open-btn" onclick="send('openSupervisors')">Abrir ►</button>
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-title">
                📡 MONITOR
            </span>
            <span class="status-dot ${state.connectionStatus === ConnectionStatus.CONNECTED ? 'connected' : 'disconnected'}"></span>
        </div>
        <div class="section-content">
            <div class="stat-row">
                <span class="stat-label">Status</span>
                <span>${state.connectionStatus === ConnectionStatus.CONNECTED ? '🟢 Ativo' : '⚪ Inativo'}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Thinking chunks</span>
                <span>${this.managers.interceptor.getState().chunksProcessed}</span>
            </div>
            <button class="open-btn" onclick="send('openMonitor')">Abrir ►</button>
        </div>
    </div>

    <div class="section">
        <div class="section-header">
            <span class="section-title">
                ⚙️ CONFIGURAÇÃO
            </span>
        </div>
        <div class="section-content">
            <div class="stat-row">
                <span class="stat-label">API Key</span>
                <span>${state.apiStatus === ApiStatus.VALID ? '✅ Configurada' :
                       state.apiStatus === ApiStatus.NOT_CONFIGURED ? '❌ Não configurada' :
                       '❌ Inválida'}</span>
            </div>
            <button class="open-btn" onclick="send('openConfig')">Abrir ►</button>
        </div>
    </div>

    <div class="actions">
        <button class="action-btn" onclick="send('addNote')">+ Nota</button>
        <button class="action-btn" onclick="send('addRule')">+ Regra</button>
        <button class="action-btn" onclick="send('importDocs')">📄 Importar</button>
        <button class="action-btn" onclick="send('toggle')">${state.connectionStatus === ConnectionStatus.CONNECTED ? '⏸️ Pausar' : '▶️ Retomar'}</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function send(command, data) {
            vscode.postMessage({ command, data });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'update') {
                // Refresh the view - in production we'd update DOM elements
                // For now, the full HTML is regenerated on refresh
            }
        });
    </script>
</body>
</html>`;
    }
}
