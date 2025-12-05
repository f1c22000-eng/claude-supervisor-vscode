# Configuração

[← Detecção de Comportamento](./behavior-detection.md) | [Próximo: Resolução de Problemas →](./troubleshooting.md)

---

## API e Autenticação

### API Key da Anthropic

**Como obter:**
1. Acesse [console.anthropic.com](https://console.anthropic.com)
2. Vá em "API Keys"
3. Clique em "Create Key"
4. Copie a chave (começa com `sk-ant-`)

**Segurança:**
- Chave armazenada criptografada
- Nunca enviada para outros servidores
- Só usada para API Anthropic

## Modelos de IA

### Supervisores
- **Modelo:** Claude 3.5 Haiku (recomendado)
- **Velocidade:** ~200ms
- **Custo:** $0.25/1M tokens

### Configurador
- **Modelo:** Claude Sonnet 4
- **Uso:** Apenas na importação de documentos
- **Custo:** $3/1M tokens

## Opções de Comportamento

| Opção | Descrição | Padrão |
|-------|-----------|--------|
| Detectar redução de escopo | Alerta quando Claude faz menos que pedido | ✅ |
| Exigir lista antes de refatoração | Para tarefas com múltiplos arquivos | ✅ |
| Detectar procrastinação | Detecta "depois", "por enquanto" | ✅ |
| Verificar completude | Compara progresso no "pronto" | ✅ |
| Modo agressivo | Interrompe ao invés de alertar | ❌ |
| Buffer de notas | Segundos antes de perguntar | 10s |

## Limites de Custo

| Configuração | Descrição | Padrão |
|--------------|-----------|--------|
| Máximo chamadas/hora | Limite de chamadas | 1000 |
| Alerta de custo diário | Notificação | R$ 5,00 |
| Limite crítico diário | Sistema pausa | R$ 20,00 |

## Arquivos de Configuração

```
config/
├── settings.yaml           # Configurações gerais
└── supervisors/
    ├── optimizer.yaml      # Projeto 1
    └── synflux.yaml        # Projeto 2
```

---

## Navegação

- [← Detecção de Comportamento](./behavior-detection.md)
- [Próximo: Resolução de Problemas →](./troubleshooting.md)
