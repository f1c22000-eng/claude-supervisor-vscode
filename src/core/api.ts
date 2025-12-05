// ============================================
// CLAUDE SUPERVISOR - CLIENTE API ANTHROPIC
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { configManager } from './config';
import { ApiUsage, ApiStats, Severity } from './types';
import { TIMEOUTS, LIMITS, DEFAULT_MODEL_PRICING, USD_TO_BRL } from './constants';
import { BEHAVIOR_SUPERVISOR_PROMPT, SUPERVISOR_ANALYSIS_PROMPT } from './configurator-prompt';

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
        const model = configManager.getSupervisorModel();
        return this.callModel(model, systemPrompt, userMessage, maxTokens, TIMEOUTS.HAIKU_REQUEST);
    }

    public async callSonnet(
        systemPrompt: string,
        userMessage: string,
        maxTokens: number = 2000
    ): Promise<string | null> {
        const model = configManager.getConfiguratorModel();
        return this.callModel(model, systemPrompt, userMessage, maxTokens, TIMEOUTS.SONNET_REQUEST);
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
    ): Promise<{ detected: boolean; type?: string; explanation?: string; suggestion?: string }> {
        // Use the comprehensive behavior supervisor prompt
        const systemPrompt = BEHAVIOR_SUPERVISOR_PROMPT
            .replace('{thinking}', thinking.substring(0, 2000))
            .replace('{originalRequest}', originalRequest || 'Não especificado')
            .replace('{progress}', currentProgress || '0%');

        const response = await this.callHaiku(systemPrompt, 'Analise o thinking acima e detecte comportamentos problemáticos.', 300);

        if (!response) {
            return { detected: false };
        }

        try {
            const parsed = JSON.parse(response);
            return {
                detected: parsed.detected !== null,
                type: parsed.detected,
                explanation: parsed.explanation,
                suggestion: parsed.suggestion
            };
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
        const pricing = configManager.getModelPrice(model);
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

    public async validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
        try {
            const testClient = new Anthropic({ apiKey });

            // Make a minimal request to validate the key
            await testClient.messages.create({
                model: configManager.getSupervisorModel(),
                max_tokens: 10,
                messages: [{ role: 'user', content: 'test' }]
            });

            return { valid: true };
        } catch (error: any) {
            // HTTP 401 - Unauthorized (invalid key)
            if (error.status === 401) {
                return { valid: false, error: 'API Key inválida. Verifique se a key está correta.' };
            }

            // HTTP 403 - Forbidden (key disabled or no permissions)
            if (error.status === 403) {
                return { valid: false, error: 'API Key sem permissões ou desativada.' };
            }

            // HTTP 429 - Rate limit (key is valid but rate limited)
            if (error.status === 429) {
                return { valid: true }; // Key is valid, just rate limited
            }

            // HTTP 400 - Bad request (key is valid, request was bad)
            if (error.status === 400) {
                return { valid: true }; // Key is valid
            }

            // Network errors
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                return { valid: false, error: 'Erro de rede. Verifique sua conexão com a internet.' };
            }

            // Other unknown errors
            return { valid: false, error: `Erro desconhecido: ${error.message || 'Verifique sua conexão.'}` };
        }
    }
}

// Export singleton instance
export const anthropicClient = AnthropicClient.getInstance();
