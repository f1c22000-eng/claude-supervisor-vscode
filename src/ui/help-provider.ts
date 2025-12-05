// ============================================
// CLAUDE SUPERVISOR - HELP PROVIDER
// ============================================

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// HELP PROVIDER
// ============================================

export class HelpProvider {
    private extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    public async openHelp(topic?: string): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'claudeSupervisor.help',
            'Claude Supervisor - Ajuda',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.extensionUri]
            }
        );

        panel.webview.html = await this.getHelpHtml(panel.webview, topic);

        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'openTopic') {
                this.updateHelpContent(panel, message.topic);
            }
        });
    }

    private async updateHelpContent(panel: vscode.WebviewPanel, topic: string): Promise<void> {
        panel.webview.html = await this.getHelpHtml(panel.webview, topic);
    }

    private async getHelpHtml(webview: vscode.Webview, topic?: string): Promise<string> {
        const helpContent = this.getHelpContent(topic || 'index');

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Supervisor - Ajuda</title>
    <style>
        :root {
            --bg-primary: #1e1e1e;
            --bg-secondary: #252526;
            --bg-tertiary: #2d2d2d;
            --border: #3c3c3c;
            --text-primary: #cccccc;
            --text-secondary: #808080;
            --accent: #007acc;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
            font-size: 14px;
            color: var(--text-primary);
            background: var(--bg-primary);
            display: flex;
            min-height: 100vh;
        }

        .sidebar {
            width: 250px;
            background: var(--bg-secondary);
            border-right: 1px solid var(--border);
            padding: 20px;
            position: fixed;
            height: 100vh;
            overflow-y: auto;
        }

        .sidebar h2 {
            font-size: 14px;
            margin-bottom: 16px;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .nav-item {
            display: block;
            padding: 8px 12px;
            color: var(--text-primary);
            text-decoration: none;
            border-radius: 4px;
            margin-bottom: 4px;
            cursor: pointer;
        }

        .nav-item:hover {
            background: var(--bg-tertiary);
        }

        .nav-item.active {
            background: var(--accent);
        }

        .content {
            flex: 1;
            margin-left: 250px;
            padding: 40px;
            max-width: 800px;
        }

        .content h1 {
            font-size: 24px;
            margin-bottom: 24px;
            padding-bottom: 12px;
            border-bottom: 2px solid var(--border);
        }

        .content h2 {
            font-size: 18px;
            margin-top: 32px;
            margin-bottom: 16px;
            color: var(--accent);
        }

        .content h3 {
            font-size: 16px;
            margin-top: 24px;
            margin-bottom: 12px;
        }

        .content p {
            line-height: 1.6;
            margin-bottom: 16px;
        }

        .content ul, .content ol {
            margin-left: 24px;
            margin-bottom: 16px;
        }

        .content li {
            line-height: 1.6;
            margin-bottom: 8px;
        }

        .content code {
            background: var(--bg-tertiary);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
        }

        .content pre {
            background: var(--bg-tertiary);
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            margin-bottom: 16px;
        }

        .content pre code {
            background: none;
            padding: 0;
        }

        .content table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
        }

        .content th, .content td {
            padding: 10px;
            border: 1px solid var(--border);
            text-align: left;
        }

        .content th {
            background: var(--bg-tertiary);
        }

        .tip {
            background: var(--bg-tertiary);
            border-left: 4px solid var(--accent);
            padding: 12px 16px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>Índice</h2>
        <a class="nav-item ${topic === 'index' || !topic ? 'active' : ''}" onclick="openTopic('index')">Início</a>
        <a class="nav-item ${topic === 'getting-started' ? 'active' : ''}" onclick="openTopic('getting-started')">Primeiros Passos</a>
        <a class="nav-item ${topic === 'scope-manager' ? 'active' : ''}" onclick="openTopic('scope-manager')">Gestor de Escopo</a>
        <a class="nav-item ${topic === 'supervisors' ? 'active' : ''}" onclick="openTopic('supervisors')">Supervisores</a>
        <a class="nav-item ${topic === 'behavior-detection' ? 'active' : ''}" onclick="openTopic('behavior-detection')">Detecção de Comportamento</a>
        <a class="nav-item ${topic === 'configuration' ? 'active' : ''}" onclick="openTopic('configuration')">Configuração</a>
        <a class="nav-item ${topic === 'troubleshooting' ? 'active' : ''}" onclick="openTopic('troubleshooting')">Resolução de Problemas</a>
        <a class="nav-item ${topic === 'api-costs' ? 'active' : ''}" onclick="openTopic('api-costs')">Custos e API</a>
        <a class="nav-item ${topic === 'commands' ? 'active' : ''}" onclick="openTopic('commands')">Comandos</a>
    </div>

    <div class="content">
        ${helpContent}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function openTopic(topic) {
            vscode.postMessage({ command: 'openTopic', topic });
        }
    </script>
</body>
</html>`;
    }

    private getHelpContent(topic: string): string {
        const contents: Record<string, string> = {
            'index': `
                <h1>Claude Supervisor - Ajuda</h1>
                <p>Bem-vindo ao sistema de ajuda do Claude Supervisor!</p>
                <h2>O Que é o Claude Supervisor?</h2>
                <p>O Claude Supervisor é uma extensão para VS Code que monitora o Claude Code em tempo real, detectando problemas, desvios de escopo e comportamentos indesejados.</p>
                <h2>Tópicos</h2>
                <ul>
                    <li><strong>Primeiros Passos</strong> - Como instalar e configurar</li>
                    <li><strong>Gestor de Escopo</strong> - Rastreamento de tarefas e progresso</li>
                    <li><strong>Supervisores</strong> - Sistema de análise hierárquica</li>
                    <li><strong>Detecção de Comportamento</strong> - Monitoramento de padrões</li>
                    <li><strong>Configuração</strong> - Opções e personalização</li>
                    <li><strong>Custos e API</strong> - Gerenciamento de custos</li>
                    <li><strong>Comandos</strong> - Atalhos e comandos disponíveis</li>
                </ul>
            `,
            'getting-started': `
                <h1>Primeiros Passos</h1>
                <h2>Requisitos</h2>
                <ul>
                    <li>VS Code 1.85 ou superior</li>
                    <li>Node.js 18 ou superior</li>
                    <li>Conta na Anthropic com API Key</li>
                    <li>Claude Code CLI instalado</li>
                </ul>
                <h2>Instalação</h2>
                <ol>
                    <li>Abra VS Code</li>
                    <li>Vá em Extensions (Ctrl+Shift+X)</li>
                    <li>Busque "Claude Supervisor"</li>
                    <li>Clique em Install</li>
                </ol>
                <h2>Configuração Inicial</h2>
                <ol>
                    <li>Clique no ícone 🧠 na barra lateral</li>
                    <li>Vá em Configuração</li>
                    <li>Cole sua API Key da Anthropic</li>
                    <li>Clique em Salvar</li>
                </ol>
            `,
            'scope-manager': `
                <h1>Gestor de Escopo</h1>
                <p>O Gestor de Escopo rastreia o que você pediu para o Claude Code fazer versus o que ele está realmente fazendo.</p>
                <h2>Por Que Usar?</h2>
                <ul>
                    <li>Pediu para refatorar 12 telas e o Claude só fez 3</li>
                    <li>Adicionou requisitos durante o trabalho e eles foram esquecidos</li>
                    <li>Claude disse "pronto" antes de terminar tudo</li>
                </ul>
                <h2>Comandos</h2>
                <table>
                    <tr><th>Comando</th><th>Descrição</th></tr>
                    <tr><td><code>/nota &lt;texto&gt;</code></td><td>Adiciona nota sem interromper</td></tr>
                    <tr><td><code>/escopo</code></td><td>Mostra escopo atual</td></tr>
                    <tr><td><code>/urgente &lt;texto&gt;</code></td><td>Interrompe e injeta mensagem</td></tr>
                </table>
            `,
            'supervisors': `
                <h1>Sistema de Supervisores</h1>
                <p>Supervisores são agentes de IA (Claude Haiku) que analisam o pensamento do Claude Code em tempo real.</p>
                <h2>Hierarquia</h2>
                <pre><code>Router (classifica o tema)
├── Técnico
│   ├── Frontend
│   ├── Segurança
│   └── Arquitetura
├── Negócio
│   └── [Projetos]
└── Comportamento
    ├── Completude
    └── Escopo</code></pre>
                <h2>Tipos</h2>
                <ul>
                    <li><strong>Router</strong> - Classifica o tema (~50ms)</li>
                    <li><strong>Coordinator</strong> - Agrupa relacionados (~50ms)</li>
                    <li><strong>Specialist</strong> - Contém regras específicas (~100ms)</li>
                </ul>
            `,
            'behavior-detection': `
                <h1>Detecção de Comportamento</h1>
                <p>Sistema que verifica se o Claude Code está tentando fazer menos do que foi pedido.</p>
                <h2>Tipos Detectados</h2>
                <h3>1. Redução de Escopo</h3>
                <ul>
                    <li>"vou fazer só essa por enquanto"</li>
                    <li>"começando pela principal"</li>
                    <li>"as outras depois"</li>
                </ul>
                <h3>2. Procrastinação</h3>
                <ul>
                    <li>"deixo pra depois"</li>
                    <li>"numa próxima iteração"</li>
                </ul>
                <h3>3. Incompletude</h3>
                <p>Detectado comparando progresso atual vs declaração de término.</p>
            `,
            'configuration': `
                <h1>Configuração</h1>
                <h2>API Key</h2>
                <p>Obtenha sua API Key em console.anthropic.com</p>
                <h2>Modelos</h2>
                <ul>
                    <li><strong>Supervisores:</strong> Claude 3.5 Haiku (recomendado)</li>
                    <li><strong>Configurador:</strong> Claude Sonnet 4</li>
                </ul>
                <h2>Comportamento</h2>
                <ul>
                    <li>☑️ Detectar redução de escopo</li>
                    <li>☑️ Exigir lista antes de refatoração</li>
                    <li>☑️ Detectar linguagem de procrastinação</li>
                    <li>☑️ Verificar completude no "pronto"</li>
                </ul>
            `,
            'troubleshooting': `
                <h1>Resolução de Problemas</h1>
                <h2>Sistema não conecta ao Claude Code</h2>
                <ul>
                    <li>Verifique se Claude Code está rodando</li>
                    <li>Reinicie o Claude Code</li>
                    <li>Recarregue a janela VS Code</li>
                </ul>
                <h2>API Key inválida</h2>
                <ul>
                    <li>Verifique se começa com <code>sk-ant-</code></li>
                    <li>Verifique saldo no console Anthropic</li>
                </ul>
                <h2>Performance lenta</h2>
                <ul>
                    <li>Reduza número de supervisores</li>
                    <li>Use Haiku (não Sonnet)</li>
                </ul>
            `,
            'api-costs': `
                <h1>Custos e API</h1>
                <h2>Preços (Haiku)</h2>
                <ul>
                    <li>Input: $0.25/1M tokens</li>
                    <li>Output: $1.25/1M tokens</li>
                    <li>Por chamada: ~$0.00019</li>
                </ul>
                <h2>Custo por Sessão (4h)</h2>
                <p>~R$ 1,00 a R$ 1,50</p>
                <h2>Custo Mensal</h2>
                <ul>
                    <li>Uso leve (2h/dia): R$ 20-30</li>
                    <li>Uso médio (4h/dia): R$ 40-60</li>
                    <li>Uso intenso (8h/dia): R$ 80-120</li>
                </ul>
            `,
            'commands': `
                <h1>Comandos e Atalhos</h1>
                <h2>Atalhos de Teclado</h2>
                <table>
                    <tr><th>Atalho</th><th>Comando</th></tr>
                    <tr><td><code>Ctrl+Shift+S</code></td><td>Toggle sistema</td></tr>
                    <tr><td><code>Ctrl+Shift+N</code></td><td>Adicionar nota</td></tr>
                    <tr><td><code>Ctrl+Shift+R</code></td><td>Adicionar regra</td></tr>
                    <tr><td><code>Ctrl+Shift+E</code></td><td>Mostrar escopo</td></tr>
                </table>
                <h2>Comandos de Terminal</h2>
                <table>
                    <tr><th>Comando</th><th>Descrição</th></tr>
                    <tr><td><code>/nota &lt;texto&gt;</code></td><td>Nota sem interromper</td></tr>
                    <tr><td><code>/escopo</code></td><td>Mostra escopo atual</td></tr>
                    <tr><td><code>/urgente &lt;texto&gt;</code></td><td>Interrompe e injeta</td></tr>
                    <tr><td><code>/regra &lt;texto&gt;</code></td><td>Adiciona regra rápida</td></tr>
                    <tr><td><code>/status</code></td><td>Status dos supervisores</td></tr>
                </table>
            `
        };

        return contents[topic] || contents['index'];
    }
}
