// ============================================
// CLAUDE SUPERVISOR - SCOPE DETECTOR SUPERVISOR
// ============================================
// Uses Haiku to detect scope items and completions
// Replaces regex-based detection with AI-powered detection

import { EventEmitter } from 'events';
import { anthropicClient } from '../../core/api';
import { TaskItem, ItemStatus, CompletionMatch } from '../../core/types';

// ============================================
// TYPES
// ============================================

export interface ScopeDetectionResult {
    items: string[];
    hasAllKeyword: boolean;
    confidence: number;
}

export interface CompletionDetectionResult {
    completedItems: string[];
    isGlobalComplete: boolean;
    confidence: number;
    evidence: string;
}

// ============================================
// PROMPTS
// ============================================

const SCOPE_DETECTION_PROMPT = `Você é um detector de escopo de tarefas.

Analise o texto e identifique TODOS os itens/tarefas mencionados.
Formatos comuns (mas não limitados a):
- Listas numeradas: "1. Item", "2. Item"
- Formato compacto: "1.A, 2.B, 3.C, 4.D, 5.E" ou "1.Item1, 2.Item2"
- Bullets: "- Item" ou "* Item"
- Separados por vírgula: "A, B, C" ou "A, B e C"
- Declarações: "vou fazer X, Y e Z" ou "need to do X, Y, Z"
- Referências: "os 5 itens", "todas as tarefas", "the 3 items"

IMPORTANTE:
- Se encontrar formato "1.A, 2.B, 3.C", extraia: ["A", "B", "C"]
- Se encontrar "1. Item A, 2. Item B", extraia: ["Item A", "Item B"]
- Funciona em português E inglês

Responda em JSON PURO (sem markdown):
{
  "items": ["item1", "item2", ...],
  "has_all_keyword": true/false,
  "confidence": 0.0-1.0
}

Se não encontrar itens claros, retorne:
{"items": [], "has_all_keyword": false, "confidence": 0}`;

const COMPLETION_DETECTION_PROMPT = `Você é um detector de conclusão de tarefas.

ITENS PENDENTES:
{pending_items}

Analise o output e identifique:
1. Quais itens foram ENTREGUES/COMPLETADOS
2. Se há uma declaração de conclusão global

SINAIS DE CONCLUSÃO GLOBAL (is_global_complete=true):
- PT: "pronto", "terminei", "feito", "concluído", "finalizado", "tudo certo"
- EN: "done", "finished", "completed", "all done", "that's it"
- Listas repetindo todos os itens pendentes com marcação (✓, [x], done)

SINAIS DE ITEM ESPECÍFICO COMPLETO:
- Item mencionado com "feito", "done", "✓", "[x]"
- Item listado em resumo de tarefas concluídas
- Match fuzzy com itens pendentes (ignore case, acentos)

Responda em JSON PURO (sem markdown):
{
  "completed_items": ["item1", "item2"],
  "is_global_complete": true/false,
  "confidence": 0.0-1.0,
  "evidence": "trecho relevante"
}

Se não detectar conclusão, retorne:
{"completed_items": [], "is_global_complete": false, "confidence": 0, "evidence": ""}`;

// ============================================
// SCOPE DETECTOR SUPERVISOR
// ============================================

export class ScopeDetectorSupervisor extends EventEmitter {
    private callCount: number = 0;
    private cache: Map<string, { result: any; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds

    // Debounce/batching for scope detection
    private scopeBuffer: string = '';
    private scopeDebounceTimer: NodeJS.Timeout | null = null;
    private scopePendingResolvers: Array<(result: ScopeDetectionResult) => void> = [];
    private readonly SCOPE_DEBOUNCE_MS = 800; // Wait 800ms of silence before calling Haiku
    private readonly SCOPE_MIN_BUFFER = 50; // Minimum chars before processing

    // Debounce/batching for completion detection
    private completionBuffer: string = '';
    private completionDebounceTimer: NodeJS.Timeout | null = null;
    private completionPendingResolvers: Array<(result: CompletionDetectionResult) => void> = [];
    private completionPendingItems: TaskItem[] = [];
    private readonly COMPLETION_DEBOUNCE_MS = 500; // Wait 500ms before checking completion

    constructor() {
        super();
    }

    // ========================================
    // SCOPE DETECTION (from thinking)
    // ========================================

    /**
     * Detect scope items from thinking or message (debounced)
     * Accumulates chunks and calls Haiku after SCOPE_DEBOUNCE_MS of silence
     */
    public async detectScope(text: string): Promise<ScopeDetectionResult> {
        return new Promise((resolve) => {
            // Accumulate text
            this.scopeBuffer += text + ' ';
            this.scopePendingResolvers.push(resolve);

            // Reset debounce timer
            if (this.scopeDebounceTimer) {
                clearTimeout(this.scopeDebounceTimer);
            }

            // If buffer is still small, wait for more
            if (this.scopeBuffer.length < this.SCOPE_MIN_BUFFER) {
                this.scopeDebounceTimer = setTimeout(() => {
                    this.flushScopeBuffer();
                }, this.SCOPE_DEBOUNCE_MS);
                return;
            }

            // Set new timer
            this.scopeDebounceTimer = setTimeout(() => {
                this.flushScopeBuffer();
            }, this.SCOPE_DEBOUNCE_MS);
        });
    }

    /**
     * Flush scope buffer and call Haiku
     */
    private async flushScopeBuffer(): Promise<void> {
        const text = this.scopeBuffer.trim();
        const resolvers = [...this.scopePendingResolvers];

        // Reset state
        this.scopeBuffer = '';
        this.scopePendingResolvers = [];
        this.scopeDebounceTimer = null;

        if (text.length < 20) {
            // Not enough text, resolve with empty result
            const emptyResult: ScopeDetectionResult = { items: [], hasAllKeyword: false, confidence: 0 };
            resolvers.forEach(r => r(emptyResult));
            return;
        }

        // Call Haiku
        const result = await this.detectScopeImmediate(text);

        // Resolve all pending promises with the same result
        resolvers.forEach(r => r(result));
    }

    /**
     * Immediately detect scope (no debouncing) - internal
     */
    private async detectScopeImmediate(text: string): Promise<ScopeDetectionResult> {
        const startTime = Date.now();
        this.callCount++;

        // Check cache
        const cacheKey = `scope:${text.substring(0, 200)}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            console.log('[ScopeDetector] Cache hit for scope detection');
            return cached;
        }

        console.log(`[ScopeDetector] Detecting scope from ${text.length} chars (batched)`);

        try {
            const response = await anthropicClient.callHaiku(
                SCOPE_DETECTION_PROMPT,
                text.substring(0, 2000),
                300
            );

            if (!response) {
                console.log('[ScopeDetector] No response from Haiku');
                return { items: [], hasAllKeyword: false, confidence: 0 };
            }

            // Parse JSON response
            const parsed = this.parseJsonResponse(response);

            const result: ScopeDetectionResult = {
                items: parsed.items || [],
                hasAllKeyword: parsed.has_all_keyword || false,
                confidence: parsed.confidence || 0
            };

            console.log(`[ScopeDetector] Found ${result.items.length} items in ${Date.now() - startTime}ms`);
            console.log(`[ScopeDetector] Items: ${result.items.join(', ')}`);

            // Cache result
            this.setCache(cacheKey, result);

            this.emit('scope_detected', {
                items: result.items,
                confidence: result.confidence
            });

            return result;

        } catch (error) {
            console.error('[ScopeDetector] Error detecting scope:', error);
            return { items: [], hasAllKeyword: false, confidence: 0 };
        }
    }

    // ========================================
    // COMPLETION DETECTION (from output)
    // ========================================

    /**
     * Detect completed items from Claude's output (debounced)
     * Accumulates output chunks and calls Haiku after COMPLETION_DEBOUNCE_MS of silence
     */
    public async detectCompletion(
        output: string,
        pendingItems: TaskItem[]
    ): Promise<CompletionDetectionResult> {
        // Don't process if no pending items
        if (pendingItems.length === 0) {
            return {
                completedItems: [],
                isGlobalComplete: false,
                confidence: 0,
                evidence: ''
            };
        }

        return new Promise((resolve) => {
            // Accumulate output
            this.completionBuffer += output + ' ';
            this.completionPendingItems = pendingItems; // Use latest pending items
            this.completionPendingResolvers.push(resolve);

            // Reset debounce timer
            if (this.completionDebounceTimer) {
                clearTimeout(this.completionDebounceTimer);
            }

            // Set new timer
            this.completionDebounceTimer = setTimeout(() => {
                this.flushCompletionBuffer();
            }, this.COMPLETION_DEBOUNCE_MS);
        });
    }

    /**
     * Flush completion buffer and call Haiku
     */
    private async flushCompletionBuffer(): Promise<void> {
        const output = this.completionBuffer.trim();
        const pendingItems = this.completionPendingItems;
        const resolvers = [...this.completionPendingResolvers];

        // Reset state
        this.completionBuffer = '';
        this.completionPendingItems = [];
        this.completionPendingResolvers = [];
        this.completionDebounceTimer = null;

        if (output.length < 10 || pendingItems.length === 0) {
            // Not enough output, resolve with empty result
            const emptyResult: CompletionDetectionResult = {
                completedItems: [],
                isGlobalComplete: false,
                confidence: 0,
                evidence: ''
            };
            resolvers.forEach(r => r(emptyResult));
            return;
        }

        // Call Haiku
        const result = await this.detectCompletionImmediate(output, pendingItems);

        // Resolve all pending promises with the same result
        resolvers.forEach(r => r(result));
    }

    /**
     * Immediately detect completion (no debouncing) - internal
     */
    private async detectCompletionImmediate(
        output: string,
        pendingItems: TaskItem[]
    ): Promise<CompletionDetectionResult> {
        const startTime = Date.now();
        this.callCount++;

        console.log(`[ScopeDetector] Detecting completion from ${output.length} chars (batched), ${pendingItems.length} pending items`);

        // Build prompt with pending items
        const pendingItemsList = pendingItems
            .filter(item => item.status !== ItemStatus.COMPLETED)
            .map(item => `- ${item.name}`)
            .join('\n');

        const prompt = COMPLETION_DETECTION_PROMPT.replace('{pending_items}', pendingItemsList);

        try {
            const response = await anthropicClient.callHaiku(
                prompt,
                output.substring(0, 2000),
                400
            );

            if (!response) {
                console.log('[ScopeDetector] No response from Haiku for completion');
                return {
                    completedItems: [],
                    isGlobalComplete: false,
                    confidence: 0,
                    evidence: ''
                };
            }

            // Parse JSON response
            const parsed = this.parseJsonResponse(response);

            const result: CompletionDetectionResult = {
                completedItems: parsed.completed_items || [],
                isGlobalComplete: parsed.is_global_complete || false,
                confidence: parsed.confidence || 0,
                evidence: parsed.evidence || ''
            };

            console.log(`[ScopeDetector] Detected ${result.completedItems.length} completed items, global=${result.isGlobalComplete}`);

            // If global complete, add all pending items to completed
            if (result.isGlobalComplete && result.confidence >= 0.6) {
                result.completedItems = pendingItems
                    .filter(item => item.status !== ItemStatus.COMPLETED)
                    .map(item => item.name);
                console.log(`[ScopeDetector] Global completion - marking all ${result.completedItems.length} items as complete`);
            }

            this.emit('completion_detected', {
                items: result.completedItems,
                isGlobal: result.isGlobalComplete,
                confidence: result.confidence
            });

            console.log(`[ScopeDetector] Completion detection took ${Date.now() - startTime}ms`);

            return result;

        } catch (error) {
            console.error('[ScopeDetector] Error detecting completion:', error);
            return {
                completedItems: [],
                isGlobalComplete: false,
                confidence: 0,
                evidence: ''
            };
        }
    }

    /**
     * Convert completion result to CompletionMatch array for compatibility
     */
    public convertToMatches(
        result: CompletionDetectionResult,
        items: TaskItem[]
    ): CompletionMatch[] {
        const matches: CompletionMatch[] = [];

        for (const completedName of result.completedItems) {
            // Find matching item
            const item = items.find(i =>
                i.name.toLowerCase().includes(completedName.toLowerCase()) ||
                completedName.toLowerCase().includes(i.name.toLowerCase())
            );

            if (item && item.status !== ItemStatus.COMPLETED) {
                matches.push({
                    itemId: item.id,
                    itemName: item.name,
                    evidence: result.evidence,
                    confidence: result.confidence,
                    matchType: result.isGlobalComplete ? 'global' : 'declaration'
                });
            }
        }

        // If global complete but no specific matches found, match all pending
        if (result.isGlobalComplete && matches.length === 0) {
            for (const item of items) {
                if (item.status !== ItemStatus.COMPLETED) {
                    matches.push({
                        itemId: item.id,
                        itemName: item.name,
                        evidence: result.evidence,
                        confidence: result.confidence,
                        matchType: 'global'
                    });
                }
            }
        }

        return matches;
    }

    // ========================================
    // UTILITIES
    // ========================================

    private parseJsonResponse(response: string): any {
        try {
            // Remove markdown code blocks if present
            let cleaned = response
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .trim();

            // Find JSON object
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return JSON.parse(cleaned);
        } catch (error) {
            console.error('[ScopeDetector] Failed to parse JSON:', response);
            return {};
        }
    }

    private getFromCache(key: string): any | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.result;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, result: any): void {
        // Limit cache size
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

    /**
     * Clear all buffers (call when session ends or resets)
     */
    public clearBuffers(): void {
        // Clear scope buffer
        if (this.scopeDebounceTimer) {
            clearTimeout(this.scopeDebounceTimer);
            this.scopeDebounceTimer = null;
        }
        this.scopeBuffer = '';
        this.scopePendingResolvers = [];

        // Clear completion buffer
        if (this.completionDebounceTimer) {
            clearTimeout(this.completionDebounceTimer);
            this.completionDebounceTimer = null;
        }
        this.completionBuffer = '';
        this.completionPendingItems = [];
        this.completionPendingResolvers = [];

        console.log('[ScopeDetector] Buffers cleared');
    }

    /**
     * Full reset (stats, cache, and buffers)
     */
    public reset(): void {
        this.resetStats();
        this.clearCache();
        this.clearBuffers();
    }
}

// Singleton instance
export const scopeDetector = new ScopeDetectorSupervisor();
