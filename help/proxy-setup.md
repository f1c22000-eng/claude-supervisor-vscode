# Configuração do Proxy Reverso HTTP

O Claude Supervisor usa um proxy reverso HTTP para interceptar as requisições entre o Claude Code e a API da Anthropic, capturando os pensamentos (thinking) em tempo real.

## Como Funciona

1. Quando você ativa o Claude Supervisor, um servidor proxy reverso é iniciado na porta 8888
2. O Claude Code é configurado para enviar requisições HTTP para localhost:8888
3. O proxy recebe as requisições HTTP e encaminha via HTTPS para api.anthropic.com
4. As respostas SSE (Server-Sent Events) são parseadas para extrair os eventos de thinking
5. Os chunks de thinking são enviados para os supervisores para análise
6. A resposta é repassada integralmente ao Claude Code

## Uso

### Windows (PowerShell)

```powershell
$env:ANTHROPIC_BASE_URL="http://localhost:8888"; claude
```

### Windows (CMD)

```cmd
set ANTHROPIC_BASE_URL=http://localhost:8888 && claude
```

### Linux/macOS (Bash)

```bash
ANTHROPIC_BASE_URL=http://localhost:8888 claude
```

### Persistente (Linux/macOS)

Adicione ao seu `.bashrc` ou `.zshrc`:

```bash
alias claude-supervised='ANTHROPIC_BASE_URL=http://localhost:8888 claude'
```

### Persistente (Windows PowerShell)

Adicione ao seu `$PROFILE`:

```powershell
function claude-supervised { $env:ANTHROPIC_BASE_URL="http://localhost:8888"; claude $args }
```

## Verificação

Para verificar se o proxy está funcionando:

1. Abra o painel Monitor no Claude Supervisor
2. O status "Proxy Ativo" deve estar verde
3. Execute o Claude Code com a variável de ambiente configurada
4. Os thinking chunks devem aparecer no stream em tempo real

## Solução de Problemas

### Porta 8888 em uso

Se a porta 8888 estiver em uso, verifique qual processo está usando:

```bash
# Linux/macOS
lsof -i :8888

# Windows
netstat -ano | findstr :8888
```

### Proxy não intercepta

Verifique se:
1. O Claude Supervisor está ativo (ícone verde na status bar)
2. A variável ANTHROPIC_BASE_URL está definida corretamente
3. O Claude Code está usando a versão correta

### Requisições não chegam

Verifique:
1. Se o Claude Code realmente usa ANTHROPIC_BASE_URL
2. Se não há firewall bloqueando localhost:8888
3. Se outra variável (ANTHROPIC_API_URL, etc.) não está sobrescrevendo

## Arquitetura

```
┌─────────────────┐    HTTP     ┌──────────────────┐   HTTPS    ┌─────────────────────┐
│   Claude Code   │────────────►│  Proxy :8888     │───────────►│ api.anthropic.com   │
│                 │◄────────────│  (Reverse Proxy) │◄───────────│                     │
└─────────────────┘             └────────┬─────────┘            └─────────────────────┘
                                        │
                                        ▼
                             ┌──────────────────┐
                             │  SSE Parser      │
                             │  + Thinking      │
                             │    Extractor     │
                             └────────┬─────────┘
                                        │
                                        ▼
                             ┌──────────────────┐
                             │  Supervisor      │
                             │  Hierarchy       │
                             └──────────────────┘
```

## Fluxo de Dados

1. Claude Code envia requisição HTTP para `http://localhost:8888/v1/messages`
2. Proxy recebe a requisição (não criptografada - HTTP local)
3. Proxy encaminha via HTTPS para `https://api.anthropic.com/v1/messages`
4. Resposta SSE é recebida do servidor
5. Proxy parseia os eventos SSE
6. Eventos `thinking_delta` são extraídos e acumulados
7. Chunks são enviados para supervisores
8. Supervisores analisam usando Claude Haiku
9. Alertas são gerados se necessário
10. Resposta é repassada ao Claude Code

## Diferenças do Proxy HTTPS

A abordagem de proxy reverso HTTP é mais simples e confiável:

| Aspecto | Proxy HTTPS (MITM) | Proxy Reverso HTTP |
|---------|-------------------|-------------------|
| Certificados | Requer CA próprio | Não necessário |
| Configuração | Complexa | Simples |
| Segurança | Precisa instalar certificado | Apenas localhost |
| Interceptação | Difícil (criptografia) | Trivial (HTTP local) |
| Compatibilidade | Problemas frequentes | Funciona sempre |

## Segurança

O proxy reverso é seguro porque:

1. Só escuta em localhost (127.0.0.1) - não acessível externamente
2. O trecho HTTP é apenas local (dentro da mesma máquina)
3. A comunicação com api.anthropic.com continua sendo HTTPS
4. API key nunca é exposta na rede
