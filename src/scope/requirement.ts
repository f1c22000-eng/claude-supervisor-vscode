// ============================================
// CLAUDE SUPERVISOR - REQUIREMENT MANAGER
// ============================================

import { Requirement } from '../core/types';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// REQUIREMENT MANAGER
// ============================================

export class RequirementManager {
    // ========================================
    // CREATION
    // ========================================

    public static create(text: string, source: 'original' | 'added' = 'added'): Requirement {
        return {
            id: uuidv4(),
            text,
            source,
            timestamp: Date.now(),
            completed: false
        };
    }

    public static createMultiple(texts: string[], source: 'original' | 'added' = 'original'): Requirement[] {
        return texts.map(text => this.create(text, source));
    }

    // ========================================
    // STATE
    // ========================================

    public static complete(requirement: Requirement): Requirement {
        return {
            ...requirement,
            completed: true
        };
    }

    public static uncomplete(requirement: Requirement): Requirement {
        return {
            ...requirement,
            completed: false
        };
    }

    // ========================================
    // FILTERING
    // ========================================

    public static filterBySource(requirements: Requirement[], source: 'original' | 'added'): Requirement[] {
        return requirements.filter(r => r.source === source);
    }

    public static filterCompleted(requirements: Requirement[]): Requirement[] {
        return requirements.filter(r => r.completed);
    }

    public static filterPending(requirements: Requirement[]): Requirement[] {
        return requirements.filter(r => !r.completed);
    }

    // ========================================
    // STATISTICS
    // ========================================

    public static getStats(requirements: Requirement[]): {
        total: number;
        completed: number;
        pending: number;
        original: number;
        added: number;
    } {
        return {
            total: requirements.length,
            completed: requirements.filter(r => r.completed).length,
            pending: requirements.filter(r => !r.completed).length,
            original: requirements.filter(r => r.source === 'original').length,
            added: requirements.filter(r => r.source === 'added').length
        };
    }

    // ========================================
    // EXTRACTION
    // ========================================

    public static extractFromText(text: string): string[] {
        const requirements: string[] = [];

        // Match bullet points
        const bulletPattern = /(?:^|\n)\s*[-*•]\s*(.+)/g;
        let match;
        while ((match = bulletPattern.exec(text)) !== null) {
            requirements.push(match[1].trim());
        }

        // Match numbered items
        const numberedPattern = /(?:^|\n)\s*\d+[.)]\s*(.+)/g;
        while ((match = numberedPattern.exec(text)) !== null) {
            requirements.push(match[1].trim());
        }

        // Match "deve/should/must" statements
        const mustPattern = /(?:deve|should|must|precisa|needs?\s+to)\s+(.+?)(?:\.|$)/gi;
        while ((match = mustPattern.exec(text)) !== null) {
            const req = match[1].trim();
            if (req.length > 10 && !requirements.includes(req)) {
                requirements.push(req);
            }
        }

        return requirements;
    }
}
