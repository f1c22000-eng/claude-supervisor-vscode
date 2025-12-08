// ============================================
// CLAUDE SUPERVISOR - ESCALATION MANAGER
// ============================================
// Manages hybrid decision-making: Haiku → Sonnet escalation

import { EventEmitter } from 'events';
import {
    SupervisorResult,
    EscalationResult,
    LearnedPattern,
    Severity
} from '../core/types';
import { anthropicClient } from '../core/api';
import { configManager } from '../core/config';

// ============================================
// CONSTANTS
// ============================================

const ESCALATION_THRESHOLD = 80;  // Below this confidence, escalate to Sonnet
const PATTERN_MATCH_THRESHOLD = 0.7;  // Similarity threshold for pattern matching
const MAX_LEARNED_PATTERNS = 500;
const PATTERN_STORAGE_KEY = 'claudeSupervisor.learnedPatterns';

// ============================================
// ESCALATION MANAGER
// ============================================

export class EscalationManager extends EventEmitter {
    private learnedPatterns: LearnedPattern[] = [];
    private escalationCount: number = 0;
    private patternHits: number = 0;

    constructor() {
        super();
        this.loadPatterns();
    }

    // ========================================
    // PATTERN STORAGE
    // ========================================

    private loadPatterns(): void {
        this.learnedPatterns = configManager.getGlobalState<LearnedPattern[]>(
            PATTERN_STORAGE_KEY,
            []
        );
        console.log(`[EscalationManager] Loaded ${this.learnedPatterns.length} learned patterns`);
    }

    private savePatterns(): void {
        // Keep only most recent/used patterns
        if (this.learnedPatterns.length > MAX_LEARNED_PATTERNS) {
            this.learnedPatterns.sort((a, b) => {
                // Sort by usage count and recency
                const scoreA = a.usageCount * 0.7 + (a.learnedAt / Date.now()) * 0.3;
                const scoreB = b.usageCount * 0.7 + (b.learnedAt / Date.now()) * 0.3;
                return scoreB - scoreA;
            });
            this.learnedPatterns = this.learnedPatterns.slice(0, MAX_LEARNED_PATTERNS);
        }

        configManager.setGlobalState(PATTERN_STORAGE_KEY, this.learnedPatterns);
    }

    // ========================================
    // CONFIDENCE CALCULATION
    // ========================================

    /**
     * Calculate confidence for a supervisor result based on context
     */
    public calculateConfidence(
        result: SupervisorResult,
        context: {
            thinkingChunk: string;
            hasActiveTask: boolean;
            taskProgress: number;
            recentAlerts: number;
            matchedKeywords: string[];
        }
    ): { confidence: number; reason: string } {
        let confidence = 50;  // Base confidence
        const reasons: string[] = [];

        // Check for learned patterns first
        const patternMatch = this.findMatchingPattern(result, context.thinkingChunk);
        if (patternMatch) {
            this.patternHits++;
            confidence = patternMatch.confidence;
            reasons.push(`Padrão conhecido: ${patternMatch.trigger}`);

            // Update usage count
            patternMatch.usageCount++;
            this.savePatterns();

            return { confidence, reason: reasons.join('; ') };
        }

        // Rule-based confidence calculation
        if (result.status === 'alert') {
            // High confidence alerts
            if (context.hasActiveTask && context.taskProgress < 100) {
                // "Pronto" with incomplete task = high confidence alert
                const completionKeywords = ['pronto', 'terminei', 'feito', 'done', 'finished'];
                const hasCompletionWord = completionKeywords.some(kw =>
                    context.thinkingChunk.toLowerCase().includes(kw)
                );

                if (hasCompletionWord) {
                    confidence = 95;
                    reasons.push(`Declaração de conclusão com progresso ${context.taskProgress}%`);
                }
            }

            // Multiple keyword matches = higher confidence
            if (context.matchedKeywords.length >= 3) {
                confidence = Math.min(confidence + 15, 95);
                reasons.push(`${context.matchedKeywords.length} keywords correspondentes`);
            }

            // Severity affects confidence
            if (result.severity === Severity.CRITICAL) {
                confidence = Math.min(confidence + 10, 95);
                reasons.push('Severidade crítica');
            }

            // Recent alerts pattern = higher confidence
            if (context.recentAlerts >= 2) {
                confidence = Math.min(confidence + 5, 90);
                reasons.push('Padrão recorrente de alertas');
            }
        } else {
            // OK status confidence
            if (!context.hasActiveTask) {
                confidence = 90;
                reasons.push('Sem tarefa ativa');
            } else if (context.taskProgress >= 100) {
                confidence = 85;
                reasons.push('Tarefa completa');
            } else {
                confidence = 60;
                reasons.push('Tarefa em progresso, análise ambígua');
            }
        }

        // Ambiguous context reduces confidence
        const ambiguousPatterns = [
            'talvez', 'maybe', 'não tenho certeza', 'not sure',
            'poderia', 'could', 'acho que', 'i think'
        ];
        const hasAmbiguity = ambiguousPatterns.some(p =>
            context.thinkingChunk.toLowerCase().includes(p)
        );
        if (hasAmbiguity) {
            confidence = Math.max(confidence - 20, 30);
            reasons.push('Linguagem ambígua detectada');
        }

        return {
            confidence,
            reason: reasons.length > 0 ? reasons.join('; ') : 'Análise padrão'
        };
    }

    // ========================================
    // ESCALATION DECISION
    // ========================================

    /**
     * Decide whether to escalate to Sonnet
     */
    public shouldEscalate(confidence: number): boolean {
        return confidence < ESCALATION_THRESHOLD;
    }

    /**
     * Escalate analysis to Sonnet for deeper evaluation
     */
    public async escalateToSonnet(
        result: SupervisorResult,
        context: {
            thinkingChunk: string;
            originalRequest?: string;
            taskProgress?: number;
            recentHistory?: string[];
        }
    ): Promise<EscalationResult> {
        const startTime = Date.now();
        this.escalationCount++;

        this.emit('escalation_started', {
            supervisorId: result.supervisorId,
            originalConfidence: result.confidence
        });

        try {
            const prompt = this.buildEscalationPrompt(result, context);

            // Use Sonnet for escalation analysis
            const response = await anthropicClient.callSonnet(
                'Você é um supervisor sênior que analisa decisões de alertas.',
                prompt,
                1000
            );

            if (!response) {
                return {
                    model: 'sonnet',
                    decision: 'uncertain',
                    confidence: 50,
                    reason: 'API não retornou resposta',
                    processingTime: Date.now() - startTime
                };
            }

            const escalationResult = this.parseEscalationResponse(response, startTime);

            this.emit('escalation_complete', {
                supervisorId: result.supervisorId,
                decision: escalationResult.decision,
                confidence: escalationResult.confidence
            });

            // Learn from this escalation if confident
            if (escalationResult.confidence >= 85 && escalationResult.suggestedPattern) {
                this.learnPattern(escalationResult.suggestedPattern);
            }

            return escalationResult;

        } catch (error) {
            console.error('[EscalationManager] Escalation failed:', error);

            return {
                model: 'sonnet',
                decision: 'uncertain',
                confidence: 50,
                reason: `Escalação falhou: ${error}`,
                processingTime: Date.now() - startTime
            };
        }
    }

    /**
     * Build prompt for Sonnet escalation analysis
     */
    private buildEscalationPrompt(
        result: SupervisorResult,
        context: {
            thinkingChunk: string;
            originalRequest?: string;
            taskProgress?: number;
            recentHistory?: string[];
        }
    ): string {
        return `Você é um supervisor sênior analisando uma decisão de alerta.

## Contexto da Análise Inicial (Haiku)
- Supervisor: ${result.supervisorName}
- Decisão inicial: ${result.status === 'alert' ? 'ALERTA' : 'OK'}
- Confiança: ${result.confidence}%
- Razão: ${result.confidenceReason || 'Não especificada'}
- Mensagem: ${result.message || 'Nenhuma'}

## Contexto da Tarefa
- Requisição original: ${context.originalRequest || 'Não disponível'}
- Progresso atual: ${context.taskProgress !== undefined ? `${context.taskProgress}%` : 'Não rastreado'}

## Thinking Capturado
\`\`\`
${context.thinkingChunk}
\`\`\`

${context.recentHistory && context.recentHistory.length > 0 ? `
## Histórico Recente
${context.recentHistory.slice(-3).map((h, i) => `${i + 1}. ${h}`).join('\n')}
` : ''}

## Sua Tarefa
Analise se a decisão inicial está correta. Considere:
1. O thinking realmente indica o problema detectado?
2. O contexto da tarefa justifica o alerta?
3. Há nuances que o Haiku pode ter perdido?

Responda EXATAMENTE neste formato JSON:
{
  "decision": "confirm" | "override" | "uncertain",
  "confidence": <0-100>,
  "reason": "<explicação curta>",
  "suggestedPattern": {
    "trigger": "<padrão identificável para futuros casos>",
    "correctDecision": "alert" | "ok"
  }
}

Se não puder determinar com confiança, use "uncertain".`;
    }

    /**
     * Parse Sonnet's escalation response
     */
    private parseEscalationResponse(response: string, startTime: number): EscalationResult {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            const result: EscalationResult = {
                model: 'sonnet',
                decision: parsed.decision || 'uncertain',
                confidence: parsed.confidence || 50,
                reason: parsed.reason || 'Análise inconclusiva',
                processingTime: Date.now() - startTime
            };

            // Add suggested pattern if present
            if (parsed.suggestedPattern && parsed.suggestedPattern.trigger) {
                result.suggestedPattern = {
                    id: `pattern-${Date.now()}`,
                    trigger: parsed.suggestedPattern.trigger,
                    context: response.substring(0, 200),
                    correctDecision: parsed.suggestedPattern.correctDecision || 'alert',
                    confidence: parsed.confidence || 70,
                    learnedAt: Date.now(),
                    usageCount: 0
                };
            }

            return result;

        } catch (error) {
            console.error('[EscalationManager] Failed to parse response:', error);
            return {
                model: 'sonnet',
                decision: 'uncertain',
                confidence: 50,
                reason: 'Falha ao processar resposta',
                processingTime: Date.now() - startTime
            };
        }
    }

    // ========================================
    // PATTERN LEARNING
    // ========================================

    /**
     * Find matching learned pattern
     */
    private findMatchingPattern(
        result: SupervisorResult,
        thinkingChunk: string
    ): LearnedPattern | null {
        const chunkLower = thinkingChunk.toLowerCase();

        for (const pattern of this.learnedPatterns) {
            // Check if pattern trigger matches
            const triggerWords = pattern.trigger.toLowerCase().split(/\s+/);
            const matchCount = triggerWords.filter(w => chunkLower.includes(w)).length;
            const matchRatio = matchCount / triggerWords.length;

            if (matchRatio >= PATTERN_MATCH_THRESHOLD) {
                // Check if decision matches expected
                const expectedStatus = pattern.correctDecision;
                if (result.status === expectedStatus) {
                    return pattern;
                }
            }
        }

        return null;
    }

    /**
     * Learn a new pattern from escalation
     */
    public learnPattern(pattern: LearnedPattern): void {
        // Check for duplicates
        const existingIndex = this.learnedPatterns.findIndex(p =>
            this.calculateSimilarity(p.trigger, pattern.trigger) > 0.8
        );

        if (existingIndex >= 0) {
            // Update existing pattern
            const existing = this.learnedPatterns[existingIndex];
            existing.usageCount++;
            existing.confidence = Math.max(existing.confidence, pattern.confidence);
        } else {
            // Add new pattern
            this.learnedPatterns.push(pattern);
        }

        this.savePatterns();

        this.emit('pattern_learned', {
            trigger: pattern.trigger,
            correctDecision: pattern.correctDecision,
            totalPatterns: this.learnedPatterns.length
        });

        console.log(`[EscalationManager] Learned pattern: "${pattern.trigger}" → ${pattern.correctDecision}`);
    }

    /**
     * Calculate string similarity (Jaccard)
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const words1 = new Set(str1.toLowerCase().split(/\s+/));
        const words2 = new Set(str2.toLowerCase().split(/\s+/));

        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    // ========================================
    // STATISTICS
    // ========================================

    public getStats(): {
        learnedPatterns: number;
        escalationCount: number;
        patternHits: number;
        hitRate: number;
    } {
        const total = this.escalationCount + this.patternHits;
        return {
            learnedPatterns: this.learnedPatterns.length,
            escalationCount: this.escalationCount,
            patternHits: this.patternHits,
            hitRate: total > 0 ? (this.patternHits / total) * 100 : 0
        };
    }

    public getPatterns(): LearnedPattern[] {
        return [...this.learnedPatterns];
    }

    public clearPatterns(): void {
        this.learnedPatterns = [];
        this.savePatterns();
    }
}

// Singleton instance
export const escalationManager = new EscalationManager();
