# PROJETO: Claude Supervisor - Extensão VS Code

## Visão Geral

Extensão para VS Code que monitora Claude Code em tempo real, capturando o "thinking" antes de virar resposta, e usando uma hierarquia de supervisores (Haiku) para detectar problemas, desvios de escopo e comportamentos indesejados.

**Repositório:** `claude-supervisor-vscode`
**Licença:** MIT
**Stack:** TypeScript, Node.js, VS Code Extension API, Anthropic API

---

## FASE 1: SETUP DO PROJETO ✅

### 1.1 Criar Estrutura de Pastas

- [x] Criar pasta raiz `claude-supervisor-vscode`
- [x] Criar subpasta `src/`
- [x] Criar subpasta `src/core/` (lógica principal)
- [x] Criar subpasta `src/supervisors/` (agentes supervisores)
- [x] Criar subpasta `src/ui/` (painéis e webviews)
- [x] Criar subpasta `src/interceptor/` (captura HTTP)
- [x] Criar subpasta `src/scope/` (gestor de escopo)
- [x] Criar subpasta `media/` (ícones, CSS, HTML dos painéis)
- [x] Criar subpasta `config/` (configurações default)
- [x] Criar subpasta `config/supervisors/` (YAMLs de supervisores)
- [x] Criar subpasta `docs/` (documentação)
- [x] Criar subpasta `help/` (arquivos de help do sistema)

### 1.2 Inicializar Projeto Node

- [x] Executar `npm init -y`
- [x] Instalar dependências de desenvolvimento:
  ```bash
  npm install -D typescript @types/node @types/vscode vsce esbuild
  ```
- [x] Instalar dependências de produção:
  ```bash
  npm install @anthropic-ai/sdk yaml uuid
  ```
- [x] Criar `tsconfig.json`:
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
- [x] Criar `.gitignore`:
  ```
  node_modules/
  out/
  *.vsix
  .vscode-test/
  .env
  ```

### 1.3 Configurar package.json para VS Code Extension

- [x] Adicionar campos obrigatórios:
  - `publisher`: seu nome/organização
  - `engines.vscode`: "^1.85.0"
  - `activationEvents`: ["onStartupFinished"]
  - `main`: "./out/extension.js"
  - `contributes.viewsContainers`
  - `contributes.views`
  - `contributes.commands`
  - `contributes.configuration`
- [x] Definir ícone da extensão em `icon` (SVG criado)
- [x] Adicionar scripts:
  ```json
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package"
  }
  ```

### 1.4 Criar Arquivos Base

- [x] Criar `src/extension.ts` (ponto de entrada)
- [x] Criar `src/core/config.ts` (gerenciador de configurações)
- [x] Criar `src/core/api.ts` (cliente Anthropic)
- [x] Criar `src/core/types.ts` (interfaces TypeScript)
- [x] Criar `src/core/constants.ts` (constantes do sistema)

---

## FASE 2: INTERCEPTOR HTTP ✅

O interceptor captura as chamadas do Claude Code para a API Anthropic.

### 2.1 Estrutura do Interceptor

- [x] Criar `src/interceptor/index.ts` (exporta módulo)
- [x] Criar `src/interceptor/interceptor-manager.ts` (gerenciador principal)
- [x] Criar `src/interceptor/stream-parser.ts` (parser de SSE/streaming)
- [x] Criar `src/interceptor/thinking-buffer.ts` (acumula thinking chunks)

### 2.2 Implementar Proxy HTTP

- [x] Implementar detecção de Claude Code
- [x] Capturar response streaming (SSE)
- [x] Parsear eventos `thinking_delta` e `text_delta`
- [x] Emitir eventos para o sistema quando detectar thinking

### 2.3 Configurar Variáveis de Ambiente

- [x] Detectar se Claude Code está rodando
- [ ] Configurar `HTTPS_PROXY` ou usar monkey-patching
- [ ] Alternativa: usar técnica do `claude-trace` (require interceptor)
- [ ] Criar script wrapper `claude-supervised` que injeta interceptor

### 2.4 Testes do Interceptor

- [ ] Testar captura de request normal
- [ ] Testar captura de streaming
- [ ] Testar extração de thinking chunks
- [ ] Testar reconexão em caso de falha

---

## FASE 3: SISTEMA DE SUPERVISORES ✅

### 3.1 Estrutura Base dos Supervisores

- [x] Criar `src/supervisors/index.ts` (exporta módulo)
- [x] Criar `src/supervisors/supervisor-node.ts` (classe base)
- [x] Criar `src/supervisors/router.ts` (roteia para supervisor correto)
- [x] Criar `src/supervisors/coordinator.ts` (coordenador de área)
- [x] Criar `src/supervisors/specialist.ts` (especialista com regras)
- [x] Criar `src/supervisors/hierarchy.ts` (gerencia árvore de supervisores)

### 3.2 Implementar Router

- [x] Recebe thinking chunk
- [x] Analisa keywords para decidir área
- [x] Chama Haiku com prompt de classificação
- [x] Retorna ID do coordinator apropriado
- [x] Cache de decisões recentes (evita chamadas repetidas)

### 3.3 Implementar Coordinator

- [x] Recebe thinking do router
- [x] Decide qual specialist chamar
- [x] Pode ter múltiplos specialists filhos
- [x] Chama Haiku com prompt de sub-classificação

### 3.4 Implementar Specialist

- [x] Carrega regras do YAML
- [x] Monta prompt com regras específicas
- [x] Chama Haiku para análise
- [x] Retorna resultado: OK ou PROBLEMA com correção
- [x] Registra severidade: baixa, média, alta, crítica

### 3.5 Supervisor de Comportamento (Especial)

- [x] Criar `src/supervisors/behavior/index.ts`
- [x] Implementar detecção de completude
- [x] Implementar detecção de procrastinação
- [x] Implementar detecção de redução de escopo
- [x] Recebe: pedido original + thinking atual + progresso
- [x] Detecta padrões: "por enquanto", "principal", "depois"
- [x] Compara números: pedido 12 telas, fazendo 1 = problema

### 3.6 Carregar Configuração YAML

- [x] Criar `src/supervisors/config-loader.ts`
- [x] Ler arquivos YAML de `config/supervisors/`
- [x] Validar estrutura do YAML
- [x] Montar árvore de supervisores em memória
- [x] Hot reload quando arquivo YAML muda
- [x] Suporte a `always_active: true` para supervisores core
- [x] Suporte a `load_priority` para ordem de carregamento
- [x] Método `loadFromFileWithMetadata()` para carregar com metadados

### 3.7 Supervisores Core (Sempre Ativos) ✅

- [x] Criar `config/supervisors/core-behavior.yaml` com 7 supervisores
- [x] Implementar `loadCoreBehaviorSupervisors()` em hierarchy.ts
- [x] Set `alwaysActiveIds` para rastrear supervisores que não podem ser desativados
- [x] Método `isAlwaysActive(id)` para verificar status
- [x] Ícone de cadeado 🔒 na UI para supervisores core
- [x] Proteção contra toggle de supervisores core

#### Supervisores Core Implementados:
1. **Verificador.Conclusao** - Detecta "pronto" sem evidência de teste
2. **Verificador.DadosReais** - Detecta valores hardcoded
3. **Verificador.EsforcoCompleto** - Detecta redução de escopo
4. **Verificador.Teste** - Exige teste após implementação
5. **Verificador.Integracao** - Verifica componentes conectados
6. **Verificador.Requisitos** - Detecta requisitos adiados
7. **Verificador.Documentacao** - Verifica documentação atualizada

### 3.9 Chamadas Paralelas

- [x] Implementar `Promise.all` para múltiplos supervisores
- [x] Timeout de 5 segundos por chamada
- [x] Fallback: se falhar, retorna OK (não bloqueia)
- [x] Agregar resultados e ordenar por severidade

---

## FASE 4: GESTOR DE ESCOPO ✅

### 4.1 Estrutura do Gestor

- [x] Criar `src/scope/index.ts` (exporta módulo)
- [x] Criar `src/scope/scope-manager.ts` (gerenciador principal)
- [x] Criar `src/scope/task.ts` (representa uma tarefa)
- [x] Criar `src/scope/requirement.ts` (representa um requisito)
- [x] Criar `src/scope/note.ts` (representa uma nota pendente)
- [x] Criar `src/scope/progress-tracker.ts` (rastreia progresso)

### 4.2 Captura de Mensagens

- [x] Escutar mensagens do usuário para Claude Code
- [x] Escutar respostas do Claude Code
- [x] Extrair informações de escopo automaticamente
- [x] Detectar: números, "todas", "cada", listas

### 4.3 Buffer de Notas

- [x] Comando `/nota` adiciona à lista sem interromper
- [x] Timer de 10 segundos antes de perguntar o que fazer
- [x] Opções: aplicar agora, aplicar no final, descartar
- [x] Persistir notas entre sessões

### 4.4 Tracking de Progresso

- [x] Detectar quando Claude diz "feito", "pronto", "terminei"
- [x] Comparar com escopo definido
- [x] Alertar se progresso < 100%
- [x] Listar itens pendentes

### 4.5 Integração com Supervisor de Comportamento

- [x] Passar escopo atual para supervisor
- [x] Supervisor compara thinking vs escopo
- [x] Detectar desvios em tempo real

---

## FASE 5: INTERFACE DO USUÁRIO (PAINÉIS) ✅

**IMPORTANTE:** Os layouts de todas as telas estão detalhados no arquivo `TELAS.md`

### 5.1 Painel Principal (Sidebar)

- [x] Criar `src/ui/sidebar-provider.ts`
- [x] Implementar HTML/CSS inline (template)
- [x] Implementar seções colapsáveis:
  - [x] Status Geral
  - [x] Gestor de Escopo (resumo)
  - [x] Supervisores (resumo)
  - [x] Monitor (resumo)
  - [x] Configuração (link)
- [x] Botões de ação rápida em cada seção
- [x] Atualização em tempo real via postMessage

### 5.2 Painel: Gestor de Escopo (Detalhado)

- [x] Criar `src/ui/scope-panel.ts`
- [x] Mostrar tarefa ativa
- [x] Barra de progresso visual
- [x] Lista de arquivos/itens com status (✅🔄⬜)
- [x] Lista de requisitos
- [x] Área de notas pendentes
- [x] Campo para adicionar nota/requisito
- [x] Ver layout em `TELAS.md` seção "Tela: Gestor de Escopo"

### 5.3 Painel: Supervisores (Detalhado)

- [x] Criar `src/ui/supervisors-panel.ts`
- [x] Mostrar árvore hierárquica
- [x] Status de cada nó (🟢🟡🔴)
- [x] Atividade recente com timestamps
- [x] Clique em nó abre detalhes
- [x] Ver layout em `TELAS.md` seção "Tela: Supervisores"

### 5.4 Painel: Detalhes do Supervisor

- [x] Implementado dentro do supervisors-panel.ts
- [x] Mostrar keywords do supervisor
- [x] Listar todas as regras
- [x] Checkbox para ativar/desativar regra
- [x] Botões editar/excluir regra
- [x] Botão adicionar regra
- [x] Ver layout em `TELAS.md` seção "Tela: Detalhes de um Supervisor"

### 5.5 Painel: Monitor

- [x] Criar `src/ui/monitor-panel.ts`
- [x] Mostrar conexão com Claude Code
- [x] Stream de thinking ao vivo (últimos N chunks)
- [x] Estatísticas da sessão
- [x] Histórico de intervenções
- [x] Ver layout em `TELAS.md` seção "Tela: Monitor"

### 5.6 Painel: Configuração

- [x] Criar `src/ui/config-panel.ts`
- [x] Campo para API Key (com máscara)
- [x] Seletor de modelo para supervisores
- [x] Seletor de modelo para configurador
- [x] Lista de projetos configurados
- [x] Checkboxes de comportamento
- [x] Campos de limites (chamadas/hora, custo diário)
- [x] Ver layout em `TELAS.md` seção "Tela: Configuração"

### 5.7 Painel: Importar Documentos

- [x] Criar `src/ui/import-panel.ts`
- [x] Área de drag-and-drop para arquivos (limitação VS Code - usar file picker)
- [x] Lista de arquivos selecionados
- [x] Campo nome do projeto
- [x] Botão analisar e gerar (usa Configurator com Sonnet)
- [x] Indicador de progresso
- [x] Preview da hierarquia gerada
- [x] Botão "Aplicar" para adicionar supervisores à hierarquia
- [x] Ver layout em `TELAS.md` seção "Tela: Importar Documentos"

### 5.8 Painel: Monitor (Funcionalidades Extras)

- [x] Botão pausar/continuar stream
- [x] Botão copiar thinking para clipboard
- [x] Botão exportar histórico como JSON
- [x] Estado `streamPaused` para controle

### 5.9 Sidebar (Correções)

- [x] Contador de chunks usa `chunksProcessed` real
- [x] Botão toggle com texto dinâmico ("Desativar"/"Ativar")
- [x] Sincronização via EventEmitter entre painéis

### 5.10 Sistema de Help Integrado

- [x] Criar `src/ui/help-provider.ts`
- [x] Carregar arquivos de help de `help/`
- [x] Botão [?] em cada painel abre help contextual
- [x] Help searchable
- [x] **IMPORTANTE:** O conteúdo do help está em `HELP.md`
- [x] Claude Code deve criar arquivos individuais de help:
  - [x] `help/getting-started.md`
  - [x] `help/scope-manager.md`
  - [x] `help/supervisors.md`
  - [x] `help/behavior-detection.md`
  - [x] `help/configuration.md`
  - [x] `help/troubleshooting.md`
  - [x] `help/api-costs.md`
  - [x] `help/commands.md`

---

## FASE 6: CONFIGURADOR AUTOMÁTICO ✅

### 6.1 Analisador de Documentos

- [x] Criar `src/core/configurator.ts`
- [x] Ler documentos (.md, .txt, .pdf, .docx)
- [x] Enviar para Claude Sonnet (não Haiku)
- [x] Extrair temas e sub-temas
- [x] Extrair regras por seção
- [x] Gerar estrutura hierárquica

### 6.2 Gerador de YAML

- [x] Receber estrutura do analisador
- [x] Gerar YAML válido
- [x] Criar keywords automáticas
- [x] Criar prompts para cada specialist
- [x] Salvar em `config/supervisors/{projeto}.yaml`

### 6.3 Editor de Regras

- [x] Interface para editar regra individual
- [x] Campos: descrição, severidade, exemplo violação
- [x] Validar antes de salvar
- [x] Hot reload após salvar

### 6.4 Adição Rápida de Regras

- [x] Comando palette: "Claude Supervisor: Add Rule"
- [x] Detectar área automaticamente pelo contexto
- [x] Perguntar severidade
- [x] Salvar e ativar imediatamente

### 6.5 Sistema de Prompts ✅

- [x] Criar `src/core/prompts/` com prompts organizados
- [x] `configurator-prompt.ts` - CONFIGURATOR_SYSTEM_PROMPT para análise de documentos
- [x] `behavior-prompt.ts` - BEHAVIOR_SUPERVISOR_PROMPT para detecção comportamental
- [x] `core-behavior-prompt.ts` - Prompts para supervisores core:
  - [x] CORE_BEHAVIOR_ANALYSIS_PROMPT
  - [x] CONCLUSION_CHECK_PROMPT
  - [x] HARDCODE_CHECK_PROMPT
  - [x] SCOPE_REDUCTION_PROMPT
  - [x] TEST_CHECK_PROMPT

---

## FASE 7: COMANDOS E ATALHOS ✅

### 7.1 Registrar Comandos

- [x] `claudeSupervisor.toggle` - Ativar/desativar sistema
- [x] `claudeSupervisor.openScope` - Abrir gestor de escopo
- [x] `claudeSupervisor.openSupervisors` - Abrir supervisores
- [x] `claudeSupervisor.openMonitor` - Abrir monitor
- [x] `claudeSupervisor.openConfig` - Abrir configuração
- [x] `claudeSupervisor.addNote` - Adicionar nota rápida
- [x] `claudeSupervisor.addRule` - Adicionar regra rápida
- [x] `claudeSupervisor.showScope` - Mostrar escopo no terminal
- [x] `claudeSupervisor.importDocs` - Importar documentos

### 7.2 Atalhos de Teclado

- [x] `Ctrl+Shift+S` - Toggle sistema
- [x] `Ctrl+Shift+N` - Adicionar nota
- [x] `Ctrl+Shift+R` - Adicionar regra
- [x] `Ctrl+Shift+E` - Mostrar escopo

### 7.3 Comandos de Terminal (quando Claude Code ativo)

- [x] `/nota <texto>` - Adiciona nota sem interromper
- [x] `/escopo` - Mostra escopo atual
- [x] `/regra <texto>` - Adiciona regra rápida
- [x] `/urgente <texto>` - Interrompe e injeta mensagem
- [x] `/status` - Mostra status dos supervisores

---

## FASE 8: PERSISTÊNCIA E ESTADO ✅

### 8.1 Armazenamento Local

- [x] Usar `context.globalState` para configurações globais
- [x] Usar `context.workspaceState` para estado do workspace
- [x] Salvar: API key (criptografada), preferências, histórico

### 8.2 Arquivos de Configuração

- [x] `config/settings.yaml` - Configurações gerais
- [x] `config/supervisors/*.yaml` - Supervisores por projeto
- [ ] `.claude-supervisor/` na raiz do projeto (opcional, versionável)

### 8.3 Histórico e Logs

- [x] Log de intervenções (últimas 1000)
- [x] Log de mudanças de configuração
- [x] Estatísticas de uso (chamadas, custo)
- [ ] Exportar histórico para arquivo

---

## FASE 9: INTEGRAÇÃO COM API ANTHROPIC ✅

### 9.1 Cliente API

- [x] Criar `src/core/api.ts` (anthropic-client)
- [x] Wrapper do SDK oficial `@anthropic-ai/sdk`
- [x] Configurar timeout (5s para Haiku, 30s para Sonnet)
- [x] Retry automático (3 tentativas)
- [x] Rate limiting local

### 9.2 Gerenciamento de Custos

- [x] Contar tokens de input e output
- [x] Calcular custo por chamada
- [x] Acumular custo diário
- [x] Alertar quando atingir limite
- [x] Pausar se ultrapassar limite crítico

### 9.3 Cache de Respostas

- [x] Cache de classificações do router (TTL 5min)
- [x] Cache de análises idênticas (TTL 1min)
- [x] Invalidar cache quando regras mudam

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

## FASE 11: DOCUMENTAÇÃO ✅

### 11.1 Arquivos de Documentação

- [x] `README.md` - Visão geral e instalação
- [x] `CHANGELOG.md` - Histórico de versões
- [x] `CONTRIBUTING.md` - Como contribuir
- [x] `docs/architecture.md` - Arquitetura técnica
- [x] `docs/api.md` - API interna
- [x] `docs/troubleshooting.md` - Resolução de problemas

### 11.2 Help do Sistema (Criar via Claude Code)

- [x] Gerar `help/getting-started.md` baseado em `HELP.md`
- [x] Gerar `help/scope-manager.md` baseado em `HELP.md`
- [x] Gerar `help/supervisors.md` baseado em `HELP.md`
- [x] Gerar `help/behavior-detection.md` baseado em `HELP.md`
- [x] Gerar `help/configuration.md` baseado em `HELP.md`
- [x] Gerar `help/troubleshooting.md` baseado em `HELP.md`
- [x] Gerar `help/api-costs.md` baseado em `HELP.md`
- [x] Gerar `help/commands.md` baseado em `HELP.md`

---

## FASE 12: PUBLICAÇÃO

### 12.1 Preparar para Marketplace

- [ ] Criar ícone 128x128 PNG (salvar em media/icon.png)
- [x] Escrever descrição completa (package.json e README.md)
- [ ] Adicionar screenshots
- [x] Definir categorias e tags (package.json)
- [ ] Criar conta de publisher no VS Code Marketplace

### 12.2 Build e Package

- [x] `npm run compile`
- [x] Configurar .vscodeignore
- [x] Criar LICENSE
- [x] `vsce package` (claude-supervisor-vscode-1.0.0.vsix gerado)
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

1. [x] Criar pasta do projeto
2. [x] Copiar os 3 arquivos MD para a pasta
3. [x] Inicializar npm e TypeScript
4. [x] Criar estrutura de pastas
5. [x] Implementar extension.ts básico
6. [ ] Testar que extensão carrega no VS Code
7. [x] Começar pelo interceptor (FASE 2)

---

## ARQUIVOS DE REFERÊNCIA

- `TELAS.md` - Layouts detalhados de todas as interfaces
- `HELP.md` - Conteúdo completo do sistema de help
- Este arquivo (`PROJETO.md`) - Checklist e arquitetura

---

*Última atualização: Dezembro 2024*
