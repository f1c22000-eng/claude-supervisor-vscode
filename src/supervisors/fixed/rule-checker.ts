// ============================================
// CLAUDE SUPERVISOR - RULE CHECKER
// ============================================
// Uses Haiku to check if thinking violates specific rules
// Used by specialist supervisors for dynamic rules

import { EventEmitter } from 'events';
import { anthropicClient } from '../../core/api';

// ============================================
// TYPES
// ============================================

export interface RuleCheckResult {
    violated: boolean;
    ruleId: string | null;
    confidence: number;
    explanation: string;
    suggestion: string;
}

// ============================================
// PROMPT
// ============================================

const RULE_CHECK_PROMPT = `Voce e um supervisor que verifica se um pensamento viola uma regra especifica.

REGRA A VERIFICAR:
{rule}

{context}

DIRETRIZES:
1. So marque violacao se tiver certeza (confidence > 0.7)
2. Considere o contexto da tarefa
3. Nao marque violacao se Claude esta apenas planejando
4. Marque violacao apenas se a ACAO viola a regra
5. A explicacao deve ser concisa (max 100 caracteres)

Responda em JSON PURO:
{
  "violated": true ou false,
  "confidence": 0.0-1.0,
  "explanation": "Explicacao breve se violado",
  "suggestion": "Sugestao de correcao se violado"
}

Se nao houver violacao:
{"violated": false, "confidence": 0, "explanation": "", "suggestion": ""}`;

// ============================================
// RULE CHECKER
// ============================================

export class RuleChecker extends EventEmitter {
    private callCount: number = 0;
    private violationCount: number = 0;
    private cache: Map<string, { result: RuleCheckResult; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 45000; // 45 seconds

    constructor() {
        super();
    }

    // ========================================
    // RULE CHECK (no debounce - rules are specific)
    // ========================================

    public async checkRule(
        thinking: string,
        rule: { id: string; text: string },
        context?: string
    ): Promise<RuleCheckResult> {
        const startTime = Date.now();
        this.callCount++;

        // Check cache
        const cacheKey = `rule:${rule.id}:${thinking.substring(0, 100)}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            console.log(`[RuleChecker] Cache hit for rule ${rule.id}`);
            return cached;
        }

        console.log(`[RuleChecker] Checking rule "${rule.id}" against ${thinking.length} chars`);

        const prompt = RULE_CHECK_PROMPT
            .replace('{rule}', rule.text)
            .replace('{context}', context ? `CONTEXTO ADICIONAL:\n${context}` : '');

        try {
            const response = await anthropicClient.callHaiku(
                prompt,
                thinking.substring(0, 2000),
                200
            );

            if (!response) {
                console.log('[RuleChecker] No response from Haiku');
                return this.emptyResult(rule.id);
            }

            const parsed = this.parseJsonResponse(response);

            const result: RuleCheckResult = {
                violated: parsed.violated === true,
                ruleId: parsed.violated ? rule.id : null,
                confidence: parsed.confidence || 0,
                explanation: parsed.explanation || '',
                suggestion: parsed.suggestion || ''
            };

            console.log(`[RuleChecker] Rule ${rule.id}: ${result.violated ? 'VIOLATED' : 'OK'} (${(result.confidence * 100).toFixed(0)}%) in ${Date.now() - startTime}ms`);

            // Cache result
            this.setCache(cacheKey, result);

            if (result.violated) {
                this.violationCount++;
                this.emit('rule_violated', result);
            }

            return result;

        } catch (error) {
            console.error('[RuleChecker] Error:', error);
            return this.emptyResult(rule.id);
        }
    }

    /**
     * Check multiple rules in parallel
     */
    public async checkRules(
        thinking: string,
        rules: Array<{ id: string; text: string }>,
        context?: string
    ): Promise<RuleCheckResult[]> {
        const results = await Promise.all(
            rules.map(rule => this.checkRule(thinking, rule, context))
        );
        return results;
    }

    /**
     * Check rules and return first violation
     */
    public async checkRulesUntilViolation(
        thinking: string,
        rules: Array<{ id: string; text: string }>,
        context?: string
    ): Promise<RuleCheckResult | null> {
        for (const rule of rules) {
            const result = await this.checkRule(thinking, rule, context);
            if (result.violated && result.confidence >= 0.7) {
                return result;
            }
        }
        return null;
    }

    // ========================================
    // UTILITIES
    // ========================================

    private emptyResult(ruleId: string): RuleCheckResult {
        return {
            violated: false,
            ruleId: null,
            confidence: 0,
            explanation: '',
            suggestion: ''
        };
    }

    private parseJsonResponse(response: string): any {
        try {
            let cleaned = response
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .trim();

            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return JSON.parse(cleaned);
        } catch (error) {
            console.error('[RuleChecker] Failed to parse JSON:', response);
            return { violated: false };
        }
    }

    private getFromCache(key: string): RuleCheckResult | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.result;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, result: RuleCheckResult): void {
        if (this.cache.size > 200) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        this.cache.set(key, { result, timestamp: Date.now() });
    }

    // ========================================
    // STATISTICS
    // ========================================

    public getCallCount(): number {
        return this.callCount;
    }

    public getViolationCount(): number {
        return this.violationCount;
    }

    public resetStats(): void {
        this.callCount = 0;
        this.violationCount = 0;
    }

    public clearCache(): void {
        this.cache.clear();
    }

    public reset(): void {
        this.resetStats();
        this.clearCache();
    }
}

// Singleton instance
export const ruleChecker = new RuleChecker();
