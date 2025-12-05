# Arquitetura Técnica

## Visão Geral

O Claude Supervisor é uma extensão VS Code que monitora o Claude Code em tempo real, interceptando o "thinking" antes de se tornar resposta final e usando uma hierarquia de supervisores baseados em Claude Haiku para análise.

## Diagrama de Componentes

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
│  │ - manager   │   │             │   │             │          │
│  │ - parser    │   │ - task      │   │ - sidebar   │          │
│  │ - buffer    │   │ - notes     │   │ - panels    │          │
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
│  │  └─────────────────────────────────────────────┘        │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   ANTHROPIC CLIENT                       │   │
│  │  - Haiku (supervisores) ~200ms                          │   │
│  │  - Sonnet (configurador) ~2s                            │   │
│  │  - Cache, retry, rate limit                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Fluxo de Dados

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

## Componentes Principais

### 1. Interceptor (`src/interceptor/`)

Responsável por capturar o tráfego do Claude Code.

#### InterceptorManager
- Gerencia a detecção do Claude Code
- Coordena a captura de streaming
- Emite eventos para o sistema

#### StreamParser
- Parseia eventos SSE (Server-Sent Events)
- Extrai `thinking_delta` e `text_delta`
- Detecta `message_start` e `message_stop`

#### ThinkingBuffer
- Acumula chunks de thinking
- Emite quando atinge threshold (200 chars)
- Mantém contexto entre chunks

### 2. Supervisores (`src/supervisors/`)

Sistema hierárquico de análise.

#### SupervisorNode (classe base)
- Interface comum para todos os supervisores
- Métodos: analyze, enable, disable, addChild
- Estatísticas: callCount, alertCount

#### Router
- Ponto de entrada para análise
- Classifica thinking por área usando keywords
- Usa Haiku para classificação quando necessário
- Cache de decisões (TTL 5min)

#### Coordinator
- Agrupa especialistas relacionados
- Sub-classifica para especialista específico
- Agrega resultados de múltiplos especialistas

#### Specialist
- Verifica regras específicas
- Monta prompt com regras e contexto
- Retorna: OK ou PROBLEMA com correção

#### BehaviorSupervisor
- Supervisor especial que roda em todo thinking
- Detecta padrões de comportamento:
  - Redução de escopo
  - Procrastinação
  - Incompletude

### 3. Gestor de Escopo (`src/scope/`)

Rastreia tarefas e progresso.

#### ScopeManager
- Gerencia tarefa ativa
- Manipula itens, requisitos e notas
- Calcula progresso
- Persiste estado

#### Task
- Representa uma tarefa com itens
- Status: pending, in_progress, completed, cancelled
- Contém items, requirements, notes

### 4. UI (`src/ui/`)

Painéis WebView para interação.

#### SidebarProvider
- Painel principal na barra lateral
- Resumo de status, escopo, supervisores
- Links rápidos para outros painéis

#### Panel Providers
- ScopePanelProvider: Gestor de escopo detalhado
- SupervisorsPanelProvider: Visualização em árvore
- MonitorPanelProvider: Streaming em tempo real
- ConfigPanelProvider: Configurações
- ImportPanelProvider: Importação de documentos

### 5. Terminal (`src/terminal/`)

Comandos interativos.

#### TerminalHandler
- Cria pseudoterminal VS Code
- Processa comandos /nota, /escopo, etc.
- Exibe output colorido com ANSI

## Padrões de Design

### Event-Driven Architecture
- Componentes se comunicam via eventos
- EventEmitter para desacoplamento
- Eventos: thinking_received, alert, progress_changed

### Singleton
- ConfigManager: configurações globais
- AnthropicClient: cliente API único
- Configurator: gerador de supervisores

### Strategy
- SupervisorNode: diferentes estratégias de análise
- Router, Coordinator, Specialist

### Observer
- UI observa mudanças de estado
- ScopeManager emite eventos de progresso

## Segurança

### Armazenamento
- API Key usa SecretStorage do VS Code
- Não persiste dados sensíveis em texto plano

### Rede
- Apenas conecta a api.anthropic.com
- Não envia código-fonte para análise
- SSL/TLS obrigatório

### Limites
- Rate limiting local
- Timeout em todas as chamadas
- Limite de custo diário

## Performance

### Cache
- Cache de classificações (5min TTL)
- Cache de análises idênticas (1min TTL)
- Invalidação quando configurações mudam

### Async/Parallel
- Promise.all para supervisores paralelos
- Timeout de 5s por chamada
- Fallback graceful em erros

### Memória
- Buffer limitado de thinking
- Histórico limitado (100 entradas)
- Cleanup em desativação

## Extensibilidade

### Adicionando Supervisores
1. Criar YAML em `config/supervisors/`
2. Definir keywords e rules
3. Hot reload automático

### Adicionando Comandos
1. Registrar em `constants.ts`
2. Implementar em `extension.ts`
3. Adicionar keybinding em `package.json`

### Adicionando Painéis
1. Criar Provider em `src/ui/`
2. Implementar getHtml() e handleMessage()
3. Registrar no activate()
