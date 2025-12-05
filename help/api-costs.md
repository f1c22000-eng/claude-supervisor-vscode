# Custos e API

[← Resolução de Problemas](./troubleshooting.md) | [Próximo: Comandos →](./commands.md)

---

## Modelos e Preços

### Claude 3.5 Haiku (Supervisores)

| Tipo | Preço |
|------|-------|
| Input | $0.25/1M tokens |
| Output | $1.25/1M tokens |
| **Por chamada** | **~$0.00019** |

### Claude Sonnet 4 (Configurador)

| Tipo | Preço |
|------|-------|
| Input | $3/1M tokens |
| Output | $15/1M tokens |
| **Por análise** | **~$0.03** |

## Custo por Sessão (4 horas)

```
Chunks de thinking: ~500
Chamadas por chunk: ~2 (router + specialist)
Total chamadas: ~1000

Custo USD: ~$0.19
Custo BRL: ~R$ 1,00 a R$ 1,50
```

## Custo Mensal Estimado

| Uso | Horas/dia | Custo mensal |
|-----|-----------|--------------|
| Leve | 2h | R$ 20-30 |
| Médio | 4h | R$ 40-60 |
| Intenso | 8h | R$ 80-120 |

## Otimizando Custos

### 1. Use Haiku para tudo
Haiku é 10x mais barato que Sonnet e suficiente para supervisão.

### 2. Reduza supervisores ativos
Desative supervisores que não são relevantes para o projeto atual.

### 3. Aumente intervalo de análise
Configure para analisar chunks maiores (menos chamadas).

### 4. Use cache agressivo
O sistema já usa cache, mas você pode aumentar o TTL.

### 5. Modo passivo
Para tarefas simples, use modo que só alerta em casos críticos.

## Configurando Limites

```yaml
# config/settings.yaml

limits:
  max_calls_per_hour: 1000    # ~R$ 1/hora
  daily_cost_alert: 5.00      # R$ 5 - notificação
  daily_cost_limit: 20.00     # R$ 20 - sistema pausa
```

## Monitorando Custos

No painel principal, você pode ver:
- Uso hoje: chamadas e custo
- Uso da sessão: tokens e custo
- Alertas quando limites são atingidos

---

## Navegação

- [← Resolução de Problemas](./troubleshooting.md)
- [Próximo: Comandos →](./commands.md)
