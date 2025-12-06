// ============================================
// CLAUDE SUPERVISOR - COORDINATOR
// ============================================

import { SupervisorNode } from './supervisor-node';
import { SupervisorConfig, SupervisorType, SupervisorResult, Severity } from '../core/types';
import { anthropicClient } from '../core/api';

// ============================================
// COORDINATOR
// ============================================

export class Coordinator extends SupervisorNode {
    constructor(config: SupervisorConfig) {
        super({
            ...config,
            type: SupervisorType.COORDINATOR
        });
    }

    // ========================================
    // ANALYSIS
    // ========================================

    public async analyze(thinking: string, context?: any): Promise<SupervisorResult> {
        const startTime = Date.now();

        if (!this.isEnabled()) {
            return this.createOkResult(startTime);
        }

        // Find appropriate specialist(s)
        const specialists = await this.selectSpecialists(thinking);

        if (specialists.length === 0) {
            return this.createOkResult(startTime);
        }

        // Run specialists in parallel
        const results = await this.runSpecialists(specialists, thinking, context);

        // Aggregate results
        const aggregatedResult = this.aggregateResults(results, startTime);

        this.recordResult(aggregatedResult);
        return aggregatedResult;
    }

    // ========================================
    // SPECIALIST SELECTION
    // ========================================

    /**
     * Normalize string: lowercase, remove accents
     */
    private normalizeForSearch(str: string): string {
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, ''); // Remove accents
    }

    private async selectSpecialists(thinking: string): Promise<SupervisorNode[]> {
        const selected: SupervisorNode[] = [];
        const normalizedThinking = this.normalizeForSearch(thinking);

        // Select by keyword matching (accent-insensitive)
        for (const child of this.children) {
            if (!child.isEnabled()) continue;

            const keywords = child.getKeywords();
            for (const keyword of keywords) {
                if (normalizedThinking.includes(this.normalizeForSearch(keyword))) {
                    selected.push(child);
                    break;
                }
            }
        }

        // If no keyword matches, use AI to determine relevance
        if (selected.length === 0 && this.children.length > 0) {
            // For now, select all enabled specialists
            // In a more sophisticated implementation, we'd use AI
            return this.children.filter(c => c.isEnabled());
        }

        return selected;
    }

    // ========================================
    // PARALLEL EXECUTION
    // ========================================

    private async runSpecialists(
        specialists: SupervisorNode[],
        thinking: string,
        context?: any
    ): Promise<SupervisorResult[]> {
        const promises = specialists.map(specialist =>
            specialist.analyze(thinking, context).catch(error => {
                console.error(`Specialist ${specialist.getName()} failed:`, error);
                return this.createErrorResult(specialist, error);
            })
        );

        // Wait for all with timeout
        const results = await Promise.all(promises);
        return results;
    }

    // ========================================
    // RESULT AGGREGATION
    // ========================================

    private aggregateResults(results: SupervisorResult[], startTime: number): SupervisorResult {
        // Find the most severe alert
        const alerts = results.filter(r => r.status === 'alert');

        if (alerts.length === 0) {
            return {
                supervisorId: this.getId(),
                supervisorName: this.getName(),
                status: 'ok',
                timestamp: Date.now(),
                processingTime: Date.now() - startTime
            };
        }

        // Sort by severity
        const severityOrder = ['critical', 'high', 'medium', 'low'];
        alerts.sort((a, b) => {
            const aIndex = severityOrder.indexOf(a.severity || 'low');
            const bIndex = severityOrder.indexOf(b.severity || 'low');
            return aIndex - bIndex;
        });

        const mostSevere = alerts[0];

        return {
            supervisorId: this.getId(),
            supervisorName: `${this.getName()} > ${mostSevere.supervisorName}`,
            status: 'alert',
            severity: mostSevere.severity,
            message: mostSevere.message,
            thinkingSnippet: mostSevere.thinkingSnippet,
            timestamp: Date.now(),
            processingTime: Date.now() - startTime
        };
    }

    // ========================================
    // HELPERS
    // ========================================

    private createOkResult(startTime: number): SupervisorResult {
        return {
            supervisorId: this.getId(),
            supervisorName: this.getName(),
            status: 'ok',
            timestamp: Date.now(),
            processingTime: Date.now() - startTime
        };
    }

    private createErrorResult(specialist: SupervisorNode, error: any): SupervisorResult {
        return {
            supervisorId: specialist.getId(),
            supervisorName: specialist.getName(),
            status: 'ok', // Fail open - don't block on errors
            timestamp: Date.now(),
            processingTime: 0
        };
    }
}
