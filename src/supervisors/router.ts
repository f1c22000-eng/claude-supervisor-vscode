// ============================================
// CLAUDE SUPERVISOR - ROUTER
// ============================================

import { SupervisorNode } from './supervisor-node';
import { SupervisorConfig, SupervisorType, SupervisorResult, Severity } from '../core/types';
import { anthropicClient } from '../core/api';
import { TIMEOUTS } from '../core/constants';

// ============================================
// CLASSIFICATION CACHE
// ============================================

interface CacheEntry {
    area: string;
    timestamp: number;
}

// ============================================
// ROUTER
// ============================================

export class Router extends SupervisorNode {
    private classificationCache: Map<string, CacheEntry> = new Map();
    private cacheTTL: number = TIMEOUTS.CACHE_TTL;

    constructor(config: SupervisorConfig) {
        super({
            ...config,
            type: SupervisorType.ROUTER
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

        // Try to find matching coordinator
        const coordinator = await this.routeToCoordinator(thinking);

        if (!coordinator) {
            return this.createOkResult(startTime);
        }

        // Delegate to coordinator
        const result = await coordinator.analyze(thinking, context);

        this.recordResult(result);
        return result;
    }

    // ========================================
    // ROUTING
    // ========================================

    private async routeToCoordinator(thinking: string): Promise<SupervisorNode | null> {
        // First try keyword matching (fast)
        const keywordMatch = this.matchByKeywords(thinking);
        if (keywordMatch) {
            return keywordMatch;
        }

        // Then try AI classification (slower but more accurate)
        const aiMatch = await this.classifyWithAI(thinking);
        return aiMatch;
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

    private matchByKeywords(thinking: string): SupervisorNode | null {
        const normalizedThinking = this.normalizeForSearch(thinking);

        for (const child of this.children) {
            const keywords = child.getKeywords();
            for (const keyword of keywords) {
                if (normalizedThinking.includes(this.normalizeForSearch(keyword))) {
                    return child;
                }
            }
        }

        return null;
    }

    private async classifyWithAI(thinking: string): Promise<SupervisorNode | null> {
        // Check cache first
        const cacheKey = this.createCacheKey(thinking);
        const cached = this.classificationCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return this.findChild(cached.area) || null;
        }

        // Get available areas
        const areas = this.children.map(c => c.getName());

        if (areas.length === 0) {
            return null;
        }

        // Call AI for classification
        const result = await anthropicClient.classifyThinking(thinking, areas);

        if (!result || result === 'none') {
            return null;
        }

        // Cache the result
        this.classificationCache.set(cacheKey, {
            area: result,
            timestamp: Date.now()
        });

        // Find matching coordinator
        return this.children.find(c =>
            c.getName().toLowerCase() === result.toLowerCase()
        ) || null;
    }

    private createCacheKey(thinking: string): string {
        // Create a simple hash of the first 100 characters
        return thinking.substring(0, 100).trim();
    }

    // ========================================
    // CACHE MANAGEMENT
    // ========================================

    public clearCache(): void {
        this.classificationCache.clear();
    }

    public setCacheTTL(ttl: number): void {
        this.cacheTTL = ttl;
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
}
