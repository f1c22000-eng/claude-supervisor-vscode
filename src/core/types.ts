// ============================================
// CLAUDE SUPERVISOR - TIPOS E INTERFACES
// ============================================

import * as vscode from 'vscode';

// ============================================
// ENUMS
// ============================================

export enum Severity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

export enum SupervisorType {
    ROUTER = 'router',
    COORDINATOR = 'coordinator',
    SPECIALIST = 'specialist'
}

export enum TaskStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled'
}

export enum ItemStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed'
}

export enum AlertType {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

export enum ConnectionStatus {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    ERROR = 'error'
}

export enum ApiStatus {
    NOT_CONFIGURED = 'not_configured',
    INVALID = 'invalid',
    VALID = 'valid',
    CHECKING = 'checking'
}

// ============================================
// SUPERVISOR INTERFACES
// ============================================

export interface Rule {
    id: string;
    description: string;
    severity: Severity;
    check: string;
    exampleViolation?: string;
    enabled: boolean;
}

export interface SupervisorConfig {
    id: string;
    name: string;
    type: SupervisorType;
    parentId?: string;
    description?: string;
    keywords: string[];
    rules: Rule[];
    enabled: boolean;
    alwaysActive?: boolean;  // If true, cannot be disabled by user
}

export interface SupervisorResult {
    supervisorId: string;
    supervisorName: string;
    status: 'ok' | 'alert';
    severity?: Severity;
    message?: string;
    thinkingSnippet?: string;
    timestamp: number;
    processingTime: number;
}

export interface AnalysisResult {
    thinkingChunk: string;
    results: SupervisorResult[];
    totalTime: number;
    timestamp: number;
}

// ============================================
// SCOPE MANAGER INTERFACES
// ============================================

export interface TaskItem {
    id: string;
    name: string;
    status: ItemStatus;
}

export interface Requirement {
    id: string;
    text: string;
    source: 'original' | 'added';
    timestamp: number;
    completed: boolean;
}

export interface Note {
    id: string;
    text: string;
    timestamp: number;
    action?: 'apply_now' | 'apply_later' | 'discard';
}

export interface Task {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    items: TaskItem[];
    requirements: Requirement[];
    notes: Note[];
}

export interface ScopeState {
    activeTask: Task | null;
    history: HistoryEntry[];
}

export interface HistoryEntry {
    timestamp: number;
    type: 'task_created' | 'task_started' | 'task_completed' | 'item_completed' |
          'requirement_added' | 'note_added' | 'intervention';
    description: string;
}

// ============================================
// INTERCEPTOR INTERFACES
// ============================================

export interface ThinkingChunk {
    id: string;
    content: string;
    timestamp: number;
    messageId?: string;
}

export interface StreamEvent {
    type: 'thinking_delta' | 'text_delta' | 'message_start' | 'message_stop';
    data: any;
    timestamp: number;
}

export interface InterceptorState {
    status: ConnectionStatus;
    pid?: number;
    uptime: number;
    chunksProcessed: number;
    lastChunk?: ThinkingChunk;
}

// ============================================
// API INTERFACES
// ============================================

export interface ApiUsage {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    callCount: number;
}

export interface ApiStats {
    today: ApiUsage;
    session: ApiUsage;
    lastReset: number;
}

// ============================================
// UI INTERFACES
// ============================================

export interface Alert {
    id: string;
    type: AlertType;
    title: string;
    message: string;
    thinkingSnippet?: string;
    supervisorName?: string;
    timestamp: number;
    dismissed: boolean;
    actions?: AlertAction[];
}

export interface AlertAction {
    label: string;
    command: string;
    args?: any[];
}

export interface PanelState {
    isActive: boolean;
    lastUpdate: number;
}

// ============================================
// CONFIGURATION INTERFACES
// ============================================

export interface ExtensionConfig {
    apiKey: string;
    supervisorModel: string;
    configuratorModel: string;
    maxCallsPerHour: number;
    dailyCostAlert: number;
    dailyCostLimit: number;
    detectScopeReduction: boolean;
    requireListBeforeRefactor: boolean;
    detectProcrastination: boolean;
    verifyCompleteness: boolean;
    aggressiveMode: boolean;
    noteBufferSeconds: number;
    autoConnect: boolean;
}

export interface ProjectConfig {
    id: string;
    name: string;
    yamlPath: string;
    supervisors: SupervisorConfig[];
    enabled: boolean;
    lastUpdated: number;
}

// ============================================
// EVENT INTERFACES
// ============================================

export interface SupervisorEvent {
    type: 'analysis_complete' | 'alert_triggered' | 'intervention';
    data: any;
    timestamp: number;
}

export interface ScopeEvent {
    type: 'task_updated' | 'progress_changed' | 'note_added' | 'requirement_added';
    data: any;
    timestamp: number;
}

// ============================================
// MESSAGE INTERFACES (WebView Communication)
// ============================================

export interface WebViewMessage {
    command: string;
    data?: any;
}

export interface WebViewState {
    connectionStatus: ConnectionStatus;
    apiStatus: ApiStatus;
    activeTask: Task | null;
    supervisorStats: {
        active: number;
        totalRules: number;
        lastAnalysis: number;
        alertCount: number;
    };
    apiStats: ApiStats;
    recentAlerts: Alert[];
}

// ============================================
// IMPORT/EXPORT INTERFACES
// ============================================

export interface ImportResult {
    projectName: string;
    coordinators: number;
    specialists: number;
    rules: number;
    hierarchy: SupervisorConfig[];
}

export interface DocumentAnalysis {
    themes: string[];
    subThemes: Record<string, string[]>;
    rules: Rule[];
}
