// ============================================
// CLAUDE SUPERVISOR - SCOPE PANEL
// ============================================

import * as vscode from 'vscode';
import { ScopeManager } from '../scope';
import { Task, TaskItem, ItemStatus, Requirement, Note } from '../core/types';

// ============================================
// SCOPE PANEL PROVIDER
// ============================================

export class ScopePanelProvider {
    private extensionUri: vscode.Uri;
    private scopeManager: ScopeManager;
    private panel?: vscode.WebviewPanel;

    constructor(extensionUri: vscode.Uri, scopeManager: ScopeManager) {
        this.extensionUri = extensionUri;
        this.scopeManager = scopeManager;
    }

    public setPanel(panel: vscode.WebviewPanel): void {
        this.panel = panel;

        panel.webview.onDidReceiveMessage(message => {
            this.handleMessage(message);
        });

        // Listen for scope changes
        this.scopeManager.on('scope_event', () => {
            if (this.panel) {
                this.panel.webview.html = this.getHtml(this.panel.webview);
            }
        });
    }

    private handleMessage(message: any): void {
        switch (message.command) {
            case 'completeItem':
                this.scopeManager.updateItemStatus(message.itemId, ItemStatus.COMPLETED);
                break;
            case 'setCurrentItem':
                this.scopeManager.setCurrentItem(message.itemId);
                break;
            case 'addNote':
                this.scopeManager.addNote(message.text);
                break;
            case 'addRequirement':
                this.scopeManager.addRequirement(message.text);
                break;
            case 'applyNote':
                this.scopeManager.applyNote(message.noteId, message.action);
                break;
            case 'completeTask':
                this.scopeManager.completeTask();
                break;
            case 'cancelTask':
                this.scopeManager.cancelTask();
                break;
        }

        // Refresh panel
        if (this.panel) {
            this.panel.webview.html = this.getHtml(this.panel.webview);
        }
    }

    public getHtml(webview: vscode.Webview): string {
        const task = this.scopeManager.getActiveTask();
        const progress = this.scopeManager.getProgress();
        const history = this.scopeManager.getHistory().slice(-10).reverse();

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gestor de Escopo</title>
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
            max-width: 800px;
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

        .task-box {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
        }

        .task-title {
            font-size: 16px;
            font-weight: 500;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .task-meta {
            color: var(--text-secondary);
            font-size: 12px;
            margin-bottom: 12px;
        }

        .task-actions {
            display: flex;
            gap: 8px;
        }

        .btn {
            padding: 6px 12px;
            border-radius: 4px;
            border: 1px solid var(--border);
            background: var(--bg-tertiary);
            color: var(--text-primary);
            cursor: pointer;
            font-size: 12px;
        }

        .btn:hover { background: var(--accent); border-color: var(--accent); }
        .btn-danger:hover { background: var(--error); border-color: var(--error); }

        .progress-section {
            margin-top: 16px;
        }

        .progress-bar {
            height: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            overflow: hidden;
            margin: 8px 0;
        }

        .progress-fill {
            height: 100%;
            background: var(--accent);
            transition: width 0.3s ease;
        }

        .progress-text {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .items-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 8px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px;
        }

        .item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .item:hover { background: var(--bg-primary); }
        .item.current { border-left: 3px solid var(--accent); }
        .item.completed { opacity: 0.6; }

        .legend {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 8px;
        }

        .requirements-list, .notes-list {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px;
        }

        .requirement-item, .note-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            border-bottom: 1px solid var(--border);
        }

        .requirement-item:last-child, .note-item:last-child {
            border-bottom: none;
        }

        .note-actions {
            display: flex;
            gap: 4px;
        }

        .note-btn {
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 3px;
            border: 1px solid var(--border);
            background: var(--bg-tertiary);
            color: var(--text-primary);
            cursor: pointer;
        }

        .note-btn:hover { background: var(--accent); }

        .input-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px;
        }

        .input-row {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
        }

        .input-row input {
            flex: 1;
            padding: 8px 12px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text-primary);
            font-size: 13px;
        }

        .input-row input:focus {
            outline: none;
            border-color: var(--accent);
        }

        .history-list {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px;
            max-height: 200px;
            overflow-y: auto;
        }

        .history-item {
            display: flex;
            gap: 12px;
            padding: 6px 0;
            font-size: 12px;
            border-bottom: 1px solid var(--border);
        }

        .history-item:last-child { border-bottom: none; }

        .history-time {
            color: var(--text-secondary);
            min-width: 50px;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--text-secondary);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 GESTOR DE ESCOPO</h1>
    </div>

    ${task ? this.renderTask(task, progress, history) : this.renderEmptyState()}

    <script>
        const vscode = acquireVsCodeApi();

        function send(command, data) {
            vscode.postMessage({ command, ...data });
        }

        function completeItem(itemId) {
            send('completeItem', { itemId });
        }

        function setCurrentItem(itemId) {
            send('setCurrentItem', { itemId });
        }

        function addNote() {
            const input = document.getElementById('noteInput');
            if (input.value.trim()) {
                send('addNote', { text: input.value.trim() });
                input.value = '';
            }
        }

        function addRequirement() {
            const input = document.getElementById('noteInput');
            if (input.value.trim()) {
                send('addRequirement', { text: input.value.trim() });
                input.value = '';
            }
        }

        function applyNote(noteId, action) {
            send('applyNote', { noteId, action });
        }

        function completeTask() {
            send('completeTask', {});
        }

        function cancelTask() {
            send('cancelTask', {});
        }
    </script>
</body>
</html>`;
    }

    private renderTask(task: Task, progress: any, history: any[]): string {
        return `
    <div class="section">
        <div class="section-title">TAREFA ATIVA</div>
        <div class="task-box">
            <div class="task-title">📌 ${task.title}</div>
            <div class="task-meta">
                Criada: ${this.formatTime(task.createdAt)}
                ${task.startedAt ? ` | Duração: ${this.formatDuration(Date.now() - task.startedAt)}` : ''}
            </div>
            <div class="task-actions">
                <button class="btn" onclick="completeTask()">⏹️ Finalizar</button>
                <button class="btn btn-danger" onclick="cancelTask()">🗑️ Cancelar</button>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">PROGRESSO</div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress.percentage}%"></div>
        </div>
        <div class="progress-text">${progress.completed}/${progress.total} itens (${progress.percentage}%)</div>

        ${task.items.length > 0 ? `
        <div class="items-grid" style="margin-top: 12px;">
            ${task.items.map(item => `
                <div class="item ${item.status === ItemStatus.IN_PROGRESS ? 'current' : ''} ${item.status === ItemStatus.COMPLETED ? 'completed' : ''}"
                     onclick="${item.status === ItemStatus.COMPLETED ? '' : (item.status === ItemStatus.IN_PROGRESS ? `completeItem('${item.id}')` : `setCurrentItem('${item.id}')`)}">
                    ${item.status === ItemStatus.COMPLETED ? '✅' : item.status === ItemStatus.IN_PROGRESS ? '🔄' : '⬜'}
                    ${item.name}
                    ${item.status === ItemStatus.IN_PROGRESS ? ' ◄── atual' : ''}
                </div>
            `).join('')}
        </div>
        <div class="legend">Legenda: ✅ Completo  🔄 Em andamento  ⬜ Pendente</div>
        ` : ''}
    </div>

    <div class="section">
        <div class="section-title">REQUISITOS</div>
        <div class="requirements-list">
            ${task.requirements.length > 0 ? task.requirements.map((req, i) => `
                <div class="requirement-item">
                    <span>☑️ ${i + 1}. ${req.text}</span>
                    <span style="color: var(--text-secondary); font-size: 11px;">
                        (${req.source === 'original' ? 'original' : `adicionado ${this.formatTime(req.timestamp)}`})
                    </span>
                </div>
            `).join('') : '<div style="color: var(--text-secondary); text-align: center; padding: 12px;">Nenhum requisito definido</div>'}
        </div>
    </div>

    ${this.scopeManager.getPendingNotes().length > 0 ? `
    <div class="section">
        <div class="section-title">📝 NOTAS PENDENTES</div>
        <div class="notes-list">
            ${this.scopeManager.getPendingNotes().map(note => `
                <div class="note-item">
                    <span>"${note.text}" <span style="color: var(--text-secondary);">(${this.formatTime(note.timestamp)})</span></span>
                    <div class="note-actions">
                        <button class="note-btn" onclick="applyNote('${note.id}', 'apply_now')">Aplicar Agora</button>
                        <button class="note-btn" onclick="applyNote('${note.id}', 'apply_later')">No Final</button>
                        <button class="note-btn" onclick="applyNote('${note.id}', 'discard')">Descartar</button>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
    ` : ''}

    <div class="section">
        <div class="section-title">➕ ADICIONAR</div>
        <div class="input-section">
            <div class="input-row">
                <input type="text" id="noteInput" placeholder="Digite nota ou requisito...">
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn" onclick="addNote()">+ Nota</button>
                <button class="btn" onclick="addRequirement()">+ Requisito</button>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 8px;">
                Nota: não interrompe Claude | Requisito: pode interromper se urgente
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">HISTÓRICO</div>
        <div class="history-list">
            ${history.map(entry => `
                <div class="history-item">
                    <span class="history-time">${this.formatTime(entry.timestamp)}</span>
                    <span>${this.getHistoryIcon(entry.type)} ${entry.description}</span>
                </div>
            `).join('')}
        </div>
    </div>
        `;
    }

    private renderEmptyState(): string {
        return `
    <div class="empty-state">
        <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
        <div style="font-size: 16px; margin-bottom: 8px;">Nenhuma tarefa ativa</div>
        <div>Inicie uma conversa com o Claude Code para criar uma tarefa automaticamente</div>
    </div>
        `;
    }

    private formatTime(timestamp: number): string {
        return new Date(timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    private formatDuration(ms: number): string {
        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}h ${minutes % 60}min`;
        }
        return `${minutes}min`;
    }

    private getHistoryIcon(type: string): string {
        switch (type) {
            case 'task_created': return '📌';
            case 'task_started': return '▶️';
            case 'task_completed': return '✅';
            case 'item_completed': return '✓';
            case 'requirement_added': return '➕';
            case 'note_added': return '📝';
            case 'intervention': return '⚠️';
            default: return '•';
        }
    }
}
