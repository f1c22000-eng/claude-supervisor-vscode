# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2024-12-05

### Adicionado

#### Core
- Sistema de interceptação de Claude Code para captura de "thinking"
- Parser de streaming SSE para eventos `thinking_delta` e `text_delta`
- Buffer de thinking com threshold configurável
- Cliente API Anthropic com retry, rate limiting e cache
- Gerenciamento de custos com alertas e limites

#### Supervisores
- Hierarquia de supervisores: Router → Coordinator → Specialist
- Supervisor de comportamento para detecção de:
  - Redução de escopo ("por enquanto", "só essa", "primeiro só")
  - Procrastinação ("deixo pra depois", "numa próxima")
  - Incompletude (comparação de progresso vs escopo)
- Carregamento de configuração YAML
- Hot reload de configurações
- Cache de classificações (TTL 5min)

#### Gestor de Escopo
- Rastreamento de tarefas e itens
- Gerenciamento de requisitos (original/adicionado)
- Sistema de notas com buffer e ações
- Tracking de progresso com alertas
- Extração automática de escopo de mensagens
- Persistência de estado entre sessões

#### Interface
- Painel sidebar com resumo do sistema
- Painel de Gestor de Escopo detalhado
- Painel de Supervisores com visualização em árvore
- Painel de Monitor em tempo real
- Painel de Configuração completo
- Painel de Importação de documentos
- Sistema de Help integrado

#### Terminal
- Comandos: `/nota`, `/escopo`, `/regra`, `/urgente`, `/status`
- Comandos auxiliares: `/help`, `/clear`
- Terminal pseudo-interativo com cores ANSI

#### Configuração
- Suporte a YAML para configuração de supervisores
- Configurações via VS Code settings
- Armazenamento seguro de API Key

#### Documentação
- Sistema de help contextual
- Documentação de API e arquitetura
- Guias de início rápido e troubleshooting

### Segurança
- API Key armazenada com SecretStorage
- Validação de inputs em comandos
- Sem coleta de telemetria

## [Unreleased]

### Planejado
- Métricas de sessão expandidas
- Dashboard de custos histórico
- Integração com Git para contexto
- Modo offline com cache local

### Implementado (não lançado)
- ✅ Suporte a PDF e DOCX no importador
- ✅ Modelos e preços configuráveis via UI
- ✅ Comando addRule com wizard de severidade
- ✅ Persistência de histórico de alertas
