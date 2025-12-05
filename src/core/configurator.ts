// ============================================
// CLAUDE SUPERVISOR - CONFIGURADOR AUTOMÁTICO
// ============================================

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { anthropicClient } from './api';
import { configManager } from './config';
import { SupervisorConfig, SupervisorType, Rule, Severity, DocumentAnalysis, ImportResult } from './types';
import { ConfigLoader } from '../supervisors/config-loader';
import { CONFIGURATOR_SYSTEM_PROMPT, RULE_CREATOR_PROMPT } from './configurator-prompt';

// PDF and DOCX parsing libraries
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';

// ============================================
// CONFIGURATOR
// ============================================

export class Configurator {
    private configLoader: ConfigLoader;

    constructor() {
        this.configLoader = new ConfigLoader();
    }

    // ========================================
    // DOCUMENT ANALYSIS
    // ========================================

    public async analyzeDocuments(
        documents: Array<{ path: string; content: string }>,
        projectName: string,
        onProgress?: (progress: number, message: string) => void
    ): Promise<ImportResult> {
        const totalDocs = documents.length;
        let processedDocs = 0;
        const allAnalyses: DocumentAnalysis[] = [];

        // Analyze each document
        for (const doc of documents) {
            onProgress?.(
                Math.round((processedDocs / totalDocs) * 50),
                `Analisando ${path.basename(doc.path)}...`
            );

            const analysis = await this.analyzeDocument(doc.content, doc.path);
            allAnalyses.push(analysis);
            processedDocs++;
        }

        onProgress?.(60, 'Gerando hierarquia de supervisores...');

        // Merge analyses and generate hierarchy
        const mergedAnalysis = this.mergeAnalyses(allAnalyses);

        onProgress?.(80, 'Criando configuração YAML...');

        // Generate supervisor configs
        const hierarchy = this.generateHierarchy(mergedAnalysis, projectName);

        onProgress?.(90, 'Salvando configuração...');

        // Save YAML
        const yamlPath = await this.saveConfiguration(hierarchy, projectName);

        onProgress?.(100, 'Concluído!');

        // Count results
        const coordinators = hierarchy.filter(s => s.type === SupervisorType.COORDINATOR).length;
        const specialists = hierarchy.filter(s => s.type === SupervisorType.SPECIALIST).length;
        const rules = hierarchy.reduce((acc, s) => acc + s.rules.length, 0);

        return {
            projectName,
            coordinators,
            specialists,
            rules,
            hierarchy
        };
    }

    private async analyzeDocument(content: string, filePath: string): Promise<DocumentAnalysis> {
        // Use comprehensive system prompt that explains what Claude Supervisor is
        const userMessage = `Analise este documento do projeto e extraia regras para supervisão.

Arquivo: ${path.basename(filePath)}

=== CONTEÚDO DO DOCUMENTO ===
${content.substring(0, 15000)}
=== FIM DO DOCUMENTO ===

Extraia temas, sub-temas e regras seguindo o formato JSON especificado.`;

        const response = await anthropicClient.callSonnet(CONFIGURATOR_SYSTEM_PROMPT, userMessage, 4000);

        if (!response) {
            return { themes: [], subThemes: {}, rules: [] };
        }

        try {
            const parsed = JSON.parse(response);
            return {
                themes: parsed.themes || [],
                subThemes: parsed.subThemes || {},
                rules: (parsed.rules || []).map((r: any) => ({
                    id: uuidv4(),
                    description: r.description,
                    severity: this.parseSeverity(r.severity),
                    check: r.check,
                    enabled: true
                }))
            };
        } catch (error) {
            console.error('Failed to parse document analysis:', error);
            return { themes: [], subThemes: {}, rules: [] };
        }
    }

    private mergeAnalyses(analyses: DocumentAnalysis[]): DocumentAnalysis {
        const themes = new Set<string>();
        const subThemes: Record<string, Set<string>> = {};
        const rules: Rule[] = [];

        for (const analysis of analyses) {
            // Merge themes
            for (const theme of analysis.themes) {
                themes.add(theme);
            }

            // Merge sub-themes
            for (const [theme, subs] of Object.entries(analysis.subThemes)) {
                if (!subThemes[theme]) {
                    subThemes[theme] = new Set();
                }
                for (const sub of subs) {
                    subThemes[theme].add(sub);
                }
            }

            // Merge rules
            rules.push(...analysis.rules);
        }

        return {
            themes: Array.from(themes),
            subThemes: Object.fromEntries(
                Object.entries(subThemes).map(([k, v]) => [k, Array.from(v)])
            ),
            rules
        };
    }

    // ========================================
    // HIERARCHY GENERATION
    // ========================================

    private generateHierarchy(analysis: DocumentAnalysis, projectName: string): SupervisorConfig[] {
        const configs: SupervisorConfig[] = [];

        // Create coordinators for each theme
        for (const theme of analysis.themes) {
            const coordinatorId = `${projectName.toLowerCase()}-${theme.toLowerCase().replace(/\s+/g, '-')}`;

            const coordinator: SupervisorConfig = {
                id: coordinatorId,
                name: `${projectName}.${theme}`,
                type: SupervisorType.COORDINATOR,
                keywords: this.generateKeywords(theme),
                rules: [],
                enabled: true
            };

            configs.push(coordinator);

            // Create specialists for sub-themes
            const subs = analysis.subThemes[theme] || [];
            for (const sub of subs) {
                const specialistId = `${coordinatorId}-${sub.toLowerCase().replace(/\s+/g, '-')}`;

                // Get rules for this sub-theme
                const subRules = analysis.rules.filter(r =>
                    this.ruleMatchesTheme(r, theme, sub)
                );

                const specialist: SupervisorConfig = {
                    id: specialistId,
                    name: `${projectName}.${theme}.${sub}`,
                    type: SupervisorType.SPECIALIST,
                    parentId: coordinatorId,
                    keywords: this.generateKeywords(sub),
                    rules: subRules,
                    enabled: true
                };

                configs.push(specialist);
            }
        }

        return configs;
    }

    private generateKeywords(name: string): string[] {
        const words = name.toLowerCase().split(/\s+/);
        const keywords = [...words];

        // Add common variations
        for (const word of words) {
            // Add plural/singular
            if (word.endsWith('s')) {
                keywords.push(word.slice(0, -1));
            } else {
                keywords.push(word + 's');
            }

            // Add common related terms
            const relatedTerms: Record<string, string[]> = {
                'estoque': ['quantidade', 'saldo', 'reserva', 'inventário'],
                'pedido': ['ordem', 'compra', 'venda', 'order'],
                'cliente': ['customer', 'user', 'usuário'],
                'produto': ['item', 'product', 'artigo'],
                'pagamento': ['payment', 'cobrança', 'fatura'],
                'validação': ['validation', 'check', 'verificar'],
                'segurança': ['security', 'auth', 'senha', 'password']
            };

            if (relatedTerms[word]) {
                keywords.push(...relatedTerms[word]);
            }
        }

        return [...new Set(keywords)];
    }

    private ruleMatchesTheme(rule: any, theme: string, subTheme: string): boolean {
        const ruleText = `${rule.description} ${rule.check}`.toLowerCase();
        return ruleText.includes(theme.toLowerCase()) ||
               ruleText.includes(subTheme.toLowerCase());
    }

    private parseSeverity(severity: string): Severity {
        switch (severity?.toLowerCase()) {
            case 'critical': return Severity.CRITICAL;
            case 'high': return Severity.HIGH;
            case 'medium': return Severity.MEDIUM;
            default: return Severity.LOW;
        }
    }

    // ========================================
    // CONFIGURATION SAVING
    // ========================================

    private async saveConfiguration(
        configs: SupervisorConfig[],
        projectName: string
    ): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const configDir = path.join(workspaceFolder.uri.fsPath, 'config', 'supervisors');

        // Ensure directory exists
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        const yamlPath = path.join(configDir, `${projectName.toLowerCase()}.yaml`);
        const yamlContent = this.configLoader.generateYaml(configs, projectName);

        fs.writeFileSync(yamlPath, yamlContent, 'utf-8');

        return yamlPath;
    }

    // ========================================
    // RULE EDITOR
    // ========================================

    public async addRuleQuick(
        description: string,
        context?: string
    ): Promise<Rule | null> {
        // Use the rule creator prompt
        const userMessage = `Crie uma regra para: ${description}${context ? `\n\nContexto: ${context}` : ''}`;

        const response = await anthropicClient.callHaiku(RULE_CREATOR_PROMPT, userMessage, 300);

        if (!response) {
            return null;
        }

        try {
            const parsed = JSON.parse(response);
            return {
                id: uuidv4(),
                description: parsed.description,
                severity: this.parseSeverity(parsed.severity),
                check: parsed.check,
                enabled: true
            };
        } catch {
            // Fallback to simple rule
            return {
                id: uuidv4(),
                description,
                severity: Severity.MEDIUM,
                check: description,
                enabled: true
            };
        }
    }

    // ========================================
    // FILE READING
    // ========================================

    public async readDocument(filePath: string): Promise<string> {
        const ext = path.extname(filePath).toLowerCase();

        switch (ext) {
            case '.md':
            case '.txt':
                return fs.readFileSync(filePath, 'utf-8');

            case '.pdf':
                return await this.extractPdfText(filePath);

            case '.docx':
                return await this.extractDocxText(filePath);

            default:
                return fs.readFileSync(filePath, 'utf-8');
        }
    }

    private async extractPdfText(filePath: string): Promise<string> {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        } catch (error) {
            console.error(`Failed to extract PDF text from ${filePath}:`, error);
            throw new Error(`Falha ao extrair texto do PDF: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
    }

    private async extractDocxText(filePath: string): Promise<string> {
        try {
            const result = await mammoth.extractRawText({ path: filePath });
            if (result.messages.length > 0) {
                console.warn('DOCX extraction warnings:', result.messages);
            }
            return result.value;
        } catch (error) {
            console.error(`Failed to extract DOCX text from ${filePath}:`, error);
            throw new Error(`Falha ao extrair texto do DOCX: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
    }

    public async readDocuments(filePaths: string[]): Promise<Array<{ path: string; content: string }>> {
        const documents: Array<{ path: string; content: string }> = [];

        for (const filePath of filePaths) {
            try {
                const content = await this.readDocument(filePath);
                documents.push({ path: filePath, content });
            } catch (error) {
                console.error(`Failed to read ${filePath}:`, error);
            }
        }

        return documents;
    }
}

// Export singleton
export const configurator = new Configurator();
