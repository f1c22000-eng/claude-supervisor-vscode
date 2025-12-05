// ============================================
// CLAUDE SUPERVISOR - BASE SUPERVISOR NODE
// ============================================

import { EventEmitter } from 'events';
import { SupervisorConfig, SupervisorType, SupervisorResult, Rule, Severity } from '../core/types';
import { anthropicClient } from '../core/api';

// ============================================
// BASE SUPERVISOR NODE
// ============================================

export abstract class SupervisorNode extends EventEmitter {
    protected config: SupervisorConfig;
    protected children: SupervisorNode[] = [];
    protected parent: SupervisorNode | null = null;
    protected lastResult: SupervisorResult | null = null;
    protected callCount: number = 0;
    protected alertCount: number = 0;

    constructor(config: SupervisorConfig) {
        super();
        this.config = config;
    }

    // ========================================
    // ABSTRACT METHODS
    // ========================================

    public abstract analyze(thinking: string, context?: any): Promise<SupervisorResult>;

    // ========================================
    // HIERARCHY
    // ========================================

    public addChild(child: SupervisorNode): void {
        child.parent = this;
        this.children.push(child);
    }

    public removeChild(childId: string): void {
        this.children = this.children.filter(c => c.getId() !== childId);
    }

    public getChildren(): SupervisorNode[] {
        return this.children;
    }

    public getParent(): SupervisorNode | null {
        return this.parent;
    }

    public findChild(id: string): SupervisorNode | undefined {
        return this.children.find(c => c.getId() === id);
    }

    public findDescendant(id: string): SupervisorNode | undefined {
        for (const child of this.children) {
            if (child.getId() === id) {
                return child;
            }
            const found = child.findDescendant(id);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    // ========================================
    // CONFIG ACCESS
    // ========================================

    public getId(): string {
        return this.config.id;
    }

    public getName(): string {
        return this.config.name;
    }

    public getType(): SupervisorType {
        return this.config.type;
    }

    public getKeywords(): string[] {
        return this.config.keywords;
    }

    public getRules(): Rule[] {
        return this.config.rules;
    }

    public isEnabled(): boolean {
        return this.config.enabled;
    }

    public setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
    }

    public getConfig(): SupervisorConfig {
        return { ...this.config };
    }

    // ========================================
    // RULES MANAGEMENT
    // ========================================

    public addRule(rule: Rule): void {
        this.config.rules.push(rule);
    }

    public removeRule(ruleId: string): void {
        this.config.rules = this.config.rules.filter(r => r.id !== ruleId);
    }

    public updateRule(ruleId: string, updates: Partial<Rule>): void {
        const rule = this.config.rules.find(r => r.id === ruleId);
        if (rule) {
            Object.assign(rule, updates);
        }
    }

    public toggleRule(ruleId: string, enabled: boolean): void {
        const rule = this.config.rules.find(r => r.id === ruleId);
        if (rule) {
            rule.enabled = enabled;
        }
    }

    // ========================================
    // STATISTICS
    // ========================================

    public getCallCount(): number {
        return this.callCount;
    }

    public getAlertCount(): number {
        return this.alertCount;
    }

    public getLastResult(): SupervisorResult | null {
        return this.lastResult;
    }

    protected recordResult(result: SupervisorResult): void {
        this.callCount++;
        if (result.status === 'alert') {
            this.alertCount++;
        }
        this.lastResult = result;
        this.emit('result', result);
    }

    // ========================================
    // SERIALIZATION
    // ========================================

    public toJSON(): SupervisorConfig {
        return this.getConfig();
    }
}
