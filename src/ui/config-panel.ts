// ============================================
// CLAUDE SUPERVISOR - CONFIG PANEL
// ============================================

import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { configManager } from '../core/config';
import { anthropicClient } from '../core/api';
import { AVAILABLE_MODELS, ANTHROPIC_PRICING_URL, USD_TO_BRL } from '../core/constants';
import { ProjectConfig } from '../core/types';

// ============================================
// CONFIG PANEL PROVIDER
// ============================================

export class ConfigPanelProvider {
    private extensionUri: vscode.Uri;
    private panel?: vscode.WebviewPanel;
    private configChangeDisposable?: vscode.Disposable;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    public setPanel(panel: vscode.WebviewPanel): void {
        this.panel = panel;

        panel.webview.onDidReceiveMessage(async message => {
            await this.handleMessage(message);
        });

        // Listen for external config changes and refresh panel
        this.configChangeDisposable = configManager.onConfigChange(() => {
            if (this.panel) {
                this.panel.webview.html = this.getHtml(this.panel.webview);
            }
        });

        // Cleanup on panel dispose
        panel.onDidDispose(() => {
            if (this.configChangeDisposable) {
                this.configChangeDisposable.dispose();
                this.configChangeDisposable = undefined;
            }
        });
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'saveApiKey':
                const newApiKey = message.apiKey?.trim() || '';

                if (!newApiKey) {
                    // API key is being cleared
                    await configManager.clearApiKey();
                    vscode.window.showInformationMessage('API Key removida. Sistema desativado.');
                } else if (!newApiKey.startsWith('sk-ant-')) {
                    // Invalid format
                    await configManager.setApiKey(newApiKey);
                    vscode.window.showWarningMessage('API Key salva, mas formato inválido (deve começar com sk-ant-)');
                } else {
                    // Valid format - save and validate
                    await configManager.setApiKey(newApiKey);
                    await anthropicClient.initialize();
                    const validResult = await anthropicClient.validateApiKey(newApiKey);
                    if (validResult.valid) {
                        vscode.window.showInformationMessage('API Key salva e validada!');
                    } else {
                        vscode.window.showWarningMessage(
                            `API Key salva, mas: ${validResult.error || 'pode ser inválida'}`
                        );
                    }
                }
                break;
            case 'saveConfig':
                for (const [key, value] of Object.entries(message.config)) {
                    await configManager.updateConfig(key as any, value as any);
                }
                // Reinitialize API client with new config
                await anthropicClient.initialize();
                vscode.window.showInformationMessage('Configurações salvas!');
                break;
            case 'resetConfig':
                // Reset to defaults
                vscode.window.showInformationMessage('Configurações restauradas!');
                break;
            case 'verifyApi':
                const apiKey = await configManager.getApiKey();
                const verifyResult = await anthropicClient.validateApiKey(apiKey);
                if (verifyResult.valid) {
                    vscode.window.showInformationMessage('API Key válida!');
                } else {
                    vscode.window.showErrorMessage(verifyResult.error || 'API Key inválida');
                }
                break;
            case 'saveModels':
                await configManager.setSupervisorModel(message.supervisorModel);
                await configManager.setConfiguratorModel(message.configuratorModel);
                // Reinitialize API client with new models
                await anthropicClient.initialize();
                vscode.window.showInformationMessage('Modelos salvos!');
                break;
            case 'saveModelPricing':
                await configManager.setModelPricing(
                    message.modelId,
                    message.inputPrice,
                    message.outputPrice
                );
                vscode.window.showInformationMessage(`Preços do modelo ${message.modelId} salvos!`);
                break;
            case 'resetModelPricing':
                await configManager.resetModelPricing(message.modelId);
                vscode.window.showInformationMessage(`Preços do modelo ${message.modelId} restaurados!`);
                break;
            case 'resetAllPricing':
                await configManager.resetAllModelPricing();
                vscode.window.showInformationMessage('Todos os preços restaurados aos padrões!');
                break;
            case 'openPricingPage':
                vscode.env.openExternal(vscode.Uri.parse(ANTHROPIC_PRICING_URL));
                break;
            case 'newProject':
                // Open input box for project name
                const projectName = await vscode.window.showInputBox({
                    prompt: 'Nome do novo projeto',
                    placeHolder: 'Ex: MeuProjeto',
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Nome não pode ser vazio';
                        }
                        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                            return 'Use apenas letras, números, _ e -';
                        }
                        // Check if project already exists
                        const existing = configManager.getProjects();
                        if (existing.some(p => p.name.toLowerCase() === value.toLowerCase())) {
                            return 'Já existe um projeto com esse nome';
                        }
                        return null;
                    }
                });
                if (projectName) {
                    // Create project config
                    const newProject: ProjectConfig = {
                        id: uuidv4(),
                        name: projectName,
                        yamlPath: path.join('config', 'supervisors', `${projectName.toLowerCase()}.yaml`),
                        supervisors: [],
                        enabled: true,
                        lastUpdated: Date.now()
                    };

                    // Save to storage
                    await configManager.addProject(newProject);
                    console.log(`[ConfigPanel] Projeto criado:`, newProject);

                    vscode.window.showInformationMessage(
                        `Projeto "${projectName}" criado! Use "Importar Documentos" para adicionar supervisores.`
                    );
                }
                break;
            case 'importDocs':
                // Execute the import docs command
                vscode.commands.executeCommand('claudeSupervisor.importDocs');
                break;
        }

        if (this.panel) {
            this.panel.webview.html = this.getHtml(this.panel.webview);
        }
    }

    public getHtml(webview: vscode.Webview): string {
        const config = configManager.getConfig();
        const projects = configManager.getProjects();
        const apiKeyMasked = config.apiKey ?
            config.apiKey.substring(0, 10) + '•'.repeat(20) + config.apiKey.slice(-4) :
            '';

        // Get model data
        const availableModels = configManager.getAvailableModels();
        const currentSupervisorModel = configManager.getSupervisorModel();
        const currentConfiguratorModel = configManager.getConfiguratorModel();
        const modelPricing = configManager.getModelPricing();

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuração</title>
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

        .form-group {
            margin-bottom: 16px;
        }

        .form-label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
        }

        .form-hint {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 4px;
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

        .form-select {
            width: 100%;
            padding: 10px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text-primary);
            font-size: 13px;
            cursor: pointer;
        }

        .input-group {
            display: flex;
            gap: 8px;
        }

        .input-group .form-input {
            flex: 1;
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

        .status-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            font-size: 12px;
        }

        .status-valid { color: var(--success); }
        .status-invalid { color: var(--error); }

        .checkbox-group {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            margin-bottom: 12px;
        }

        .checkbox-group input[type="checkbox"] {
            margin-top: 2px;
        }

        .checkbox-label {
            flex: 1;
        }

        .checkbox-description {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 2px;
        }

        .project-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
        }

        .project-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .project-name {
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .project-meta {
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 12px;
        }

        .project-actions {
            display: flex;
            gap: 8px;
        }

        .project-btn {
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 3px;
            border: 1px solid var(--border);
            background: var(--bg-tertiary);
            color: var(--text-primary);
            cursor: pointer;
        }

        .project-btn:hover { background: var(--accent); }

        .limits-grid {
            display: grid;
            grid-template-columns: 1fr 120px;
            gap: 12px;
            align-items: center;
        }

        .actions-bar {
            display: flex;
            gap: 12px;
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid var(--border);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚙️ CONFIGURAÇÃO</h1>
    </div>

    <div class="section">
        <div class="section-title">API</div>

        <div class="form-group">
            <label class="form-label">Anthropic API Key:</label>
            <div class="input-group">
                <input type="password" id="apiKey" class="form-input"
                       value="${config.apiKey}" placeholder="sk-ant-...">
                <button class="btn" onclick="togglePassword()">👁️</button>
            </div>
            <div class="status-row">
                <span class="${config.apiKey ? 'status-valid' : 'status-invalid'}">
                    ${config.apiKey ? '✅ Configurada' : '❌ Não configurada'}
                </span>
            </div>
        </div>

        <div style="display: flex; gap: 8px;">
            <button class="btn" onclick="verifyApi()">🔄 Verificar API</button>
            <button class="btn" onclick="saveApiKey()">💾 Salvar API Key</button>
        </div>

        <div class="form-hint" style="margin-top: 12px;">
            💡 Uma única API key é usada para todos os supervisores
        </div>
    </div>

    <div class="section">
        <div class="section-title">MODELOS E CUSTOS</div>

        <div class="form-group">
            <label class="form-label">Modelo Supervisor (análise rápida):</label>
            <select id="supervisorModel" class="form-select">
                ${availableModels.map(m => `
                    <option value="${m.id}" ${currentSupervisorModel === m.id ? 'selected' : ''}>
                        ${m.name} ${m.recommended === 'supervisor' ? '⭐ Recomendado' : ''}
                    </option>
                `).join('')}
            </select>
            <div class="form-hint">ℹ️ Usado para análise em tempo real do thinking (requer rapidez)</div>
        </div>

        <div class="form-group">
            <label class="form-label">Modelo Configurador (análise de documentos):</label>
            <select id="configuratorModel" class="form-select">
                ${availableModels.map(m => `
                    <option value="${m.id}" ${currentConfiguratorModel === m.id ? 'selected' : ''}>
                        ${m.name} ${m.recommended === 'configurator' ? '⭐ Recomendado' : ''}
                    </option>
                `).join('')}
            </select>
            <div class="form-hint">ℹ️ Usado apenas no setup inicial de projetos (requer inteligência)</div>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
            <button class="btn btn-primary" onclick="saveModels()">💾 Salvar Modelos</button>
        </div>

        <div class="section-title" style="margin-top: 24px;">PREÇOS POR MODELO (USD/1M tokens)</div>

        <div class="form-hint" style="margin-bottom: 16px;">
            💡 Personalize os preços para calcular custos corretamente.
            <a href="#" onclick="openPricingPage()" style="color: var(--accent);">Ver preços oficiais</a>
        </div>

        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 1px solid var(--border);">
                    <th style="text-align: left; padding: 8px;">Modelo</th>
                    <th style="text-align: right; padding: 8px;">Input ($)</th>
                    <th style="text-align: right; padding: 8px;">Output ($)</th>
                    <th style="text-align: center; padding: 8px;">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${availableModels.map(m => {
                    const price = modelPricing[m.id] || { input: m.defaultInput / 1_000_000, output: m.defaultOutput / 1_000_000 };
                    const inputPerMillion = price.input * 1_000_000;
                    const outputPerMillion = price.output * 1_000_000;
                    const isDefault = inputPerMillion === m.defaultInput && outputPerMillion === m.defaultOutput;
                    return `
                    <tr style="border-bottom: 1px solid var(--border);">
                        <td style="padding: 8px;">
                            ${m.name}
                            ${!isDefault ? '<span style="color: var(--warning);">*</span>' : ''}
                        </td>
                        <td style="padding: 8px;">
                            <input type="number" step="0.01" min="0"
                                   id="price-input-${m.id}"
                                   value="${inputPerMillion.toFixed(2)}"
                                   class="form-input" style="width: 100px; text-align: right;">
                        </td>
                        <td style="padding: 8px;">
                            <input type="number" step="0.01" min="0"
                                   id="price-output-${m.id}"
                                   value="${outputPerMillion.toFixed(2)}"
                                   class="form-input" style="width: 100px; text-align: right;">
                        </td>
                        <td style="padding: 8px; text-align: center;">
                            <button class="project-btn" onclick="savePricing('${m.id}')">💾</button>
                            <button class="project-btn" onclick="resetPricing('${m.id}')" title="Restaurar padrão">↩️</button>
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>

        <div style="display: flex; gap: 8px; margin-top: 16px;">
            <button class="btn" onclick="resetAllPricing()">↩️ Restaurar Todos os Preços</button>
        </div>

        <div class="form-hint" style="margin-top: 12px;">
            * Preço personalizado (diferente do padrão)<br>
            Taxa de conversão: 1 USD = R$ ${USD_TO_BRL.toFixed(2)}
        </div>
    </div>

    <div class="section">
        <div class="section-title">PROJETOS</div>

        ${projects.length > 0 ? projects.map(p => `
        <div class="project-card">
            <div class="project-header">
                <span class="project-name">
                    📁 ${p.name}
                    <span style="color: ${p.enabled !== false ? 'var(--success)' : 'var(--text-secondary)'};">${p.enabled !== false ? '🟢 Ativo' : '⚪ Inativo'}</span>
                </span>
            </div>
            <div class="project-meta">
                Supervisores: ${p.supervisors.length} | Regras: ${p.supervisors.reduce((acc, s) => acc + s.rules.length, 0)}<br>
                Última atualização: ${new Date(p.lastUpdated).toLocaleString('pt-BR')}<br>
                Arquivo: ${p.yamlPath}
            </div>
            <div class="project-actions">
                <button class="project-btn">✏️ Editar</button>
                <button class="project-btn">📄 Ver YAML</button>
                <button class="project-btn">⏸️ Desativar</button>
                <button class="project-btn">🗑️</button>
            </div>
        </div>
        `).join('') : `
        <div style="text-align: center; padding: 24px; color: var(--text-secondary);">
            Nenhum projeto configurado
        </div>
        `}

        <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button class="btn" onclick="send('newProject')">+ Novo Projeto</button>
            <button class="btn" onclick="send('importDocs')">📄 Importar de Documentos</button>
        </div>
    </div>

    <div class="section">
        <div class="section-title">COMPORTAMENTO</div>

        <div class="checkbox-group">
            <input type="checkbox" id="detectScopeReduction" ${config.detectScopeReduction ? 'checked' : ''}>
            <div class="checkbox-label">
                <span>Detectar redução de escopo</span>
                <div class="checkbox-description">Alerta quando Claude tenta fazer menos do que pedido</div>
            </div>
        </div>

        <div class="checkbox-group">
            <input type="checkbox" id="requireListBeforeRefactor" ${config.requireListBeforeRefactor ? 'checked' : ''}>
            <div class="checkbox-label">
                <span>Exigir lista antes de refatoração</span>
                <div class="checkbox-description">Para tarefas que afetam múltiplos arquivos</div>
            </div>
        </div>

        <div class="checkbox-group">
            <input type="checkbox" id="detectProcrastination" ${config.detectProcrastination ? 'checked' : ''}>
            <div class="checkbox-label">
                <span>Detectar linguagem de procrastinação</span>
                <div class="checkbox-description">Detecta: "por enquanto", "depois", "primeiro só"</div>
            </div>
        </div>

        <div class="checkbox-group">
            <input type="checkbox" id="verifyCompleteness" ${config.verifyCompleteness ? 'checked' : ''}>
            <div class="checkbox-label">
                <span>Verificar completude no "pronto"</span>
                <div class="checkbox-description">Compara progresso com escopo quando Claude diz terminou</div>
            </div>
        </div>

        <div class="checkbox-group">
            <input type="checkbox" id="aggressiveMode" ${config.aggressiveMode ? 'checked' : ''}>
            <div class="checkbox-label">
                <span>Modo agressivo</span>
                <div class="checkbox-description">Interrompe imediatamente em vez de alertar</div>
            </div>
        </div>

        <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">Buffer de notas:</label>
            <div class="input-group" style="max-width: 200px;">
                <input type="number" id="noteBufferSeconds" class="form-input"
                       value="${config.noteBufferSeconds}" min="1" max="60">
                <span style="padding: 10px;">segundos</span>
            </div>
            <div class="form-hint">Tempo de espera antes de perguntar o que fazer com nota</div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">LIMITES</div>

        <div class="form-group">
            <div class="limits-grid">
                <label>Máximo chamadas/hora:</label>
                <input type="number" id="maxCallsPerHour" class="form-input"
                       value="${config.maxCallsPerHour}" min="1" max="10000">
            </div>
            <div class="form-hint">ℹ️ Custo aproximado: R$ 1/hora</div>
        </div>

        <div class="form-group">
            <div class="limits-grid">
                <label>Alerta de custo diário:</label>
                <div class="input-group">
                    <span style="padding: 10px;">R$</span>
                    <input type="number" id="dailyCostAlert" class="form-input"
                           value="${config.dailyCostAlert}" step="0.01">
                </div>
            </div>
            <div class="form-hint">ℹ️ Notificação quando atingir este valor</div>
        </div>

        <div class="form-group">
            <div class="limits-grid">
                <label>Limite crítico diário:</label>
                <div class="input-group">
                    <span style="padding: 10px;">R$</span>
                    <input type="number" id="dailyCostLimit" class="form-input"
                           value="${config.dailyCostLimit}" step="0.01">
                </div>
            </div>
            <div class="form-hint">ℹ️ Sistema pausa automaticamente</div>
        </div>
    </div>

    <div class="actions-bar">
        <button class="btn btn-primary" onclick="saveConfig()">💾 Salvar Configurações</button>
        <button class="btn" onclick="resetConfig()">↩️ Restaurar Padrões</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function send(command, data) {
            vscode.postMessage({ command, ...data });
        }

        function togglePassword() {
            const input = document.getElementById('apiKey');
            input.type = input.type === 'password' ? 'text' : 'password';
        }

        function saveApiKey() {
            const apiKey = document.getElementById('apiKey').value;
            send('saveApiKey', { apiKey });
        }

        function verifyApi() {
            send('verifyApi', {});
        }

        function saveConfig() {
            const config = {
                supervisorModel: document.getElementById('supervisorModel').value,
                configuratorModel: document.getElementById('configuratorModel').value,
                maxCallsPerHour: parseInt(document.getElementById('maxCallsPerHour').value),
                dailyCostAlert: parseFloat(document.getElementById('dailyCostAlert').value),
                dailyCostLimit: parseFloat(document.getElementById('dailyCostLimit').value),
                detectScopeReduction: document.getElementById('detectScopeReduction').checked,
                requireListBeforeRefactor: document.getElementById('requireListBeforeRefactor').checked,
                detectProcrastination: document.getElementById('detectProcrastination').checked,
                verifyCompleteness: document.getElementById('verifyCompleteness').checked,
                aggressiveMode: document.getElementById('aggressiveMode').checked,
                noteBufferSeconds: parseInt(document.getElementById('noteBufferSeconds').value)
            };
            send('saveConfig', { config });
        }

        function resetConfig() {
            send('resetConfig', {});
        }

        function saveModels() {
            const supervisorModel = document.getElementById('supervisorModel').value;
            const configuratorModel = document.getElementById('configuratorModel').value;
            send('saveModels', { supervisorModel, configuratorModel });
        }

        function savePricing(modelId) {
            const inputPrice = parseFloat(document.getElementById('price-input-' + modelId).value);
            const outputPrice = parseFloat(document.getElementById('price-output-' + modelId).value);
            send('saveModelPricing', { modelId, inputPrice, outputPrice });
        }

        function resetPricing(modelId) {
            send('resetModelPricing', { modelId });
        }

        function resetAllPricing() {
            send('resetAllPricing', {});
        }

        function openPricingPage() {
            send('openPricingPage', {});
        }
    </script>
</body>
</html>`;
    }
}
