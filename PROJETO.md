# PROJETO: Claude Supervisor - Extensão VS Code

## Visão Geral

Extensão para VS Code que monitora Claude Code em tempo real, capturando o "thinking" antes de virar resposta, e usando uma hierarquia de supervisores (Haiku) para detectar problemas, desvios de escopo e comportamentos indesejados.

**Repositório:** `claude-supervisor-vscode`
**Licença:** MIT
**Stack:** TypeScript, Node.js, VS Code Extension API, Anthropic API

---

## FASE 1: SETUP DO PROJETO

### 1.1 Criar Estrutura de Pastas

- [ ] Criar pasta raiz `claude-supervisor-vscode`
- [ ] Criar subpasta `src/`
- [ ] Criar subpasta `src/core/` (lógica principal)
- [ ] Criar subpasta `src/supervisors/` (agentes supervisores)
- [ ] Criar subpasta `src/ui/` (painéis e webviews)
- [ ] Criar subpasta `src/interceptor/` (captura HTTP)
- [ ] Criar subpasta `src/scope/` (gestor de escopo)
- [ ] Criar subpasta `media/` (ícones, CSS, HTML dos painéis)
- [ ] Criar subpasta `config/` (configurações default)
- [ ] Criar subpasta `config/supervisors/` (YAMLs de supervisores)
- [ ] Criar subpasta `docs/` (documentação)
- [ ] Criar subpasta `help/` (arquivos de help do sistema)

### 1.2 Inicializar Projeto Node

- [ ] Executar `npm init -y`
- [ ] Instalar dependências de desenvolvimento:
  ```bash
  npm install -D typescript @types/node @types/vscode vsce esbuild
  ```
- [ ] Instalar dependências de produção:
  ```bash
  npm install @anthropic-ai/sdk yaml uuid
  ```
- [ ] Criar `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "module": "commonjs",
      "target": "ES2020",
      "outDir": "out",
      "lib": ["ES2020"],
      "sourceMap": true,
      "rootDir": "src",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "resolveJsonModule": true
    },
    "exclude": ["node_modules", ".vscode-test"]
  }
  ```
- [ ] Criar `.gitignore`:
  ```
  node_modules/
  out/
  *.vsix
  .vscode-test/
  .env
  ```

### 1.3 Configurar package.json para VS Code Extension

- [ ] Adicionar campos obrigatórios:
  - `publisher`: seu nome/organização
  - `engines.vscode`: "^1.85.0"
  - `activationEvents`: ["onStartupFinished"]
  - `main`: "./out/extension.js"
  - `contributes.viewsContainers`
  - `contributes.views`
  - `contributes.commands`
  - `contributes.configuration`
- [ ] Definir ícone da extensão em `icon` (PNG 128x128)
- [ ] Adicionar scripts:
  ```json
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package"
  }
  ```

### 1.4 Criar Arquivos Base

- [ ] Criar `src/extension.ts` (ponto de entrada)
- [ ] Criar `src/core/config.ts` (gerenciador de configurações)
- [ ] Criar `src/core/api.ts` (cliente Anthropic)
- [ ] Criar `src/core/types.ts` (interfaces TypeScript)
- [ ] Criar `src/core/constants.ts` (constantes do sistema)

---

## FASE 2: INTERCEPTOR HTTP

O interceptor captura as chamadas do Claude Code para a API Anthropic.

### 2.1 Estrutura do Interceptor

- [ ] Criar `src/interceptor/index.ts` (exporta módulo)
- [ ] Criar `src/interceptor/proxy.ts` (proxy HTTP local)
- [ ] Criar `src/interceptor/stream-parser.ts` (parser de SSE/streaming)
- [ ] Criar `src/interceptor/thinking-buffer.ts` (acumula thinking chunks)

### 2.2 Implementar Proxy HTTP

- [ ] Usar biblioteca `http-proxy` ou implementar proxy simples
- [ ] Interceptar apenas requests para `api.anthropic.com`
- [ ] Passar outros requests sem modificação
- [ ] Capturar response streaming (SSE)
- [ ] Parsear eventos `thinking_delta` e `text_delta`
- [ ] Emitir eventos para o sistema quando detectar thinking

### 2.3 Configurar Variáveis de Ambiente

- [ ] Detectar se Claude Code está rodando
- [ ] Configurar `HTTPS_PROXY` ou usar monkey-patching
- [ ] Alternativa: usar técnica do `claude-trace` (require interceptor)
- [ ] Criar script wrapper `claude-supervised` que injeta interceptor

### 2.4 Testes do Interceptor

- [ ] Testar captura de request normal
- [ ] Testar captura de streaming
- [ ] Testar extração de thinking chunks
- [ ] Testar reconexão em caso de falha

---

## FASE 3: SISTEMA DE SUPERVISORES

### 3.1 Estrutura Base dos Supervisores

- [ ] Criar `src/supervisors/index.ts` (exporta módulo)
- [ ] Criar `src/supervisors/supervisor-node.ts` (classe base)
- [ ] Criar `src/supervisors/router.ts` (roteia para supervisor correto)
- [ ] Criar `src/supervisors/coordinator.ts` (coordenador de área)
- [ ] Criar `src/supervisors/specialist.ts` (especialista com regras)
- [ ] Criar `src/supervisors/hierarchy.ts` (gerencia árvore de supervisores)

### 3.2 Implementar Router

- [ ] Recebe thinking chunk
- [ ] Analisa keywords para decidir área
- [ ] Chama Haiku com prompt de classificação
- [ ] Retorna ID do coordinator apropriado
- [ ] Cache de decisões recentes (evita chamadas repetidas)

### 3.3 Implementar Coordinator

- [ ] Recebe thinking do router
- [ ] Decide qual specialist chamar
- [ ] Pode ter múltiplos specialists filhos
- [ ] Chama Haiku com prompt de sub-classificação

### 3.4 Implementar Specialist

- [ ] Carrega regras do YAML
- [ ] Monta prompt com regras específicas
- [ ] Chama Haiku para análise
- [ ] Retorna resultado: OK ou PROBLEMA com correção
- [ ] Registra severidade: baixa, média, alta, crítica

### 3.5 Supervisor de Comportamento (Especial)

- [ ] Criar `src/supervisors/behavior/index.ts`
- [ ] Criar `src/supervisors/behavior/completeness.ts` (verifica escopo completo)
- [ ] Criar `src/supervisors/behavior/laziness.ts` (detecta preguiça)
- [ ] Criar `src/supervisors/behavior/scope-reduction.ts` (detecta redução)
- [ ] Recebe: pedido original + thinking atual + progresso
- [ ] Detecta padrões: "por enquanto", "principal", "depois"
- [ ] Compara números: pedido 12 telas, fazendo 1 = problema

### 3.6 Carregar Configuração YAML

- [ ] Criar `src/supervisors/config-loader.ts`
- [ ] Ler arquivos YAML de `config/supervisors/`
- [ ] Validar estrutura do YAML
- [ ] Montar árvore de supervisores em memória
- [ ] Hot reload quando arquivo YAML muda

### 3.7 Chamadas Paralelas

- [ ] Implementar `Promise.all` para múltiplos supervisores
- [ ] Timeout de 5 segundos por chamada
- [ ] Fallback: se falhar, retorna OK (não bloqueia)
- [ ] Agregar resultados e ordenar por severidade

---

## FASE 4: GESTOR DE ESCOPO

### 4.1 Estrutura do Gestor

- [ ] Criar `src/scope/index.ts` (exporta módulo)
- [ ] Criar `src/scope/scope-manager.ts` (gerenciador principal)
- [ ] Criar `src/scope/task.ts` (representa uma tarefa)
- [ ] Criar `src/scope/requirement.ts` (representa um requisito)
- [ ] Criar `src/scope/note.ts` (representa uma nota pendente)
- [ ] Criar `src/scope/progress-tracker.ts` (rastreia progresso)

### 4.2 Captura de Mensagens

- [ ] Escutar mensagens do usuário para Claude Code
- [ ] Escutar respostas do Claude Code
- [ ] Extrair informações de escopo automaticamente
- [ ] Detectar: números, "todas", "cada", listas

### 4.3 Buffer de Notas

- [ ] Comando `/nota` adiciona à lista sem interromper
- [ ] Timer de 10 segundos antes de perguntar o que fazer
- [ ] Opções: aplicar agora, aplicar no final, descartar
- [ ] Persistir notas entre sessões

### 4.4 Tracking de Progresso

- [ ] Detectar quando Claude diz "feito", "pronto", "terminei"
- [ ] Comparar com escopo definido
- [ ] Alertar se progresso < 100%
- [ ] Listar itens pendentes

### 4.5 Integração com Supervisor de Comportamento

- [ ] Passar escopo atual para supervisor
- [ ] Supervisor compara thinking vs escopo
- [ ] Detectar desvios em tempo real

---

## FASE 5: INTERFACE DO USUÁRIO (PAINÉIS)

**IMPORTANTE:** Os layouts de todas as telas estão detalhados no arquivo `TELAS.md`

### 5.1 Painel Principal (Sidebar)

- [ ] Criar `src/ui/sidebar-provider.ts`
- [ ] Criar `media/sidebar.html` (template)
- [ ] Criar `media/sidebar.css` (estilos)
- [ ] Criar `media/sidebar.js` (interatividade)
- [ ] Implementar seções colapsáveis:
  - [ ] Status Geral
  - [ ] Gestor de Escopo (resumo)
  - [ ] Supervisores (resumo)
  - [ ] Monitor (resumo)
  - [ ] Configuração (link)
- [ ] Botões de ação rápida em cada seção
- [ ] Atualização em tempo real via postMessage

### 5.2 Painel: Gestor de Escopo (Detalhado)

- [ ] Criar `src/ui/scope-panel.ts`
- [ ] Criar `media/scope.html`
- [ ] Mostrar tarefa ativa
- [ ] Barra de progresso visual
- [ ] Lista de arquivos/itens com status (✅🔄⬜)
- [ ] Lista de requisitos
- [ ] Área de notas pendentes
- [ ] Campo para adicionar nota/requisito
- [ ] Ver layout em `TELAS.md` seção "Tela: Gestor de Escopo"

### 5.3 Painel: Supervisores (Detalhado)

- [ ] Criar `src/ui/supervisors-panel.ts`
- [ ] Criar `media/supervisors.html`
- [ ] Mostrar árvore hierárquica
- [ ] Status de cada nó (🟢🟡🔴)
- [ ] Atividade recente com timestamps
- [ ] Clique em nó abre detalhes
- [ ] Ver layout em `TELAS.md` seção "Tela: Supervisores"

### 5.4 Painel: Detalhes do Supervisor

- [ ] Criar `src/ui/supervisor-detail-panel.ts`
- [ ] Criar `media/supervisor-detail.html`
- [ ] Mostrar keywords do supervisor
- [ ] Listar todas as regras
- [ ] Checkbox para ativar/desativar regra
- [ ] Botões editar/excluir regra
- [ ] Botão adicionar regra
- [ ] Ver layout em `TELAS.md` seção "Tela: Detalhes de um Supervisor"

### 5.5 Painel: Monitor

- [ ] Criar `src/ui/monitor-panel.ts`
- [ ] Criar `media/monitor.html`
- [ ] Mostrar conexão com Claude Code
- [ ] Stream de thinking ao vivo (últimos N chunks)
- [ ] Estatísticas da sessão
- [ ] Histórico de intervenções
- [ ] Ver layout em `TELAS.md` seção "Tela: Monitor"

### 5.6 Painel: Configuração

- [ ] Criar `src/ui/config-panel.ts`
- [ ] Criar `media/config.html`
- [ ] Campo para API Key (com máscara)
- [ ] Seletor de modelo para supervisores
- [ ] Seletor de modelo para configurador
- [ ] Lista de projetos configurados
- [ ] Checkboxes de comportamento
- [ ] Campos de limites (chamadas/hora, custo diário)
- [ ] Ver layout em `TELAS.md` seção "Tela: Configuração"

### 5.7 Painel: Importar Documentos

- [ ] Criar `src/ui/import-panel.ts`
- [ ] Criar `media/import.html`
- [ ] Área de drag-and-drop para arquivos
- [ ] Lista de arquivos selecionados
- [ ] Campo nome do projeto
- [ ] Botão analisar e gerar
- [ ] Indicador de progresso
- [ ] Preview da hierarquia gerada
- [ ] Ver layout em `TELAS.md` seção "Tela: Importar Documentos"

### 5.8 Sistema de Help Integrado

- [ ] Criar `src/ui/help-provider.ts`
- [ ] Carregar arquivos de help de `help/`
- [ ] Botão [?] em cada painel abre help contextual
- [ ] Help searchable
- [ ] **IMPORTANTE:** O conteúdo do help está em `HELP.md`
- [ ] Claude Code deve criar arquivos individuais de help:
  - [ ] `help/getting-started.md`
  - [ ] `help/scope-manager.md`
  - [ ] `help/supervisors.md`
  - [ ] `help/behavior-detection.md`
  - [ ] `help/configuration.md`
  - [ ] `help/troubleshooting.md`
  - [ ] `help/api-costs.md`
  - [ ] `help/commands.md`

---

## FASE 6: CONFIGURADOR AUTOMÁTICO

### 6.1 Analisador de Documentos

- [ ] Criar `src/core/configurator.ts`
- [ ] Ler documentos (.md, .txt, .pdf, .docx)
- [ ] Enviar para Claude Sonnet (não Haiku)
- [ ] Extrair temas e sub-temas
- [ ] Extrair regras por seção
- [ ] Gerar estrutura hierárquica

### 6.2 Gerador de YAML

- [ ] Receber estrutura do analisador
- [ ] Gerar YAML válido
- [ ] Criar keywords automáticas
- [ ] Criar prompts para cada specialist
- [ ] Salvar em `config/supervisors/{projeto}.yaml`

### 6.3 Editor de Regras

- [ ] Interface para editar regra individual
- [ ] Campos: descrição, severidade, exemplo violação
- [ ] Validar antes de salvar
- [ ] Hot reload após salvar

### 6.4 Adição Rápida de Regras

- [ ] Comando `/regra` no terminal
- [ ] Comando palette: "Claude Supervisor: Add Rule"
- [ ] Detectar área automaticamente pelo contexto
- [ ] Perguntar severidade
- [ ] Salvar e ativar imediatamente

---

## FASE 7: COMANDOS E ATALHOS

### 7.1 Registrar Comandos

- [ ] `claudeSupervisor.toggle` - Ativar/desativar sistema
- [ ] `claudeSupervisor.openScope` - Abrir gestor de escopo
- [ ] `claudeSupervisor.openSupervisors` - Abrir supervisores
- [ ] `claudeSupervisor.openMonitor` - Abrir monitor
- [ ] `claudeSupervisor.openConfig` - Abrir configuração
- [ ] `claudeSupervisor.addNote` - Adicionar nota rápida
- [ ] `claudeSupervisor.addRule` - Adicionar regra rápida
- [ ] `claudeSupervisor.showScope` - Mostrar escopo no terminal
- [ ] `claudeSupervisor.importDocs` - Importar documentos

### 7.2 Atalhos de Teclado

- [ ] `Ctrl+Shift+S` - Toggle sistema
- [ ] `Ctrl+Shift+N` - Adicionar nota
- [ ] `Ctrl+Shift+R` - Adicionar regra
- [ ] `Ctrl+Shift+E` - Mostrar escopo

### 7.3 Comandos de Terminal (quando Claude Code ativo)

- [ ] `/nota <texto>` - Adiciona nota sem interromper
- [ ] `/escopo` - Mostra escopo atual
- [ ] `/regra <texto>` - Adiciona regra rápida
- [ ] `/urgente <texto>` - Interrompe e injeta mensagem
- [ ] `/status` - Mostra status dos supervisores

---

## FASE 8: PERSISTÊNCIA E ESTADO

### 8.1 Armazenamento Local

- [ ] Usar `context.globalState` para configurações globais
- [ ] Usar `context.workspaceState` para estado do workspace
- [ ] Salvar: API key (criptografada), preferências, histórico

### 8.2 Arquivos de Configuração

- [ ] `config/settings.yaml` - Configurações gerais
- [ ] `config/supervisors/*.yaml` - Supervisores por projeto
- [ ] `.claude-supervisor/` na raiz do projeto (opcional, versionável)

### 8.3 Histórico e Logs

- [ ] Log de intervenções (últimas 1000)
- [ ] Log de mudanças de configuração
- [ ] Estatísticas de uso (chamadas, custo)
- [ ] Exportar histórico para arquivo

---

## FASE 9: INTEGRAÇÃO COM API ANTHROPIC

### 9.1 Cliente API

- [ ] Criar `src/core/anthropic-client.ts`
- [ ] Wrapper do SDK oficial `@anthropic-ai/sdk`
- [ ] Configurar timeout (5s para Haiku, 30s para Sonnet)
- [ ] Retry automático (3 tentativas)
- [ ] Rate limiting local

### 9.2 Gerenciamento de Custos

- [ ] Contar tokens de input e output
- [ ] Calcular custo por chamada
- [ ] Acumular custo diário
- [ ] Alertar quando atingir limite
- [ ] Pausar se ultrapassar limite crítico

### 9.3 Cache de Respostas

- [ ] Cache de classificações do router (TTL 5min)
- [ ] Cache de análises idênticas (TTL 1min)
- [ ] Invalidar cache quando regras mudam

---

## FASE 10: TESTES

### 10.1 Testes Unitários

- [ ] Testar parser de streaming
- [ ] Testar router de supervisores
- [ ] Testar gestor de escopo
- [ ] Testar gerador de YAML

### 10.2 Testes de Integração

- [ ] Testar fluxo completo: captura → análise → alerta
- [ ] Testar importação de documentos
- [ ] Testar hot reload de configuração

### 10.3 Testes Manuais

- [ ] Testar com Claude Code real
- [ ] Testar todos os painéis
- [ ] Testar comandos e atalhos
- [ ] Testar em diferentes SO (Windows, Mac, Linux)

---

## FASE 11: DOCUMENTAÇÃO

### 11.1 Arquivos de Documentação

- [ ] `README.md` - Visão geral e instalação
- [ ] `CHANGELOG.md` - Histórico de versões
- [ ] `CONTRIBUTING.md` - Como contribuir
- [ ] `docs/architecture.md` - Arquitetura técnica
- [ ] `docs/api.md` - API interna
- [ ] `docs/troubleshooting.md` - Resolução de problemas

### 11.2 Help do Sistema (Criar via Claude Code)

- [ ] Gerar `help/getting-started.md` baseado em `HELP.md`
- [ ] Gerar `help/scope-manager.md` baseado em `HELP.md`
- [ ] Gerar `help/supervisors.md` baseado em `HELP.md`
- [ ] Gerar `help/behavior-detection.md` baseado em `HELP.md`
- [ ] Gerar `help/configuration.md` baseado em `HELP.md`
- [ ] Gerar `help/troubleshooting.md` baseado em `HELP.md`
- [ ] Gerar `help/api-costs.md` baseado em `HELP.md`
- [ ] Gerar `help/commands.md` baseado em `HELP.md`

---

## FASE 12: PUBLICAÇÃO

### 12.1 Preparar para Marketplace

- [ ] Criar ícone 128x128 PNG
- [ ] Escrever descrição completa
- [ ] Adicionar screenshots
- [ ] Definir categorias e tags
- [ ] Criar conta de publisher no VS Code Marketplace

### 12.2 Build e Package

- [ ] `npm run compile`
- [ ] `vsce package`
- [ ] Testar `.vsix` localmente
- [ ] `vsce publish`

### 12.3 Pós-Publicação

- [ ] Monitorar issues no GitHub
- [ ] Responder feedback
- [ ] Planejar próximas versões

---

## ARQUITETURA TÉCNICA

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS CODE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    EXTENSION.TS                          │   │
│  │                   (Ponto de entrada)                     │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
│         ┌──────────────────┼──────────────────┐                │
│         │                  │                  │                │
│         ▼                  ▼                  ▼                │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │ INTERCEPTOR │   │   SCOPE     │   │     UI      │          │
│  │             │   │  MANAGER    │   │  PROVIDERS  │          │
│  │ - proxy.ts  │   │             │   │             │          │
│  │ - parser.ts │   │ - task.ts   │   │ - sidebar   │          │
│  │ - buffer.ts │   │ - notes.ts  │   │ - panels    │          │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘          │
│         │                  │                  │                │
│         └──────────────────┼──────────────────┘                │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SUPERVISORS                           │   │
│  │                                                          │   │
│  │  ┌─────────┐  ┌─────────────┐  ┌────────────────┐       │   │
│  │  │ ROUTER  │─►│ COORDINATOR │─►│   SPECIALIST   │       │   │
│  │  └─────────┘  └─────────────┘  └────────────────┘       │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────┐        │   │
│  │  │           BEHAVIOR SUPERVISOR               │        │   │
│  │  │  - completeness.ts                          │        │   │
│  │  │  - laziness.ts                              │        │   │
│  │  │  - scope-reduction.ts                       │        │   │
│  │  └─────────────────────────────────────────────┘        │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   ANTHROPIC CLIENT                       │   │
│  │                                                          │   │
│  │  - Haiku (supervisores) ~200ms                          │   │
│  │  - Sonnet (configurador) ~2s                            │   │
│  │  - Cache, retry, rate limit                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

```
Claude Code ──► HTTP Request ──► Anthropic API
                    │
                    │ (interceptado)
                    ▼
             ┌─────────────┐
             │ INTERCEPTOR │
             └──────┬──────┘
                    │ thinking_delta events
                    ▼
             ┌─────────────┐
             │   BUFFER    │ (acumula chunks)
             └──────┬──────┘
                    │ a cada ~200 chars
                    ▼
             ┌─────────────┐
             │   ROUTER    │ ──► Haiku: "qual área?"
             └──────┬──────┘
                    │
                    ▼
             ┌─────────────┐
             │ COORDINATOR │ ──► Haiku: "qual sub-área?"
             └──────┬──────┘
                    │
                    ▼
             ┌─────────────┐
             │ SPECIALIST  │ ──► Haiku: "viola regra?"
             └──────┬──────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
   [OK: continua]        [PROBLEMA: intervém]
                                │
                                ▼
                         ┌─────────────┐
                         │ ALERTA/     │
                         │ INJEÇÃO     │
                         └─────────────┘
```

---

## REGRAS E RESTRIÇÕES

### O Que PODE

- Ler qualquer arquivo do projeto
- Interceptar tráfego HTTP para `api.anthropic.com`
- Mostrar notificações no VS Code
- Criar painéis e webviews
- Acessar configurações do workspace
- Salvar estado local

### O Que NÃO PODE

- Modificar arquivos sem permissão explícita
- Enviar dados para outros servidores além da Anthropic
- Armazenar API key em texto plano
- Bloquear completamente o Claude Code (sempre tem bypass)
- Coletar telemetria sem consentimento

### Segurança

- API key deve ser armazenada criptografada
- Não logar conteúdo sensível (senhas, tokens)
- Não enviar código-fonte para análise (só thinking)
- Respeitar .gitignore ao listar arquivos

---

## ESTIMATIVAS DE CUSTO

### Por Chamada (Haiku)

- Input: ~500 tokens × $0.00025/1K = $0.000125
- Output: ~50 tokens × $0.00125/1K = $0.0000625
- **Total: ~$0.00019 por chamada**

### Por Sessão (4 horas)

- Chunks de thinking: ~500
- Chamadas por chunk: ~2 (router + specialist)
- Total chamadas: ~1000
- **Custo: ~$0.19 (~R$ 1,10)**

### Mensal (uso médio)

- 22 dias × 5h = 110h
- ~R$ 30-40/mês

---

## PRÓXIMOS PASSOS IMEDIATOS

1. [ ] Criar pasta do projeto
2. [ ] Copiar os 3 arquivos MD para a pasta
3. [ ] Inicializar npm e TypeScript
4. [ ] Criar estrutura de pastas
5. [ ] Implementar extension.ts básico
6. [ ] Testar que extensão carrega no VS Code
7. [ ] Começar pelo interceptor (FASE 2)

---

## ARQUIVOS DE REFERÊNCIA

- `TELAS.md` - Layouts detalhados de todas as interfaces
- `HELP.md` - Conteúdo completo do sistema de help
- Este arquivo (`PROJETO.md`) - Checklist e arquitetura

---

*Última atualização: Dezembro 2024*
