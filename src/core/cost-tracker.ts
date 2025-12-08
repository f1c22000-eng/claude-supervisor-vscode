// ============================================
// CLAUDE SUPERVISOR - COST TRACKER
// ============================================
// Tracks API costs for session and daily totals

import { EventEmitter } from 'events';
import { CostSession, CostDaily, CostTracking } from './types';
import { configManager } from './config';
import { DEFAULT_MODEL_PRICING, USD_TO_BRL } from './constants';

// ============================================
// COST TRACKER
// ============================================

export class CostTracker extends EventEmitter {
    private session: CostSession;
    private daily: CostDaily;
    private static readonly DAILY_KEY = 'claudeSupervisor.dailyCosts';

    constructor() {
        super();

        // Initialize session (always fresh on start)
        this.session = this.createEmptySession();

        // Load daily from persistence (or create new if date changed)
        this.daily = this.loadDailyFromStorage();
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    private createEmptySession(): CostSession {
        return {
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            startTime: Date.now()
        };
    }

    private createEmptyDaily(): CostDaily {
        return {
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            date: this.getTodayDate()
        };
    }

    private getTodayDate(): string {
        return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    }

    private loadDailyFromStorage(): CostDaily {
        const stored = configManager.getGlobalState<CostDaily | null>(CostTracker.DAILY_KEY, null as any);

        if (!stored) {
            return this.createEmptyDaily();
        }

        // Check if it's a new day
        if (stored.date !== this.getTodayDate()) {
            // New day - reset daily costs
            return this.createEmptyDaily();
        }

        return stored;
    }

    private saveDailyToStorage(): void {
        configManager.setGlobalState(CostTracker.DAILY_KEY, this.daily);
    }

    // ========================================
    // COST CALCULATION
    // ========================================

    /**
     * Calculate cost for a request based on model and tokens
     */
    public calculateCost(model: string, inputTokens: number, outputTokens: number): number {
        // Get pricing for model
        const pricing = this.getPricing(model);

        // Calculate cost in USD
        const inputCost = inputTokens * pricing.input;
        const outputCost = outputTokens * pricing.output;
        const totalUsd = inputCost + outputCost;

        // Convert to BRL
        return totalUsd * USD_TO_BRL;
    }

    /**
     * Get pricing for a model (per token)
     */
    private getPricing(model: string): { input: number; output: number } {
        // Try to get from default pricing
        if (DEFAULT_MODEL_PRICING[model]) {
            return DEFAULT_MODEL_PRICING[model];
        }

        // Try to match partial model name
        for (const [key, value] of Object.entries(DEFAULT_MODEL_PRICING)) {
            if (model.includes(key) || key.includes(model)) {
                return value;
            }
        }

        // Default fallback (Claude 3.5 Haiku pricing)
        return {
            input: 0.80 / 1_000_000,
            output: 4.00 / 1_000_000
        };
    }

    // ========================================
    // TRACKING
    // ========================================

    /**
     * Track a new API call
     */
    public trackCall(model: string, inputTokens: number, outputTokens: number): void {
        // Check if day changed
        if (this.daily.date !== this.getTodayDate()) {
            this.daily = this.createEmptyDaily();
        }

        const cost = this.calculateCost(model, inputTokens, outputTokens);

        // Update session
        this.session.calls++;
        this.session.inputTokens += inputTokens;
        this.session.outputTokens += outputTokens;
        this.session.cost += cost;

        // Update daily
        this.daily.calls++;
        this.daily.inputTokens += inputTokens;
        this.daily.outputTokens += outputTokens;
        this.daily.cost += cost;

        // Save daily to storage
        this.saveDailyToStorage();

        // Emit update event
        this.emit('cost_update', this.getCosts());

        // Check for cost alerts
        this.checkCostAlerts();
    }

    /**
     * Check for cost alerts
     */
    private checkCostAlerts(): void {
        const config = configManager.getConfig();

        // Check daily cost alert threshold
        if (this.daily.cost >= config.dailyCostAlert) {
            this.emit('cost_alert', {
                type: 'warning',
                message: `Custo diário atingiu R$ ${this.daily.cost.toFixed(2)}`,
                threshold: config.dailyCostAlert
            });
        }

        // Check daily cost limit
        if (this.daily.cost >= config.dailyCostLimit) {
            this.emit('cost_limit', {
                type: 'critical',
                message: `Limite diário de R$ ${config.dailyCostLimit.toFixed(2)} atingido!`,
                limit: config.dailyCostLimit
            });
        }
    }

    // ========================================
    // GETTERS
    // ========================================

    /**
     * Get current costs
     */
    public getCosts(): CostTracking {
        return {
            session: { ...this.session },
            daily: { ...this.daily }
        };
    }

    /**
     * Get session costs
     */
    public getSessionCosts(): CostSession {
        return { ...this.session };
    }

    /**
     * Get daily costs
     */
    public getDailyCosts(): CostDaily {
        // Check if day changed
        if (this.daily.date !== this.getTodayDate()) {
            this.daily = this.createEmptyDaily();
            this.saveDailyToStorage();
        }
        return { ...this.daily };
    }

    /**
     * Get formatted cost string
     */
    public getFormattedCosts(): { session: string; daily: string } {
        return {
            session: `${this.session.calls} chamadas (~R$ ${this.session.cost.toFixed(2)})`,
            daily: `${this.daily.calls} chamadas (~R$ ${this.daily.cost.toFixed(2)})`
        };
    }

    // ========================================
    // RESET
    // ========================================

    /**
     * Reset session costs (keeps daily)
     */
    public resetSession(): void {
        this.session = this.createEmptySession();
        this.emit('cost_update', this.getCosts());
    }

    /**
     * Reset daily costs
     */
    public resetDaily(): void {
        this.daily = this.createEmptyDaily();
        this.saveDailyToStorage();
        this.emit('cost_update', this.getCosts());
    }

    /**
     * Reset all costs
     */
    public resetAll(): void {
        this.session = this.createEmptySession();
        this.daily = this.createEmptyDaily();
        this.saveDailyToStorage();
        this.emit('cost_update', this.getCosts());
    }
}

// Singleton instance
export const costTracker = new CostTracker();
