// ============================================
// CLAUDE SUPERVISOR - THINKING BUFFER
// ============================================

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ThinkingChunk } from '../core/types';
import { LIMITS } from '../core/constants';

// ============================================
// THINKING BUFFER
// ============================================

export class ThinkingBuffer extends EventEmitter {
    private buffer: string = '';
    private currentMessageId: string | null = null;
    private chunkCount: number = 0;

    constructor() {
        super();
    }

    // ========================================
    // BUFFER MANAGEMENT
    // ========================================

    public append(content: string): void {
        this.buffer += content;

        // Check if buffer is ready to emit
        if (this.buffer.length >= LIMITS.MAX_THINKING_BUFFER) {
            this.emitChunk();
        }
    }

    public flush(): void {
        if (this.buffer.length > 0) {
            this.emitChunk();
        }
    }

    public clear(): void {
        this.buffer = '';
        this.currentMessageId = null;
        this.chunkCount = 0;
    }

    public startNewMessage(messageId?: string): void {
        // Flush any remaining content from previous message
        this.flush();

        this.currentMessageId = messageId || null;
        this.chunkCount = 0;
    }

    // ========================================
    // CHUNK EMISSION
    // ========================================

    private emitChunk(): void {
        if (this.buffer.length === 0) {
            return;
        }

        const chunk: ThinkingChunk = {
            id: uuidv4(),
            content: this.buffer,
            timestamp: Date.now(),
            messageId: this.currentMessageId || undefined
        };

        this.chunkCount++;
        this.buffer = '';

        this.emit('chunk_ready', chunk);
    }

    // ========================================
    // STATE
    // ========================================

    public getBufferLength(): number {
        return this.buffer.length;
    }

    public getBufferContent(): string {
        return this.buffer;
    }

    public getChunkCount(): number {
        return this.chunkCount;
    }

    public getCurrentMessageId(): string | null {
        return this.currentMessageId;
    }
}
