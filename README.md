# ccswitch

Troca **automaticamente** a conta do Claude Code quando o limite de uso chega perto, com **notificação nativa do macOS**. Um daemon fica monitorando o consumo em background; ao passar do limite, ele troca para a conta com mais folga e te avisa.

## Como funciona

O Claude Code guarda as credenciais da conta logada num "cofre":

- **macOS**: no Keychain (item `Claude Code-credentials`)
- **Linux/WSL**: no arquivo `~/.claude/.credentials.json`

O `ccswitch` salva o blob de credenciais de **cada** conta num store próprio (`~/.config/ccswitch/accounts.json`, permissão `600`). Trocar de conta = escrever o blob da conta escolhida de volta no cofre.

Para medir o consumo, ele consulta o **mesmo endpoint** que o comando `/usage` do Claude Code usa (`/api/oauth/usage`), retornando o percentual usado nas janelas de **5 horas** (sessão) e **7 dias** (semanal).

## Requisitos

- Node.js ≥ 20
- Claude Code instalado (`npm i -g @anthropic-ai/claude-code`)
- macOS ou Linux/WSL

## Instalação

```bash
git clone https://github.com/JonasJesus42/change-account-claude.git
cd change-account-claude
npm install
npm run build
npm link        # disponibiliza o comando `ccswitch` globalmente
```

## Setup inicial (registrar as contas)

> **Importante:** nunca use `/logout` para trocar de conta — isso invalida o token. Use sempre `ccswitch use <label>` + reinicie a sessão.

**Passo 1** — Com a 1ª conta já logada no Claude Code, registre-a:

```bash
ccswitch add conta1
```

**Passo 2** — Para registrar a 2ª conta, faça `/login` dentro do Claude Code com ela (sem `/logout` antes, se possível use uma nova janela/aba). Depois:

```bash
ccswitch add conta2
```

**Passo 3** — Volte para a conta que quer usar agora:

```bash
ccswitch use conta1
```
Reinicie a sessão do Claude Code para ela assumir a nova conta.

**Passo 4** — Instale o daemon (sobe automaticamente no login):

```bash
ccswitch daemon:install
```

Pronto. O daemon monitora a cada 2 minutos e troca sozinho quando o limite chega.

## Comandos

```bash
ccswitch add <label>       # registra a conta atualmente logada
ccswitch list              # lista as contas (● = ativa)
ccswitch use <label>       # troca manualmente de conta
ccswitch current           # conta ativa + uso atual
ccswitch status            # uso de todas as contas registradas
ccswitch remove <label>    # remove uma conta do store
ccswitch config            # mostra as configurações
ccswitch config <chave> <valor>  # altera uma configuração
ccswitch daemon            # roda o monitor em foreground
ccswitch daemon:install    # instala como LaunchAgent (macOS)
ccswitch daemon:uninstall  # remove o LaunchAgent
```

## Configuração

```bash
ccswitch config warnPct 80          # % pra notificar que está chegando perto (padrão: 80)
ccswitch config switchPct 95        # % pra trocar de conta (padrão: 95)
ccswitch config autoSwitch false    # desativa troca automática (só notifica)
ccswitch config notifications false # desativa notificações do macOS
ccswitch config warmupAfterSwitch false  # desativa mensagem de warmup após troca
```

O daemon lê o config a cada ciclo — não precisa reiniciar para aplicar.

Variáveis de ambiente também funcionam (sobrescrevem os padrões):

| Var | Padrão | O que faz |
|---|---|---|
| `CCSWITCH_WARN_PCT` | `80` | % em que notifica |
| `CCSWITCH_SWITCH_PCT` | `95` | % em que troca |
| `CCSWITCH_POLL_MS` | `120000` | intervalo entre verificações (ms) |

## Limitação importante

Uma sessão do Claude Code **já aberta** lê o token na inicialização. Ao trocar de conta, o daemon avisa para reiniciar a sessão atual — só a próxima sessão vai usar a nova conta.

## Segurança

O arquivo `~/.config/ccswitch/accounts.json` contém os `refreshToken` das suas contas. Ele é criado com permissão `600` (só o dono lê) e **nunca** deve ser commitado — o `.gitignore` já cobre isso.
