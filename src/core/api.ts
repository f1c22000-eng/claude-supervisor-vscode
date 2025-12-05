// ============================================
// CLAUDE SUPERVISOR - CLIENTE API ANTHROPIC
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { configManager } from './config';
import { ApiUsage, ApiStats, Severity } from './types';
import { MODELS, MODEL_PRICING, USD_TO_BRL, TIMEOUTS, LIMITS } from './constants';

// ============================================
// API CLIENT
// ============================================

export class AnthropicClient {
    private static instance: AnthropicClient;
    private client: Anthropic | null = null;
    private stats: ApiStats;
    private callsThisHour: number = 0;
    private hourStartTime: number = Date.now();

    private constructor() {
        this.stats = this.createEmptyStats();
    }

    public static getInstance(): AnthropicClient {
        if (!AnthropicClient.instance) {
            AnthropicClient.instance = new AnthropicClient();
        }
        return AnthropicClient.instance;
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    public async initialize(): Promise<boolean> {
        try {
            const apiKey = await configManager.getApiKey();

            if (!apiKey || !apiKey.startsWith('sk-ant-')) {
                return false;
            }

            this.client = new Anthropic({
                apiKey: apiKey
            });

            // Load saved stats
            this.stats = configManager.getGlobalState('apiStats', this.createEmptyStats());

            // Reset daily stats if new day
            this.checkDailyReset();

            return true;
        } catch (error) {
            console.error('Failed to initialize Anthropic client:', error);
            return false;
        }
    }

    public isInitialized(): boolean {
        return this.client !== null;
    }

    // ========================================
    // API CALLS
    // ========================================

    public async callHaiku(
        systemPrompt: string,
        userMessage: string,
        maxTokens: number = 200
    ): Promise<string | null> {
        return this.callModel(MODELS.HAIKU, systemPrompt, userMessage, maxTokens, TIMEOUTS.HAIKU_REQUEST);
    }

    public async callSonnet(
        systemPrompt: string,
        userMessage: string,
        maxTokens: number = 2000
    ): Promise<string | null> {
        return this.callModel(MODELS.SONNET, systemPrompt, userMessage, maxTokens, TIMEOUTS.SONNET_REQUEST);
    }

    private async callModel(
        model: string,
        systemPrompt: string,
        userMessage: string,
        maxTokens: number,
        timeout: number
    ): Promise<string | null> {
        if (!this.client) {
            console.error('Anthropic client not initialized');
            return null;
        }

        // Check rate limits
        if (!this.checkRateLimit()) {
            vscode.window.showWarningMessage('Claude Supervisor: Limite de chamadas/hora atingido');
            return null;
        }

        // Check cost limits
        if (this.checkCostLimit()) {
            return null;
        }

        const startTime = Date.now();
        let retries = 0;

        while (retries < LIMITS.MAX_RETRIES) {
            try {
                const response = await Promise.race([
                    this.client.messages.create({
                        model: model,
                        max_tokens: maxTokens,
                        system: systemPrompt,
                        messages: [
                            { role: 'user', content: userMessage }
                        ]
                    }),
                    this.createTimeout(timeout)
                ]);

                if (!response || typeof response === 'string') {
                    throw new Error('Request timed out');
                }

                const messageResponse = response as Anthropic.Message;

                // Update stats
                this.updateStats(model, messageResponse.usage);

                // Extract text response
                const textContent = messageResponse.content.find(c => c.type === 'text');
                return textContent ? textContent.text : null;

            } catch (error: any) {
                retries++;

                if (error.status === 429) {
                    // Rate limited - wait and retry
                    await this.delay(1000 * retries);
                } else if (retries >= LIMITS.MAX_RETRIES) {
                    console.error('API call failed after retries:', error);
                    return null;
                }
            }
        }

        return null;
    }

    // ========================================
    // SUPERVISOR-SPECIFIC CALLS
    // ========================================

    public async classifyThinking(thinking: string, areas: string[]): Promise<string | null> {
        const systemPrompt = `Você é um classificador de temas. Analise o texto e retorne APENAS o nome da área mais relevante.
Áreas disponíveis: ${areas.join(', ')}
Se nenhuma área for relevante, retorne "none".
Responda com uma única palavra.`;

        return this.callHaiku(systemPrompt, thinking, 50);
    }

    public async checkRule(
        thinking: string,
        rule: string,
        context?: string
    ): Promise<{ violated: boolean; explanation?: string }> {
        const systemPrompt = `Você é um supervisor que verifica se um pensamento viola uma regra específica.

Regra: ${rule}
${context ? `Contexto adicional: ${context}` : ''}

Analise o pensamento abaixo e responda em JSON:
{"violated": true/false, "explanation": "breve explicação se violado"}

Se a regra NÃO foi violada, responda: {"violated": false}`;

        const response = await this.callHaiku(systemPrompt, thinking, 150);

        if (!response) {
            return { violated: false };
        }

        try {
            return JSON.parse(response);
        } catch {
            return { violated: false };
        }
    }

    public async detectBehavior(
        thinking: string,
        originalRequest: string,
        currentProgress: string
    ): Promise<{ detected: boolean; type?: string; explanation?: string }> {
        const systemPrompt = `Você é um detector de comportamento de IA. Analise se o pensamento indica:
1. Redução de escopo (fazer menos do que pedido)
2. Procrastinação (deixar para depois)
3. Incompletude (dizer que terminou sem terminar)

Pedido original: ${originalRequest}
Progresso atual: ${currentProgress}

Responda em JSON:
{"detected": true/false, "type": "scope_reduction|procrastination|incompleteness", "explanation": "breve explicação"}`;

        const response = await this.callHaiku(systemPrompt, thinking, 200);

        if (!response) {
            return { detected: false };
        }

        try {
            return JSON.parse(response);
        } catch {
            return { detected: false };
        }
    }

    // ========================================
    // RATE LIMITING
    // ========================================

    private checkRateLimit(): boolean {
        const now = Date.now();
        const config = configManager.getConfig();

        // Reset hourly counter if hour has passed
        if (now - this.hourStartTime >= 3600000) {
            this.callsThisHour = 0;
            this.hourStartTime = now;
        }

        if (this.callsThisHour >= config.maxCallsPerHour) {
            return false;
        }

        this.callsThisHour++;
        return true;
    }

    private checkCostLimit(): boolean {
        const config = configManager.getConfig();
        const dailyCostBRL = this.stats.today.totalCost * USD_TO_BRL;

        if (dailyCostBRL >= config.dailyCostLimit) {
            vscode.window.showErrorMessage(
                `Claude Supervisor: Limite crítico de custo diário (R$ ${config.dailyCostLimit}) atingido. Sistema pausado.`
            );
            return true;
        }

        if (dailyCostBRL >= config.dailyCostAlert) {
            vscode.window.showWarningMessage(
                `Claude Supervisor: Alerta de custo - R$ ${dailyCostBRL.toFixed(2)} hoje`
            );
        }

        return false;
    }

    // ========================================
    // STATS MANAGEMENT
    // ========================================

    private updateStats(model: string, usage: { input_tokens: number; output_tokens: number }): void {
        const pricing = MODEL_PRICING[model] || MODEL_PRICING[MODELS.HAIKU];
        const cost = (usage.input_tokens * pricing.input) + (usage.output_tokens * pricing.output);

        // Update session stats
        this.stats.session.inputTokens += usage.input_tokens;
        this.stats.session.outputTokens += usage.output_tokens;
        this.stats.session.totalCost += cost;
        this.stats.session.callCount++;

        // Update daily stats
        this.stats.today.inputTokens += usage.input_tokens;
        this.stats.today.outputTokens += usage.output_tokens;
        this.stats.today.totalCost += cost;
        this.stats.today.callCount++;

        // Save stats
        configManager.setGlobalState('apiStats', this.stats);
    }

    private checkDailyReset(): void {
        const now = new Date();
        const lastReset = new Date(this.stats.lastReset);

        if (now.toDateString() !== lastReset.toDateString()) {
            this.stats.today = this.createEmptyUsage();
            this.stats.lastReset = now.getTime();
            configManager.setGlobalState('apiStats', this.stats);
        }
    }

    public getStats(): ApiStats {
        return { ...this.stats };
    }

    public resetSessionStats(): void {
        this.stats.session = this.createEmptyUsage();
        configManager.setGlobalState('apiStats', this.stats);
    }

    private createEmptyStats(): ApiStats {
        return {
            today: this.createEmptyUsage(),
            session: this.createEmptyUsage(),
            lastReset: Date.now()
        };
    }

    private createEmptyUsage(): ApiUsage {
        return {
            inputTokens: 0,
            outputTokens: 0,
            totalCost: 0,
            callCount: 0
        };
    }

    // ========================================
    // UTILITIES
    // ========================================

    private createTimeout(ms: number): Promise<string> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), ms);
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            const testClient = new Anthropic({ apiKey });

            // Make a minimal request to validate the key
            const response = await testClient.messages.create({
                model: MODELS.HAIKU,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'test' }]
            });

            return true;
        } catch (error: any) {
            if (error.status === 401) {
                return false;
            }
            // Other errors might be rate limits, etc., key might still be valid
            return true;
        }
    }
}

// Export singleton instance
export const anthropicClient = AnthropicClient.getInstance();
