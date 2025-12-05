// ============================================
// CLAUDE SUPERVISOR - PROGRESS TRACKER
// ============================================

import { EventEmitter } from 'events';
import { Task, TaskItem, ItemStatus } from '../core/types';
import { BEHAVIOR_PATTERNS } from '../core/constants';

// ============================================
// PROGRESS TRACKER
// ============================================

export class ProgressTracker extends EventEmitter {
    private expectedTotal: number = 0;
    private detectedItems: string[] = [];

    constructor() {
        super();
    }

    // ========================================
    // SCOPE DETECTION
    // ========================================

    public analyzeUserMessage(message: string): {
        itemCount?: number;
        items: string[];
        hasAllKeyword: boolean;
    } {
        const lowerMessage = message.toLowerCase();
        let itemCount: number | undefined;
        const items: string[] = [];
        let hasAllKeyword = false;

        // Check for "all" keywords
        const allKeywords = ['todas', 'todos', 'cada', 'every', 'all'];
        hasAllKeyword = allKeywords.some(k => lowerMessage.includes(k));

        // Extract numbers (e.g., "refatorar 12 telas")
        const numberMatch = message.match(/(\d+)\s*(telas?|arquivos?|classes?|funções?|métodos?|componentes?|itens?|páginas?)/i);
        if (numberMatch) {
            itemCount = parseInt(numberMatch[1], 10);
            this.expectedTotal = itemCount;
        }

        // Extract list items
        const listPattern = /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s*(.+)/g;
        let match;
        while ((match = listPattern.exec(message)) !== null) {
            items.push(match[1].trim());
        }

        if (items.length > 0) {
            this.detectedItems = items;
            this.expectedTotal = items.length;
        }

        return { itemCount, items, hasAllKeyword };
    }

    // ========================================
    // COMPLETION DETECTION
    // ========================================

    public detectCompletionClaim(thinking: string): boolean {
        const lowerThinking = thinking.toLowerCase();

        for (const phrase of BEHAVIOR_PATTERNS.COMPLETION_PHRASES) {
            if (lowerThinking.includes(phrase.toLowerCase())) {
                return true;
            }
        }

        return false;
    }

    public detectScopeReduction(thinking: string): {
        detected: boolean;
        phrase?: string;
    } {
        const lowerThinking = thinking.toLowerCase();

        for (const pattern of BEHAVIOR_PATTERNS.SCOPE_REDUCTION) {
            if (lowerThinking.includes(pattern.toLowerCase())) {
                return {
                    detected: true,
                    phrase: pattern
                };
            }
        }

        return { detected: false };
    }

    // ========================================
    // PROGRESS CALCULATION
    // ========================================

    public calculateProgress(task: Task): {
        percentage: number;
        completed: number;
        total: number;
        isComplete: boolean;
        itemsBehind: number;
    } {
        const completed = task.items.filter(i => i.status === ItemStatus.COMPLETED).length;
        const total = task.items.length || this.expectedTotal;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        const isComplete = total > 0 && completed >= total;

        // Calculate if behind expected progress
        const expectedCompleted = this.expectedTotal;
        const itemsBehind = Math.max(0, expectedCompleted - completed);

        return {
            percentage,
            completed,
            total,
            isComplete,
            itemsBehind
        };
    }

    public compareWithExpected(currentCount: number): {
        onTrack: boolean;
        behindBy: number;
        message?: string;
    } {
        if (this.expectedTotal === 0) {
            return { onTrack: true, behindBy: 0 };
        }

        const behindBy = this.expectedTotal - currentCount;

        if (behindBy <= 0) {
            return { onTrack: true, behindBy: 0 };
        }

        return {
            onTrack: false,
            behindBy,
            message: `Esperado ${this.expectedTotal} itens, mas apenas ${currentCount} foram processados`
        };
    }

    // ========================================
    // ITEM MATCHING
    // ========================================

    public matchDetectedItems(completedNames: string[]): {
        matched: string[];
        unmatched: string[];
    } {
        const matched: string[] = [];
        const unmatched: string[] = [];

        for (const expected of this.detectedItems) {
            const lowerExpected = expected.toLowerCase();
            const found = completedNames.some(name =>
                name.toLowerCase().includes(lowerExpected) ||
                lowerExpected.includes(name.toLowerCase())
            );

            if (found) {
                matched.push(expected);
            } else {
                unmatched.push(expected);
            }
        }

        return { matched, unmatched };
    }

    // ========================================
    // STATE
    // ========================================

    public setExpectedTotal(total: number): void {
        this.expectedTotal = total;
    }

    public getExpectedTotal(): number {
        return this.expectedTotal;
    }

    public setDetectedItems(items: string[]): void {
        this.detectedItems = items;
        this.expectedTotal = items.length;
    }

    public getDetectedItems(): string[] {
        return [...this.detectedItems];
    }

    public reset(): void {
        this.expectedTotal = 0;
        this.detectedItems = [];
    }
}
