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
    ScopeEvent
} from '../core/types';
import { configManager } from '../core/config';
import { TIMEOUTS } from '../core/constants';

// ============================================
// SCOPE MANAGER
// ============================================

export class ScopeManager extends EventEmitter {
    private context: vscode.ExtensionContext;
    private state: ScopeState;
    private noteTimer: NodeJS.Timeout | null = null;

    constructor(context: vscode.ExtensionContext) {
        super();
        this.context = context;
        this.state = this.loadState();
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

        // Check for "all" keywords
        const allKeywords = ['todas', 'todos', 'cada', 'all', 'every'];
        hasAllKeyword = allKeywords.some(k =>
            message.toLowerCase().includes(k)
        );

        // Extract list items (bullet points, numbered lists)
        const listPattern = /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s*(.+)/g;
        let match;
        while ((match = listPattern.exec(message)) !== null) {
            items.push(match[1].trim());
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
