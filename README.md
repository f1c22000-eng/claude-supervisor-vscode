# Claude Supervisor

Extensão VS Code para monitoramento em tempo real do Claude Code, detectando problemas, desvios de escopo e comportamentos indesejados através de uma hierarquia inteligente de supervisores.

## Funcionalidades

- **Monitoramento em tempo real** - Captura e analisa o "thinking" do Claude Code via proxy reverso
- **Hierarquia de supervisores** - Sistema de supervisores especializados (técnico, negócio, comportamento) usando Claude Haiku
- **Gestor de escopo** - Rastreia tarefas, itens e progresso, alertando sobre completude
- **Detecção de comportamento** - Identifica redução de escopo, procrastinação e incompletude
- **Configuração visual** - Painéis WebView para configuração e monitoramento
- **Terminal integrado** - Comandos `/nota`, `/escopo`, `/regra`, `/urgente`, `/status`
- **Importação de documentos** - Gera supervisores automaticamente a partir de PDF, DOCX, Markdown e YAML
- **Modelos configuráveis** - Escolha entre Claude Haiku, Sonnet e Opus com preços personalizáveis
- **Persistência** - Histórico de alertas e estatísticas mantidos entre sessões

## Como Funciona

O Claude Supervisor atua como um **proxy reverso HTTP**:

1. Você executa Claude Code com: `ANTHROPIC_BASE_URL=http://localhost:8888 claude`
2. O proxy recebe as requisições HTTP e encaminha para `api.anthropic.com` via HTTPS
3. As respostas SSE são interceptadas e o "thinking" é extraído em tempo real
4. Supervisores analisam o thinking e alertam sobre problemas

## Instalação

### Via VS Code Marketplace

1. Abra VS Code
2. Vá para Extensions (Ctrl+Shift+X)
3. Busque "Claude Supervisor"
4. Clique em Install

### Via VSIX (manual)

1. Baixe o arquivo `.vsix` da [releases](https://github.com/f1c22000-eng/claude-supervisor-vscode/releases)
2. No VS Code, vá para Extensions
3. Clique nos três pontos (...) > Install from VSIX
4. Selecione o arquivo baixado

### Requisitos

- VS Code 1.106.0 ou superior
- Node.js 18+ (para desenvolvimento)
- API Key da Anthropic

## Configuração Inicial

1. Após instalar, clique no ícone do Claude Supervisor na barra lateral
2. Vá em **Configuração**
3. Insira sua **API Key da Anthropic**
4. Ative o sistema com `Ctrl+Shift+S`
5. Execute Claude Code com o proxy:
   ```bash
   ANTHROPIC_BASE_URL=http://localhost:8888 claude
   ```

## Uso

### Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Ctrl+Shift+S` | Toggle sistema (ligar/desligar) |
| `Ctrl+Shift+N` | Adicionar nota rápida |
| `Ctrl+Shift+R` | Adicionar regra rápida (com wizard) |
| `Ctrl+Shift+E` | Mostrar escopo atual |
| `Ctrl+Shift+T` | Abrir terminal do supervisor |

### Comandos de Terminal

```bash
/nota <texto>    # Adiciona nota sem interromper
/escopo          # Mostra escopo atual
/regra <texto>   # Adiciona regra rápida
/urgente <texto> # Interrompe e injeta mensagem
/status          # Mostra status dos supervisores
/help            # Mostra ajuda
/clear           # Limpa o terminal
```

### Command Palette

Acesse com `Ctrl+Shift+P` e busque por "Claude Supervisor":

- `Claude Supervisor: Toggle` - Ligar/desligar sistema
- `Claude Supervisor: Open Scope Manager` - Abrir gestor de escopo
- `Claude Supervisor: Open Supervisors` - Abrir painel de supervisores
- `Claude Supervisor: Open Monitor` - Abrir monitor em tempo real
- `Claude Supervisor: Open Configuration` - Abrir configurações
- `Claude Supervisor: Add Note` - Adicionar nota
- `Claude Supervisor: Add Rule` - Adicionar regra (wizard completo)
- `Claude Supervisor: Import Documents` - Importar documentos

## Hierarquia de Supervisores

```
Router (raiz)
├── Técnico (Coordinator)
│   ├── Segurança (Specialist)
│   └── Arquitetura (Specialist)
├── Negócio (Coordinator)
│   └── Validações (Specialist)
└── Comportamento (Coordinator)
    └── Completude (Specialist)
```

Cada supervisor pode ter:
- **Keywords** - Palavras-chave que ativam o supervisor
- **Rules** - Regras a serem verificadas
- **Severity** - Nível de severidade (low, medium, high, critical)

## Configuração de Modelos e Custos

Na tela de Configuração, você pode:

- **Escolher modelos** para Supervisor (rápido) e Configurador (inteligente)
- **Personalizar preços** por modelo (USD/1M tokens)
- **Definir limites** de custo diário (alerta e crítico)
- **Configurar rate limits** por hora

### Modelos Disponíveis

| Modelo | Input | Output | Recomendado |
|--------|-------|--------|-------------|
| Claude 3.5 Haiku | $0.80/1M | $4.00/1M | Supervisor |
| Claude 3 Haiku (Legacy) | $0.25/1M | $1.25/1M | - |
| Claude Sonnet 4 | $3.00/1M | $15.00/1M | Configurador |
| Claude 3.5 Sonnet | $3.00/1M | $15.00/1M | - |
| Claude Opus 4 | $15.00/1M | $75.00/1M | - |

## Configuração de Supervisores (YAML)

Crie arquivos em `config/supervisors/`:

```yaml
project: MeuProjeto
version: "1.0"

supervisors:
  - name: Segurança
    type: specialist
    parent: Técnico
    keywords:
      - sql
      - query
      - password
    rules:
      - id: sql-injection
        description: "Usar prepared statements em queries SQL"
        severity: critical
        check: "Verificar concatenação de strings em queries"
        enabled: true
```

## Importação de Documentos

O sistema suporta importação de:

- **PDF** - Extração de texto completa
- **DOCX** - Documentos Word
- **Markdown** - Arquivos .md
- **YAML** - Configurações diretas

A partir dos documentos, o Configurador (Sonnet) gera automaticamente supervisores com regras relevantes.

## Estimativas de Custo

O sistema usa Claude Haiku para análises rápidas:

- **Por chamada**: ~$0.00019
- **Por sessão (4h)**: ~$0.19 (~R$ 1,10)
- **Mensal (uso médio)**: ~R$ 30-40

Configure limites em Configuração para controlar gastos.

## Desenvolvimento

```bash
# Clonar repositório
git clone https://github.com/f1c22000-eng/claude-supervisor-vscode.git
cd claude-supervisor-vscode

# Instalar dependências
npm install

# Compilar
npm run compile

# Modo watch
npm run watch

# Empacotar
npm run package
```

## Estrutura do Projeto

```
claude-supervisor-vscode/
├── src/
│   ├── core/           # Lógica principal (api, config, types)
│   ├── interceptor/    # Proxy reverso e extração de thinking
│   ├── supervisors/    # Sistema de supervisores hierárquico
│   ├── scope/          # Gestor de escopo e tarefas
│   ├── terminal/       # Terminal commands
│   └── ui/             # Painéis WebView
├── config/             # Configurações default
├── help/               # Arquivos de ajuda
├── media/              # Recursos visuais
└── docs/               # Documentação técnica
```

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para detalhes sobre como contribuir.

## Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## Links

- [Documentação](docs/)
- [Issues](https://github.com/f1c22000-eng/claude-supervisor-vscode/issues)
- [Changelog](CHANGELOG.md)
- [Releases](https://github.com/f1c22000-eng/claude-supervisor-vscode/releases)
