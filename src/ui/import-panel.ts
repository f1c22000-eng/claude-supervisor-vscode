// ============================================
// CLAUDE SUPERVISOR - IMPORT PANEL
// ============================================

import * as vscode from 'vscode';
import { SupervisorHierarchy } from '../supervisors/hierarchy';

// ============================================
// IMPORT PANEL PROVIDER
// ============================================

export class ImportPanelProvider {
    private extensionUri: vscode.Uri;
    private hierarchy: SupervisorHierarchy;
    private panel?: vscode.WebviewPanel;

    constructor(extensionUri: vscode.Uri, hierarchy: SupervisorHierarchy) {
        this.extensionUri = extensionUri;
        this.hierarchy = hierarchy;
    }

    public setPanel(panel: vscode.WebviewPanel): void {
        this.panel = panel;

        panel.webview.onDidReceiveMessage(async message => {
            await this.handleMessage(message);
        });
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'selectFiles':
                const files = await vscode.window.showOpenDialog({
                    canSelectMany: true,
                    filters: {
                        'Documents': ['md', 'txt', 'pdf', 'docx']
                    }
                });
                if (files && this.panel) {
                    // Would process files here
                    vscode.window.showInformationMessage(`${files.length} arquivo(s) selecionado(s)`);
                }
                break;
            case 'analyzeFiles':
                vscode.window.showInformationMessage('Análise de documentos iniciada...');
                // Would call configurator here
                break;
        }
    }

    public getHtml(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Importar Documentos</title>
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

        .step-title {
            font-weight: 500;
            margin-bottom: 12px;
        }

        .dropzone {
            border: 2px dashed var(--border);
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }

        .dropzone:hover {
            border-color: var(--accent);
            background: var(--bg-tertiary);
        }

        .dropzone-icon {
            font-size: 48px;
            margin-bottom: 12px;
        }

        .dropzone-text {
            color: var(--text-secondary);
            margin-bottom: 12px;
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

        .btn-primary {
            background: var(--accent);
            border-color: var(--accent);
        }

        .file-list {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px;
            margin-top: 16px;
        }

        .file-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            border-bottom: 1px solid var(--border);
        }

        .file-item:last-child { border-bottom: none; }

        .file-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .file-size {
            color: var(--text-secondary);
            font-size: 11px;
        }

        .file-remove {
            color: var(--text-secondary);
            cursor: pointer;
        }

        .file-remove:hover { color: var(--error); }

        .form-group {
            margin-bottom: 16px;
        }

        .form-label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
        }

        .form-input {
            width: 100%;
            padding: 10px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text-primary);
            font-size: 13px;
        }

        .form-input:focus {
            outline: none;
            border-color: var(--accent);
        }

        .form-hint {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        .warning-box {
            background: var(--bg-secondary);
            border: 1px solid var(--warning);
            border-radius: 8px;
            padding: 16px;
            margin-top: 16px;
        }

        .warning-title {
            color: var(--warning);
            font-weight: 500;
            margin-bottom: 8px;
        }

        .warning-list {
            list-style: none;
            font-size: 12px;
        }

        .warning-list li {
            margin: 4px 0;
            padding-left: 16px;
            position: relative;
        }

        .warning-list li:before {
            content: '•';
            position: absolute;
            left: 0;
        }

        .formats-hint {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📄 IMPORTAR DOCUMENTOS</h1>
    </div>

    <div class="section">
        <div class="section-title">PASSO 1: Selecione os documentos</div>

        <div class="dropzone" onclick="selectFiles()">
            <div class="dropzone-icon">📁</div>
            <div class="dropzone-text">Arraste arquivos aqui</div>
            <div class="dropzone-text">ou</div>
            <button class="btn">Selecionar Arquivos</button>
        </div>

        <div class="formats-hint">Formatos aceitos: .md, .txt, .pdf, .docx</div>

        <div class="file-list" id="fileList" style="display: none;">
            <div style="font-weight: 500; margin-bottom: 8px;">Arquivos selecionados:</div>
            <!-- Files will be listed here -->
        </div>
    </div>

    <div class="section">
        <div class="section-title">PASSO 2: Nome do projeto</div>

        <div class="form-group">
            <input type="text" id="projectName" class="form-input" placeholder="Ex: MeuProjeto">
            <div class="form-hint">ℹ️ Será criado: config/supervisors/meuprojeto.yaml</div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">PASSO 3: Gerar supervisores</div>

        <button class="btn btn-primary" onclick="analyzeFiles()">🔧 Analisar e Gerar Configuração</button>

        <div class="warning-box">
            <div class="warning-title">⚠️ Informações importantes:</div>
            <ul class="warning-list">
                <li>Claude Sonnet será usado para análise (mais inteligente)</li>
                <li>Custo estimado: ~R$ 0,50</li>
                <li>Tempo estimado: ~30-60 segundos</li>
                <li>Você poderá revisar e editar antes de ativar</li>
            </ul>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function send(command, data) {
            vscode.postMessage({ command, ...data });
        }

        function selectFiles() {
            send('selectFiles', {});
        }

        function analyzeFiles() {
            const projectName = document.getElementById('projectName').value;
            if (!projectName) {
                alert('Por favor, insira um nome para o projeto');
                return;
            }
            send('analyzeFiles', { projectName });
        }
    </script>
</body>
</html>`;
    }
}
