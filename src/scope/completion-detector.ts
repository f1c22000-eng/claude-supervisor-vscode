// ============================================
// CLAUDE SUPERVISOR - TASK COMPLETION DETECTOR
// ============================================
// Detects when Claude completes items based on output analysis

import { EventEmitter } from 'events';
import { CompletionMatch, TaskItem, ItemStatus } from '../core/types';

// ============================================
// COMPLETION PATTERNS
// ============================================

const CHECKBOX_PATTERNS = [
    /\[x\]/gi,                           // [x]
    /\[X\]/g,                            // [X]
    /☑/g,                                // Unicode checkbox
    /✓/g,                                // Check mark
    /✔/g,                                // Heavy check mark
    /✅/g,                               // Green check emoji
    /done/gi,                            // "done"
    /completed?/gi,                      // "complete" or "completed"
];

const DECLARATION_PATTERNS = [
    /(?:item|tarefa|task|passo|step)\s*(?:#?\d+|[A-Z])\s*(?:concluíd[oa]|complet[oa]|feit[oa]|done|finished)/gi,
    /(?:concluí|completei|fiz|finalizei|terminei)\s+(?:o\s+)?(?:item|tarefa|passo)\s*(?:#?\d+|[A-Z])/gi,
    /(?:pronto|done|feito|ok)[!:]\s*(?:item|tarefa)?\s*(?:#?\d+|[A-Z])/gi,
];

const SEQUENCE_PATTERNS = [
    /^(\d+)\.\s+(.+?)(?:\s*[-–—]\s*(?:done|feito|✓|✔|✅|concluído))?$/gim,
    /^([A-Z])\.\s+(.+?)(?:\s*[-–—]\s*(?:done|feito|✓|✔|✅|concluído))?$/gim,
    /^[-*•]\s+(.+?)(?:\s*[-–—]\s*(?:done|feito|✓|✔|✅|concluído))?$/gim,
];

const CODE_PATTERNS = [
    /(?:criei|created?|adicionei|added)\s+(?:o\s+)?(?:arquivo|file|função|function|classe|class)\s+['"`]?(\w+)/gi,
    /(?:implementei|implemented)\s+(?:a\s+)?(?:função|function|método|method)\s+['"`]?(\w+)/gi,
    /export\s+(?:function|class|const|interface)\s+(\w+)/g,
];

// ============================================
// TASK COMPLETION DETECTOR
// ============================================

export class TaskCompletionDetector extends EventEmitter {
    private responseBuffer: string = '';
    private detectedCompletions: Map<string, CompletionMatch> = new Map();

    constructor() {
        super();
    }

    // ========================================
    // DETECTION
    // ========================================

    /**
     * Process output chunk and detect completions
     */
    public processOutput(output: string, currentItems: TaskItem[]): CompletionMatch[] {
        this.responseBuffer += output;
        const matches: CompletionMatch[] = [];

        console.log(`[CompletionDetector] Processing output (${output.length} chars), ${currentItems.length} items`);

        // First check for global completion phrase ("pronto", "terminei", etc.)
        const globalMatches = this.detectGlobalCompletion(output, currentItems);
        if (globalMatches.length > 0) {
            console.log(`[CompletionDetector] Global completion detected: ${globalMatches.length} items marked complete`);
            matches.push(...globalMatches);
        } else {
            // Detect checkbox completions
            const checkboxMatches = this.detectCheckboxCompletions(output, currentItems);
            matches.push(...checkboxMatches);

            // Detect declaration completions
            const declarationMatches = this.detectDeclarationCompletions(output, currentItems);
            matches.push(...declarationMatches);

            // Detect sequence completions (numbered/lettered lists)
            const sequenceMatches = this.detectSequenceCompletions(output, currentItems);
            matches.push(...sequenceMatches);

            // Detect code-based completions
            const codeMatches = this.detectCodeCompletions(output, currentItems);
            matches.push(...codeMatches);
        }

        // Emit events for new matches
        for (const match of matches) {
            const key = match.itemId || match.itemName;
            if (!this.detectedCompletions.has(key)) {
                this.detectedCompletions.set(key, match);
                this.emit('completion_detected', match);
                console.log(`[CompletionDetector] Emitting completion: ${match.itemName} (${match.matchType})`);
            }
        }

        return matches;
    }

    /**
     * Detect global completion phrases that mark ALL pending items as complete
     */
    private detectGlobalCompletion(output: string, items: TaskItem[]): CompletionMatch[] {
        const matches: CompletionMatch[] = [];

        // Global completion patterns
        const globalPatterns = [
            /(?:pronto|terminei|feito|finalizado|conclu[ií]do)[!.]?\s*$/i,
            /(?:tudo\s+(?:pronto|feito|certo|completo))[!.]?\s*$/i,
            /(?:all\s+done|finished|completed?|that'?s?\s+(?:it|all|everything))[!.]?\s*$/i,
            /(?:tarefa[s]?\s+(?:conclu[ií]da[s]?|completa[s]?|finalizada[s]?))[!.]?\s*$/i,
        ];

        const isGlobalComplete = globalPatterns.some(p => p.test(output.trim()));

        if (isGlobalComplete) {
            // Mark all pending items as complete
            for (const item of items) {
                if (item.status !== ItemStatus.COMPLETED) {
                    matches.push({
                        itemId: item.id,
                        itemName: item.name,
                        evidence: output.trim().substring(0, 100),
                        confidence: 0.75,
                        matchType: 'global'
                    });
                }
            }
        }

        return matches;
    }

    /**
     * Detect checkbox-style completions
     */
    private detectCheckboxCompletions(output: string, items: TaskItem[]): CompletionMatch[] {
        const matches: CompletionMatch[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            // Check if line has a completion marker
            const hasCheckbox = CHECKBOX_PATTERNS.some(pattern => pattern.test(line));
            if (!hasCheckbox) continue;

            // Try to match with existing items
            for (const item of items) {
                if (item.status === ItemStatus.COMPLETED) continue;

                const itemName = this.normalizeForMatch(item.name);
                const lineLower = this.normalizeForMatch(line);

                if (lineLower.includes(itemName) || this.fuzzyMatch(lineLower, itemName) > 0.7) {
                    matches.push({
                        itemId: item.id,
                        itemName: item.name,
                        evidence: line.trim(),
                        confidence: 0.9,
                        matchType: 'checkbox'
                    });
                }
            }
        }

        return matches;
    }

    /**
     * Detect explicit declaration completions
     */
    private detectDeclarationCompletions(output: string, items: TaskItem[]): CompletionMatch[] {
        const matches: CompletionMatch[] = [];

        for (const pattern of DECLARATION_PATTERNS) {
            let match;
            // Reset lastIndex for global patterns
            pattern.lastIndex = 0;

            while ((match = pattern.exec(output)) !== null) {
                const fullMatch = match[0];

                // Try to extract item identifier (number or letter)
                const idMatch = fullMatch.match(/(?:#?(\d+)|([A-Z]))/i);
                if (idMatch) {
                    const identifier = idMatch[1] || idMatch[2];

                    // Find matching item by index or name
                    const itemIndex = parseInt(identifier, 10) - 1;
                    let matchedItem: TaskItem | undefined;

                    if (!isNaN(itemIndex) && itemIndex >= 0 && itemIndex < items.length) {
                        matchedItem = items[itemIndex];
                    } else {
                        // Try letter matching (A=0, B=1, etc.)
                        const letterIndex = identifier.toUpperCase().charCodeAt(0) - 65;
                        if (letterIndex >= 0 && letterIndex < items.length) {
                            matchedItem = items[letterIndex];
                        }
                    }

                    if (matchedItem && matchedItem.status !== ItemStatus.COMPLETED) {
                        matches.push({
                            itemId: matchedItem.id,
                            itemName: matchedItem.name,
                            evidence: fullMatch,
                            confidence: 0.85,
                            matchType: 'declaration'
                        });
                    }
                }
            }
        }

        return matches;
    }

    /**
     * Detect sequence completions (numbered lists with completion markers)
     */
    private detectSequenceCompletions(output: string, items: TaskItem[]): CompletionMatch[] {
        const matches: CompletionMatch[] = [];

        // Check if output has a global completion phrase (pronto, terminei, etc.)
        const globalComplete = /(?:pronto|terminei|feito|conclu[íi]|finaliz|tudo certo|all done|finished|completed?|that's it|done with)/i.test(output);

        for (const pattern of SEQUENCE_PATTERNS) {
            let match;
            pattern.lastIndex = 0;

            while ((match = pattern.exec(output)) !== null) {
                const identifier = match[1];
                const content = match[2] || match[1];
                const fullMatch = match[0];

                // Check if this line indicates completion OR if there's a global completion phrase
                const isComplete = globalComplete || /(?:done|feito|✓|✔|✅|concluído)/i.test(fullMatch);
                if (!isComplete) continue;

                // Try to match by index or content
                let matchedItem: TaskItem | undefined;

                if (/^\d+$/.test(identifier)) {
                    const itemIndex = parseInt(identifier, 10) - 1;
                    if (itemIndex >= 0 && itemIndex < items.length) {
                        matchedItem = items[itemIndex];
                    }
                } else if (/^[A-Z]$/i.test(identifier)) {
                    const letterIndex = identifier.toUpperCase().charCodeAt(0) - 65;
                    if (letterIndex >= 0 && letterIndex < items.length) {
                        matchedItem = items[letterIndex];
                    }
                } else {
                    // Try fuzzy match on content
                    for (const item of items) {
                        if (this.fuzzyMatch(content, item.name) > 0.6) {
                            matchedItem = item;
                            break;
                        }
                    }
                }

                if (matchedItem && matchedItem.status !== ItemStatus.COMPLETED) {
                    matches.push({
                        itemId: matchedItem.id,
                        itemName: matchedItem.name,
                        evidence: fullMatch.trim(),
                        confidence: 0.8,
                        matchType: 'sequence'
                    });
                }
            }
        }

        return matches;
    }

    /**
     * Detect code-based completions
     */
    private detectCodeCompletions(output: string, items: TaskItem[]): CompletionMatch[] {
        const matches: CompletionMatch[] = [];

        for (const pattern of CODE_PATTERNS) {
            let match;
            pattern.lastIndex = 0;

            while ((match = pattern.exec(output)) !== null) {
                const codeName = match[1];
                const fullMatch = match[0];

                // Try to match code name with item names
                for (const item of items) {
                    if (item.status === ItemStatus.COMPLETED) continue;

                    const itemNameLower = this.normalizeForMatch(item.name);
                    const codeNameLower = this.normalizeForMatch(codeName);

                    if (itemNameLower.includes(codeNameLower) ||
                        codeNameLower.includes(itemNameLower) ||
                        this.fuzzyMatch(itemNameLower, codeNameLower) > 0.5) {
                        matches.push({
                            itemId: item.id,
                            itemName: item.name,
                            evidence: fullMatch,
                            confidence: 0.7,
                            matchType: 'code'
                        });
                    }
                }
            }
        }

        return matches;
    }

    // ========================================
    // ALERT RESOLUTION DETECTION
    // ========================================

    /**
     * Check if output resolves a specific alert
     */
    public checkAlertResolution(output: string, alertType: string, alertMessage: string): boolean {
        const outputLower = output.toLowerCase();

        // Pattern-based resolution detection
        const resolutionPatterns: Record<string, RegExp[]> = {
            'declaracao-sem-evidencia': [
                /npm run (compile|build|test)/i,
                /test(s)? pass(ed|ing)?/i,
                /✓|✔|passed/i,
                /output:/i,
                /resultado:/i,
            ],
            'numero-magico-display': [
                /\.length/,
                /\.count/,
                /\.size/,
                /array\./,
                /Object\.keys/,
                /\.filter\(/,
                /\.reduce\(/,
            ],
            'reducao-de-escopo': [
                /implement(ed|ing)?\s+all/i,
                /todos?\s+os\s+itens/i,
                /complete(d)?\s+all/i,
            ],
            'codigo-sem-teste': [
                /npm run (compile|build|test)/i,
                /jest|mocha|test/i,
                /passed|success/i,
            ],
            'placeholder-vazio': [
                /return\s+[^'"`\s;]+/,  // Returns something other than empty
                /throw\s+new/,          // Throws error (intentional)
            ],
        };

        const patterns = resolutionPatterns[alertType] || [];
        return patterns.some(pattern => pattern.test(output));
    }

    // ========================================
    // UTILITIES
    // ========================================

    private normalizeForMatch(str: string): string {
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .trim();
    }

    /**
     * Simple fuzzy matching (Jaccard similarity on words)
     */
    private fuzzyMatch(str1: string, str2: string): number {
        const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
        const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));

        if (words1.size === 0 || words2.size === 0) return 0;

        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    /**
     * Reset detector state for new session
     */
    public reset(): void {
        this.responseBuffer = '';
        this.detectedCompletions.clear();
    }

    /**
     * Get all detected completions
     */
    public getDetectedCompletions(): CompletionMatch[] {
        return Array.from(this.detectedCompletions.values());
    }
}
