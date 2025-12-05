# Resolução de Problemas

Guia para diagnóstico e solução de problemas comuns no Claude Supervisor.

## Problemas de Conexão

### "API Key não configurada"

**Sintoma:** Mensagem de erro ao tentar ativar o sistema.

**Solução:**
1. Abra o Command Palette (Ctrl+Shift+P)
2. Execute "Claude Supervisor: Open Configuration"
3. Insira sua API Key da Anthropic
4. Clique em "Salvar"
5. Tente ativar novamente

### "API Key inválida"

**Sintoma:** Erro ao fazer chamadas para a API.

**Solução:**
1. Verifique se a API Key está correta no [Console Anthropic](https://console.anthropic.com/)
2. Confirme que a chave tem permissões adequadas
3. Verifique se não há espaços extras na chave
4. Gere uma nova chave se necessário

### "Não foi possível conectar ao Claude Code"

**Sintoma:** Sistema ativo mas não detecta Claude Code.

**Solução:**
1. Verifique se o Claude Code está rodando
2. Reinicie o Claude Code
3. Desative e reative o Claude Supervisor
4. Verifique se há conflitos com outras extensões

## Problemas de Performance

### Sistema lento ou travando

**Possíveis causas:**
- Muitas chamadas à API
- Buffer de thinking muito pequeno
- Timeout insuficiente

**Solução:**
1. Aumente o `thinking_buffer_size` em `config/settings.yaml`
2. Verifique o limite de chamadas por hora
3. Reduza o número de supervisores ativos
4. Desative supervisores não essenciais

### Alto consumo de API

**Sintoma:** Custos mais altos que o esperado.

**Solução:**
1. Verifique estatísticas em Monitor
2. Aumente o intervalo de análise
3. Use cache mais agressivo
4. Configure limites diários

```yaml
# config/settings.yaml
analysis_interval: 500  # Aumentar para 500ms
cache:
  classification_ttl: 600000  # 10 minutos
```

## Problemas de Supervisores

### Supervisor não detecta violações

**Possíveis causas:**
- Keywords incorretas
- Regras mal configuradas
- Supervisor desativado

**Solução:**
1. Verifique keywords no YAML
2. Confirme que a regra está `enabled: true`
3. Teste com exemplos conhecidos
4. Verifique severidade (pode estar filtrando)

### Muitos falsos positivos

**Sintoma:** Alertas frequentes sem violação real.

**Solução:**
1. Refine as keywords do supervisor
2. Ajuste a descrição das regras
3. Aumente a especificidade do `check`
4. Considere criar sub-especialistas

### YAML não carrega

**Sintoma:** Configuração não é aplicada.

**Solução:**
1. Verifique sintaxe YAML (use validador online)
2. Confira indentação (usar espaços, não tabs)
3. Verifique que o arquivo está em `config/supervisors/`
4. Reinicie a extensão após mudanças

Exemplo de YAML válido:
```yaml
project: MeuProjeto
version: "1.0"

supervisors:
  - name: Exemplo
    type: specialist
    parent: Técnico
    keywords:
      - palavra1
      - palavra2
    rules:
      - id: regra-1
        description: "Descrição da regra"
        severity: medium
        check: "O que verificar"
        enabled: true
```

## Problemas de UI

### Painel não abre

**Sintoma:** Clique em painel não mostra conteúdo.

**Solução:**
1. Feche e reabra o VS Code
2. Desative e reative a extensão
3. Verifique o Developer Tools (Help > Toggle Developer Tools)
4. Procure erros no console

### Atualização não reflete

**Sintoma:** Mudanças não aparecem na interface.

**Solução:**
1. Clique no botão de atualizar no painel
2. Feche e reabra o painel
3. Execute "Developer: Reload Window"

### Ícone não aparece na sidebar

**Sintoma:** Extensão ativa mas sem ícone.

**Solução:**
1. Verifique se a extensão está instalada (Extensions)
2. Procure "Claude Supervisor" na lista de views
3. Clique com botão direito na Activity Bar > Claude Supervisor

## Problemas de Terminal

### Comandos não funcionam

**Sintoma:** Terminal não responde a comandos.

**Solução:**
1. Verifique se está usando o terminal correto (Claude Supervisor)
2. Use `/help` para ver comandos disponíveis
3. Verifique se há tarefa ativa para `/escopo`
4. Reinicie o terminal

### Terminal não abre

**Sintoma:** Comando Open Terminal não funciona.

**Solução:**
1. Verifique se outra extensão não está conflitando
2. Use o Command Palette: "Claude Supervisor: Open Terminal"
3. Feche todos os terminais e tente novamente

## Problemas de Escopo

### Progresso incorreto

**Sintoma:** Porcentagem não reflete o real.

**Solução:**
1. Verifique itens marcados em Gestor de Escopo
2. Atualize status dos itens manualmente
3. Use `/escopo` para ver estado atual

### Notas não persistem

**Sintoma:** Notas desaparecem entre sessões.

**Solução:**
1. Verifique se há tarefa ativa
2. Notas são vinculadas à tarefa atual
3. Verifique permissões de escrita no workspace

## Diagnóstico Avançado

### Logs de Debug

Ative logs detalhados:

```yaml
# config/settings.yaml
debug: true
```

### Developer Tools

1. Abra Help > Toggle Developer Tools
2. Vá para a aba Console
3. Filtre por "Claude Supervisor"
4. Procure mensagens de erro

### Verificar Estado Interno

Use o comando `/status` no terminal para ver:
- Supervisores ativos
- Estatísticas de chamadas
- Estado da hierarquia

### Resetar Configurações

Para resetar completamente:
1. Feche VS Code
2. Delete a pasta `.vscode/` no workspace
3. Delete `config/supervisors/*.yaml` (exceto default.yaml)
4. Reabra VS Code

## Reportando Bugs

Se o problema persistir:

1. Colete informações:
   - Versão do VS Code
   - Versão da extensão
   - Sistema operacional
   - Logs do Developer Tools

2. Crie uma issue em:
   https://github.com/seu-usuario/claude-supervisor-vscode/issues

3. Inclua:
   - Descrição do problema
   - Passos para reproduzir
   - Comportamento esperado vs atual
   - Screenshots se aplicável

## FAQ

**P: O sistema funciona offline?**
R: Não, requer conexão com a API Anthropic.

**P: Posso usar com outros modelos?**
R: Atualmente apenas Claude (Haiku/Sonnet) são suportados.

**P: Quanto custa usar?**
R: Cerca de R$ 30-40/mês com uso médio. Configure limites para controlar.

**P: Posso desativar supervisores específicos?**
R: Sim, via YAML (`enabled: false`) ou interface.

**P: O sistema vê meu código?**
R: Não, apenas analisa o "thinking" do Claude Code, não seu código-fonte.
