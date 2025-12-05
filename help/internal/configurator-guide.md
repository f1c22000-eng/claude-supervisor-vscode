# Guia do Configurador

## O que é o Configurador?

O Configurador é um módulo que usa Claude Sonnet para analisar documentos do projeto e gerar automaticamente regras de supervisão.

## Como Funciona

1. **Importação**: Usuário importa documentos (PDF, DOCX, MD, YAML)
2. **Análise**: Sonnet analisa com CONFIGURATOR_SYSTEM_PROMPT
3. **Extração**: Gera JSON estruturado com regras
4. **Carregamento**: Regras são adicionadas à hierarquia de supervisores

## CONFIGURATOR_SYSTEM_PROMPT

Este é o prompt principal que dá contexto ao Sonnet sobre o que é a extensão e o que extrair.

### Seções do Prompt

#### O QUE A EXTENSÃO FAZ
Explica que a extensão:
- Monitora Claude Code via proxy HTTP
- Intercepta o "thinking" em tempo real
- Analisa com supervisores Haiku
- Alerta quando regras são violadas

#### COMO FUNCIONA
Descreve o fluxo técnico:
1. Usuário configura `ANTHROPIC_BASE_URL=http://localhost:8888`
2. Proxy intercepta e extrai thinking
3. Supervisores Haiku analisam
4. Alertas aparecem no VS Code

#### ESTRUTURA DE SUPERVISORES
Mostra a hierarquia completa para Sonnet entender onde colocar cada regra.

#### SUA TAREFA
Instrui Sonnet a extrair:
- Regras Técnicas (código, segurança, arquitetura)
- Regras de Negócio (domínio, validações)
- Comportamentos a Monitorar
- Keywords de ativação

#### FORMATO DE SAÍDA
Define o JSON esperado:
```json
{
  "themes": ["Tema1", "Tema2"],
  "subThemes": {
    "Tema1": ["SubTema1", "SubTema2"]
  },
  "rules": [
    {
      "theme": "Tema1",
      "subTheme": "SubTema1",
      "description": "Descrição clara",
      "severity": "critical|high|medium|low",
      "check": "O que verificar no thinking",
      "keywords": ["palavra1", "palavra2"],
      "violationExample": "Exemplo de violação"
    }
  ]
}
```

#### SEVERIDADES
- **critical**: Segurança, perda de dados, crash
- **high**: Arquitetura, regra de negócio importante
- **medium**: Boas práticas, padrões
- **low**: Preferências, convenções

#### EXEMPLOS DE BOAS REGRAS
Inclui 4 exemplos detalhados:
1. Regra técnica de segurança (SQL injection)
2. Regra técnica de arquitetura (camadas)
3. Regra de negócio (estoque negativo)
4. Regra de comportamento (completude)

## RULE_CREATOR_PROMPT

Prompt simplificado para criar regras rapidamente via Haiku.

**Uso**: Quando usuário digita uma regra em linguagem natural no terminal.

**Entrada**: "Não deixar console.log no código"

**Saída**:
```json
{
  "description": "Remover console.log antes de commitar",
  "severity": "medium",
  "check": "Detectar quando Claude está adicionando console.log",
  "keywords": ["console.log", "debug", "log", "print"]
}
```

## Fluxo de Importação

```
[Usuário importa PDF]
    ↓
[ImportPanelProvider.importFile()]
    ↓
[Configurator.analyzeDocument()]
    ↓
[API.callSonnet(CONFIGURATOR_SYSTEM_PROMPT, conteúdo)]
    ↓
[JSON com regras]
    ↓
[Configurator.parseResponse()]
    ↓
[SupervisorHierarchy.addRule() para cada regra]
    ↓
[Regras ativas nos supervisores]
```

## Código Relevante

- [configurator.ts](../../src/core/configurator.ts) - Lógica de análise
- [configurator-prompt.ts](../../src/core/configurator-prompt.ts) - Prompts
- [import-panel.ts](../../src/ui/import-panel.ts) - UI de importação
- [api.ts](../../src/core/api.ts) - Chamadas para Sonnet

## Dicas de Uso

1. **Documentos ricos**: Quanto mais detalhado o documento, melhores as regras
2. **Revisar regras**: Sempre revisar as regras geradas antes de usar
3. **Ajustar severidade**: Sonnet pode errar na severidade, ajuste manualmente
4. **Keywords**: Adicione keywords específicas do seu projeto
