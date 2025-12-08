// ============================================
// CLAUDE SUPERVISOR - BEHAVIOR DETECTOR
// ============================================
// Uses Haiku to detect problematic behaviors in thinking
// Detects: scope reduction, procrastination, incompleteness

import { EventEmitter } from 'events';
import { anthropicClient } from '../../core/api';
import { Severity } from '../../core/types';

// ============================================
// TYPES
// ============================================

export interface BehaviorDetectionResult {
    detected: boolean;
    type: 'scope_reduction' | 'procrastination' | 'incompleteness' | null;
    confidence: number;
    explanation: string;
    suggestion: string;
}

// ============================================
// PROMPT
// ============================================

const BEHAVIOR_DETECTION_PROMPT = `Voce e o supervisor de comportamento do Claude Supervisor.

== SUA TAREFA ==
Detectar comportamentos problematicos no thinking do Claude Code:

1. **REDUCAO DE ESCOPO** (scope_reduction): Claude tenta fazer menos do que foi pedido
   - Frases como: "por enquanto", "so essa parte", "primeiro so", "depois faco o resto"
   - Fazer 3 de 10 itens pedidos
   - Simplificar requisitos sem autorizacao

2. **PROCRASTINACAO** (procrastination): Claude adia partes importantes
   - Frases como: "deixar pra depois", "mais tarde", "em outro momento"
   - Pular validacoes/testes "por enquanto"
   - Criar TODOs em vez de implementar

3. **INCOMPLETUDE** (incompleteness): Claude diz que terminou mas nao terminou
   - Dizer "pronto" sem ter feito tudo
   - Deixar funcoes vazias ou com placeholders
   - Nao implementar tratamento de erros

== CONTEXTO ==
Tarefa original: {originalRequest}
Progresso atual: {progress}

== FORMATO DE RESPOSTA ==
Responda APENAS com JSON valido:
{
  "detected": "scope_reduction" ou "procrastination" ou "incompleteness" ou null,
  "confidence": numero de 0.0 a 1.0,
  "explanation": "Explicacao breve",
  "suggestion": "Sugestao de correcao"
}

Se nao detectar problema, retorne:
{"detected": null, "confidence": 0, "explanation": "", "suggestion": ""}`;

// ============================================
// BEHAVIOR DETECTOR SUPERVISOR
// ============================================

export class BehaviorDetectorSupervisor extends EventEmitter {
    private callCount: number = 0;
    private alertCount: number = 0;
    private cache: Map<string, { result: BehaviorDetectionResult; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds

    // Debounce for behavior detection
    private buffer: string = '';
    private debounceTimer: NodeJS.Timeout | null = null;
    private pendingResolvers: Array<(result: BehaviorDetectionResult) => void> = [];
    private pendingContext: { originalRequest: string; progress: string } | null = null;
    private readonly DEBOUNCE_MS = 600; // Wait 600ms of silence

    constructor() {
        super();
    }

    // ========================================
    // BEHAVIOR DETECTION (debounced)
    // ========================================

    public async detectBehavior(
        thinking: string,
        originalRequest: string,
        progress: string
    ): Promise<BehaviorDetectionResult> {
        return new Promise((resolve) => {
            // Accumulate text
            this.buffer += thinking + ' ';
            this.pendingContext = { originalRequest, progress };
            this.pendingResolvers.push(resolve);

            // Reset debounce timer
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            // Set new timer
            this.debounceTimer = setTimeout(() => {
                this.flushBuffer();
            }, this.DEBOUNCE_MS);
        });
    }

    private async flushBuffer(): Promise<void> {
        const thinking = this.buffer.trim();
        const context = this.pendingContext;
        const resolvers = [...this.pendingResolvers];

        // Reset state
        this.buffer = '';
        this.pendingContext = null;
        this.pendingResolvers = [];
        this.debounceTimer = null;

        if (thinking.length < 30 || !context) {
            const emptyResult: BehaviorDetectionResult = {
                detected: false,
                type: null,
                confidence: 0,
                explanation: '',
                suggestion: ''
            };
            resolvers.forEach(r => r(emptyResult));
            return;
        }

        const result = await this.detectBehaviorImmediate(thinking, context.originalRequest, context.progress);
        resolvers.forEach(r => r(result));
    }

    private async detectBehaviorImmediate(
        thinking: string,
        originalRequest: string,
        progress: string
    ): Promise<BehaviorDetectionResult> {
        const startTime = Date.now();
        this.callCount++;

        // Check cache
        const cacheKey = `behavior:${thinking.substring(0, 200)}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            console.log('[BehaviorDetector] Cache hit');
            return cached;
        }

        console.log(`[BehaviorDetector] Analyzing ${thinking.length} chars (batched)`);

        // Build prompt with context
        const prompt = BEHAVIOR_DETECTION_PROMPT
            .replace('{originalRequest}', originalRequest || 'Nao especificado')
            .replace('{progress}', progress || '0%');

        try {
            const response = await anthropicClient.callHaiku(
                prompt,
                thinking.substring(0, 2000),
                300
            );

            if (!response) {
                console.log('[BehaviorDetector] No response from Haiku');
                return this.emptyResult();
            }

            // Parse JSON response
            const parsed = this.parseJsonResponse(response);

            const result: BehaviorDetectionResult = {
                detected: parsed.detected !== null,
                type: parsed.detected || null,
                confidence: parsed.confidence || 0,
                explanation: parsed.explanation || '',
                suggestion: parsed.suggestion || ''
            };

            console.log(`[BehaviorDetector] Result: ${result.type || 'none'} (${(result.confidence * 100).toFixed(0)}%) in ${Date.now() - startTime}ms`);

            // Cache result
            this.setCache(cacheKey, result);

            if (result.detected) {
                this.alertCount++;
                this.emit('behavior_detected', result);
            }

            return result;

        } catch (error) {
            console.error('[BehaviorDetector] Error:', error);
            return this.emptyResult();
        }
    }

    // ========================================
    // UTILITIES
    // ========================================

    private emptyResult(): BehaviorDetectionResult {
        return {
            detected: false,
            type: null,
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
            console.error('[BehaviorDetector] Failed to parse JSON:', response);
            return {};
        }
    }

    private getFromCache(key: string): BehaviorDetectionResult | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.result;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, result: BehaviorDetectionResult): void {
        if (this.cache.size > 100) {
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

    public getAlertCount(): number {
        return this.alertCount;
    }

    public resetStats(): void {
        this.callCount = 0;
        this.alertCount = 0;
    }

    public clearCache(): void {
        this.cache.clear();
    }

    public clearBuffers(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.buffer = '';
        this.pendingContext = null;
        this.pendingResolvers = [];
    }

    public reset(): void {
        this.resetStats();
        this.clearCache();
        this.clearBuffers();
    }
}

// Singleton instance
export const behaviorDetector = new BehaviorDetectorSupervisor();
