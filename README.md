# ccswitch

Troca **automaticamente** a conta do Claude Code quando o limite de uso chega perto, com **notificação nativa do macOS**. Um daemon fica monitorando o consumo; ao passar do limite, ele troca para a conta com mais folga e te avisa.

## Como funciona

O Claude Code guarda as credenciais da conta logada num "cofre":

- **macOS**: no Keychain (item `Claude Code-credentials`).
- **Linux/WSL**: no arquivo `~/.claude/.credentials.json`.

O `ccswitch` guarda o blob de credenciais de **cada** conta num store próprio (`~/.config/ccswitch/accounts.json`, permissão `600`). Trocar de conta = escrever o blob da conta escolhida de volta no cofre.

Para medir o consumo, ele consulta o **mesmo endpoint** que o comando `/usage` do Claude Code usa (`/api/oauth/usage`), que devolve o percentual usado nas janelas de **5 horas** e **7 dias**.

## Instalação

```bash
npm install
npm run build
npm link   # opcional: deixa o comando `ccswitch` global
```

Sem `npm link`, use `node dist/cli.js <comando>`.

## Uso

```bash
# 1. Logue no Claude Code com a 1ª conta, depois registre-a:
ccswitch add pessoal

# 2. Troque o login do Claude Code para a 2ª conta (claude /login) e registre:
ccswitch add trabalho

# Ver contas e uso
ccswitch list
ccswitch status      # uso de todas as contas
ccswitch current     # conta ativa + uso

# Trocar manualmente
ccswitch use pessoal

# Rodar o monitor automático em foreground
ccswitch daemon

# Instalar como serviço que sobe no login (macOS)
ccswitch daemon:install
ccswitch daemon:uninstall
```

## Configuração (variáveis de ambiente)

| Var | Padrão | O que faz |
|---|---|---|
| `CCSWITCH_WARN_PCT` | `80` | % em que **notifica** que está chegando perto |
| `CCSWITCH_SWITCH_PCT` | `95` | % em que **troca** de conta automaticamente |
| `CCSWITCH_POLL_MS` | `120000` | intervalo entre verificações (2 min) |

## Limitação importante

Uma sessão do Claude Code **já aberta** lê o token no início. Trocar a conta afeta com certeza as **próximas** sessões — por isso, ao trocar, o daemon te avisa para reiniciar a sessão atual (`/exit` e reabrir, ou nova aba).

## Segurança

O arquivo `~/.config/ccswitch/accounts.json` contém `refreshToken` das suas contas. Ele é criado com permissão `600` (só você lê) e **nunca** deve ser commitado — o `.gitignore` já cobre isso.
