// ============================================
// CLAUDE SUPERVISOR - STREAM PARSER
// ============================================

import { EventEmitter } from 'events';
import { StreamEvent } from '../core/types';

// ============================================
// SSE STREAM PARSER
// ============================================

export class StreamParser extends EventEmitter {
    private buffer: string = '';
    private currentMessageId: string | null = null;

    constructor() {
        super();
    }

    // ========================================
    // PARSING
    // ========================================

    public parse(data: string): void {
        this.buffer += data;
        this.processBuffer();
    }

    private processBuffer(): void {
        // SSE format: event lines separated by double newlines
        const events = this.buffer.split('\n\n');

        // Keep the last incomplete event in buffer
        this.buffer = events.pop() || '';

        for (const eventStr of events) {
            if (eventStr.trim()) {
                this.parseEvent(eventStr);
            }
        }
    }

    private parseEvent(eventStr: string): void {
        const lines = eventStr.split('\n');
        let eventType = '';
        let eventData = '';

        for (const line of lines) {
            if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
                eventData = line.substring(5).trim();
            }
        }

        if (!eventType || !eventData) {
            return;
        }

        try {
            const parsedData = JSON.parse(eventData);
            this.handleParsedEvent(eventType, parsedData);
        } catch (error) {
            // Not all data is JSON - handle raw string
            this.handleParsedEvent(eventType, { text: eventData });
        }
    }

    private handleParsedEvent(eventType: string, data: any): void {
        const timestamp = Date.now();

        switch (eventType) {
            case 'message_start':
                this.currentMessageId = data.message?.id || null;
                this.emit('event', {
                    type: 'message_start',
                    data: { messageId: this.currentMessageId },
                    timestamp
                } as StreamEvent);
                break;

            case 'content_block_start':
                // Check if this is a thinking block
                if (data.content_block?.type === 'thinking') {
                    // Thinking block started
                }
                break;

            case 'content_block_delta':
                if (data.delta?.type === 'thinking_delta') {
                    this.emit('event', {
                        type: 'thinking_delta',
                        data: data.delta.thinking || '',
                        timestamp
                    } as StreamEvent);
                } else if (data.delta?.type === 'text_delta') {
                    this.emit('event', {
                        type: 'text_delta',
                        data: data.delta.text || '',
                        timestamp
                    } as StreamEvent);
                }
                break;

            case 'message_delta':
                // Message metadata update
                break;

            case 'message_stop':
                this.emit('event', {
                    type: 'message_stop',
                    data: { messageId: this.currentMessageId },
                    timestamp
                } as StreamEvent);
                this.currentMessageId = null;
                break;

            case 'error':
                console.error('Stream error:', data);
                break;
        }
    }

    // ========================================
    // CONTROL
    // ========================================

    public reset(): void {
        this.buffer = '';
        this.currentMessageId = null;
    }

    public getCurrentMessageId(): string | null {
        return this.currentMessageId;
    }
}
