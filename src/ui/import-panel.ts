// ============================================
// CLAUDE SUPERVISOR - IMPORT PANEL
// ============================================

import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SupervisorHierarchy } from '../supervisors/hierarchy';
import { configurator } from '../core/configurator';
import { configManager } from '../core/config';
import { ImportResult, Severity, ProjectConfig } from '../core/types';

// ============================================
// IMPORT PANEL PROVIDER
// ============================================

interface SelectedFile {
    path: string;
    name: string;
    size: number;
}

export class ImportPanelProvider {
    private extensionUri: vscode.Uri;
    private hierarchy: SupervisorHierarchy;
    private panel?: vscode.WebviewPanel;

    // State
    private selectedFiles: SelectedFile[] = [];
    private isAnalyzing: boolean = false;
    private analysisProgress: number = 0;
    private analysisMessage: string = '';
    private analysisResult: ImportResult | null = null;
    private analysisError: string | null = null;

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
                await this.handleSelectFiles();
                break;
            case 'removeFile':
                this.handleRemoveFile(message.index);
                break;
            case 'clearFiles':
                this.selectedFiles = [];
                this.analysisResult = null;
                this.analysisError = null;
                this.refresh();
                break;
            case 'analyzeFiles':
                await this.handleAnalyzeFiles(message.projectName);
                break;
            case 'applyRules':
                this.handleApplyRules();
                break;
            case 'exportYaml':
                this.handleExportYaml();
                break;
        }
    }

    private async handleSelectFiles(): Promise<void> {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: true,
            filters: {
                'Documentos': ['md', 'txt', 'pdf', 'docx'],
                'Markdown': ['md'],
                'Texto': ['txt'],
                'PDF': ['pdf'],
                'Word': ['docx']
            }
        });

        if (files && files.length > 0) {
            for (const file of files) {
                const stat = await vscode.workspace.fs.stat(file);
                this.selectedFiles.push({
                    path: file.fsPath,
                    name: path.basename(file.fsPath),
                    size: stat.size
                });
            }
            this.refresh();
        }
    }

    private handleRemoveFile(index: number): void {
        if (index >= 0 && index < this.selectedFiles.length) {
            this.selectedFiles.splice(index, 1);
            this.refresh();
        }
    }

    private async handleAnalyzeFiles(projectName: string): Promise<void> {
        console.log(`[ImportPanel] handleAnalyzeFiles called with project: ${projectName}`);
        console.log(`[ImportPanel] Selected files: ${this.selectedFiles.length}`);

        if (this.selectedFiles.length === 0) {
            vscode.window.showWarningMessage('Selecione pelo menos um arquivo para analisar');
            return;
        }

        if (!projectName || projectName.trim() === '') {
            vscode.window.showWarningMessage('Informe o nome do projeto');
            return;
        }

        this.isAnalyzing = true;
        this.analysisProgress = 0;
        this.analysisMessage = 'Iniciando análise...';
        this.analysisResult = null;
        this.analysisError = null;
        this.refresh();

        try {
            // Read documents
            console.log(`[ImportPanel] Reading documents...`);
            const filePaths = this.selectedFiles.map(f => f.path);
            const documents = await configurator.readDocuments(filePaths);
            console.log(`[ImportPanel] Documents read: ${documents.length}`);

            if (documents.length === 0) {
                throw new Error('Nenhum documento pôde ser lido');
            }

            // Analyze documents
            const result = await configurator.analyzeDocuments(
                documents,
                projectName.trim(),
                (progress, message) => {
                    this.analysisProgress = progress;
                    this.analysisMessage = message;
                    this.refresh();
                }
            );

            this.analysisResult = result;
            this.isAnalyzing = false;
            this.refresh();

            vscode.window.showInformationMessage(
                `Análise concluída! ${result.rules} regras extraídas em ${result.coordinators} coordenadores e ${result.specialists} especialistas.`
            );

        } catch (error) {
            this.isAnalyzing = false;
            this.analysisError = error instanceof Error ? error.message : 'Erro desconhecido';
            this.refresh();
            vscode.window.showErrorMessage(`Erro na análise: ${this.analysisError}`);
        }
    }

    private async handleApplyRules(): Promise<void> {
        if (!this.analysisResult) {
            vscode.window.showWarningMessage('Nenhuma análise para aplicar');
            return;
        }

        // Get current workspace path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workspacePath = workspaceFolder?.uri.fsPath || '';

        // Create project config and save to storage
        const projectConfig: ProjectConfig = {
            id: uuidv4(),
            name: this.analysisResult.projectName,
            workspacePath: workspacePath,
            yamlPath: `config/supervisors/${this.analysisResult.projectName.toLowerCase()}.yaml`,
            supervisors: this.analysisResult.hierarchy,
            enabled: true,
            lastUpdated: Date.now()
        };

        // Save project to config manager (persistent storage)
        await configManager.addProject(projectConfig);
        console.log(`[ImportPanel] Project saved: ${projectConfig.name} with ${projectConfig.supervisors.length} supervisors`);

        // Add each supervisor to the current hierarchy (in-memory)
        for (const config of this.analysisResult.hierarchy) {
            this.hierarchy.addSupervisorFromConfig(config);
        }

        vscode.window.showInformationMessage(
            `Projeto "${this.analysisResult.projectName}" salvo! ${this.analysisResult.rules} regras aplicadas.`
        );
    }

    private handleExportYaml(): void {
        if (!this.analysisResult) {
            vscode.window.showWarningMessage('Nenhuma análise para exportar');
            return;
        }

        vscode.window.showInformationMessage(
            `Configuração salva em: config/supervisors/${this.analysisResult.projectName.toLowerCase()}.yaml`
        );
    }

    private refresh(): void {
        if (this.panel) {
            this.panel.webview.html = this.getHtml(this.panel.webview);
        }
    }

    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    private getFileIcon(name: string): string {
        const ext = path.extname(name).toLowerCase();
        switch (ext) {
            case '.pdf': return '📕';
            case '.docx': return '📘';
            case '.md': return '📝';
            default: return '📄';
        }
    }

    private getSeverityColor(severity: Severity): string {
        switch (severity) {
            case Severity.CRITICAL: return '#ef4444';
            case Severity.HIGH: return '#f59e0b';
            case Severity.MEDIUM: return '#3b82f6';
            default: return '#6b7280';
        }
    }

    private getSeverityLabel(severity: Severity): string {
        switch (severity) {
            case Severity.CRITICAL: return 'Crítica';
            case Severity.HIGH: return 'Alta';
            case Severity.MEDIUM: return 'Média';
            default: return 'Baixa';
        }
    }

    public getHtml(webview: vscode.Webview): string {
        const filesHtml = this.selectedFiles.length > 0
            ? this.selectedFiles.map((f, i) => `
                <div class="file-item">
                    <div class="file-info">
                        <span class="file-icon">${this.getFileIcon(f.name)}</span>
                        <span class="file-name">${f.name}</span>
                        <span class="file-size">${this.formatFileSize(f.size)}</span>
                    </div>
                    <span class="file-remove" onclick="removeFile(${i})">✕</span>
                </div>
            `).join('')
            : '<div class="empty-message">Nenhum arquivo selecionado</div>';

        const resultHtml = this.analysisResult ? this.renderResult(this.analysisResult) : '';

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

        .dropzone {
            border: 2px dashed var(--border);
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }

        .dropzone:hover, .dropzone.dragover {
            border-color: var(--accent);
            background: var(--bg-tertiary);
        }

        .dropzone.dragover {
            border-style: solid;
            background: rgba(0, 122, 204, 0.1);
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

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
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

        .file-icon { font-size: 16px; }

        .file-size {
            color: var(--text-secondary);
            font-size: 11px;
        }

        .file-remove {
            color: var(--text-secondary);
            cursor: pointer;
            padding: 4px 8px;
        }

        .file-remove:hover { color: var(--error); }

        .empty-message {
            color: var(--text-secondary);
            text-align: center;
            padding: 16px;
        }

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

        .progress-container {
            margin-top: 16px;
            padding: 16px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
        }

        .progress-bar {
            height: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .progress-fill {
            height: 100%;
            background: var(--accent);
            transition: width 0.3s;
        }

        .progress-text {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .result-box {
            background: var(--bg-secondary);
            border: 1px solid var(--success);
            border-radius: 8px;
            padding: 16px;
            margin-top: 16px;
        }

        .result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .result-title {
            color: var(--success);
            font-weight: 500;
        }

        .result-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 16px;
        }

        .stat-item {
            text-align: center;
            padding: 12px;
            background: var(--bg-tertiary);
            border-radius: 4px;
        }

        .stat-value {
            font-size: 24px;
            font-weight: 600;
            color: var(--accent);
        }

        .stat-label {
            font-size: 11px;
            color: var(--text-secondary);
        }

        .rules-preview {
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid var(--border);
            border-radius: 4px;
        }

        .rule-item {
            padding: 12px;
            border-bottom: 1px solid var(--border);
        }

        .rule-item:last-child { border-bottom: none; }

        .rule-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }

        .rule-description {
            font-weight: 500;
        }

        .rule-severity {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 3px;
            color: white;
        }

        .rule-check {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .result-actions {
            display: flex;
            gap: 8px;
            margin-top: 16px;
        }

        .error-box {
            background: var(--bg-secondary);
            border: 1px solid var(--error);
            border-radius: 8px;
            padding: 16px;
            margin-top: 16px;
        }

        .error-title {
            color: var(--error);
            font-weight: 500;
            margin-bottom: 8px;
        }

        .error-message {
            font-size: 12px;
        }

        .actions-bar {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📄 IMPORTAR DOCUMENTOS</h1>
    </div>

    <div class="section">
        <div class="section-title">PASSO 1: Selecione os documentos</div>

        <div class="dropzone" id="dropzone" onclick="selectFiles()">
            <div class="dropzone-icon">📁</div>
            <div class="dropzone-text">Arraste arquivos aqui</div>
            <div class="dropzone-text">ou</div>
            <button class="btn">Selecionar Arquivos</button>
        </div>

        <div class="formats-hint">Formatos aceitos: .md, .txt, .pdf, .docx</div>

        <div class="file-list">
            ${filesHtml}
        </div>

        ${this.selectedFiles.length > 0 ? `
        <div class="actions-bar">
            <button class="btn" onclick="clearFiles()">🗑️ Limpar lista</button>
        </div>
        ` : ''}
    </div>

    <div class="section">
        <div class="section-title">PASSO 2: Nome do projeto</div>

        <div class="form-group">
            <input type="text" id="projectName" class="form-input" placeholder="Ex: MeuProjeto" ${this.isAnalyzing ? 'disabled' : ''}>
            <div class="form-hint">Este nome será usado para o arquivo de configuração YAML</div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">PASSO 3: Gerar supervisores</div>

        <button class="btn btn-primary" onclick="analyzeFiles()" ${this.isAnalyzing || this.selectedFiles.length === 0 ? 'disabled' : ''}>
            ${this.isAnalyzing ? '⏳ Analisando...' : '🔧 Analisar e Gerar Configuração'}
        </button>

        ${this.isAnalyzing ? `
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${this.analysisProgress}%"></div>
            </div>
            <div class="progress-text">${this.analysisMessage}</div>
        </div>
        ` : ''}

        ${this.analysisError ? `
        <div class="error-box">
            <div class="error-title">❌ Erro na análise</div>
            <div class="error-message">${this.analysisError}</div>
        </div>
        ` : ''}

        ${resultHtml}

        ${!this.isAnalyzing && !this.analysisResult ? `
        <div class="warning-box">
            <div class="warning-title">⚠️ Informações importantes:</div>
            <ul class="warning-list">
                <li>Claude Sonnet será usado para análise (mais inteligente)</li>
                <li>Custo estimado: ~R$ 0,50 por documento</li>
                <li>Tempo estimado: ~30-60 segundos</li>
                <li>Você poderá revisar e editar antes de ativar</li>
            </ul>
        </div>
        ` : ''}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function send(command, data = {}) {
            vscode.postMessage({ command, ...data });
        }

        function selectFiles() {
            send('selectFiles');
        }

        function removeFile(index) {
            send('removeFile', { index });
        }

        function clearFiles() {
            send('clearFiles');
        }

        function analyzeFiles() {
            const projectName = document.getElementById('projectName').value;
            if (!projectName) {
                alert('Por favor, insira um nome para o projeto');
                return;
            }
            send('analyzeFiles', { projectName });
        }

        function applyRules() {
            send('applyRules');
        }

        function exportYaml() {
            send('exportYaml');
        }

        // Drag and drop handlers
        const dropzone = document.getElementById('dropzone');

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');

            // Note: Due to VS Code webview security restrictions,
            // drag-and-drop file reading is limited.
            // We'll inform the user to use the file picker instead.
            alert('Por segurança do VS Code, use o botão "Selecionar Arquivos" para adicionar documentos.');
        });
    </script>
</body>
</html>`;
    }

    private renderResult(result: ImportResult): string {
        // Get all rules from hierarchy
        const allRules = result.hierarchy.flatMap(s => s.rules);

        return `
        <div class="result-box">
            <div class="result-header">
                <span class="result-title">✅ Análise concluída!</span>
            </div>

            <div class="result-stats">
                <div class="stat-item">
                    <div class="stat-value">${result.coordinators}</div>
                    <div class="stat-label">Coordenadores</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${result.specialists}</div>
                    <div class="stat-label">Especialistas</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${result.rules}</div>
                    <div class="stat-label">Regras</div>
                </div>
            </div>

            ${allRules.length > 0 ? `
            <div style="font-weight: 500; margin-bottom: 8px;">Regras extraídas:</div>
            <div class="rules-preview">
                ${allRules.slice(0, 10).map(rule => `
                    <div class="rule-item">
                        <div class="rule-header">
                            <span class="rule-description">${rule.description}</span>
                            <span class="rule-severity" style="background: ${this.getSeverityColor(rule.severity)}">
                                ${this.getSeverityLabel(rule.severity)}
                            </span>
                        </div>
                        <div class="rule-check">${rule.check}</div>
                    </div>
                `).join('')}
                ${allRules.length > 10 ? `
                    <div class="rule-item" style="text-align: center; color: var(--text-secondary);">
                        ... e mais ${allRules.length - 10} regras
                    </div>
                ` : ''}
            </div>
            ` : ''}

            <div class="result-actions">
                <button class="btn btn-primary" onclick="applyRules()">✅ Aplicar aos Supervisores</button>
                <button class="btn" onclick="exportYaml()">📤 Ver arquivo YAML</button>
            </div>
        </div>
        `;
    }
}
