# Contribuindo para o Claude Supervisor

Obrigado pelo interesse em contribuir com o Claude Supervisor! Este documento fornece diretrizes para contribuições.

## Código de Conduta

Este projeto adota um código de conduta para garantir um ambiente acolhedor. Seja respeitoso e construtivo em todas as interações.

## Como Contribuir

### Reportando Bugs

1. Verifique se o bug já não foi reportado nas [Issues](https://github.com/f1c22000-eng/claude-supervisor-vscode/issues)
2. Se não encontrar, crie uma nova issue com:
   - Descrição clara do problema
   - Passos para reproduzir
   - Comportamento esperado vs atual
   - Versão do VS Code e extensão
   - Screenshots se aplicável

### Sugerindo Funcionalidades

1. Verifique se a sugestão já não existe nas Issues
2. Crie uma issue com a tag `enhancement`
3. Descreva:
   - O problema que a funcionalidade resolve
   - Como você imagina que funcionaria
   - Alternativas consideradas

### Enviando Pull Requests

1. Fork o repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Faça commits atômicos com mensagens descritivas
4. Adicione testes se aplicável
5. Garanta que o código compila (`npm run compile`)
6. Envie o PR para a branch `main`

## Ambiente de Desenvolvimento

### Pré-requisitos

- Node.js 18+
- VS Code 1.85+
- npm 9+

### Setup

```bash
# Clone o repositório
git clone https://github.com/f1c22000-eng/claude-supervisor-vscode.git
cd claude-supervisor-vscode

# Instale dependências
npm install

# Compile
npm run compile

# Inicie em modo watch
npm run watch
```

### Testando Localmente

1. Abra o projeto no VS Code
2. Pressione F5 para iniciar o Extension Development Host
3. Uma nova janela do VS Code abrirá com a extensão carregada
4. Teste suas alterações

### Estrutura do Projeto

```
src/
├── core/               # Módulos principais
│   ├── api.ts          # Cliente Anthropic
│   ├── config.ts       # Gerenciador de configurações
│   ├── configurator.ts # Configurador automático
│   ├── constants.ts    # Constantes do sistema
│   └── types.ts        # Definições TypeScript
├── interceptor/        # Captura de Claude Code
│   ├── interceptor-manager.ts
│   ├── stream-parser.ts
│   └── thinking-buffer.ts
├── supervisors/        # Sistema de supervisores
│   ├── behavior/       # Supervisor de comportamento
│   ├── config-loader.ts
│   ├── coordinator.ts
│   ├── hierarchy.ts
│   ├── router.ts
│   ├── specialist.ts
│   └── supervisor-node.ts
├── scope/              # Gestor de escopo
│   ├── note.ts
│   ├── progress-tracker.ts
│   ├── requirement.ts
│   ├── scope-manager.ts
│   └── task.ts
├── terminal/           # Comandos de terminal
│   └── terminal-handler.ts
├── ui/                 # Painéis e WebViews
│   ├── config-panel.ts
│   ├── help-provider.ts
│   ├── import-panel.ts
│   ├── monitor-panel.ts
│   ├── scope-panel.ts
│   ├── sidebar-provider.ts
│   └── supervisors-panel.ts
└── extension.ts        # Ponto de entrada
```

## Padrões de Código

### TypeScript

- Use strict mode
- Prefira `const` sobre `let`
- Use tipos explícitos para parâmetros de função
- Documente funções públicas com JSDoc

### Commits

Siga o formato:

```
tipo(escopo): descrição curta

Descrição longa opcional explicando o "porquê" da mudança.

Fixes #123
```

Tipos:
- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `docs`: Documentação
- `style`: Formatação
- `refactor`: Refatoração
- `test`: Testes
- `chore`: Manutenção

### Branches

- `main`: Branch principal, estável
- `feature/*`: Novas funcionalidades
- `fix/*`: Correções de bugs
- `docs/*`: Atualizações de documentação

## Testes

### Executando Testes

```bash
# Testes unitários (quando implementados)
npm test

# Lint
npm run lint
```

### Testes Manuais

Sempre teste:
1. Ativação/desativação do sistema
2. Todos os comandos de terminal
3. Cada painel WebView
4. Configurações persistem entre sessões
5. Hot reload de YAMLs

## Revisão de Código

Pull requests passam por revisão antes de merge. Critérios:

- [ ] Código compila sem erros
- [ ] Sem regressões em funcionalidades existentes
- [ ] Segue padrões de código do projeto
- [ ] Documentação atualizada se necessário
- [ ] Commits bem estruturados

## Releases

Releases seguem semantic versioning:

- **MAJOR**: Mudanças incompatíveis
- **MINOR**: Novas funcionalidades compatíveis
- **PATCH**: Correções de bugs

## Dúvidas?

Abra uma issue com a tag `question` ou entre em contato pelos canais do projeto.

---

Obrigado por contribuir!
