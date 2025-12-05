// ============================================
// CLAUDE SUPERVISOR - SPECIALIST
// ============================================

import { SupervisorNode } from './supervisor-node';
import { SupervisorConfig, SupervisorType, SupervisorResult, Rule, Severity } from '../core/types';
import { anthropicClient } from '../core/api';

// ============================================
// SPECIALIST
// ============================================

export class Specialist extends SupervisorNode {
    constructor(config: SupervisorConfig) {
        super({
            ...config,
            type: SupervisorType.SPECIALIST
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

        // Get enabled rules
        const enabledRules = this.config.rules.filter(r => r.enabled);

        if (enabledRules.length === 0) {
            return this.createOkResult(startTime);
        }

        // Check rules against thinking
        const violations = await this.checkRules(thinking, enabledRules, context);

        if (violations.length === 0) {
            const result = this.createOkResult(startTime);
            this.recordResult(result);
            return result;
        }

        // Get the most severe violation
        const mostSevere = this.getMostSevereViolation(violations);

        const result: SupervisorResult = {
            supervisorId: this.getId(),
            supervisorName: this.getName(),
            status: 'alert',
            severity: mostSevere.rule.severity,
            message: `${mostSevere.rule.description}: ${mostSevere.explanation}`,
            thinkingSnippet: this.extractRelevantSnippet(thinking, 100),
            timestamp: Date.now(),
            processingTime: Date.now() - startTime
        };

        this.recordResult(result);
        return result;
    }

    // ========================================
    // RULE CHECKING
    // ========================================

    private async checkRules(
        thinking: string,
        rules: Rule[],
        context?: any
    ): Promise<Array<{ rule: Rule; explanation: string }>> {
        const violations: Array<{ rule: Rule; explanation: string }> = [];

        // Check rules in parallel
        const checks = rules.map(async rule => {
            const result = await anthropicClient.checkRule(
                thinking,
                rule.check,
                context ? JSON.stringify(context) : undefined
            );

            if (result.violated) {
                return { rule, explanation: result.explanation || 'Regra violada' };
            }
            return null;
        });

        const results = await Promise.all(checks);

        for (const result of results) {
            if (result) {
                violations.push(result);
            }
        }

        return violations;
    }

    // ========================================
    // SEVERITY HANDLING
    // ========================================

    private getMostSevereViolation(
        violations: Array<{ rule: Rule; explanation: string }>
    ): { rule: Rule; explanation: string } {
        const severityOrder: Severity[] = [
            Severity.CRITICAL,
            Severity.HIGH,
            Severity.MEDIUM,
            Severity.LOW
        ];

        violations.sort((a, b) => {
            const aIndex = severityOrder.indexOf(a.rule.severity);
            const bIndex = severityOrder.indexOf(b.rule.severity);
            return aIndex - bIndex;
        });

        return violations[0];
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

    private extractRelevantSnippet(thinking: string, maxLength: number): string {
        if (thinking.length <= maxLength) {
            return thinking;
        }

        // Try to extract a meaningful snippet
        // Look for sentence boundaries
        const truncated = thinking.substring(0, maxLength);
        const lastPeriod = truncated.lastIndexOf('.');
        const lastComma = truncated.lastIndexOf(',');

        if (lastPeriod > maxLength / 2) {
            return truncated.substring(0, lastPeriod + 1);
        } else if (lastComma > maxLength / 2) {
            return truncated.substring(0, lastComma) + '...';
        }

        return truncated + '...';
    }
}
