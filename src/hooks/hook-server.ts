// ============================================
// CLAUDE SUPERVISOR - HOOK SERVER
// ============================================
// HTTP server for Claude Code hooks communication

import * as http from 'http';
import { EventEmitter } from 'events';
import { StopCheckRequest, StopCheckResponse, SupervisorAlert, AlertStatus, Severity } from '../core/types';

// ============================================
// HOOK SERVER
// ============================================

export class HookServer extends EventEmitter {
    private server: http.Server | null = null;
    private port: number = 18899;  // Default hook server port
    private isRunning: boolean = false;

    // Callbacks for checking state
    private getProgress: () => { percentage: number; pendingItems: string[]; pendingCount: number } =
        () => ({ percentage: 100, pendingItems: [], pendingCount: 0 });
    private getPendingAlerts: () => { alerts: SupervisorAlert[]; criticalCount: number } =
        () => ({ alerts: [], criticalCount: 0 });

    constructor(port: number = 18899) {
        super();
        this.port = port;
    }

    // ========================================
    // CALLBACKS SETUP
    // ========================================

    /**
     * Set callback to get current progress
     */
    public setProgressCallback(callback: () => { percentage: number; pendingItems: string[]; pendingCount: number }): void {
        this.getProgress = callback;
    }

    /**
     * Set callback to get pending alerts
     */
    public setAlertsCallback(callback: () => { alerts: SupervisorAlert[]; criticalCount: number }): void {
        this.getPendingAlerts = callback;
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
                        console.log(`[HookServer] Port ${this.port} in use, trying next...`);
                        this.port++;
                        this.server?.close();
                        // Try again with next port
                        setTimeout(() => this.start().then(resolve), 100);
                    } else {
                        console.error('[HookServer] Server error:', err);
                        resolve(false);
                    }
                });

                this.server.listen(this.port, '127.0.0.1', () => {
                    this.isRunning = true;
                    console.log(`[HookServer] Hook server running on http://127.0.0.1:${this.port}`);
                    this.emit('started', { port: this.port });
                    resolve(true);
                });

            } catch (error) {
                console.error('[HookServer] Failed to start:', error);
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
                console.log('[HookServer] Server stopped');
                this.emit('stopped');
                resolve();
            });
        });
    }

    public getPort(): number {
        return this.port;
    }

    public isActive(): boolean {
        return this.isRunning;
    }

    // ========================================
    // REQUEST HANDLING
    // ========================================

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const url = req.url || '';

        // Route requests
        if (url === '/api/check-stop' && req.method === 'POST') {
            this.handleCheckStop(req, res);
        } else if (url === '/api/status' && req.method === 'GET') {
            this.handleStatus(req, res);
        } else if (url === '/api/bypass' && req.method === 'POST') {
            this.handleBypass(req, res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    }

    /**
     * Handle stop check request from Claude Code hook
     */
    private handleCheckStop(req: http.IncomingMessage, res: http.ServerResponse): void {
        let body = '';

        console.log('[HookServer] Received check-stop request');

        req.on('data', (chunk) => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const request: StopCheckRequest = body ? JSON.parse(body) : {};
                console.log('[HookServer] Request body:', JSON.stringify(request).substring(0, 200));

                const response = this.checkStop(request);
                console.log(`[HookServer] Response: allow=${response.allow}, message=${response.message}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));

                // Emit event for logging
                this.emit('stop_check', { request, response });

            } catch (error) {
                console.error('[HookServer] Error handling check-stop:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request', allow: true }));
            }
        });
    }

    /**
     * Handle status request
     */
    private handleStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
        const progress = this.getProgress();
        const alerts = this.getPendingAlerts();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            running: true,
            progress: progress.percentage,
            pendingItems: progress.pendingCount,
            pendingAlerts: alerts.criticalCount,
            canStop: progress.pendingCount === 0 && alerts.criticalCount === 0
        }));
    }

    /**
     * Handle bypass request (force allow stop)
     */
    private handleBypass(req: http.IncomingMessage, res: http.ServerResponse): void {
        // Emit bypass event
        this.emit('bypass_requested');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Bypass granted. Next stop will be allowed.'
        }));
    }

    // ========================================
    // STOP CHECK LOGIC
    // ========================================

    private bypassNext: boolean = false;

    /**
     * Check if Claude should be allowed to stop
     */
    private checkStop(request: StopCheckRequest): StopCheckResponse {
        console.log('[HookServer] checkStop called');

        // Check for bypass
        if (this.bypassNext) {
            this.bypassNext = false;
            this.emit('bypass_changed', false);
            console.log('[HookServer] Bypass active - allowing stop');
            return { allow: true, message: 'Bypass granted' };
        }

        // Get current state
        const progress = this.getProgress();
        const alerts = this.getPendingAlerts();

        console.log(`[HookServer] Progress: ${progress.percentage}%, pending: ${progress.pendingCount}`);
        console.log(`[HookServer] Pending items: ${progress.pendingItems.join(', ')}`);
        console.log(`[HookServer] Critical alerts: ${alerts.criticalCount}`);

        // Decision logic
        const reasons: string[] = [];

        // Check progress
        if (progress.percentage < 100 && progress.pendingCount > 0) {
            reasons.push(`Tarefa incompleta: ${progress.pendingCount} itens pendentes`);
        }

        // Check critical alerts
        if (alerts.criticalCount > 0) {
            reasons.push(`${alerts.criticalCount} alerta(s) crítico(s) pendente(s)`);
        }

        // If there are reasons to block, block
        if (reasons.length > 0) {
            const message = this.buildBlockMessage(progress, alerts, reasons);
            return {
                allow: false,
                message,
                pendingItems: progress.pendingItems,
                pendingAlerts: alerts.alerts.map(a => a.message)
            };
        }

        // Allow stop
        return {
            allow: true,
            message: 'Tarefa completa. Pode parar.'
        };
    }

    /**
     * Build a clear blocking message
     */
    private buildBlockMessage(
        progress: { percentage: number; pendingItems: string[]; pendingCount: number },
        alerts: { alerts: SupervisorAlert[]; criticalCount: number },
        reasons: string[]
    ): string {
        let message = `⚠️ SUPERVISOR: Parada bloqueada.\n\n`;
        message += `Motivo(s):\n`;

        for (const reason of reasons) {
            message += `• ${reason}\n`;
        }

        if (progress.pendingItems.length > 0) {
            message += `\nItens pendentes:\n`;
            for (const item of progress.pendingItems.slice(0, 5)) {
                message += `  ○ ${item}\n`;
            }
            if (progress.pendingItems.length > 5) {
                message += `  ... e mais ${progress.pendingItems.length - 5} itens\n`;
            }
        }

        if (alerts.criticalCount > 0) {
            message += `\nAlertas críticos:\n`;
            for (const alert of alerts.alerts.slice(0, 3)) {
                message += `  ⚠ ${alert.message}\n`;
            }
        }

        message += `\nContinue a execução ou use /bypass para forçar parada.`;

        return message;
    }

    /**
     * Allow next stop (bypass)
     */
    public allowNextStop(): void {
        this.bypassNext = true;
        this.emit('bypass_changed', true);
        console.log('[HookServer] Next stop will be allowed (bypass)');
    }

    /**
     * Check if bypass is active
     */
    public isBypassActive(): boolean {
        return this.bypassNext;
    }
}
