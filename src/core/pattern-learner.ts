// ============================================
// CLAUDE SUPERVISOR - PATTERN LEARNER
// ============================================
// Automatic learning of behavior patterns from confirmed alerts

import * as vscode from 'vscode';

// ============================================
// TYPES
// ============================================

interface LearnedPattern {
    pattern: string;
    category: 'scope_reduction' | 'procrastination' | 'completion';
    occurrences: number;
    firstSeen: number;
    lastSeen: number;
    confirmed: boolean;  // User confirmed this is a valid pattern
}

interface ThinkingChunk {
    content: string;
    timestamp: number;
    alertType?: string;
    userConfirmed?: boolean;
}

// ============================================
// PATTERN LEARNER
// ============================================

export class PatternLearner {
    private context: vscode.ExtensionContext;
    private readonly STORAGE_KEY = 'patternLearner.data';
    private readonly MIN_OCCURRENCES = 3;  // Minimum times a pattern must appear to be suggested
    private readonly NGRAM_SIZES = [2, 3, 4, 5];  // Word lengths to extract

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // ========================================
    // STORAGE
    // ========================================

    private getData(): { chunks: ThinkingChunk[], patterns: LearnedPattern[] } {
        return this.context.globalState.get(this.STORAGE_KEY, {
            chunks: [],
            patterns: []
        });
    }

    private async saveData(data: { chunks: ThinkingChunk[], patterns: LearnedPattern[] }): Promise<void> {
        await this.context.globalState.update(this.STORAGE_KEY, data);
    }

    // ========================================
    // CHUNK COLLECTION
    // ========================================

    /**
     * Store a thinking chunk that triggered an alert
     */
    public async storeAlertChunk(
        thinking: string,
        alertType: 'scope_reduction' | 'procrastination' | 'completion',
        userConfirmed: boolean = false
    ): Promise<void> {
        const data = this.getData();

        data.chunks.push({
            content: thinking,
            timestamp: Date.now(),
            alertType,
            userConfirmed
        });

        // Keep only last 500 chunks to avoid memory issues
        if (data.chunks.length > 500) {
            data.chunks = data.chunks.slice(-500);
        }

        await this.saveData(data);

        // Auto-learn if user confirmed
        if (userConfirmed) {
            await this.learnFromChunk(thinking, alertType);
        }
    }

    /**
     * User confirms an alert was correct - learn from it
     */
    public async confirmAlert(chunkIndex: number): Promise<void> {
        const data = this.getData();

        if (chunkIndex >= 0 && chunkIndex < data.chunks.length) {
            const chunk = data.chunks[chunkIndex];
            chunk.userConfirmed = true;

            if (chunk.alertType) {
                await this.learnFromChunk(
                    chunk.content,
                    chunk.alertType as 'scope_reduction' | 'procrastination' | 'completion'
                );
            }

            await this.saveData(data);
        }
    }

    // ========================================
    // PATTERN EXTRACTION
    // ========================================

    /**
     * Normalize text for pattern extraction
     */
    private normalizeText(text: string): string {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')  // Remove accents
            .replace(/[^\w\s]/g, ' ')  // Remove punctuation
            .replace(/\s+/g, ' ')  // Normalize spaces
            .trim();
    }

    /**
     * Extract n-grams (word sequences) from text
     */
    private extractNgrams(text: string): string[] {
        const normalized = this.normalizeText(text);
        const words = normalized.split(' ').filter(w => w.length > 1);
        const ngrams: string[] = [];

        for (const n of this.NGRAM_SIZES) {
            for (let i = 0; i <= words.length - n; i++) {
                const ngram = words.slice(i, i + n).join(' ');
                // Filter out very common/useless patterns
                if (this.isInterestingNgram(ngram)) {
                    ngrams.push(ngram);
                }
            }
        }

        return ngrams;
    }

    /**
     * Check if an n-gram is interesting (not just common words)
     */
    private isInterestingNgram(ngram: string): boolean {
        // Skip very common words that appear everywhere
        const stopPhrases = [
            'the', 'and', 'for', 'that', 'this', 'with', 'from',
            'que', 'para', 'com', 'isso', 'esse', 'uma', 'como',
            'i will', 'i am', 'it is', 'eu vou', 'eu estou'
        ];

        const lower = ngram.toLowerCase();
        return !stopPhrases.some(stop => lower === stop || lower.startsWith(stop + ' '));
    }

    /**
     * Learn patterns from a confirmed thinking chunk
     */
    private async learnFromChunk(
        thinking: string,
        category: 'scope_reduction' | 'procrastination' | 'completion'
    ): Promise<void> {
        const data = this.getData();
        const ngrams = this.extractNgrams(thinking);

        for (const ngram of ngrams) {
            const existing = data.patterns.find(
                p => p.pattern === ngram && p.category === category
            );

            if (existing) {
                existing.occurrences++;
                existing.lastSeen = Date.now();
            } else {
                data.patterns.push({
                    pattern: ngram,
                    category,
                    occurrences: 1,
                    firstSeen: Date.now(),
                    lastSeen: Date.now(),
                    confirmed: false
                });
            }
        }

        // Keep only patterns with recent activity (last 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        data.patterns = data.patterns.filter(p => p.lastSeen > thirtyDaysAgo);

        await this.saveData(data);
    }

    // ========================================
    // PATTERN SUGGESTIONS
    // ========================================

    /**
     * Get learned patterns that appear frequently
     */
    public getSuggestedPatterns(): LearnedPattern[] {
        const data = this.getData();

        return data.patterns
            .filter(p => p.occurrences >= this.MIN_OCCURRENCES && !p.confirmed)
            .sort((a, b) => b.occurrences - a.occurrences)
            .slice(0, 20);  // Top 20 suggestions
    }

    /**
     * Confirm a learned pattern should be added to BEHAVIOR_PATTERNS
     */
    public async confirmPattern(pattern: string): Promise<void> {
        const data = this.getData();
        const found = data.patterns.find(p => p.pattern === pattern);

        if (found) {
            found.confirmed = true;
            await this.saveData(data);
        }
    }

    /**
     * Get all confirmed patterns (for export/integration)
     */
    public getConfirmedPatterns(): { pattern: string, category: string }[] {
        const data = this.getData();

        return data.patterns
            .filter(p => p.confirmed)
            .map(p => ({ pattern: p.pattern, category: p.category }));
    }

    // ========================================
    // REAL-TIME PATTERN CHECK
    // ========================================

    /**
     * Check if thinking matches any learned patterns
     * This supplements the hardcoded BEHAVIOR_PATTERNS
     */
    public checkLearnedPatterns(thinking: string): {
        matched: boolean;
        category?: string;
        pattern?: string;
    } {
        const data = this.getData();
        const normalizedThinking = this.normalizeText(thinking);

        // Only check confirmed patterns or highly frequent ones
        const activePatterns = data.patterns.filter(
            p => p.confirmed || p.occurrences >= this.MIN_OCCURRENCES * 2
        );

        for (const p of activePatterns) {
            if (normalizedThinking.includes(p.pattern)) {
                return {
                    matched: true,
                    category: p.category,
                    pattern: p.pattern
                };
            }
        }

        return { matched: false };
    }

    // ========================================
    // STATISTICS
    // ========================================

    public getStats(): {
        totalChunks: number;
        confirmedChunks: number;
        learnedPatterns: number;
        confirmedPatterns: number;
        suggestedPatterns: number;
    } {
        const data = this.getData();

        return {
            totalChunks: data.chunks.length,
            confirmedChunks: data.chunks.filter(c => c.userConfirmed).length,
            learnedPatterns: data.patterns.length,
            confirmedPatterns: data.patterns.filter(p => p.confirmed).length,
            suggestedPatterns: data.patterns.filter(
                p => p.occurrences >= this.MIN_OCCURRENCES && !p.confirmed
            ).length
        };
    }

    /**
     * Clear all learned data
     */
    public async clearAll(): Promise<void> {
        await this.saveData({ chunks: [], patterns: [] });
    }
}

// Singleton instance
let patternLearnerInstance: PatternLearner | null = null;

export function initPatternLearner(context: vscode.ExtensionContext): PatternLearner {
    patternLearnerInstance = new PatternLearner(context);
    return patternLearnerInstance;
}

export function getPatternLearner(): PatternLearner | null {
    return patternLearnerInstance;
}
