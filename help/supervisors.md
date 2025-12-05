# Sistema de Supervisores

[← Gestor de Escopo](./scope-manager.md) | [Próximo: Detecção de Comportamento →](./behavior-detection.md)

---

## O Que São Supervisores?

Supervisores são agentes de IA (Claude Haiku) que analisam o pensamento do Claude Code em tempo real.

## Hierarquia de Supervisores

```
Router (classifica o tema)
│
├── Técnico
│   ├── Frontend
│   ├── Segurança
│   └── Arquitetura
│
├── Negócio
│   ├── Projeto1
│   └── Projeto2
│
└── Comportamento
    ├── Completude
    └── Escopo
```

## Tipos de Supervisores

| Tipo | Função | Tempo |
|------|--------|-------|
| **Router** | Classifica o tema | ~50ms |
| **Coordinator** | Agrupa relacionados | ~50ms |
| **Specialist** | Contém regras específicas | ~100ms |

## Criando um Supervisor via YAML

```yaml
name: MeuProjeto.Estoque
type: specialist
parent: Negocio.MeuProjeto
keywords:
  - estoque
  - quantidade
  - reserva
rules:
  - id: estoque-negativo
    description: "Estoque nunca pode ficar negativo"
    severity: critical
    check: "Verificar saldo >= quantidade"
```

## Severidades

| Severidade | Cor | Ação |
|------------|-----|------|
| **Critical** | 🔴 | Pode bloquear |
| **High** | 🟠 | Alerta destacado |
| **Medium** | 🟡 | Alerta normal |
| **Low** | 🔵 | Sugestão |

## Fluxo de Análise

```
Thinking Chunk
     │
     ▼
   Router ──► "Qual área?"
     │
     ▼
 Coordinator ──► "Qual sub-área?"
     │
     ▼
 Specialist ──► "Viola regra?"
     │
     ▼
[OK] ou [ALERTA]
```

---

## Navegação

- [← Gestor de Escopo](./scope-manager.md)
- [Próximo: Detecção de Comportamento →](./behavior-detection.md)
