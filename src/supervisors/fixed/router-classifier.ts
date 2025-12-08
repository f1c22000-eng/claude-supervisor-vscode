// ============================================
// CLAUDE SUPERVISOR - ROUTER CLASSIFIER
// ============================================
// Uses Haiku to classify thinking into topic areas
// Routes analysis to appropriate specialist supervisors

import { EventEmitter } from 'events';
import { anthropicClient } from '../../core/api';

// ============================================
// TYPES
// ============================================

export interface ClassificationResult {
    area: string | null;
    confidence: number;
    reasoning: string;
}

// ============================================
// PROMPT
// ============================================

const CLASSIFICATION_PROMPT = `Voce e um classificador de temas para o Claude Supervisor.

Analise o texto e identifique a area mais relevante.

AREAS DISPONIVEIS:
{areas}

REGRAS:
1. Retorne APENAS o nome exato de uma area
2. Se nenhuma area for relevante, retorne "none"
3. Escolha a area mais especifica possivel

Responda em JSON PURO:
{
  "area": "nome da area ou none",
  "confidence": 0.0-1.0,
  "reasoning": "motivo da classificacao em 1 frase"
}`;

// ============================================
// ROUTER CLASSIFIER
// ============================================

export class RouterClassifier extends EventEmitter {
    private callCount: number = 0;
    private cache: Map<string, { result: ClassificationResult; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 60000; // 60 seconds (longer for classification)

    // Debounce for classification
    private buffer: string = '';
    private debounceTimer: NodeJS.Timeout | null = null;
    private pendingResolvers: Array<(result: ClassificationResult) => void> = [];
    private pendingAreas: string[] = [];
    private readonly DEBOUNCE_MS = 400; // Wait 400ms of silence

    constructor() {
        super();
    }

    // ========================================
    // CLASSIFICATION (debounced)
    // ========================================

    public async classify(
        thinking: string,
        areas: string[]
    ): Promise<ClassificationResult> {
        return new Promise((resolve) => {
            // Accumulate text
            this.buffer += thinking + ' ';
            this.pendingAreas = areas;
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
        const areas = this.pendingAreas;
        const resolvers = [...this.pendingResolvers];

        // Reset state
        this.buffer = '';
        this.pendingAreas = [];
        this.pendingResolvers = [];
        this.debounceTimer = null;

        if (thinking.length < 20 || areas.length === 0) {
            const emptyResult: ClassificationResult = {
                area: null,
                confidence: 0,
                reasoning: ''
            };
            resolvers.forEach(r => r(emptyResult));
            return;
        }

        const result = await this.classifyImmediate(thinking, areas);
        resolvers.forEach(r => r(result));
    }

    private async classifyImmediate(
        thinking: string,
        areas: string[]
    ): Promise<ClassificationResult> {
        const startTime = Date.now();
        this.callCount++;

        // Check cache
        const cacheKey = `classify:${thinking.substring(0, 100)}:${areas.join(',')}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            console.log('[RouterClassifier] Cache hit');
            return cached;
        }

        console.log(`[RouterClassifier] Classifying ${thinking.length} chars into ${areas.length} areas`);

        const prompt = CLASSIFICATION_PROMPT.replace('{areas}', areas.join(', '));

        try {
            const response = await anthropicClient.callHaiku(
                prompt,
                thinking.substring(0, 1500),
                100
            );

            if (!response) {
                console.log('[RouterClassifier] No response from Haiku');
                return this.emptyResult();
            }

            const parsed = this.parseJsonResponse(response);

            const result: ClassificationResult = {
                area: parsed.area === 'none' ? null : parsed.area,
                confidence: parsed.confidence || 0,
                reasoning: parsed.reasoning || ''
            };

            console.log(`[RouterClassifier] Result: ${result.area || 'none'} (${(result.confidence * 100).toFixed(0)}%) in ${Date.now() - startTime}ms`);

            // Cache result
            this.setCache(cacheKey, result);

            this.emit('classified', result);

            return result;

        } catch (error) {
            console.error('[RouterClassifier] Error:', error);
            return this.emptyResult();
        }
    }

    // ========================================
    // UTILITIES
    // ========================================

    private emptyResult(): ClassificationResult {
        return {
            area: null,
            confidence: 0,
            reasoning: ''
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

            // If no JSON, try to extract area name directly
            const areaMatch = response.trim().match(/^(\w+)$/);
            if (areaMatch) {
                return { area: areaMatch[1], confidence: 0.5, reasoning: '' };
            }

            return JSON.parse(cleaned);
        } catch (error) {
            console.error('[RouterClassifier] Failed to parse JSON:', response);
            return {};
        }
    }

    private getFromCache(key: string): ClassificationResult | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.result;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, result: ClassificationResult): void {
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

    public resetStats(): void {
        this.callCount = 0;
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
        this.pendingAreas = [];
        this.pendingResolvers = [];
    }

    public reset(): void {
        this.resetStats();
        this.clearCache();
        this.clearBuffers();
    }
}

// Singleton instance
export const routerClassifier = new RouterClassifier();
