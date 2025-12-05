// ============================================
// CLAUDE SUPERVISOR - REVERSE PROXY SERVER
// ============================================
// Este proxy funciona como reverse proxy HTTP:
// 1. Claude Code envia HTTP para localhost:8888
// 2. Proxy faz forward HTTPS para api.anthropic.com
// 3. Proxy intercepta e parseia resposta SSE
// 4. Retorna resposta ao Claude Code
//
// Configuração no Claude Code:
// ANTHROPIC_BASE_URL=http://localhost:8888 claude

import * as http from 'http';
import * as https from 'https';
import { EventEmitter } from 'events';

// ============================================
// TYPES
// ============================================

export interface ProxyConfig {
    port: number;
    host: string;
    targetHost: string;
}

export interface SSEChunk {
    event?: string;
    data: string;
    timestamp: number;
}

// ============================================
// REVERSE PROXY SERVER
// ============================================

export class ProxyServer extends EventEmitter {
    private server: http.Server | null = null;
    private config: ProxyConfig;
    private isRunning: boolean = false;
    private requestCount: number = 0;

    constructor(config: Partial<ProxyConfig> = {}) {
        super();
        this.config = {
            port: config.port || 8888,
            host: config.host || '127.0.0.1',
            targetHost: config.targetHost || 'api.anthropic.com'
        };
    }

    // ========================================
    // LIFECYCLE
    // ========================================

    public async start(): Promise<boolean> {
        if (this.isRunning) {
            return true;
        }

        return new Promise((resolve) => {
            try {
                this.server = http.createServer((req, res) => {
                    this.handleRequest(req, res);
                });

                this.server.on('error', (err: NodeJS.ErrnoException) => {
                    if (err.code === 'EADDRINUSE') {
                        console.error(`[Proxy] Port ${this.config.port} is already in use`);
                        this.emit('error', new Error(`Port ${this.config.port} is already in use`));
                        resolve(false);
                    } else {
                        console.error('[Proxy] Server error:', err);
                        this.emit('error', err);
                        resolve(false);
                    }
                });

                this.server.listen(this.config.port, this.config.host, () => {
                    this.isRunning = true;
                    console.log(`[Proxy] Reverse proxy running on http://${this.config.host}:${this.config.port}`);
                    console.log(`[Proxy] Forwarding to https://${this.config.targetHost}`);
                    this.emit('started', { port: this.config.port, host: this.config.host });
                    resolve(true);
                });

            } catch (error) {
                console.error('[Proxy] Failed to start:', error);
                this.emit('error', error);
                resolve(false);
            }
        });
    }

    public async stop(): Promise<void> {
        if (!this.isRunning || !this.server) {
            return;
        }

        return new Promise((resolve) => {
            this.server!.close(() => {
                this.isRunning = false;
                this.server = null;
                console.log('[Proxy] Server stopped');
                this.emit('stopped');
                resolve();
            });
        });
    }

    public getStatus(): { running: boolean; port: number; host: string; requestCount: number } {
        return {
            running: this.isRunning,
            port: this.config.port,
            host: this.config.host,
            requestCount: this.requestCount
        };
    }

    // ========================================
    // REQUEST HANDLING
    // ========================================

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        this.requestCount++;
        const requestId = this.requestCount;
        const isMessagesEndpoint = req.url?.includes('/v1/messages') ?? false;
        const isStreamRequest = (req.headers['accept']?.includes('text/event-stream') ||
                               req.headers['content-type']?.includes('application/json')) ?? false;

        console.log(`[Proxy] #${requestId} ${req.method} ${req.url}`);

        // Emit request intercepted event
        this.emit('request_start', {
            id: requestId,
            method: req.method,
            url: req.url,
            timestamp: Date.now()
        });

        // Collect request body
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });

        req.on('end', () => {
            const body = Buffer.concat(chunks);

            // Log request body for messages endpoint
            if (isMessagesEndpoint && body.length > 0) {
                try {
                    const bodyJson = JSON.parse(body.toString());
                    console.log(`[Proxy] #${requestId} Request model: ${bodyJson.model}`);
                    console.log(`[Proxy] #${requestId} Stream: ${bodyJson.stream}`);

                    this.emit('request_body', {
                        id: requestId,
                        model: bodyJson.model,
                        stream: bodyJson.stream,
                        timestamp: Date.now()
                    });
                } catch (e) {
                    // Not JSON, ignore
                }
            }

            // Forward request to Anthropic API
            this.forwardRequest(req, res, body, requestId, isMessagesEndpoint);
        });

        req.on('error', (err) => {
            console.error(`[Proxy] #${requestId} Request error:`, err);
            res.writeHead(500);
            res.end('Internal Server Error');
        });
    }

    private forwardRequest(
        originalReq: http.IncomingMessage,
        originalRes: http.ServerResponse,
        body: Buffer,
        requestId: number,
        isMessagesEndpoint: boolean
    ): void {
        // Prepare headers for forwarding
        const headers: Record<string, string | string[] | undefined> = { ...originalReq.headers };

        // Remove hop-by-hop headers
        delete headers['host'];
        delete headers['connection'];
        delete headers['keep-alive'];
        delete headers['proxy-authenticate'];
        delete headers['proxy-authorization'];
        delete headers['te'];
        delete headers['trailer'];
        delete headers['transfer-encoding'];
        delete headers['upgrade'];

        // Set correct host
        headers['host'] = this.config.targetHost;

        const options: https.RequestOptions = {
            hostname: this.config.targetHost,
            port: 443,
            path: originalReq.url,
            method: originalReq.method,
            headers: headers as http.OutgoingHttpHeaders
        };

        console.log(`[Proxy] #${requestId} Forwarding to https://${this.config.targetHost}${originalReq.url}`);

        const proxyReq = https.request(options, (proxyRes) => {
            console.log(`[Proxy] #${requestId} Response status: ${proxyRes.statusCode}`);

            // Copy response headers
            const responseHeaders: Record<string, string | string[] | undefined> = { ...proxyRes.headers };
            delete responseHeaders['transfer-encoding']; // We'll handle chunking ourselves

            // Write response headers
            originalRes.writeHead(proxyRes.statusCode || 200, responseHeaders);

            // Check if this is SSE response
            const isSSE = proxyRes.headers['content-type']?.includes('text/event-stream');

            if (isMessagesEndpoint && isSSE) {
                // Intercept SSE response for thinking extraction
                this.handleSSEResponse(proxyRes, originalRes, requestId);
            } else {
                // Just pipe the response
                proxyRes.pipe(originalRes);
            }
        });

        proxyReq.on('error', (err) => {
            console.error(`[Proxy] #${requestId} Forward error:`, err);

            if (!originalRes.headersSent) {
                originalRes.writeHead(502);
            }
            originalRes.end(`Bad Gateway: ${err.message}`);

            this.emit('request_error', {
                id: requestId,
                error: err.message,
                timestamp: Date.now()
            });
        });

        // Send request body
        if (body.length > 0) {
            proxyReq.write(body);
        }
        proxyReq.end();
    }

    // ========================================
    // SSE RESPONSE HANDLING
    // ========================================

    private handleSSEResponse(
        proxyRes: http.IncomingMessage,
        originalRes: http.ServerResponse,
        requestId: number
    ): void {
        let buffer = '';
        let thinkingBuffer = '';
        let messageId: string | undefined;
        let model: string | undefined;

        console.log(`[Proxy] #${requestId} Intercepting SSE stream...`);

        proxyRes.on('data', (chunk: Buffer) => {
            const data = chunk.toString();
            buffer += data;

            // Forward data to client immediately
            originalRes.write(chunk);

            // Process complete SSE events
            const events = this.parseSSEBuffer(buffer);
            buffer = events.remaining;

            for (const event of events.parsed) {
                this.processSSEEvent(event, requestId, {
                    messageId,
                    model,
                    thinkingBuffer,
                    setMessageId: (id: string) => { messageId = id; },
                    setModel: (m: string) => { model = m; },
                    appendThinking: (text: string) => { thinkingBuffer += text; },
                    flushThinking: () => {
                        if (thinkingBuffer.length > 0) {
                            this.emit('thinking_chunk', {
                                id: `chunk-${requestId}-${Date.now()}`,
                                content: thinkingBuffer,
                                messageId,
                                model,
                                timestamp: Date.now()
                            });
                            thinkingBuffer = '';
                        }
                    }
                });
            }
        });

        proxyRes.on('end', () => {
            // Flush any remaining thinking
            if (thinkingBuffer.length > 0) {
                this.emit('thinking_chunk', {
                    id: `chunk-${requestId}-${Date.now()}`,
                    content: thinkingBuffer,
                    messageId,
                    model,
                    timestamp: Date.now()
                });
            }

            console.log(`[Proxy] #${requestId} SSE stream ended`);
            this.emit('request_end', {
                id: requestId,
                messageId,
                model,
                timestamp: Date.now()
            });

            originalRes.end();
        });

        proxyRes.on('error', (err) => {
            console.error(`[Proxy] #${requestId} SSE stream error:`, err);
            originalRes.end();
        });
    }

    private parseSSEBuffer(buffer: string): { parsed: SSEChunk[]; remaining: string } {
        const parsed: SSEChunk[] = [];
        const lines = buffer.split('\n');
        let currentEvent: Partial<SSEChunk> = {};
        let lastCompleteIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Empty line signals end of event
            if (line.trim() === '') {
                if (currentEvent.data !== undefined) {
                    parsed.push({
                        event: currentEvent.event,
                        data: currentEvent.data,
                        timestamp: Date.now()
                    });
                    lastCompleteIndex = i;
                }
                currentEvent = {};
                continue;
            }

            // Skip comments
            if (line.startsWith(':')) {
                lastCompleteIndex = i;
                continue;
            }

            // Parse field:value
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;

            const field = line.substring(0, colonIndex);
            let value = line.substring(colonIndex + 1);
            if (value.startsWith(' ')) {
                value = value.substring(1);
            }

            switch (field) {
                case 'event':
                    currentEvent.event = value;
                    break;
                case 'data':
                    if (currentEvent.data === undefined) {
                        currentEvent.data = value;
                    } else {
                        currentEvent.data += '\n' + value;
                    }
                    break;
            }
        }

        // Return unparsed data
        const remaining = lastCompleteIndex >= 0
            ? lines.slice(lastCompleteIndex + 1).join('\n')
            : buffer;

        return { parsed, remaining };
    }

    private processSSEEvent(
        event: SSEChunk,
        requestId: number,
        context: {
            messageId: string | undefined;
            model: string | undefined;
            thinkingBuffer: string;
            setMessageId: (id: string) => void;
            setModel: (m: string) => void;
            appendThinking: (text: string) => void;
            flushThinking: () => void;
        }
    ): void {
        try {
            const data = JSON.parse(event.data);

            // Message start - capture message ID and model
            if (data.type === 'message_start' && data.message) {
                context.setMessageId(data.message.id);
                context.setModel(data.message.model);
                console.log(`[Proxy] #${requestId} Message started: ${data.message.id} (${data.message.model})`);

                this.emit('message_start', {
                    id: requestId,
                    messageId: data.message.id,
                    model: data.message.model,
                    timestamp: Date.now()
                });
            }

            // Content block delta - check for thinking
            if (data.type === 'content_block_delta' && data.delta) {
                // Thinking delta
                if (data.delta.type === 'thinking_delta' && data.delta.thinking) {
                    context.appendThinking(data.delta.thinking);

                    // Emit raw thinking delta for real-time display
                    this.emit('thinking_delta', {
                        text: data.delta.thinking,
                        index: data.index,
                        timestamp: Date.now()
                    });

                    // Flush if buffer is large enough
                    if (context.thinkingBuffer.length >= 100) {
                        context.flushThinking();
                    }
                }

                // Text delta - flush any pending thinking first
                if (data.delta.type === 'text_delta') {
                    context.flushThinking();

                    this.emit('text_delta', {
                        text: data.delta.text,
                        index: data.index,
                        timestamp: Date.now()
                    });
                }
            }

            // Content block stop - flush thinking for this block
            if (data.type === 'content_block_stop') {
                context.flushThinking();
            }

            // Message delta - usage info
            if (data.type === 'message_delta' && data.usage) {
                this.emit('usage', {
                    inputTokens: data.usage.input_tokens,
                    outputTokens: data.usage.output_tokens,
                    timestamp: Date.now()
                });
            }

            // Message stop
            if (data.type === 'message_stop') {
                context.flushThinking();
                console.log(`[Proxy] #${requestId} Message stopped`);

                this.emit('message_stop', {
                    id: requestId,
                    timestamp: Date.now()
                });
            }

        } catch (e) {
            // Not JSON or parse error - ignore
        }
    }
}
