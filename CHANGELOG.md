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

## [1.1.0] - 2024-12-05

### Adicionado

#### Supervisores Core (Sempre Ativos)
- **7 supervisores de auto-supervisão** que monitoram o próprio Claude Code
- Campo `always_active: true` no YAML para supervisores que não podem ser desativados
- Campo `load_priority` para controle de ordem de carregamento
- Ícone de cadeado 🔒 na árvore de supervisores para supervisores sempre ativos
- Proteção contra desativação de supervisores core via UI

#### Supervisores Implementados
- `Verificador.Conclusao` - Detecta "pronto" sem evidência de teste
- `Verificador.DadosReais` - Detecta valores hardcoded que deveriam ser calculados
- `Verificador.EsforcoCompleto` - Detecta redução de escopo ("versão simplificada")
- `Verificador.Teste` - Exige teste após implementação
- `Verificador.Integracao` - Verifica se componentes estão conectados
- `Verificador.Requisitos` - Detecta requisitos adiados ou esquecidos
- `Verificador.Documentacao` - Verifica se documentação acompanha mudanças

#### Painel de Importação (Reescrito)
- Seleção de arquivos via file picker (PDF, DOCX, MD, YAML)
- Análise real usando Claude Sonnet via Configurator
- Preview da hierarquia gerada antes de aplicar
- Botão "Aplicar" que adiciona supervisores à hierarquia

#### Monitor
- Botão pausar/continuar stream funcional
- Botão copiar thinking para clipboard
- Botão exportar histórico (JSON)
- Estado `streamPaused` para controle do stream

#### Sidebar
- Contador de chunks corrigido para usar `chunksProcessed`
- Botão toggle com texto dinâmico ("Desativar"/"Ativar")
- Sincronização de estado entre painéis via eventos

#### Sistema de Prompts
- `CONFIGURATOR_SYSTEM_PROMPT` para análise de documentos
- `BEHAVIOR_SUPERVISOR_PROMPT` para detecção comportamental
- `CORE_BEHAVIOR_ANALYSIS_PROMPT` para análise de thinking
- Prompts específicos: CONCLUSION_CHECK, HARDCODE_CHECK, SCOPE_REDUCTION, TEST_CHECK

### Corrigido
- Import panel era apenas placeholder - agora funcional
- Botões do monitor sem handlers - adicionados
- Sidebar chunks counter mostrava valor errado
- Sidebar botão não mudava texto dinamicamente

### Limitações Conhecidas
- Drag-and-drop não funciona em WebViews do VS Code (limitação da plataforma)
- Workaround: usar file picker em vez de arrastar arquivos

## [Unreleased]

### Planejado
- Métricas de sessão expandidas
- Dashboard de custos histórico
- Integração com Git para contexto
- Modo offline com cache local
