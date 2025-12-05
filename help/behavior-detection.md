# Detecção de Comportamento

[← Supervisores](./supervisors.md) | [Próximo: Configuração →](./configuration.md)

---

## O Que é Detecção de Comportamento?

Sistema que verifica o **COMPORTAMENTO** do Claude Code - se ele está tentando fazer menos do que foi pedido.

## Tipos de Comportamento Detectados

### 1. Redução de Escopo

**Frases detectadas:**
- "vou fazer só essa por enquanto"
- "começando pela principal"
- "as outras depois"
- "primeiro só essa"
- "uma de cada vez"

**Ação:** Alerta amarelo com opção de intervir

### 2. Incompletude

**Detectado:** Comparando progresso atual vs declaração de término.

**Exemplo:**
- Pedido: "Refatorar 12 telas"
- Progresso: 3 telas feitas
- Claude diz: "Pronto!"
- **Sistema:** ⚠️ Alerta!

### 3. Procrastinação

**Frases detectadas:**
- "deixo pra depois"
- "numa próxima iteração"
- "mais tarde a gente vê"
- "em outra oportunidade"

### 4. Desvio de Escopo

Quando Claude começa a fazer algo diferente do pedido.

## Configurando Detecção

No painel de **Configuração**, você pode ativar/desativar:

- ☑️ Detectar redução de escopo
- ☑️ Exigir lista antes de refatoração
- ☑️ Detectar linguagem de procrastinação
- ☑️ Verificar completude no "pronto"
- ☐ Modo agressivo (interrompe imediatamente)

## Como o Sistema Analisa

```
Thinking do Claude
        │
        ▼
  Pattern Matching ──► Detectou padrão?
        │                    │
        │                    ▼
        │              Verificar com IA
        │                    │
        ▼                    ▼
    [CONTINUA]          [ALERTA]
```

---

## Navegação

- [← Supervisores](./supervisors.md)
- [Próximo: Configuração →](./configuration.md)
