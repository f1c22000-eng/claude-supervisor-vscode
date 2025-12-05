# Primeiros Passos

[← Índice](./index.md) | [Próximo: Gestor de Escopo →](./scope-manager.md)

---

## Bem-vindo ao Claude Supervisor

O Claude Supervisor é uma extensão para VS Code que monitora o Claude Code em tempo real, detectando problemas, desvios de escopo e comportamentos indesejados antes que causem problemas no seu código.

## O Que o Claude Supervisor Faz?

### 1. Intercepta o Pensamento do Claude Code
- Captura o "thinking" (raciocínio) do Claude Code em tempo real
- Analisa antes que a resposta seja finalizada
- Permite intervenção precoce

### 2. Supervisiona com Regras Personalizadas
- Regras técnicas (segurança, padrões de código)
- Regras de negócio (específicas do seu projeto)
- Regras de comportamento (escopo, completude)

### 3. Gerencia Escopo de Tarefas
- Rastreia o que foi pedido vs o que está sendo feito
- Detecta quando Claude tenta reduzir o trabalho
- Permite adicionar notas sem interromper o trabalho

## Requisitos

- VS Code 1.85 ou superior
- Node.js 18 ou superior
- Conta na Anthropic com API Key
- Claude Code CLI instalado

## Instalação Rápida

### 1. Instale a extensão
- Abra VS Code
- Vá em Extensions (Ctrl+Shift+X)
- Busque "Claude Supervisor"
- Clique em Install

### 2. Configure sua API Key
- Clique no ícone 🧠 na barra lateral
- Vá em Configuração
- Cole sua API Key da Anthropic
- Clique em Salvar

### 3. Importe suas regras (opcional)
- Clique em "Importar de Documentos"
- Arraste seus arquivos de especificação
- O sistema gerará supervisores automaticamente

### 4. Comece a usar
- Abra um terminal no VS Code
- Execute o Claude Code normalmente
- O supervisor começará a monitorar automaticamente

## Primeiro Uso

Quando você executar o Claude Code pela primeira vez com o supervisor ativo:

1. O ícone 🧠 ficará verde (🟢)
2. O painel mostrará "Conectado"
3. Você verá o thinking stream no Monitor
4. Alertas aparecerão se houver problemas

---

## Navegação

- [← Índice](./index.md)
- [Próximo: Gestor de Escopo →](./scope-manager.md)
