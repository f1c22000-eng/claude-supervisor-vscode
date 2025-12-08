// ============================================
// CLAUDE SUPERVISOR - INTERCEPTOR MANAGER
// ============================================

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { ConnectionStatus, ThinkingChunk, InterceptorState, StreamEvent } from '../core/types';
import { TIMEOUTS, LIMITS, ANTHROPIC_API_URL } from '../core/constants';
import { StreamParser } from './stream-parser';
import { ThinkingBuffer } from './thinking-buffer';
import { ProxyServer } from './proxy-server';
import { ThinkingExtractor } from './thinking-extractor';

// ============================================
// INTERCEPTOR MANAGER
// ============================================

export class InterceptorManager extends EventEmitter {
    private state: InterceptorState;
    private streamParser: StreamParser;
    private thinkingBuffer: ThinkingBuffer;
    private proxyServer: ProxyServer;
    private thinkingExtractor: ThinkingExtractor;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private statsTimer: NodeJS.Timeout | null = null;
    private startTime: number = 0;

    constructor() {
        super();
        this.state = {
            status: ConnectionStatus.DISCONNECTED,
            uptime: 0,
            chunksProcessed: 0
        };
        this.streamParser = new StreamParser();
        this.thinkingBuffer = new ThinkingBuffer();
        this.proxyServer = new ProxyServer({ port: 8888 });
        this.thinkingExtractor = new ThinkingExtractor({
            minChunkSize: 50,
            flushInterval: 1500
        });

        // Forward events from thinking buffer (legacy)
        this.thinkingBuffer.on('chunk_ready', (chunk: ThinkingChunk) => {
            this.state.chunksProcessed++;
            this.state.lastChunk = chunk;
            this.emit('thinking_chunk', chunk);
        });

        // Forward events from stream parser (legacy)
        this.streamParser.on('event', (event: StreamEvent) => {
            this.handleStreamEvent(event);
        });

        // Setup proxy server events
        this.setupProxyEvents();

        // Setup thinking extractor events
        this.setupExtractorEvents();
    }

    // ========================================
    // PROXY EVENTS
    // ========================================

    private setupProxyEvents(): void {
        // === CRITICAL: Forward thinking_chunk from proxy to extension ===
        // The proxy already parses SSE and extracts thinking.
        // We just need to forward these chunks for analysis.
        this.proxyServer.on('thinking_chunk', (chunk: any) => {
            this.state.chunksProcessed++;
            this.state.lastChunk = chunk;
            console.log(`[InterceptorManager] Forwarding thinking_chunk: ${chunk.content?.substring(0, 50)}...`);
            this.emit('thinking_chunk', chunk);
        });

        // Forward thinking_delta for real-time display
        this.proxyServer.on('thinking_delta', (data: any) => {
            this.emit('thinking_delta', data);
        });

        // Forward message events
        this.proxyServer.on('message_start', (data: any) => {
            console.log('[InterceptorManager] Message started');
            this.emit('message_start', data);
        });

        this.proxyServer.on('message_stop', (data: any) => {
            console.log('[InterceptorManager] Message stopped');
            this.emit('message_stop', data);
        });

        // Forward text_delta for response monitoring
        this.proxyServer.on('text_delta', (data: any) => {
            this.emit('response_delta', data);
        });

        // Forward usage info
        this.proxyServer.on('usage', (data: any) => {
            this.emit('usage', data);
        });

        // Forward response chunks for completion detection
        this.proxyServer.on('response_chunk', (chunk: any) => {
            console.log(`[InterceptorManager] Response chunk: ${chunk.content?.substring(0, 50)}...`);
            this.emit('response_chunk', chunk);
        });

        // Forward response complete
        this.proxyServer.on('response_complete', (data: any) => {
            console.log(`[InterceptorManager] Response complete: ${data.inputTokens} in, ${data.outputTokens} out`);
            this.emit('response_complete', data);
        });

        // Proxy errors
        this.proxyServer.on('error', (error: Error) => {
            console.error('Proxy error:', error);
            this.emit('proxy_error', error);
        });

        // Proxy started
        this.proxyServer.on('started', (info: { port: number; host: string }) => {
            console.log(`Proxy started on ${info.host}:${info.port}`);
            this.emit('proxy_started', info);
        });

        // Request received (any request)
        this.proxyServer.on('request_received', (data: any) => {
            this.emit('request_received', data);
        });

        // SSE stream started
        this.proxyServer.on('sse_stream_start', (data: any) => {
            this.emit('sse_stream_start', data);
        });

        // SSE raw data (for debugging)
        this.proxyServer.on('sse_raw_data', (data: any) => {
            this.emit('sse_raw_data', data);
        });

        // Thinking injection notification
        this.proxyServer.on('thinking_injected', (data: any) => {
            this.emit('thinking_injected', data);
        });

        // Proxy stopped
        this.proxyServer.on('stopped', () => {
            console.log('Proxy stopped');
            this.emit('proxy_stopped');
        });
    }

    // ========================================
    // EXTRACTOR EVENTS
    // ========================================

    private setupExtractorEvents(): void {
        // Thinking chunk extracted
        this.thinkingExtractor.on('thinking_chunk', (chunk: ThinkingChunk) => {
            this.state.chunksProcessed++;
            this.state.lastChunk = chunk;
            this.emit('thinking_chunk', chunk);
        });

        // Session started
        this.thinkingExtractor.on('session_start', (data: any) => {
            this.emit('session_start', data);
        });

        // Session ended
        this.thinkingExtractor.on('session_end', (data: any) => {
            this.emit('session_end', data);
        });

        // Text delta (response)
        this.thinkingExtractor.on('text_delta', (data: any) => {
            this.emit('response_delta', data);
        });

        // Usage info
        this.thinkingExtractor.on('usage', (data: any) => {
            this.emit('usage', data);
        });
    }

    // ========================================
    // LIFECYCLE
    // ========================================

    public async start(): Promise<boolean> {
        if (this.state.status === ConnectionStatus.CONNECTED) {
            return true;
        }

        this.state.status = ConnectionStatus.CONNECTING;
        this.emit('status_change', this.state.status);

        try {
            // Start the proxy server
            const proxyStarted = await this.proxyServer.start();

            if (proxyStarted) {
                this.state.status = ConnectionStatus.CONNECTED;
                this.startTime = Date.now();
                this.startStatsTimer();
                this.emit('status_change', this.state.status);

                // Get the actual port the proxy is running on
                const actualPort = this.proxyServer.getPort();
                const proxyCommand = `HTTPS_PROXY=http://localhost:${actualPort} claude`;

                // Show notification with proxy instructions
                vscode.window.showInformationMessage(
                    `Claude Supervisor proxy ativo na porta ${actualPort}. Execute: ${proxyCommand}`,
                    'Copiar Comando'
                ).then(selection => {
                    if (selection === 'Copiar Comando') {
                        vscode.env.clipboard.writeText(proxyCommand);
                        vscode.window.showInformationMessage('Comando copiado!');
                    }
                });

                console.log(`Proxy started on 127.0.0.1:${actualPort}`);
                return true;
            } else {
                this.state.status = ConnectionStatus.ERROR;
                this.emit('status_change', this.state.status);
                return false;
            }
        } catch (error) {
            console.error('Failed to start interceptor:', error);
            this.state.status = ConnectionStatus.ERROR;
            this.emit('status_change', this.state.status);
            return false;
        }
    }

    public async stop(): Promise<void> {
        this.state.status = ConnectionStatus.DISCONNECTED;

        // Stop proxy server
        await this.proxyServer.stop();

        // Reset thinking extractor
        this.thinkingExtractor.reset();

        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.statsTimer) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }

        this.thinkingBuffer.clear();
        this.emit('status_change', this.state.status);
    }

    // ========================================
    // DETECTION
    // ========================================

    private async detectClaudeCode(): Promise<boolean> {
        // Method 1: Check if claude-code extension is active
        const claudeExtension = vscode.extensions.getExtension('anthropic.claude-code');
        if (claudeExtension && claudeExtension.isActive) {
            return true;
        }

        // Method 2: Check for Claude Code terminal
        const terminals = vscode.window.terminals;
        for (const terminal of terminals) {
            if (terminal.name.toLowerCase().includes('claude')) {
                return true;
            }
        }

        // Method 3: Check environment for Claude processes
        // This is a simplified check - real implementation would be more sophisticated
        try {
            // In a real implementation, we would:
            // 1. Check for Claude Code CLI process
            // 2. Set up HTTP interception if available
            // 3. Use file-based communication as fallback
            return false;
        } catch {
            return false;
        }
    }

    private startReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
        }

        this.reconnectTimer = setInterval(async () => {
            if (this.state.status !== ConnectionStatus.CONNECTED) {
                const detected = await this.detectClaudeCode();
                if (detected) {
                    this.state.status = ConnectionStatus.CONNECTED;
                    this.startTime = Date.now();
                    this.emit('status_change', this.state.status);
                    this.emit('connected');

                    if (this.reconnectTimer) {
                        clearInterval(this.reconnectTimer);
                        this.reconnectTimer = null;
                    }
                }
            }
        }, TIMEOUTS.INTERCEPTOR_RECONNECT);
    }

    private startStatsTimer(): void {
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
        }

        this.statsTimer = setInterval(() => {
            this.state.uptime = Date.now() - this.startTime;
            this.emit('stats_update', this.getState());
        }, 1000);
    }

    // ========================================
    // STREAM HANDLING
    // ========================================

    private handleStreamEvent(event: StreamEvent): void {
        switch (event.type) {
            case 'thinking_delta':
                this.thinkingBuffer.append(event.data);
                break;
            case 'text_delta':
                // Response text - not thinking
                this.emit('response_delta', event.data);
                break;
            case 'message_start':
                this.thinkingBuffer.startNewMessage(event.data.messageId);
                this.emit('message_start', event.data);
                break;
            case 'message_stop':
                this.thinkingBuffer.flush();
                this.emit('message_end', event.data);
                break;
        }
    }

    // This method would be called when we intercept HTTP responses
    public processStreamData(data: string): void {
        this.streamParser.parse(data);
    }

    // ========================================
    // STATE
    // ========================================

    public getState(): InterceptorState {
        return { ...this.state };
    }

    public isConnected(): boolean {
        return this.state.status === ConnectionStatus.CONNECTED;
    }

    public getChunksProcessed(): number {
        return this.state.chunksProcessed;
    }

    public resetStats(): void {
        this.state.chunksProcessed = 0;
        this.state.lastChunk = undefined;
        this.emit('stats_update', this.state);
    }

    public getLastChunk(): ThinkingChunk | undefined {
        return this.state.lastChunk;
    }

    public getProxyStatus(): { running: boolean; port: number; host: string } {
        return this.proxyServer.getStatus();
    }

    public getExtractorSession(): any {
        return this.thinkingExtractor.getCurrentSession();
    }
}
