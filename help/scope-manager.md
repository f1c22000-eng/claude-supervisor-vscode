# Gestor de Escopo

[← Primeiros Passos](./getting-started.md) | [Próximo: Supervisores →](./supervisors.md)

---

## O Que é o Gestor de Escopo?

O Gestor de Escopo rastreia o que você pediu para o Claude Code fazer versus o que ele está realmente fazendo.

## Por Que Usar?

Você já passou por isso?
- Pediu para refatorar 12 telas e o Claude só fez 3
- Adicionou requisitos durante o trabalho e eles foram esquecidos
- Claude disse "pronto" antes de terminar tudo

O Gestor de Escopo resolve esses problemas.

## Como Funciona

```
VOCÊ PEDE ──► GESTOR CAPTURA ──► MONITORA ──► ALERTA DESVIOS
                    │
                    ├── Tarefa principal
                    ├── Lista de itens
                    ├── Requisitos
                    └── Notas pendentes
```

## Elementos do Escopo

| Elemento | Descrição |
|----------|-----------|
| **Tarefa Ativa** | O objetivo principal do que você pediu |
| **Progresso** | Lista de itens com status (✅🔄⬜) |
| **Requisitos** | Especificações que devem ser atendidas |
| **Notas Pendentes** | Coisas para fazer depois |

## Adicionando Notas sem Interromper

```
/nota Precisa ter histórico de alterações
```

**O que acontece:**
1. Nota é salva na lista
2. Claude Code **NÃO** é interrompido
3. Quando Claude terminar item atual, você é perguntado

## Verificação de Completude

Quando Claude diz "pronto", "terminei", "feito":
1. Gestor compara progresso atual com escopo
2. Se < 100%, alerta é disparado
3. Mostra lista do que falta

## Comandos do Gestor

| Comando | Descrição |
|---------|-----------|
| `/nota <texto>` | Adiciona nota sem interromper |
| `/escopo` | Mostra escopo atual no terminal |
| `/urgente <texto>` | Interrompe e injeta mensagem |

---

## Navegação

- [← Primeiros Passos](./getting-started.md)
- [Próximo: Supervisores →](./supervisors.md)
