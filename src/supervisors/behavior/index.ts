// ============================================
// CLAUDE SUPERVISOR - BEHAVIOR SUPERVISOR
// ============================================

import { EventEmitter } from 'events';
import { SupervisorResult, Severity } from '../../core/types';
import { anthropicClient } from '../../core/api';
import { BEHAVIOR_PATTERNS } from '../../core/constants';
import { configManager } from '../../core/config';

// ============================================
// BEHAVIOR SUPERVISOR
// ============================================

export class BehaviorSupervisor extends EventEmitter {
    private callCount: number = 0;
    private alertCount: number = 0;

    constructor() {
        super();
    }

    /**
     * Normalize string: lowercase, remove accents
     */
    private normalizeForSearch(str: string): string {
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, ''); // Remove accents
    }

    // ========================================
    // ANALYSIS
    // ========================================

    public async analyze(
        thinking: string,
        originalRequest: string,
        currentProgress: string
    ): Promise<SupervisorResult | null> {
        const startTime = Date.now();
        const config = configManager.getConfig();

        // Check different behavior types based on configuration
        const checks: Promise<SupervisorResult | null>[] = [];

        if (config.detectScopeReduction) {
            checks.push(this.checkScopeReduction(thinking, originalRequest));
        }

        if (config.detectProcrastination) {
            checks.push(this.checkProcrastination(thinking));
        }

        if (config.verifyCompleteness) {
            checks.push(this.checkCompleteness(thinking, originalRequest, currentProgress));
        }

        const results = await Promise.all(checks);
        const alerts = results.filter(r => r !== null) as SupervisorResult[];

        this.callCount++;

        if (alerts.length === 0) {
            return null;
        }

        // Return most severe alert
        alerts.sort((a, b) => {
            const severityOrder = ['critical', 'high', 'medium', 'low'];
            return severityOrder.indexOf(a.severity || 'low') -
                   severityOrder.indexOf(b.severity || 'low');
        });

        this.alertCount++;
        return alerts[0];
    }

    // ========================================
    // SCOPE REDUCTION DETECTION
    // ========================================

    private async checkScopeReduction(
        thinking: string,
        originalRequest: string
    ): Promise<SupervisorResult | null> {
        const startTime = Date.now();
        const normalizedThinking = this.normalizeForSearch(thinking);

        // Quick pattern matching first (accent-insensitive)
        for (const pattern of BEHAVIOR_PATTERNS.SCOPE_REDUCTION) {
            if (normalizedThinking.includes(this.normalizeForSearch(pattern))) {
                // Found pattern - verify with AI
                const result = await anthropicClient.detectBehavior(
                    thinking,
                    originalRequest,
                    ''
                );

                if (result.detected && result.type === 'scope_reduction') {
                    return {
                        supervisorId: 'behavior-scope',
                        supervisorName: 'Comportamento.Escopo',
                        status: 'alert',
                        severity: Severity.HIGH,
                        message: `Redução de escopo detectada: ${result.explanation}`,
                        thinkingSnippet: this.extractSnippetAround(thinking, pattern),
                        timestamp: Date.now(),
                        processingTime: Date.now() - startTime
                    };
                }
            }
        }

        return null;
    }

    // ========================================
    // PROCRASTINATION DETECTION
    // ========================================

    private async checkProcrastination(thinking: string): Promise<SupervisorResult | null> {
        const startTime = Date.now();
        const normalizedThinking = this.normalizeForSearch(thinking);

        for (const pattern of BEHAVIOR_PATTERNS.PROCRASTINATION) {
            if (normalizedThinking.includes(this.normalizeForSearch(pattern))) {
                return {
                    supervisorId: 'behavior-procrastination',
                    supervisorName: 'Comportamento.Procrastinação',
                    status: 'alert',
                    severity: Severity.MEDIUM,
                    message: `Linguagem de procrastinação detectada`,
                    thinkingSnippet: this.extractSnippetAround(thinking, pattern),
                    timestamp: Date.now(),
                    processingTime: Date.now() - startTime
                };
            }
        }

        return null;
    }

    // ========================================
    // COMPLETENESS VERIFICATION
    // ========================================

    private async checkCompleteness(
        thinking: string,
        originalRequest: string,
        currentProgress: string
    ): Promise<SupervisorResult | null> {
        const startTime = Date.now();
        const normalizedThinking = this.normalizeForSearch(thinking);

        // Check if Claude is saying it's done (accent-insensitive)
        let sayingDone = false;
        for (const pattern of BEHAVIOR_PATTERNS.COMPLETION_PHRASES) {
            if (normalizedThinking.includes(this.normalizeForSearch(pattern))) {
                sayingDone = true;
                break;
            }
        }

        if (!sayingDone) {
            return null;
        }

        // Verify with AI if the task is actually complete
        const result = await anthropicClient.detectBehavior(
            thinking,
            originalRequest,
            currentProgress
        );

        if (result.detected && result.type === 'incompleteness') {
            return {
                supervisorId: 'behavior-completeness',
                supervisorName: 'Comportamento.Completude',
                status: 'alert',
                severity: Severity.HIGH,
                message: `Tarefa marcada como completa mas pode estar incompleta: ${result.explanation}`,
                thinkingSnippet: thinking.substring(0, 100) + '...',
                timestamp: Date.now(),
                processingTime: Date.now() - startTime
            };
        }

        return null;
    }

    // ========================================
    // HELPERS
    // ========================================

    private extractSnippetAround(text: string, pattern: string, contextSize: number = 50): string {
        const lowerText = text.toLowerCase();
        const index = lowerText.indexOf(pattern.toLowerCase());

        if (index === -1) {
            return text.substring(0, 100) + '...';
        }

        const start = Math.max(0, index - contextSize);
        const end = Math.min(text.length, index + pattern.length + contextSize);

        let snippet = text.substring(start, end);

        if (start > 0) snippet = '...' + snippet;
        if (end < text.length) snippet = snippet + '...';

        return snippet;
    }

    // ========================================
    // STATISTICS
    // ========================================

    public getCallCount(): number {
        return this.callCount;
    }

    public getAlertCount(): number {
        return this.alertCount;
    }

    public resetStats(): void {
        this.callCount = 0;
        this.alertCount = 0;
    }
}
