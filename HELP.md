# HELP.md - Sistema de Ajuda do Claude Supervisor

Este arquivo contém todo o conteúdo do sistema de help da extensão.
O Claude Code deve usar este arquivo para gerar os arquivos individuais de help na pasta `help/`.

---

## Estrutura dos Arquivos de Help

Gerar os seguintes arquivos baseados neste conteúdo:

1. `help/getting-started.md` - Primeiros passos
2. `help/scope-manager.md` - Gestor de Escopo
3. `help/supervisors.md` - Sistema de Supervisores
4. `help/behavior-detection.md` - Detecção de Comportamento
5. `help/configuration.md` - Configuração
6. `help/troubleshooting.md` - Resolução de Problemas
7. `help/api-costs.md` - Custos e API
8. `help/commands.md` - Comandos e Atalhos

---

# CONTEÚDO: Getting Started (Primeiros Passos)

## Bem-vindo ao Claude Supervisor

O Claude Supervisor é uma extensão para VS Code que monitora o Claude Code em tempo real, detectando problemas, desvios de escopo e comportamentos indesejados antes que causem problemas no seu código.

### O Que o Claude Supervisor Faz?

1. **Intercepta o Pensamento do Claude Code**
   - Captura o "thinking" (raciocínio) do Claude Code em tempo real
   - Analisa antes que a resposta seja finalizada
   - Permite intervenção precoce

2. **Supervisiona com Regras Personalizadas**
   - Regras técnicas (segurança, padrões de código)
   - Regras de negócio (específicas do seu projeto)
   - Regras de comportamento (escopo, completude)

3. **Gerencia Escopo de Tarefas**
   - Rastreia o que foi pedido vs o que está sendo feito
   - Detecta quando Claude tenta reduzir o trabalho
   - Permite adicionar notas sem interromper o trabalho

### Requisitos

- VS Code 1.85 ou superior
- Node.js 18 ou superior
- Conta na Anthropic com API Key
- Claude Code CLI instalado

### Instalação Rápida

1. **Instale a extensão**
   - Abra VS Code
   - Vá em Extensions (Ctrl+Shift+X)
   - Busque "Claude Supervisor"
   - Clique em Install

2. **Configure sua API Key**
   - Clique no ícone 🧠 na barra lateral
   - Vá em Configuração
   - Cole sua API Key da Anthropic
   - Clique em Salvar

3. **Importe suas regras (opcional)**
   - Clique em "Importar de Documentos"
   - Arraste seus arquivos de especificação
   - O sistema gerará supervisores automaticamente

4. **Comece a usar**
   - Abra um terminal no VS Code
   - Execute o Claude Code normalmente
   - O supervisor começará a monitorar automaticamente

### Primeiro Uso

Quando você executar o Claude Code pela primeira vez com o supervisor ativo:

1. O ícone 🧠 ficará verde (🟢)
2. O painel mostrará "Conectado"
3. Você verá o thinking stream no Monitor
4. Alertas aparecerão se houver problemas

---

# CONTEÚDO: Scope Manager (Gestor de Escopo)

## O Que é o Gestor de Escopo?

O Gestor de Escopo rastreia o que você pediu para o Claude Code fazer versus o que ele está realmente fazendo.

### Por Que Usar?

Você já passou por isso?
- Pediu para refatorar 12 telas e o Claude só fez 3
- Adicionou requisitos durante o trabalho e eles foram esquecidos
- Claude disse "pronto" antes de terminar tudo

O Gestor de Escopo resolve esses problemas.

### Como Funciona

```
VOCÊ PEDE ──► GESTOR CAPTURA ──► MONITORA ──► ALERTA DESVIOS
                    │
                    ├── Tarefa principal
                    ├── Lista de itens
                    ├── Requisitos
                    └── Notas pendentes
```

### Elementos do Escopo

**Tarefa Ativa** - O objetivo principal do que você pediu
**Progresso** - Lista de itens com status (✅🔄⬜)
**Requisitos** - Especificações que devem ser atendidas
**Notas Pendentes** - Coisas para fazer depois

### Adicionando Notas sem Interromper

```
/nota Precisa ter histórico de alterações
```

O que acontece:
1. Nota é salva na lista
2. Claude Code NÃO é interrompido
3. Quando Claude terminar item atual, você é perguntado

### Verificação de Completude

Quando Claude diz "pronto", "terminei", "feito":
1. Gestor compara progresso atual com escopo
2. Se < 100%, alerta é disparado
3. Mostra lista do que falta

### Comandos do Gestor

| Comando | Descrição |
|---------|-----------|
| `/nota <texto>` | Adiciona nota sem interromper |
| `/escopo` | Mostra escopo atual no terminal |
| `/urgente <texto>` | Interrompe e injeta mensagem |

---

# CONTEÚDO: Supervisors (Sistema de Supervisores)

## O Que São Supervisores?

Supervisores são agentes de IA (Claude Haiku) que analisam o pensamento do Claude Code em tempo real.

### Hierarquia de Supervisores

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

### Tipos de Supervisores

**Router** - Classifica o tema (~50ms)
**Coordinator** - Agrupa relacionados (~50ms)
**Specialist** - Contém regras específicas (~100ms)

### Criando um Supervisor via YAML

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

### Severidades

| Severidade | Cor | Ação |
|------------|-----|------|
| Critical | 🔴 | Pode bloquear |
| High | 🟠 | Alerta destacado |
| Medium | 🟡 | Alerta normal |
| Low | 🔵 | Sugestão |

---

# CONTEÚDO: Behavior Detection (Detecção de Comportamento)

## O Que é Detecção de Comportamento?

Sistema que verifica o COMPORTAMENTO do Claude Code - se ele está tentando fazer menos do que foi pedido.

### Tipos de Comportamento Detectados

**1. Redução de Escopo**
Frases detectadas:
- "vou fazer só essa por enquanto"
- "começando pela principal"
- "as outras depois"

**2. Incompletude**
Detectado comparando progresso atual vs declaração de término.

**3. Procrastinação**
Frases detectadas:
- "deixo pra depois"
- "numa próxima iteração"

**4. Desvio de Escopo**
Quando Claude começa a fazer algo diferente do pedido.

### Configurando Detecção

No painel de Configuração:
- ☑️ Detectar redução de escopo
- ☑️ Exigir lista antes de refatoração
- ☑️ Detectar linguagem de procrastinação
- ☑️ Verificar completude no "pronto"
- ☐ Modo agressivo

---

# CONTEÚDO: Configuration (Configuração)

## API e Autenticação

**API Key da Anthropic**

Como obter:
1. Acesse console.anthropic.com
2. Vá em "API Keys"
3. Clique em "Create Key"
4. Copie a chave (começa com `sk-ant-`)

**Segurança**
- Chave armazenada criptografada
- Nunca enviada para outros servidores
- Só usada para API Anthropic

## Modelos de IA

**Supervisores:** Claude 3.5 Haiku (recomendado)
- Rápido (~200ms)
- Barato ($0.25/1M tokens)

**Configurador:** Claude Sonnet 4
- Mais inteligente
- Usado apenas na importação

## Comportamento

- Detectar redução de escopo ☑️
- Exigir lista antes de refatoração ☑️
- Detectar linguagem de procrastinação ☑️
- Verificar completude no "pronto" ☑️
- Modo agressivo ☐
- Buffer de notas: 10 segundos

## Limites

- Máximo chamadas/hora: 1000
- Alerta de custo diário: R$ 5,00
- Limite crítico diário: R$ 20,00

---

# CONTEÚDO: Troubleshooting (Resolução de Problemas)

## Problemas Comuns

### Sistema não conecta ao Claude Code

**Soluções:**
1. Verifique se Claude Code está rodando
2. Reinicie o Claude Code
3. Recarregue a janela VS Code
4. Verifique conflitos com outras extensões

### API Key inválida

**Soluções:**
1. Verifique se começa com `sk-ant-`
2. Verifique saldo no console Anthropic
3. Regenere a chave se necessário

### Alertas não aparecem

**Soluções:**
1. Verifique se há supervisores ativos (🟢)
2. Verifique se regras estão ativadas (☑️)
3. Teste com regra óbvia

### Performance lenta

**Soluções:**
1. Reduza número de supervisores
2. Use Haiku (não Sonnet)
3. Verifique conexão de rede

### Logs e Diagnóstico

```
Ctrl+Shift+P → "Developer: Open Extension Logs Folder"
```

Em settings.yaml, adicione `debug: true` para logs detalhados.

---

# CONTEÚDO: API Costs (Custos e API)

## Modelos e Preços

**Claude 3.5 Haiku:**
- Input: $0.25/1M tokens
- Output: $1.25/1M tokens
- Por chamada: ~$0.00019

**Claude Sonnet 4:**
- Input: $3/1M tokens
- Output: $15/1M tokens
- Por análise: ~$0.03

## Custo por Sessão (4 horas)

```
Chunks: ~500
Chamadas: ~1000
Custo: ~R$ 1,00 a R$ 1,50
```

## Custo Mensal Estimado

- Uso leve (2h/dia): R$ 20-30
- Uso médio (4h/dia): R$ 40-60
- Uso intenso (8h/dia): R$ 80-120

## Otimizando Custos

1. Use Haiku para tudo
2. Reduza supervisores
3. Aumente intervalo de análise
4. Use cache agressivo
5. Modo passivo para tarefas simples

## Configurando Limites

```
Máximo chamadas/hora: 1000
Alerta custo diário: R$ 5,00
Limite crítico: R$ 20,00
```

---

# CONTEÚDO: Commands (Comandos e Atalhos)

## Atalhos de Teclado

| Atalho | Comando |
|--------|---------|
| `Ctrl+Shift+S` | Toggle sistema |
| `Ctrl+Shift+N` | Adicionar nota |
| `Ctrl+Shift+R` | Adicionar regra |
| `Ctrl+Shift+E` | Mostrar escopo |

## Comandos de Terminal

| Comando | Descrição |
|---------|-----------|
| `/nota <texto>` | Nota sem interromper |
| `/escopo` | Mostra escopo atual |
| `/urgente <texto>` | Interrompe e injeta |
| `/regra <texto>` | Adiciona regra rápida |
| `/status` | Status dos supervisores |

## Command Palette

`Ctrl+Shift+P`:
- `Claude Supervisor: Toggle`
- `Claude Supervisor: Open Scope Manager`
- `Claude Supervisor: Open Supervisors`
- `Claude Supervisor: Open Monitor`
- `Claude Supervisor: Open Configuration`
- `Claude Supervisor: Add Note`
- `Claude Supervisor: Add Rule`
- `Claude Supervisor: Import Documents`

## Ações de Contexto

**No Editor (clique direito):**
- "Add as Rule Violation Example"

**No Painel de Supervisores:**
- Edit, Disable, Delete, View YAML

**No Painel de Escopo:**
- Mark Complete, Mark In Progress, Remove

---

# Instruções para Claude Code

## Gerando os Arquivos de Help

Claude Code deve gerar os arquivos individuais baseados neste documento.

### Comando

```bash
mkdir -p help
# Gerar cada arquivo com o conteúdo correspondente
```

### Estrutura de Cada Arquivo

```markdown
# Título

[← Voltar ao Índice](./index.md) | [Próximo →](./proximo.md)

## Conteúdo...

---

## Navegação
- [Índice](./index.md)
- [Outros links...]
```

### Arquivo de Índice (help/index.md)

```markdown
# Claude Supervisor - Ajuda

1. [Getting Started](./getting-started.md)
2. [Gestor de Escopo](./scope-manager.md)
3. [Supervisores](./supervisors.md)
4. [Detecção de Comportamento](./behavior-detection.md)
5. [Configuração](./configuration.md)
6. [Resolução de Problemas](./troubleshooting.md)
7. [Custos e API](./api-costs.md)
8. [Comandos](./commands.md)
```

---

*Este arquivo é a fonte única de verdade para o sistema de help.*
