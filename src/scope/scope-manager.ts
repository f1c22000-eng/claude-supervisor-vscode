// ============================================
// CLAUDE SUPERVISOR - SCOPE MANAGER
// ============================================

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
    Task,
    TaskStatus,
    TaskItem,
    ItemStatus,
    Requirement,
    Note,
    ScopeState,
    HistoryEntry,
    ScopeEvent,
    CompletionMatch
} from '../core/types';
import { configManager } from '../core/config';
import { TIMEOUTS } from '../core/constants';
import { TaskCompletionDetector } from './completion-detector';

// ============================================
// SCOPE MANAGER
// ============================================

export class ScopeManager extends EventEmitter {
    private context: vscode.ExtensionContext;
    private state: ScopeState;
    private noteTimer: NodeJS.Timeout | null = null;
    private completionDetector: TaskCompletionDetector;

    /**
     * Normalize string: lowercase, remove accents
     */
    private normalizeForSearch(str: string): string {
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, ''); // Remove accents
    }

    constructor(context: vscode.ExtensionContext) {
        super();
        this.context = context;
        this.state = this.loadState();
        this.completionDetector = new TaskCompletionDetector();

        // Listen for completion detection events
        this.completionDetector.on('completion_detected', (match: CompletionMatch) => {
            console.log(`[ScopeManager] Completion detected: ${match.itemName} (${match.matchType}, confidence: ${match.confidence})`);
            if (match.itemId) {
                this.markItemComplete(match.itemId, match.evidence);
            }
        });
    }

    // ========================================
    // STATE MANAGEMENT
    // ========================================

    private loadState(): ScopeState {
        return this.context.workspaceState.get<ScopeState>('scopeState', {
            activeTask: null,
            history: []
        });
    }

    private async saveState(): Promise<void> {
        await this.context.workspaceState.update('scopeState', this.state);
    }

    // ========================================
    // TASK MANAGEMENT
    // ========================================

    public createTask(title: string, items: string[] = []): Task {
        const task: Task = {
            id: uuidv4(),
            title,
            status: TaskStatus.PENDING,
            createdAt: Date.now(),
            items: items.map(name => ({
                id: uuidv4(),
                name,
                status: ItemStatus.PENDING
            })),
            requirements: [],
            notes: []
        };

        this.state.activeTask = task;
        this.addHistoryEntry('task_created', `Tarefa criada: ${title}`);
        this.saveState();
        this.emitEvent('task_updated', task);

        return task;
    }

    public startTask(): void {
        if (this.state.activeTask) {
            this.state.activeTask.status = TaskStatus.IN_PROGRESS;
            this.state.activeTask.startedAt = Date.now();
            this.addHistoryEntry('task_started', 'Execução iniciada');
            this.saveState();
            this.emitEvent('task_updated', this.state.activeTask);
        }
    }

    public completeTask(): void {
        if (this.state.activeTask) {
            this.state.activeTask.status = TaskStatus.COMPLETED;
            this.state.activeTask.completedAt = Date.now();
            this.addHistoryEntry('task_completed', 'Tarefa concluída');
            this.saveState();
            this.emitEvent('task_updated', this.state.activeTask);
        }
    }

    public cancelTask(): void {
        if (this.state.activeTask) {
            this.state.activeTask.status = TaskStatus.CANCELLED;
            this.addHistoryEntry('task_completed', 'Tarefa cancelada');
            this.saveState();
            this.emitEvent('task_updated', this.state.activeTask);
        }
    }

    public getActiveTask(): Task | null {
        return this.state.activeTask;
    }

    // ========================================
    // ITEM MANAGEMENT
    // ========================================

    public addItem(name: string): TaskItem | null {
        if (!this.state.activeTask) return null;

        const item: TaskItem = {
            id: uuidv4(),
            name,
            status: ItemStatus.PENDING
        };

        this.state.activeTask.items.push(item);
        this.saveState();
        this.emitEvent('progress_changed', this.getProgress());

        return item;
    }

    public updateItemStatus(itemId: string, status: ItemStatus): void {
        if (!this.state.activeTask) return;

        const item = this.state.activeTask.items.find(i => i.id === itemId);
        if (item) {
            item.status = status;

            if (status === ItemStatus.COMPLETED) {
                this.addHistoryEntry('item_completed', `Item concluído: ${item.name}`);
            }

            this.saveState();
            this.emitEvent('progress_changed', this.getProgress());
        }
    }

    public setCurrentItem(itemId: string): void {
        if (!this.state.activeTask) return;

        // Set all in_progress items back to pending
        for (const item of this.state.activeTask.items) {
            if (item.status === ItemStatus.IN_PROGRESS) {
                item.status = ItemStatus.PENDING;
            }
        }

        // Set the specified item as in_progress
        const item = this.state.activeTask.items.find(i => i.id === itemId);
        if (item) {
            item.status = ItemStatus.IN_PROGRESS;
            this.saveState();
            this.emitEvent('progress_changed', this.getProgress());
        }
    }

    // ========================================
    // REQUIREMENT MANAGEMENT
    // ========================================

    public addRequirement(text: string, source: 'original' | 'added' = 'added'): Requirement | null {
        if (!this.state.activeTask) return null;

        const requirement: Requirement = {
            id: uuidv4(),
            text,
            source,
            timestamp: Date.now(),
            completed: false
        };

        this.state.activeTask.requirements.push(requirement);
        this.addHistoryEntry('requirement_added', `Requisito adicionado: ${text}`);
        this.saveState();
        this.emitEvent('requirement_added', requirement);

        return requirement;
    }

    public completeRequirement(requirementId: string): void {
        if (!this.state.activeTask) return;

        const req = this.state.activeTask.requirements.find(r => r.id === requirementId);
        if (req) {
            req.completed = true;
            this.saveState();
        }
    }

    public removeRequirement(requirementId: string): void {
        if (!this.state.activeTask) return;

        this.state.activeTask.requirements = this.state.activeTask.requirements.filter(
            r => r.id !== requirementId
        );
        this.saveState();
    }

    // ========================================
    // OUTPUT PROCESSING & AUTO-COMPLETION
    // ========================================

    /**
     * Process Claude's output to detect completed items
     */
    public processOutput(output: string): CompletionMatch[] {
        if (!this.state.activeTask) return [];

        const matches = this.completionDetector.processOutput(
            output,
            this.state.activeTask.items
        );

        // Emit event for each detected completion
        for (const match of matches) {
            this.emit('task_completed', {
                item: match.itemName,
                evidence: match.evidence,
                matchType: match.matchType,
                confidence: match.confidence
            });
        }

        return matches;
    }

    /**
     * Mark item as complete with evidence
     */
    public markItemComplete(itemId: string, evidence?: string): boolean {
        if (!this.state.activeTask) return false;

        const item = this.state.activeTask.items.find(i => i.id === itemId);
        if (!item || item.status === ItemStatus.COMPLETED) return false;

        item.status = ItemStatus.COMPLETED;
        this.addHistoryEntry('item_completed', `Item concluído: ${item.name}${evidence ? ` (${evidence.substring(0, 50)}...)` : ''}`);
        this.saveState();
        this.emitEvent('progress_changed', this.getProgress());

        console.log(`[ScopeManager] Item marked complete: ${item.name}`);

        // Check if all items are done
        const progress = this.getProgress();
        if (progress.percentage === 100) {
            this.emit('all_items_complete', {
                task: this.state.activeTask.title,
                completedItems: this.state.activeTask.items.length
            });
        }

        return true;
    }

    /**
     * Get pending items (not completed)
     */
    public getPendingItems(): TaskItem[] {
        if (!this.state.activeTask) return [];
        return this.state.activeTask.items.filter(i => i.status !== ItemStatus.COMPLETED);
    }

    /**
     * Check if task can be considered complete
     */
    public canComplete(): { canComplete: boolean; pendingItems: string[]; pendingCount: number } {
        if (!this.state.activeTask) {
            return { canComplete: true, pendingItems: [], pendingCount: 0 };
        }

        const pending = this.getPendingItems();
        return {
            canComplete: pending.length === 0,
            pendingItems: pending.map(i => i.name),
            pendingCount: pending.length
        };
    }

    /**
     * Reset completion detector for new session
     */
    public resetCompletionDetector(): void {
        this.completionDetector.reset();
    }

    // ========================================
    // NOTE MANAGEMENT
    // ========================================

    public addNote(text: string): Note | null {
        if (!this.state.activeTask) {
            // Create a temporary task if none exists
            this.createTask('Tarefa em andamento');
        }

        const note: Note = {
            id: uuidv4(),
            text,
            timestamp: Date.now()
        };

        this.state.activeTask!.notes.push(note);
        this.addHistoryEntry('note_added', `Nota adicionada: ${text}`);
        this.saveState();
        this.emitEvent('note_added', note);

        // Start timer to ask about note action
        this.startNoteTimer(note);

        return note;
    }

    private startNoteTimer(note: Note): void {
        const config = configManager.getConfig();
        const bufferMs = config.noteBufferSeconds * 1000;

        // Clear existing timer
        if (this.noteTimer) {
            clearTimeout(this.noteTimer);
        }

        this.noteTimer = setTimeout(() => {
            this.promptNoteAction(note);
        }, bufferMs);
    }

    private async promptNoteAction(note: Note): Promise<void> {
        const result = await vscode.window.showInformationMessage(
            `Nota pendente: "${note.text}"`,
            'Aplicar Agora',
            'Aplicar no Final',
            'Descartar'
        );

        switch (result) {
            case 'Aplicar Agora':
                note.action = 'apply_now';
                // Convert to urgent requirement
                this.addRequirement(note.text, 'added');
                this.removeNote(note.id);
                break;
            case 'Aplicar no Final':
                note.action = 'apply_later';
                break;
            case 'Descartar':
                note.action = 'discard';
                this.removeNote(note.id);
                break;
        }

        this.saveState();
    }

    public removeNote(noteId: string): void {
        if (!this.state.activeTask) return;

        this.state.activeTask.notes = this.state.activeTask.notes.filter(
            n => n.id !== noteId
        );
        this.saveState();
    }

    public applyNote(noteId: string, action: 'apply_now' | 'apply_later' | 'discard'): void {
        if (!this.state.activeTask) return;

        const note = this.state.activeTask.notes.find(n => n.id === noteId);
        if (!note) return;

        note.action = action;

        if (action === 'apply_now') {
            this.addRequirement(note.text, 'added');
            this.removeNote(noteId);
        } else if (action === 'discard') {
            this.removeNote(noteId);
        }

        this.saveState();
    }

    public getPendingNotes(): Note[] {
        if (!this.state.activeTask) return [];
        return this.state.activeTask.notes.filter(n => !n.action);
    }

    // ========================================
    // PROGRESS TRACKING
    // ========================================

    public getProgress(): { completed: number; total: number; percentage: number; current?: string } {
        if (!this.state.activeTask) {
            return { completed: 0, total: 0, percentage: 0 };
        }

        const items = this.state.activeTask.items;
        const completed = items.filter(i => i.status === ItemStatus.COMPLETED).length;
        const total = items.length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        const currentItem = items.find(i => i.status === ItemStatus.IN_PROGRESS);

        return {
            completed,
            total,
            percentage,
            current: currentItem?.name
        };
    }

    public getCurrentScope(): {
        title: string;
        progress: number;
        pendingItems: number;
    } | null {
        if (!this.state.activeTask) return null;

        const progress = this.getProgress();
        const pending = this.state.activeTask.items.filter(
            i => i.status === ItemStatus.PENDING
        ).length;

        return {
            title: this.state.activeTask.title,
            progress: progress.percentage,
            pendingItems: pending
        };
    }

    public isComplete(): boolean {
        const progress = this.getProgress();
        return progress.total > 0 && progress.completed === progress.total;
    }

    // ========================================
    // HISTORY
    // ========================================

    private addHistoryEntry(type: HistoryEntry['type'], description: string): void {
        const entry: HistoryEntry = {
            timestamp: Date.now(),
            type,
            description
        };

        this.state.history.push(entry);

        // Keep only last 100 entries
        if (this.state.history.length > 100) {
            this.state.history = this.state.history.slice(-100);
        }
    }

    public getHistory(): HistoryEntry[] {
        return [...this.state.history];
    }

    // ========================================
    // SCOPE EXTRACTION
    // ========================================

    public extractScopeFromMessage(message: string): {
        numbers?: number[];
        hasAllKeyword: boolean;
        items: string[];
    } {
        const numbers: number[] = [];
        const items: string[] = [];
        let hasAllKeyword = false;

        // Extract numbers
        const numberMatches = message.match(/\d+/g);
        if (numberMatches) {
            numbers.push(...numberMatches.map(n => parseInt(n, 10)));
        }

        // Check for "all" keywords (accent-insensitive)
        const allKeywords = ['todas', 'todos', 'cada', 'all', 'every'];
        const normalizedMessage = this.normalizeForSearch(message);
        hasAllKeyword = allKeywords.some(k =>
            normalizedMessage.includes(this.normalizeForSearch(k))
        );

        // Extract list items (bullet points, numbered lists)
        const listPattern = /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s*(.+)/g;
        let match;
        while ((match = listPattern.exec(message)) !== null) {
            items.push(match[1].trim());
        }

        // Extract letter-prefixed lists: "a) item" or "A. item" or "a - item"
        const letterPattern = /(?:^|\n)\s*([a-zA-Z])\s*[.):\-]\s*(.+)/g;
        while ((match = letterPattern.exec(message)) !== null) {
            const item = match[2].trim();
            if (item.length > 2 && !items.includes(item)) {
                items.push(item);
            }
        }

        // Extract inline comma-separated uppercase letters: "A, B, C, D, E"
        // Common pattern when Claude lists items superficially
        const inlineLetterPattern = /\b([A-Z])\s*,\s*([A-Z])\s*,\s*([A-Z])(?:\s*,\s*([A-Z]))?(?:\s*,\s*([A-Z]))?\b/g;
        while ((match = inlineLetterPattern.exec(message)) !== null) {
            // Found a letter list - add each letter as a placeholder item
            const letters = [match[1], match[2], match[3], match[4], match[5]].filter(Boolean);
            for (const letter of letters) {
                const itemName = `Item ${letter}`;
                if (!items.includes(itemName)) {
                    items.push(itemName);
                }
            }
        }

        // Extract "1.A, 2.B, 3.C" pattern (number.letter format)
        const numberLetterPattern = /\b(\d+)\.([A-Z])\b/gi;
        const numberLetterItems: string[] = [];
        while ((match = numberLetterPattern.exec(message)) !== null) {
            const num = match[1];
            const letter = match[2].toUpperCase();
            const itemName = `Item ${num}.${letter}`;
            if (!numberLetterItems.includes(itemName)) {
                numberLetterItems.push(itemName);
            }
        }
        // Only add if we found at least 2 items in this pattern
        if (numberLetterItems.length >= 2) {
            for (const item of numberLetterItems) {
                if (!items.includes(item)) {
                    items.push(item);
                }
            }
        }

        // Detect "5 items" or "lista de 5" patterns (count without actual items = suspicious)
        const countPattern = /(?:lista\s+(?:de|com)\s+)?(\d+)\s*(?:itens?|items?|coisas?|elementos?|pontos?)/i;
        const countMatch = message.match(countPattern);
        if (countMatch && items.length === 0) {
            // Claude mentioned a count but no actual items - flag this
            const count = parseInt(countMatch[1], 10);
            if (count > 0 && count <= 20) {
                for (let i = 1; i <= count; i++) {
                    items.push(`Item ${i} (pendente definição)`);
                }
            }
        }

        return { numbers, hasAllKeyword, items };
    }

    // ========================================
    // EVENTS
    // ========================================

    private emitEvent(type: ScopeEvent['type'], data: any): void {
        this.emit('scope_event', { type, data, timestamp: Date.now() });
        this.emit(type, data);
    }

    // ========================================
    // STATE ACCESS
    // ========================================

    public getState(): ScopeState {
        return { ...this.state };
    }

    public clearState(): void {
        this.state = {
            activeTask: null,
            history: []
        };
        this.saveState();
    }
}
