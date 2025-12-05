// ============================================
// CLAUDE SUPERVISOR - SUPERVISOR HIERARCHY
// ============================================

import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SupervisorNode } from './supervisor-node';
import { Router } from './router';
import { Coordinator } from './coordinator';
import { Specialist } from './specialist';
import { ConfigLoader } from './config-loader';
import { BehaviorSupervisor } from './behavior';
import { configManager } from '../core/config';
import {
    SupervisorConfig,
    SupervisorType,
    SupervisorResult,
    ThinkingChunk,
    AnalysisResult
} from '../core/types';
import { TIMEOUTS, LIMITS } from '../core/constants';

// Alert history entry type
interface AlertHistoryEntry {
    id: string;
    supervisorName: string;
    message: string;
    status: string;
    timestamp: number;
    chunkPreview: string;
}

// ============================================
// SUPERVISOR HIERARCHY
// ============================================

export class SupervisorHierarchy extends EventEmitter {
    private router: Router;
    private behaviorSupervisor: BehaviorSupervisor;
    private configLoader: ConfigLoader;
    private isAnalyzing: boolean = false;
    private analysisQueue: ThinkingChunk[] = [];
    private alertHistory: AlertHistoryEntry[] = [];
    private alwaysActiveIds: Set<string> = new Set();  // IDs of supervisors that cannot be disabled
    private extensionPath: string = '';
    private static readonly MAX_HISTORY_SIZE = 100;
    private static readonly HISTORY_KEY = 'claudeSupervisor.alertHistory';

    constructor() {
        super();

        // Load persisted alert history
        this.loadAlertHistory();

        // Create root router (empty by default)
        this.router = new Router({
            id: 'root-router',
            name: 'Router',
            type: SupervisorType.ROUTER,
            keywords: [],
            rules: [],
            enabled: true
        });

        // Create behavior supervisor (special - runs on all thinking)
        this.behaviorSupervisor = new BehaviorSupervisor();

        // Initialize config loader
        this.configLoader = new ConfigLoader();

        // NOTE: Core behavior supervisors are loaded via loadCoreBehaviorSupervisors()
        // which must be called after extension context is available
    }

    /**
     * Set extension path (needed for loading bundled configs)
     */
    public setExtensionPath(extPath: string): void {
        this.extensionPath = extPath;
    }

    /**
     * Load core behavior supervisors (always active, cannot be disabled)
     * These detect problematic behaviors like premature conclusions, hardcoded values, etc.
     */
    public async loadCoreBehaviorSupervisors(): Promise<void> {
        // Try multiple possible paths for the config
        const possiblePaths = [
            // When running in development (from source)
            path.join(this.extensionPath, 'config', 'supervisors', 'core-behavior.yaml'),
            // When running packaged extension
            path.join(this.extensionPath, 'out', 'config', 'supervisors', 'core-behavior.yaml'),
            // Relative to current file
            path.join(__dirname, '..', '..', 'config', 'supervisors', 'core-behavior.yaml'),
        ];

        let configPath: string | null = null;
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                configPath = p;
                break;
            }
        }

        if (!configPath) {
            console.warn('[Hierarchy] Core behavior config not found. Tried paths:', possiblePaths);
            return;
        }

        try {
            console.log('[Hierarchy] Loading core behavior supervisors from:', configPath);
            const result = await this.configLoader.loadFromFileWithMetadata(configPath);

            if (result.configs.length === 0) {
                console.warn('[Hierarchy] Core behavior config is empty');
                return;
            }

            // First, create parent coordinators if needed
            const parentNames = new Set<string>();
            for (const config of result.configs) {
                if (config.parentId) {
                    // Extract parent name from parentId (e.g., "_core_behavior-comportamento" -> "Comportamento")
                    const parentName = config.parentId.split('-').pop() || '';
                    parentNames.add(parentName);
                }
            }

            // Create parent coordinators
            for (const parentName of parentNames) {
                const capitalizedName = parentName.charAt(0).toUpperCase() + parentName.slice(1);
                const parentId = `${result.projectName.toLowerCase()}-${parentName.toLowerCase()}`;

                // Check if parent already exists
                if (!this.findNode(parentId)) {
                    const coordinator = new Coordinator({
                        id: parentId,
                        name: capitalizedName,
                        type: SupervisorType.COORDINATOR,
                        keywords: [],
                        rules: [],
                        enabled: true,
                        alwaysActive: result.alwaysActive
                    });
                    this.router.addChild(coordinator);
                    if (result.alwaysActive) {
                        this.alwaysActiveIds.add(parentId);
                    }
                }
            }

            // Now add all supervisors from config
            for (const config of result.configs) {
                const node = this.addSupervisorFromConfig(config);

                // Mark as always active if specified
                if (result.alwaysActive) {
                    this.alwaysActiveIds.add(config.id);
                }
            }

            console.log(`[Hierarchy] Loaded ${result.configs.length} core behavior supervisors (always active: ${result.alwaysActive})`);

        } catch (error) {
            console.error('[Hierarchy] Failed to load core behavior supervisors:', error);
        }
    }

    /**
     * Check if a supervisor is always active (cannot be disabled)
     */
    public isAlwaysActive(supervisorId: string): boolean {
        return this.alwaysActiveIds.has(supervisorId);
    }

    /**
     * Get count of always-active supervisors
     */
    public getAlwaysActiveCount(): number {
        return this.alwaysActiveIds.size;
    }

    // ========================================
    // EXAMPLE CONFIGURATION
    // ========================================

    /**
     * Load example supervisors for demonstration purposes.
     * Called only when user explicitly requests it.
     */
    public loadExampleSupervisors(): void {
        // Clear existing supervisors first
        this.clearAllSupervisors();

        // Create example coordinators
        const technical = new Coordinator({
            id: 'coord-technical',
            name: 'Técnico',
            type: SupervisorType.COORDINATOR,
            keywords: ['código', 'função', 'classe', 'método', 'variável', 'import', 'export'],
            rules: [],
            enabled: true
        });

        const business = new Coordinator({
            id: 'coord-business',
            name: 'Negócio',
            type: SupervisorType.COORDINATOR,
            keywords: ['regra', 'validação', 'processo', 'fluxo', 'usuário'],
            rules: [],
            enabled: true
        });

        const behavior = new Coordinator({
            id: 'coord-behavior',
            name: 'Comportamento',
            type: SupervisorType.COORDINATOR,
            keywords: ['fazer', 'implementar', 'criar', 'só', 'apenas', 'depois'],
            rules: [],
            enabled: true
        });

        // Security specialist
        const security = new Specialist({
            id: 'spec-security',
            name: 'Segurança',
            type: SupervisorType.SPECIALIST,
            keywords: ['sql', 'query', 'password', 'senha', 'token', 'auth', 'input'],
            rules: [
                {
                    id: 'sql-injection',
                    description: 'Usar prepared statements em queries SQL',
                    severity: 'critical' as any,
                    check: 'Verificar se concatenação de strings é usada em queries SQL',
                    exampleViolation: 'query = "SELECT * FROM users WHERE id = " + userId',
                    enabled: true
                },
                {
                    id: 'xss-prevention',
                    description: 'Sanitizar inputs de usuário',
                    severity: 'high' as any,
                    check: 'Verificar se inputs são sanitizados antes de exibição',
                    enabled: true
                }
            ],
            enabled: true
        });

        // Architecture specialist
        const architecture = new Specialist({
            id: 'spec-architecture',
            name: 'Arquitetura',
            type: SupervisorType.SPECIALIST,
            keywords: ['padrão', 'pattern', 'arquitetura', 'estrutura', 'módulo'],
            rules: [],
            enabled: true
        });

        // Completeness specialist
        const completeness = new Specialist({
            id: 'spec-completeness',
            name: 'Completude',
            type: SupervisorType.SPECIALIST,
            keywords: ['todos', 'todas', 'cada', 'completo', 'pronto', 'feito'],
            rules: [
                {
                    id: 'scope-reduction',
                    description: 'Não reduzir escopo sem autorização',
                    severity: 'high' as any,
                    check: 'Detectar frases como "por enquanto", "só essa", "primeiro só"',
                    enabled: true
                }
            ],
            enabled: true
        });

        // Build hierarchy
        technical.addChild(security);
        technical.addChild(architecture);
        behavior.addChild(completeness);

        this.router.addChild(technical);
        this.router.addChild(business);
        this.router.addChild(behavior);
    }

    /**
     * Clear all supervisors (keep only root router)
     */
    public clearAllSupervisors(): void {
        // Remove all children from router
        for (const child of this.router.getChildren()) {
            this.router.removeChild(child.getId());
        }
    }

    /**
     * Check if hierarchy has any supervisors configured
     */
    public hasConfiguredSupervisors(): boolean {
        return this.router.getChildren().length > 0;
    }

    // ========================================
    // ANALYSIS
    // ========================================

    public async analyzeThinking(
        chunk: ThinkingChunk,
        context?: { originalRequest?: string; progress?: string }
    ): Promise<AnalysisResult> {
        const startTime = Date.now();
        const results: SupervisorResult[] = [];

        // Add to queue if already analyzing
        if (this.isAnalyzing) {
            this.analysisQueue.push(chunk);
            return {
                thinkingChunk: chunk.content,
                results: [],
                totalTime: 0,
                timestamp: Date.now()
            };
        }

        this.isAnalyzing = true;

        try {
            // Run router analysis
            const routerResult = await Promise.race([
                this.router.analyze(chunk.content, context),
                this.createTimeout(TIMEOUTS.HAIKU_REQUEST * 2)
            ]);

            if (routerResult && typeof routerResult !== 'string') {
                results.push(routerResult);
            }

            // Run behavior supervisor (always)
            if (context?.originalRequest) {
                const behaviorResult = await this.behaviorSupervisor.analyze(
                    chunk.content,
                    context.originalRequest,
                    context.progress || ''
                );

                if (behaviorResult) {
                    results.push(behaviorResult);
                }
            }

            // Emit results
            const analysisResult: AnalysisResult = {
                thinkingChunk: chunk.content,
                results,
                totalTime: Date.now() - startTime,
                timestamp: Date.now()
            };

            this.emit('analysis_complete', analysisResult);

            // Check for alerts and save to history
            const alerts = results.filter(r => r.status === 'alert');
            for (const alert of alerts) {
                this.addAlertToHistory(alert, chunk.content);
                this.emit('alert', alert);
            }

            return analysisResult;

        } finally {
            this.isAnalyzing = false;

            // Process queue
            if (this.analysisQueue.length > 0) {
                const nextChunk = this.analysisQueue.shift()!;
                setImmediate(() => this.analyzeThinking(nextChunk, context));
            }
        }
    }

    // ========================================
    // CONFIGURATION
    // ========================================

    public async loadProjectConfig(yamlPath: string): Promise<void> {
        const configs = await this.configLoader.loadFromFile(yamlPath);

        for (const config of configs) {
            this.addSupervisorFromConfig(config);
        }
    }

    public addSupervisorFromConfig(config: SupervisorConfig): SupervisorNode {
        let node: SupervisorNode;

        switch (config.type) {
            case SupervisorType.COORDINATOR:
                node = new Coordinator(config);
                break;
            case SupervisorType.SPECIALIST:
                node = new Specialist(config);
                break;
            default:
                node = new Specialist(config);
        }

        // Find parent and add
        if (config.parentId) {
            const parent = this.findNode(config.parentId);
            if (parent) {
                parent.addChild(node);
            } else {
                // Add to appropriate coordinator based on keywords
                this.router.addChild(node);
            }
        } else {
            this.router.addChild(node);
        }

        return node;
    }

    public findNode(id: string): SupervisorNode | undefined {
        if (this.router.getId() === id) {
            return this.router;
        }
        return this.router.findDescendant(id);
    }

    // ========================================
    // STATISTICS
    // ========================================

    public getStats(): {
        totalNodes: number;
        activeNodes: number;
        totalRules: number;
        totalCalls: number;
        totalAlerts: number;
        hasConfigured: boolean;
    } {
        // Don't count root router - only user-configured supervisors
        let totalNodes = 0;
        let activeNodes = 0;
        let totalRules = 0;
        let totalCalls = this.router.getCallCount();
        let totalAlerts = this.router.getAlertCount();

        const countNode = (node: SupervisorNode) => {
            totalNodes++;
            if (node.isEnabled()) activeNodes++;
            totalRules += node.getRules().filter(r => r.enabled).length;
            totalCalls += node.getCallCount();
            totalAlerts += node.getAlertCount();

            for (const child of node.getChildren()) {
                countNode(child);
            }
        };

        for (const child of this.router.getChildren()) {
            countNode(child);
        }

        return {
            totalNodes,
            activeNodes,
            totalRules,
            totalCalls,
            totalAlerts,
            hasConfigured: this.hasConfiguredSupervisors()
        };
    }

    public getHierarchyTree(): any {
        const buildTree = (node: SupervisorNode): any => ({
            id: node.getId(),
            name: node.getName(),
            type: node.getType(),
            enabled: node.isEnabled(),
            rulesCount: node.getRules().length,
            children: node.getChildren().map(c => buildTree(c))
        });

        return buildTree(this.router);
    }

    // ========================================
    // HELPERS
    // ========================================

    private createTimeout(ms: number): Promise<string> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Analysis timeout')), ms);
        });
    }

    public getRouter(): Router {
        return this.router;
    }

    public getBehaviorSupervisor(): BehaviorSupervisor {
        return this.behaviorSupervisor;
    }

    // ========================================
    // ALERT HISTORY PERSISTENCE
    // ========================================

    private loadAlertHistory(): void {
        this.alertHistory = configManager.getGlobalState<AlertHistoryEntry[]>(
            SupervisorHierarchy.HISTORY_KEY,
            []
        );
    }

    private saveAlertHistory(): void {
        configManager.setGlobalState(SupervisorHierarchy.HISTORY_KEY, this.alertHistory);
    }

    public addAlertToHistory(result: SupervisorResult, chunkContent: string): void {
        const entry: AlertHistoryEntry = {
            id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            supervisorName: result.supervisorName,
            message: result.message || 'Alerta sem mensagem',
            status: result.status,
            timestamp: Date.now(),
            chunkPreview: chunkContent.substring(0, 200) + (chunkContent.length > 200 ? '...' : '')
        };

        this.alertHistory.unshift(entry);

        // Keep only last N entries
        if (this.alertHistory.length > SupervisorHierarchy.MAX_HISTORY_SIZE) {
            this.alertHistory = this.alertHistory.slice(0, SupervisorHierarchy.MAX_HISTORY_SIZE);
        }

        this.saveAlertHistory();
    }

    public getAlertHistory(): AlertHistoryEntry[] {
        return [...this.alertHistory];
    }

    public clearAlertHistory(): void {
        this.alertHistory = [];
        this.saveAlertHistory();
    }
}
