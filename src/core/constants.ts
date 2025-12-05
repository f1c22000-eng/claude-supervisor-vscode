// ============================================
// CLAUDE SUPERVISOR - CONSTANTES
// ============================================

// ============================================
// EXTENSÃO
// ============================================

export const EXTENSION_ID = 'claude-supervisor-vscode';
export const EXTENSION_NAME = 'Claude Supervisor';
export const EXTENSION_VERSION = '1.0.0';

// ============================================
// VIEWS E PAINÉIS
// ============================================

export const VIEW_CONTAINER_ID = 'claude-supervisor';
export const SIDEBAR_VIEW_ID = 'claudeSupervisor.sidebar';

export const PANEL_IDS = {
    SCOPE: 'claudeSupervisor.scopePanel',
    SUPERVISORS: 'claudeSupervisor.supervisorsPanel',
    SUPERVISOR_DETAIL: 'claudeSupervisor.supervisorDetailPanel',
    MONITOR: 'claudeSupervisor.monitorPanel',
    CONFIG: 'claudeSupervisor.configPanel',
    IMPORT: 'claudeSupervisor.importPanel',
    HELP: 'claudeSupervisor.helpPanel'
};

// ============================================
// COMANDOS
// ============================================

export const COMMANDS = {
    TOGGLE: 'claudeSupervisor.toggle',
    OPEN_SCOPE: 'claudeSupervisor.openScope',
    OPEN_SUPERVISORS: 'claudeSupervisor.openSupervisors',
    OPEN_MONITOR: 'claudeSupervisor.openMonitor',
    OPEN_CONFIG: 'claudeSupervisor.openConfig',
    ADD_NOTE: 'claudeSupervisor.addNote',
    ADD_RULE: 'claudeSupervisor.addRule',
    SHOW_SCOPE: 'claudeSupervisor.showScope',
    IMPORT_DOCS: 'claudeSupervisor.importDocs'
};

// ============================================
// API ANTHROPIC
// ============================================

export const ANTHROPIC_API_URL = 'https://api.anthropic.com';

export const MODELS = {
    HAIKU: 'claude-3-5-haiku-20241022',
    SONNET: 'claude-sonnet-4-20250514'
};

export const MODEL_PRICING = {
    [MODELS.HAIKU]: {
        input: 0.25 / 1_000_000,  // $0.25 per 1M tokens
        output: 1.25 / 1_000_000  // $1.25 per 1M tokens
    },
    [MODELS.SONNET]: {
        input: 3 / 1_000_000,     // $3 per 1M tokens
        output: 15 / 1_000_000    // $15 per 1M tokens
    }
};

// Taxa de conversão USD -> BRL (aproximada)
export const USD_TO_BRL = 5.5;

// ============================================
// TIMEOUTS E LIMITES
// ============================================

export const TIMEOUTS = {
    HAIKU_REQUEST: 5000,      // 5 segundos
    SONNET_REQUEST: 30000,    // 30 segundos
    INTERCEPTOR_RECONNECT: 3000,
    NOTE_BUFFER: 10000,       // 10 segundos (configurável)
    CACHE_TTL: 300000,        // 5 minutos
    CACHE_ANALYSIS_TTL: 60000 // 1 minuto
};

export const LIMITS = {
    MAX_THINKING_BUFFER: 200, // caracteres antes de analisar
    MAX_RETRIES: 3,
    MAX_HISTORY_ENTRIES: 1000,
    MAX_ALERTS: 100,
    MAX_CHUNKS_DISPLAY: 50
};

// ============================================
// SEVERIDADES
// ============================================

export const SEVERITY_COLORS = {
    low: '#3B82F6',      // Azul
    medium: '#EAB308',   // Amarelo
    high: '#F59E0B',     // Laranja
    critical: '#EF4444'  // Vermelho
};

export const SEVERITY_LABELS = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    critical: 'Crítica'
};

// ============================================
// STATUS INDICATORS
// ============================================

export const STATUS_ICONS = {
    connected: '🟢',
    connecting: '🔵',
    disconnected: '⚪',
    error: '🔴',
    warning: '🟡'
};

export const ITEM_STATUS_ICONS = {
    pending: '⬜',
    in_progress: '🔄',
    completed: '✅'
};

// ============================================
// PADRÕES DE COMPORTAMENTO
// ============================================

export const BEHAVIOR_PATTERNS = {
    SCOPE_REDUCTION: [
        'vou fazer só',
        'apenas essa',
        'por enquanto',
        'começando pela principal',
        'as outras depois',
        'primeiro só',
        'uma de cada vez',
        'vou focar em'
    ],
    PROCRASTINATION: [
        'deixo pra depois',
        'numa próxima',
        'depois a gente',
        'mais tarde',
        'em outra oportunidade'
    ],
    COMPLETION_PHRASES: [
        'pronto',
        'terminei',
        'feito',
        'concluído',
        'finalizado',
        'está pronto',
        'tarefa completa'
    ]
};

// ============================================
// CAMINHOS DE ARQUIVOS
// ============================================

export const PATHS = {
    CONFIG: 'config',
    SUPERVISORS: 'config/supervisors',
    HELP: 'help',
    MEDIA: 'media'
};

// ============================================
// CORES DO TEMA
// ============================================

export const THEME_COLORS = {
    background: '#1E1E1E',
    backgroundCard: '#252526',
    border: '#3C3C3C',
    textPrimary: '#CCCCCC',
    textSecondary: '#808080',
    accent: '#007ACC',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444'
};

// ============================================
// MENSAGENS
// ============================================

export const MESSAGES = {
    API_KEY_MISSING: 'API Key da Anthropic não configurada. Configure em Configuração.',
    API_KEY_INVALID: 'API Key inválida. Verifique sua chave.',
    CONNECTION_LOST: 'Conexão com Claude Code perdida.',
    CONNECTION_RESTORED: 'Conexão com Claude Code restaurada.',
    COST_ALERT: 'Alerta: Custo diário atingiu R$ {value}',
    COST_LIMIT: 'Limite crítico de custo atingido. Sistema pausado.',
    SCOPE_REDUCTION_DETECTED: 'Redução de escopo detectada',
    INCOMPLETE_TASK: 'Tarefa marcada como concluída está incompleta'
};
