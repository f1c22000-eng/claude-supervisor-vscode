# API Interna

Documentação das classes e métodos públicos do Claude Supervisor.

## Core

### ConfigManager

Gerencia configurações da extensão.

```typescript
class ConfigManager {
    // Inicializa com contexto VS Code
    initialize(context: ExtensionContext): void

    // Retorna configuração atual
    getConfig(): SupervisorConfig

    // Verifica se API key está configurada
    isApiKeyConfigured(): boolean

    // Retorna API key (segura)
    getApiKey(): Promise<string | undefined>

    // Salva API key
    setApiKey(key: string): Promise<void>

    // Listener de mudanças
    onConfigChange(callback: (config) => void): void
}
```

### AnthropicClient

Cliente para API Anthropic.

```typescript
class AnthropicClient {
    // Inicializa cliente com API key
    initialize(): Promise<boolean>

    // Chamada para Haiku (supervisores)
    callHaiku(
        systemPrompt: string,
        userMessage: string,
        maxTokens?: number
    ): Promise<string | null>

    // Chamada para Sonnet (configurador)
    callSonnet(
        systemPrompt: string,
        userMessage: string,
        maxTokens?: number
    ): Promise<string | null>

    // Estatísticas de uso
    getStats(): {
        totalCalls: number
        totalTokens: { input: number, output: number }
        totalCost: number
        costToday: number
    }
}
```

### Configurator

Gera supervisores a partir de documentos.

```typescript
class Configurator {
    // Analisa documentos e gera hierarquia
    analyzeDocuments(
        documents: Array<{ path: string; content: string }>,
        projectName: string,
        onProgress?: (progress: number, message: string) => void
    ): Promise<ImportResult>

    // Adiciona regra rápida via AI
    addRuleQuick(
        description: string,
        context?: string
    ): Promise<Rule | null>

    // Lê documento (md, txt, pdf, docx)
    readDocument(filePath: string): Promise<string>
}
```

## Interceptor

### InterceptorManager

Gerencia interceptação do Claude Code.

```typescript
class InterceptorManager extends EventEmitter {
    // Inicia interceptação
    start(): Promise<boolean>

    // Para interceptação
    stop(): void

    // Status da conexão
    getStatus(): ConnectionStatus

    // Eventos emitidos:
    // 'thinking_chunk' - novo chunk de thinking
    // 'message_start' - início de mensagem
    // 'message_complete' - fim de mensagem
    // 'connection_status' - mudança de status
}
```

### StreamParser

Parseia eventos SSE.

```typescript
class StreamParser extends EventEmitter {
    // Processa chunk de dados
    processChunk(data: string): void

    // Reseta parser
    reset(): void

    // Eventos emitidos:
    // 'thinking_delta' - conteúdo de thinking
    // 'text_delta' - conteúdo de texto
    // 'message_start' - início de mensagem
    // 'message_stop' - fim de mensagem
}
```

### ThinkingBuffer

Acumula chunks de thinking.

```typescript
class ThinkingBuffer extends EventEmitter {
    // Adiciona conteúdo ao buffer
    append(content: string): void

    // Limpa buffer
    clear(): void

    // Força flush
    flush(): void

    // Configura threshold
    setThreshold(chars: number): void

    // Eventos emitidos:
    // 'chunk_ready' - chunk pronto para análise
}
```

## Supervisors

### SupervisorNode (classe base)

```typescript
abstract class SupervisorNode extends EventEmitter {
    // Analisa conteúdo
    abstract analyze(
        thinking: string,
        context?: any
    ): Promise<SupervisorResult | null>

    // Getters
    getId(): string
    getName(): string
    getType(): SupervisorType
    isEnabled(): boolean
    getChildren(): SupervisorNode[]
    getRules(): Rule[]
    getCallCount(): number
    getAlertCount(): number

    // Setters
    enable(): void
    disable(): void
    addChild(node: SupervisorNode): void
    removeChild(id: string): void

    // Busca
    findDescendant(id: string): SupervisorNode | undefined
}
```

### Router

```typescript
class Router extends SupervisorNode {
    // Classifica thinking por área
    classify(thinking: string): Promise<string>

    // Roteia para coordinator apropriado
    analyze(
        thinking: string,
        context?: any
    ): Promise<SupervisorResult | null>
}
```

### Coordinator

```typescript
class Coordinator extends SupervisorNode {
    // Sub-classifica para specialist
    classify(thinking: string): Promise<string>

    // Delega para specialists
    analyze(
        thinking: string,
        context?: any
    ): Promise<SupervisorResult | null>
}
```

### Specialist

```typescript
class Specialist extends SupervisorNode {
    // Verifica regras
    analyze(
        thinking: string,
        context?: any
    ): Promise<SupervisorResult | null>

    // Adiciona regra
    addRule(rule: Rule): void

    // Remove regra
    removeRule(id: string): void

    // Atualiza regra
    updateRule(id: string, updates: Partial<Rule>): void
}
```

### BehaviorSupervisor

```typescript
class BehaviorSupervisor extends EventEmitter {
    // Analisa comportamento
    analyze(
        thinking: string,
        originalRequest: string,
        progress: string
    ): Promise<SupervisorResult | null>

    // Detecta padrões específicos
    detectScopeReduction(thinking: string): boolean
    detectProcrastination(thinking: string): boolean
    detectIncompleteness(thinking: string, progress: string): boolean
}
```

### SupervisorHierarchy

```typescript
class SupervisorHierarchy extends EventEmitter {
    // Analisa thinking
    analyzeThinking(
        chunk: ThinkingChunk,
        context?: { originalRequest?: string; progress?: string }
    ): Promise<AnalysisResult>

    // Carrega configuração YAML
    loadProjectConfig(yamlPath: string): Promise<void>

    // Adiciona supervisor
    addSupervisorFromConfig(config: SupervisorConfig): SupervisorNode

    // Busca nó
    findNode(id: string): SupervisorNode | undefined

    // Estatísticas
    getStats(): {
        totalNodes: number
        activeNodes: number
        totalRules: number
        totalCalls: number
        totalAlerts: number
    }

    // Retorna árvore para visualização
    getHierarchyTree(): any

    // Eventos emitidos:
    // 'analysis_complete' - análise concluída
    // 'alert' - alerta detectado
}
```

## Scope

### ScopeManager

```typescript
class ScopeManager extends EventEmitter {
    // Tarefas
    createTask(title: string, items?: string[]): Task
    startTask(): void
    completeTask(): void
    cancelTask(): void
    getActiveTask(): Task | null

    // Itens
    addItem(name: string): TaskItem | null
    updateItemStatus(itemId: string, status: ItemStatus): void
    setCurrentItem(itemId: string): void

    // Requisitos
    addRequirement(text: string, source?: 'original' | 'added'): Requirement | null
    completeRequirement(requirementId: string): void
    removeRequirement(requirementId: string): void

    // Notas
    addNote(text: string): Note | null
    removeNote(noteId: string): void
    applyNote(noteId: string, action: 'apply_now' | 'apply_later' | 'discard'): void
    getPendingNotes(): Note[]

    // Progresso
    getProgress(): {
        completed: number
        total: number
        percentage: number
        current?: string
    }
    getCurrentScope(): {
        title: string
        progress: number
        pendingItems: number
    } | null
    isComplete(): boolean

    // Histórico
    getHistory(): HistoryEntry[]

    // Extração
    extractScopeFromMessage(message: string): {
        numbers?: number[]
        hasAllKeyword: boolean
        items: string[]
    }

    // Estado
    getState(): ScopeState
    clearState(): void

    // Eventos emitidos:
    // 'task_updated' - tarefa atualizada
    // 'progress_changed' - progresso alterado
    // 'requirement_added' - requisito adicionado
    // 'note_added' - nota adicionada
}
```

## Terminal

### TerminalHandler

```typescript
class TerminalHandler {
    // Cria terminal
    createTerminal(): vscode.Terminal

    // Mostra terminal
    showTerminal(): void

    // Callback para mensagens urgentes
    onUrgent(callback: (message: string) => void): void

    // Cleanup
    dispose(): void
}
```

## Types

### Enums

```typescript
enum SupervisorType {
    ROUTER = 'router',
    COORDINATOR = 'coordinator',
    SPECIALIST = 'specialist'
}

enum Severity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

enum TaskStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled'
}

enum ItemStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed'
}

enum ConnectionStatus {
    CONNECTED = 'connected',
    CONNECTING = 'connecting',
    DISCONNECTED = 'disconnected',
    ERROR = 'error'
}
```

### Interfaces

```typescript
interface Rule {
    id: string
    description: string
    severity: Severity
    check: string
    exampleViolation?: string
    enabled: boolean
}

interface SupervisorResult {
    supervisorId: string
    supervisorName: string
    status: 'ok' | 'alert'
    severity?: Severity
    message?: string
    correction?: string
    timestamp: number
}

interface ThinkingChunk {
    content: string
    timestamp: number
    messageId?: string
}

interface AnalysisResult {
    thinkingChunk: string
    results: SupervisorResult[]
    totalTime: number
    timestamp: number
}

interface Task {
    id: string
    title: string
    status: TaskStatus
    createdAt: number
    startedAt?: number
    completedAt?: number
    items: TaskItem[]
    requirements: Requirement[]
    notes: Note[]
}
```

## Eventos Globais

O sistema usa EventEmitter para comunicação entre componentes:

| Evento | Emitido por | Dados |
|--------|-------------|-------|
| `thinking_chunk` | InterceptorManager | ThinkingChunk |
| `analysis_complete` | SupervisorHierarchy | AnalysisResult |
| `alert` | SupervisorHierarchy | SupervisorResult |
| `task_updated` | ScopeManager | Task |
| `progress_changed` | ScopeManager | Progress |
| `config_change` | ConfigManager | Config |
