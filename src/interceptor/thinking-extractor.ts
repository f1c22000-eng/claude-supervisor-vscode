// ============================================
// CLAUDE SUPERVISOR - THINKING EXTRACTOR
// ============================================

import { EventEmitter } from 'events';
import { SSEParser } from './sse-parser';
import { ThinkingChunk } from '../core/types';
import { LIMITS } from '../core/constants';

// ============================================
// TYPES
// ============================================

export interface ThinkingSession {
    messageId: string;
    model: string;
    startTime: number;
    chunks: string[];
    isComplete: boolean;
}

// ============================================
// THINKING EXTRACTOR
// ============================================

export class ThinkingExtractor extends EventEmitter {
    private sseParser: SSEParser;
    private currentSession: ThinkingSession | null = null;
    private thinkingBuffer: string = '';
    private flushTimer: NodeJS.Timeout | null = null;
    private chunkCounter: number = 0;

    // Configuration
    private minChunkSize: number;
    private flushInterval: number;

    constructor(options: { minChunkSize?: number; flushInterval?: number } = {}) {
        super();

        this.minChunkSize = options.minChunkSize || 100; // Minimum chars before emitting
        this.flushInterval = options.flushInterval || 2000; // Max time before flushing

        this.sseParser = new SSEParser();
        this.setupParserListeners();
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    private setupParserListeners(): void {
        // Message start - new conversation
        this.sseParser.on('message_start', (data: { messageId: string; model: string }) => {
            this.startNewSession(data.messageId, data.model);
        });

        // Thinking delta - accumulate thinking
        this.sseParser.on('thinking_delta', (data: { text: string; index: number }) => {
            if (data.text) {
                this.appendThinking(data.text);
            }
        });

        // Text delta - response text (not thinking)
        this.sseParser.on('text_delta', (data: { text: string }) => {
            // When text starts, flush any remaining thinking
            this.flushThinking();

            // Emit text delta for monitoring
            this.emit('text_delta', data);
        });

        // Message stop - conversation ended
        this.sseParser.on('message_stop', () => {
            this.endSession();
        });

        // Usage info
        this.sseParser.on('usage', (data: { inputTokens: number; outputTokens: number }) => {
            this.emit('usage', data);
        });
    }

    // ========================================
    // SESSION MANAGEMENT
    // ========================================

    private startNewSession(messageId: string, model: string): void {
        // End any existing session
        if (this.currentSession) {
            this.endSession();
        }

        this.currentSession = {
            messageId,
            model,
            startTime: Date.now(),
            chunks: [],
            isComplete: false
        };

        this.thinkingBuffer = '';
        this.chunkCounter = 0;

        this.emit('session_start', {
            messageId,
            model,
            timestamp: Date.now()
        });
    }

    private endSession(): void {
        // Flush any remaining thinking
        this.flushThinking();

        if (this.currentSession) {
            this.currentSession.isComplete = true;

            this.emit('session_end', {
                messageId: this.currentSession.messageId,
                model: this.currentSession.model,
                duration: Date.now() - this.currentSession.startTime,
                totalChunks: this.currentSession.chunks.length,
                timestamp: Date.now()
            });

            this.currentSession = null;
        }

        this.clearFlushTimer();
    }

    // ========================================
    // THINKING PROCESSING
    // ========================================

    private appendThinking(text: string): void {
        this.thinkingBuffer += text;

        // Reset flush timer
        this.resetFlushTimer();

        // Check if buffer is large enough to emit
        if (this.thinkingBuffer.length >= this.minChunkSize) {
            this.flushThinking();
        }
    }

    private flushThinking(): void {
        this.clearFlushTimer();

        if (this.thinkingBuffer.trim().length === 0) {
            return;
        }

        const chunkContent = this.thinkingBuffer;
        this.thinkingBuffer = '';

        // Create thinking chunk
        const chunk: ThinkingChunk = {
            id: `chunk-${Date.now()}-${this.chunkCounter++}`,
            content: chunkContent,
            timestamp: Date.now(),
            messageId: this.currentSession?.messageId
        };

        // Store in session
        if (this.currentSession) {
            this.currentSession.chunks.push(chunkContent);
        }

        // Emit the chunk
        this.emit('thinking_chunk', chunk);
    }

    // ========================================
    // TIMER MANAGEMENT
    // ========================================

    private resetFlushTimer(): void {
        this.clearFlushTimer();

        this.flushTimer = setTimeout(() => {
            this.flushThinking();
        }, this.flushInterval);
    }

    private clearFlushTimer(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
    }

    // ========================================
    // DATA INPUT
    // ========================================

    public processData(data: string): void {
        // Feed data to SSE parser
        this.sseParser.parse(data);
    }

    public processRawChunk(chunk: Buffer | string): void {
        const data = typeof chunk === 'string' ? chunk : chunk.toString();
        this.processData(data);
    }

    // ========================================
    // STATE
    // ========================================

    public getCurrentSession(): ThinkingSession | null {
        return this.currentSession ? { ...this.currentSession } : null;
    }

    public getBufferSize(): number {
        return this.thinkingBuffer.length;
    }

    public isActive(): boolean {
        return this.currentSession !== null && !this.currentSession.isComplete;
    }

    // ========================================
    // CONTROL
    // ========================================

    public reset(): void {
        this.clearFlushTimer();
        this.sseParser.reset();
        this.thinkingBuffer = '';
        this.currentSession = null;
        this.chunkCounter = 0;
    }

    public forceFlush(): void {
        this.flushThinking();
        this.sseParser.flush();
    }
}
