// ============================================
// CLAUDE SUPERVISOR - NOTE MANAGER
// ============================================

import { Note } from '../core/types';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// NOTE MANAGER
// ============================================

export class NoteManager {
    // ========================================
    // CREATION
    // ========================================

    public static create(text: string): Note {
        return {
            id: uuidv4(),
            text,
            timestamp: Date.now()
        };
    }

    // ========================================
    // ACTIONS
    // ========================================

    public static applyNow(note: Note): Note {
        return {
            ...note,
            action: 'apply_now'
        };
    }

    public static applyLater(note: Note): Note {
        return {
            ...note,
            action: 'apply_later'
        };
    }

    public static discard(note: Note): Note {
        return {
            ...note,
            action: 'discard'
        };
    }

    // ========================================
    // FILTERING
    // ========================================

    public static filterPending(notes: Note[]): Note[] {
        return notes.filter(n => !n.action);
    }

    public static filterByAction(notes: Note[], action: Note['action']): Note[] {
        return notes.filter(n => n.action === action);
    }

    public static filterApplyLater(notes: Note[]): Note[] {
        return notes.filter(n => n.action === 'apply_later');
    }

    // ========================================
    // UTILITIES
    // ========================================

    public static formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    public static getTimeSince(timestamp: number): string {
        const diff = Date.now() - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);

        if (minutes > 0) {
            return `${minutes}min atrás`;
        } else {
            return `${seconds}s atrás`;
        }
    }
}
