// ============================================
// CLAUDE SUPERVISOR - MONITOR PANEL
// ============================================

import * as vscode from 'vscode';
import { InterceptorManager } from '../interceptor';
import { AnthropicClient } from '../core/api';
import { ConnectionStatus } from '../core/types';
import { USD_TO_BRL } from '../core/constants';

// ============================================
// MONITOR PANEL PROVIDER
// ============================================

export class MonitorPanelProvider {
    private extensionUri: vscode.Uri;
    private interceptor: InterceptorManager;
    private api: AnthropicClient;
    private panel?: vscode.WebviewPanel;
    private thinkingHistory: Array<{ content: string; timestamp: number }> = [];

    constructor(
        extensionUri: vscode.Uri,
        interceptor: InterceptorManager,
        api: AnthropicClient
    ) {
        this.extensionUri = extensionUri;
        this.interceptor = interceptor;
        this.api = api;

        // Capture thinking chunks
        this.interceptor.on('thinking_chunk', (chunk: any) => {
            this.thinkingHistory.push({
                content: chunk.content,
                timestamp: chunk.timestamp
            });
            // Keep only last 50
            if (this.thinkingHistory.length > 50) {
                this.thinkingHistory.shift();
            }
            this.refresh();
        });
    }

    public setPanel(panel: vscode.WebviewPanel): void {
        this.panel = panel;

        panel.webview.onDidReceiveMessage(message => {
            this.handleMessage(message);
        });
    }

    private handleMessage(message: any): void {
        switch (message.command) {
            case 'reconnect':
                this.interceptor.start();
                this.refresh();
                break;
            case 'disconnect':
                this.interceptor.stop();
                this.refresh();
                break;
            case 'clearHistory':
                this.thinkingHistory = [];
                this.refresh();
                break;
            case 'copyCommand':
                // Copy proxy command to clipboard
                vscode.env.clipboard.writeText('ANTHROPIC_BASE_URL=http://localhost:8888 claude');
                vscode.window.showInformationMessage('Comando copiado para clipboard!');
                break;
        }
    }

    private refresh(): void {
        if (this.panel) {
            this.panel.webview.html = this.getHtml(this.panel.webview);
        }
    }

    public getHtml(webview: vscode.Webview): string {
        const state = this.interceptor.getState();
        const stats = this.api.getStats();
        const costBRL = (stats.session.totalCost * USD_TO_BRL).toFixed(2);
        const lastChunk = this.interceptor.getLastChunk();

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monitor</title>
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

        .connection-box {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
        }

        .connection-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }

        .connection-label {
            color: var(--text-secondary);
        }

        .connection-actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }

        .btn {
            padding: 8px 16px;
            border-radius: 4px;
            border: 1px solid var(--border);
            background: var(--bg-tertiary);
            color: var(--text-primary);
            cursor: pointer;
            font-size: 12px;
        }

        .btn:hover { background: var(--accent); border-color: var(--accent); }

        .thinking-box {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
        }

        .thinking-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border);
        }

        .thinking-content {
            padding: 16px;
            font-family: monospace;
            font-size: 12px;
            line-height: 1.5;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .thinking-analysis {
            padding: 12px 16px;
            border-top: 1px solid var(--border);
            background: var(--bg-tertiary);
        }

        .analysis-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 12px;
        }

        .stats-table {
            width: 100%;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            border-collapse: collapse;
            overflow: hidden;
        }

        .stats-table td {
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
        }

        .stats-table tr:last-child td {
            border-bottom: none;
        }

        .stats-table td:first-child {
            color: var(--text-secondary);
            width: 50%;
        }

        .stats-table td:last-child {
            text-align: right;
        }

        .intervention-list {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            max-height: 400px;
            overflow-y: auto;
        }

        .intervention-item {
            padding: 16px;
            border-bottom: 1px solid var(--border);
        }

        .intervention-item:last-child {
            border-bottom: none;
        }

        .intervention-header {
            display: flex;
            gap: 12px;
            margin-bottom: 8px;
        }

        .intervention-time {
            color: var(--text-secondary);
        }

        .intervention-name {
            color: var(--warning);
            font-weight: 500;
        }

        .intervention-details {
            font-size: 12px;
            color: var(--text-secondary);
            margin-left: 16px;
        }

        .intervention-detail {
            margin: 4px 0;
        }

        .actions-bar {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }

        .status-connected { color: var(--success); }
        .status-disconnected { color: var(--text-secondary); }
        .status-error { color: var(--error); }

        .proxy-box {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
        }

        .proxy-status {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px;
            background: var(--bg-tertiary);
            border-radius: 6px;
            margin-bottom: 12px;
        }

        .proxy-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--text-secondary);
        }

        .proxy-status.active .proxy-indicator {
            background: var(--success);
            box-shadow: 0 0 8px var(--success);
        }

        .proxy-info {
            margin-bottom: 12px;
        }

        .proxy-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 12px;
        }

        .proxy-row code {
            background: var(--bg-tertiary);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
        }

        .proxy-command {
            padding-top: 12px;
            border-top: 1px solid var(--border);
        }

        .command-box {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--bg-primary);
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
        }

        .command-box code {
            flex: 1;
            color: var(--success);
        }

        .btn-small {
            padding: 4px 8px !important;
            font-size: 11px !important;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📡 MONITOR</h1>
    </div>

    <div class="section">
        <div class="section-title">CONEXÃO</div>
        <div class="connection-box">
            <div class="connection-row">
                <span class="connection-label">Claude Code</span>
                <span class="${state.status === ConnectionStatus.CONNECTED ? 'status-connected' : 'status-disconnected'}">
                    ${state.status === ConnectionStatus.CONNECTED ? '🟢 Conectado' : '⚪ Desconectado'}
                </span>
            </div>
            ${state.pid ? `
            <div class="connection-row">
                <span class="connection-label">PID</span>
                <span>${state.pid}</span>
            </div>
            ` : ''}
            <div class="connection-row">
                <span class="connection-label">Método</span>
                <span>HTTP Intercept</span>
            </div>
            <div class="connection-row">
                <span class="connection-label">Uptime</span>
                <span>${this.formatDuration(state.uptime)}</span>
            </div>
            <div class="connection-actions">
                <button class="btn" onclick="send('reconnect')">🔄 Reconectar</button>
                <button class="btn" onclick="send('disconnect')">⏹️ Desconectar</button>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">🔌 PROXY HTTP</div>
        <div class="proxy-box">
            <div class="proxy-status ${state.status === ConnectionStatus.CONNECTED ? 'active' : ''}">
                <span class="proxy-indicator"></span>
                <span>${state.status === ConnectionStatus.CONNECTED ? 'Proxy Ativo' : 'Proxy Inativo'}</span>
            </div>
            <div class="proxy-info">
                <div class="proxy-row">
                    <span>Endereço:</span>
                    <code>http://localhost:8888</code>
                </div>
                <div class="proxy-row">
                    <span>Variável:</span>
                    <code>ANTHROPIC_BASE_URL</code>
                </div>
            </div>
            <div class="proxy-command">
                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">
                    Para conectar o Claude Code ao proxy:
                </div>
                <div class="command-box">
                    <code>ANTHROPIC_BASE_URL=http://localhost:8888 claude</code>
                    <button class="btn btn-small" onclick="send('copyCommand')">📋</button>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">THINKING STREAM (ao vivo)</div>
        <div class="thinking-box">
            <div class="thinking-header">
                <span>🧠 THINKING</span>
                <span style="color: var(--text-secondary); font-size: 11px;">▼ auto</span>
            </div>
            <div class="thinking-content">
${lastChunk ? `"${lastChunk.content}"` : 'Aguardando thinking do Claude Code...'}
            </div>
        </div>
        <div class="actions-bar">
            <button class="btn">⏸️ Pausar stream</button>
            <button class="btn" onclick="send('clearHistory')">🗑️ Limpar</button>
            <button class="btn">📋 Copiar</button>
        </div>
    </div>

    <div class="section">
        <div class="section-title">ESTATÍSTICAS DA SESSÃO</div>
        <table class="stats-table">
            <tr>
                <td>Chunks analisados</td>
                <td>${state.chunksProcessed}</td>
            </tr>
            <tr>
                <td>Supervisores acionados</td>
                <td>${stats.session.callCount}</td>
            </tr>
            <tr>
                <td>Alertas gerados</td>
                <td>0</td>
            </tr>
            <tr>
                <td>Intervenções</td>
                <td>0</td>
            </tr>
            <tr>
                <td>Tempo médio análise</td>
                <td>187ms</td>
            </tr>
            <tr>
                <td>Tokens input</td>
                <td>${stats.session.inputTokens.toLocaleString()}</td>
            </tr>
            <tr>
                <td>Tokens output</td>
                <td>${stats.session.outputTokens.toLocaleString()}</td>
            </tr>
            <tr>
                <td>Custo da sessão</td>
                <td>R$ ${costBRL}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">HISTÓRICO DE INTERVENÇÕES</div>
        <div class="intervention-list">
            <div style="padding: 24px; text-align: center; color: var(--text-secondary);">
                Nenhuma intervenção registrada nesta sessão
            </div>
        </div>
        <div class="actions-bar">
            <button class="btn">📤 Exportar histórico</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function send(command, data) {
            vscode.postMessage({ command, ...data });
        }
    </script>
</body>
</html>`;
    }

    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}min`;
        } else if (minutes > 0) {
            return `${minutes}min`;
        } else {
            return `${seconds}s`;
        }
    }

}
