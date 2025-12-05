# Resolução de Problemas

[← Configuração](./configuration.md) | [Próximo: Custos e API →](./api-costs.md)

---

## Problemas Comuns

### Sistema não conecta ao Claude Code

**Sintomas:**
- Ícone permanece cinza (⚪)
- Status mostra "Desconectado"

**Soluções:**
1. Verifique se Claude Code está rodando
2. Reinicie o Claude Code
3. Recarregue a janela VS Code (`Ctrl+Shift+P` → "Reload Window")
4. Verifique conflitos com outras extensões

### API Key inválida

**Sintomas:**
- Status mostra "API Key inválida"
- Erros de autenticação nos logs

**Soluções:**
1. Verifique se começa com `sk-ant-`
2. Verifique saldo no console Anthropic
3. Regenere a chave se necessário
4. Verifique se não expirou

### Alertas não aparecem

**Sintomas:**
- Sistema conectado mas sem alertas
- Thinking aparece mas não é analisado

**Soluções:**
1. Verifique se há supervisores ativos (🟢)
2. Verifique se regras estão ativadas (☑️)
3. Teste com uma regra óbvia
4. Verifique os logs de erro

### Performance lenta

**Sintomas:**
- Alto delay na análise
- Interface travando

**Soluções:**
1. Reduza número de supervisores ativos
2. Use Haiku ao invés de Sonnet
3. Verifique conexão de rede
4. Aumente intervalo entre análises

## Logs e Diagnóstico

### Acessando os logs

```
Ctrl+Shift+P → "Developer: Open Extension Logs Folder"
```

### Ativando modo debug

Em `config/settings.yaml`, adicione:
```yaml
debug: true
```

### Informações de diagnóstico

No Monitor, você pode ver:
- Chunks processados
- Tempo de análise
- Erros recentes

## Resetando a Extensão

Se nada funcionar:

1. Desinstale a extensão
2. Delete a pasta `~/.claude-supervisor/`
3. Reinstale a extensão
4. Reconfigure a API Key

---

## Navegação

- [← Configuração](./configuration.md)
- [Próximo: Custos e API →](./api-costs.md)
