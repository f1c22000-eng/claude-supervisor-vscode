# Comandos e Atalhos

[← Custos e API](./api-costs.md) | [Índice](./index.md)

---

## Atalhos de Teclado

| Atalho | Comando |
|--------|---------|
| `Ctrl+Shift+S` | Toggle sistema (ligar/desligar) |
| `Ctrl+Shift+N` | Adicionar nota rápida |
| `Ctrl+Shift+R` | Adicionar regra rápida |
| `Ctrl+Shift+E` | Mostrar escopo atual |

> **Nota:** No Mac, substitua `Ctrl` por `Cmd`.

## Comandos de Terminal

Quando o Claude Code está ativo, você pode usar:

| Comando | Descrição |
|---------|-----------|
| `/nota <texto>` | Adiciona nota sem interromper o Claude |
| `/escopo` | Mostra escopo atual no terminal |
| `/urgente <texto>` | Interrompe Claude e injeta mensagem |
| `/regra <texto>` | Adiciona regra rápida |
| `/status` | Mostra status dos supervisores |

### Exemplos

```bash
# Adicionar uma nota para depois
/nota Verificar se precisa migração de dados

# Ver o escopo atual
/escopo

# Adicionar requisito urgente
/urgente Precisa validar CPF também

# Adicionar regra temporária
/regra Não usar console.log em produção

# Ver status
/status
```

## Command Palette

Acesse com `Ctrl+Shift+P` (ou `Cmd+Shift+P` no Mac):

| Comando | Descrição |
|---------|-----------|
| `Claude Supervisor: Toggle` | Ligar/desligar sistema |
| `Claude Supervisor: Open Scope Manager` | Abrir gestor de escopo |
| `Claude Supervisor: Open Supervisors` | Abrir painel de supervisores |
| `Claude Supervisor: Open Monitor` | Abrir monitor em tempo real |
| `Claude Supervisor: Open Configuration` | Abrir configurações |
| `Claude Supervisor: Add Note` | Adicionar nota |
| `Claude Supervisor: Add Rule` | Adicionar regra |
| `Claude Supervisor: Import Documents` | Importar documentos |

## Ações de Contexto

### No Editor (clique direito)
- "Add as Rule Violation Example" - Usar seleção como exemplo de violação

### No Painel de Supervisores
- Edit - Editar supervisor/regra
- Disable - Desativar temporariamente
- Delete - Excluir
- View YAML - Ver configuração

### No Painel de Escopo
- Mark Complete - Marcar item como completo
- Mark In Progress - Marcar item como em andamento
- Remove - Remover item

## Dicas

### Notas vs Requisitos
- **Nota:** Não interrompe, fica pendente para depois
- **Requisito:** Pode interromper se marcado como urgente

### Modo Agressivo
Se ativado, comandos de alerta interrompem imediatamente o Claude ao invés de apenas mostrar notificação.

---

## Navegação

- [← Custos e API](./api-costs.md)
- [Índice](./index.md)
