// ============================================
// CLAUDE SUPERVISOR - SSE PARSER
// ============================================

import { EventEmitter } from 'events';

// ============================================
// TYPES
// ============================================

export interface SSEEvent {
    event?: string;
    data: string;
    id?: string;
    retry?: number;
}

export interface ParsedSSEData {
    type: string;
    index?: number;
    content_block?: {
        type: string;
        text?: string;
    };
    delta?: {
        type: string;
        text?: string;
        thinking?: string;
    };
    message?: {
        id: string;
        type: string;
        role: string;
        model: string;
    };
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
}

// ============================================
// SSE PARSER
// ============================================

export class SSEParser extends EventEmitter {
    private buffer: string = '';
    private currentEvent: Partial<SSEEvent> = {};

    constructor() {
        super();
    }

    // ========================================
    // PARSING
    // ========================================

    public parse(chunk: string): void {
        this.buffer += chunk;

        // Process complete lines
        const lines = this.buffer.split('\n');

        // Keep the last potentially incomplete line in the buffer
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            this.parseLine(line);
        }
    }

    private parseLine(line: string): void {
        // Empty line signals end of event
        if (line.trim() === '') {
            if (this.currentEvent.data !== undefined) {
                this.emitEvent();
            }
            this.currentEvent = {};
            return;
        }

        // Comment line
        if (line.startsWith(':')) {
            return;
        }

        // Parse field:value format
        const colonIndex = line.indexOf(':');
        let field: string;
        let value: string;

        if (colonIndex === -1) {
            field = line;
            value = '';
        } else {
            field = line.substring(0, colonIndex);
            // Remove optional leading space after colon
            value = line.substring(colonIndex + 1);
            if (value.startsWith(' ')) {
                value = value.substring(1);
            }
        }

        switch (field) {
            case 'event':
                this.currentEvent.event = value;
                break;
            case 'data':
                if (this.currentEvent.data === undefined) {
                    this.currentEvent.data = value;
                } else {
                    this.currentEvent.data += '\n' + value;
                }
                break;
            case 'id':
                this.currentEvent.id = value;
                break;
            case 'retry':
                const retry = parseInt(value);
                if (!isNaN(retry)) {
                    this.currentEvent.retry = retry;
                }
                break;
        }
    }

    private emitEvent(): void {
        const event: SSEEvent = {
            event: this.currentEvent.event,
            data: this.currentEvent.data || '',
            id: this.currentEvent.id,
            retry: this.currentEvent.retry
        };

        // Try to parse JSON data
        try {
            const parsedData = JSON.parse(event.data) as ParsedSSEData;
            this.emit('event', {
                ...event,
                parsedData
            });

            // Emit specific events based on type
            if (parsedData.type) {
                this.emit(parsedData.type, parsedData);
            }

            // Handle thinking specifically
            if (parsedData.type === 'content_block_delta' &&
                parsedData.delta?.type === 'thinking_delta') {
                this.emit('thinking_delta', {
                    text: parsedData.delta.thinking,
                    index: parsedData.index,
                    timestamp: Date.now()
                });
            }

            // Handle text deltas
            if (parsedData.type === 'content_block_delta' &&
                parsedData.delta?.type === 'text_delta') {
                this.emit('text_delta', {
                    text: parsedData.delta.text,
                    index: parsedData.index,
                    timestamp: Date.now()
                });
            }

            // Handle message start
            if (parsedData.type === 'message_start' && parsedData.message) {
                this.emit('message_start', {
                    messageId: parsedData.message.id,
                    model: parsedData.message.model,
                    timestamp: Date.now()
                });
            }

            // Handle message stop
            if (parsedData.type === 'message_stop') {
                this.emit('message_stop', {
                    timestamp: Date.now()
                });
            }

            // Handle message delta (includes usage)
            if (parsedData.type === 'message_delta' && parsedData.usage) {
                this.emit('usage', {
                    inputTokens: parsedData.usage.input_tokens,
                    outputTokens: parsedData.usage.output_tokens,
                    timestamp: Date.now()
                });
            }

        } catch (e) {
            // Not JSON, emit raw event
            this.emit('event', event);
        }
    }

    // ========================================
    // CONTROL
    // ========================================

    public reset(): void {
        this.buffer = '';
        this.currentEvent = {};
    }

    public flush(): void {
        if (this.buffer.trim() !== '') {
            this.parseLine(this.buffer);
            this.buffer = '';
        }

        if (this.currentEvent.data !== undefined) {
            this.emitEvent();
            this.currentEvent = {};
        }
    }
}
