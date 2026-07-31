#!/usr/bin/env node
import * as store from "./store.js";
import * as switcher from "./switcher.js";
import * as credstore from "./credstore.js";
import { fetchUsage } from "./usage.js";
import { runDaemon } from "./daemon.js";
import * as launchd from "./launchd.js";
import { loadUserConfig, saveUserConfig } from "./userconfig.js";
import { STORE_PATH, WARN_PCT, SWITCH_PCT } from "./config.js";
import type { Usage } from "./types.js";

function hhmm(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function usageStr(u?: Usage, err?: string): string {
  if (err) return `erro: ${err}`;
  if (!u) return "—";
  return `sessão ${String(u.fiveHourPct).padStart(3)}%  ·  semana ${String(u.sevenDayPct).padStart(3)}%  (reset ${u.worstWindow} ${hhmm(u.resetsAt)})`;
}

function requireLabel(label: string | undefined, cmd: string): string {
  if (!label) {
    console.error(`Uso: ccswitch ${cmd} <label>`);
    process.exit(1);
  }
  return label;
}

async function cmdAdd(label: string): Promise<void> {
  const s = store.load();
  const acc = switcher.capture(s, label);
  const sub = acc.credentials.claudeAiOauth.subscriptionType ?? "?";
  console.log(`✅ Conta "${label}" registrada (plano: ${sub}).`);
  console.log(`   Store: ${STORE_PATH}`);
  if (s.activeLabel === label) console.log(`   Marcada como ativa.`);
}

function cmdList(): void {
  const s = store.load();
  if (s.accounts.length === 0) {
    console.log("Nenhuma conta registrada. Rode `ccswitch add <label>`.");
    return;
  }
  console.log(`Contas registradas (fonte: ${credstore.location()}):\n`);
  for (const a of s.accounts) {
    const active = a.label === s.activeLabel ? "● " : "  ";
    const sub = a.credentials.claudeAiOauth.subscriptionType ?? "?";
    console.log(`${active}${a.label.padEnd(16)} plano=${sub}`);
  }
}

async function cmdUse(label: string): Promise<void> {
  const s = store.load();
  const acc = store.find(s, label);
  if (!acc) {
    console.error(`Conta "${label}" não existe. Veja \`ccswitch list\`.`);
    process.exit(1);
  }
  switcher.apply(s, acc);
  console.log(`✅ Agora usando "${label}". Reinicie a sessão do Claude Code pra valer.`);
}

async function cmdCurrent(): Promise<void> {
  const s = store.load();
  if (!s.activeLabel) {
    console.log("Nenhuma conta marcada como ativa.");
    return;
  }
  console.log(`Conta ativa: ${s.activeLabel}`);
  const creds = credstore.read();
  const token = creds?.claudeAiOauth?.accessToken;
  if (!token) {
    console.log("Sem credencial no cofre.");
    return;
  }
  try {
    const u = await fetchUsage(token);
    console.log(`Uso: ${usageStr(u)}`);
    if (u.worstPct >= SWITCH_PCT) console.log("⚠️  No limite de troca.");
    else if (u.worstPct >= WARN_PCT) console.log("⚠️  Chegando perto do limite.");
  } catch (e) {
    console.log(`Não consegui consultar uso: ${(e as Error).message}`);
  }
}

async function cmdStatus(): Promise<void> {
  const s = store.load();
  if (s.accounts.length === 0) {
    console.log("Nenhuma conta registrada.");
    return;
  }
  const all = await switcher.usageForAll(s);
  console.log("Uso por conta:\n");
  for (const a of all) {
    const active = a.account.label === s.activeLabel ? "● " : "  ";
    console.log(`${active}${a.account.label.padEnd(16)} ${usageStr(a.usage, a.error)}`);
  }
  const best = switcher.pickBest(all, null);
  if (best) console.log(`\nMais folga: "${best.account.label}" (${best.usage!.worstPct}%).`);
  else console.log(`\nNenhuma conta abaixo de ${WARN_PCT}%.`);
}

function cmdRemove(label: string): void {
  const s = store.load();
  if (store.remove(s, label)) {
    store.save(s);
    console.log(`🗑️  Conta "${label}" removida do store.`);
  } else {
    console.error(`Conta "${label}" não existe.`);
    process.exit(1);
  }
}

function cmdConfig(key?: string, val?: string): void {
  const cfg = loadUserConfig();
  if (!key) {
    console.log("Configurações atuais:\n");
    console.log(`  autoSwitch        ${String(cfg.autoSwitch).padEnd(5)}  — troca automática ao bater o limite`);
    console.log(`  notifications     ${String(cfg.notifications).padEnd(5)}  — notificações nativas do macOS`);
    console.log(`  warmupAfterSwitch ${String(cfg.warmupAfterSwitch).padEnd(5)}  — envia "oi" após trocar de conta`);
    console.log(`  warnPct           ${String(cfg.warnPct).padEnd(5)}  — % pra notificar que está chegando perto`);
    console.log(`  switchPct         ${String(cfg.switchPct).padEnd(5)}  — % pra trocar de conta automaticamente`);
    console.log(`\nUso: ccswitch config <chave> <valor>`);
    console.log(`Ex:  ccswitch config autoSwitch false`);
    console.log(`Ex:  ccswitch config warnPct 70`);
    return;
  }
  if (!val) {
    console.error("Informe um valor.");
    process.exit(1);
  }

  const boolKeys = ["autoSwitch", "notifications", "warmupAfterSwitch"];
  const numKeys = ["warnPct", "switchPct"];

  if (boolKeys.includes(key)) {
    if (val !== "true" && val !== "false") {
      console.error('Valor deve ser "true" ou "false".');
      process.exit(1);
    }
    saveUserConfig({ [key]: val === "true" });
  } else if (numKeys.includes(key)) {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      console.error("Valor deve ser um número entre 1 e 100.");
      process.exit(1);
    }
    saveUserConfig({ [key]: n });
  } else {
    console.error(`Chave inválida. Opções: ${[...boolKeys, ...numKeys].join(", ")}`);
    process.exit(1);
  }

  console.log(`✅ ${key} = ${val}`);
  console.log("Daemon lê o config a cada ciclo — sem precisar reiniciar.");
}

function help(): void {
  const cfg = loadUserConfig();
  console.log(`ccswitch — troca automática de conta Claude Code por limite de uso

Comandos:
  add <label>        Registra a conta atualmente logada no Claude Code
  list               Lista as contas registradas (● = ativa)
  use <label>        Troca manualmente para a conta <label>
  current            Mostra a conta ativa e seu uso atual
  status             Mostra o uso de todas as contas registradas
  remove <label>     Remove uma conta do store
  config [chave] [valor]  Mostra ou altera configurações
  daemon             Roda o monitor em foreground (troca automática)
  daemon:install     Instala o daemon como LaunchAgent (inicia no login, macOS)
  daemon:uninstall   Remove o LaunchAgent
  help               Mostra esta ajuda

Config atual: autoSwitch=${cfg.autoSwitch} notifications=${cfg.notifications} warmup=${cfg.warmupAfterSwitch}
Thresholds (via env): CCSWITCH_WARN_PCT=${WARN_PCT} CCSWITCH_SWITCH_PCT=${SWITCH_PCT}`);
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "add":
      await cmdAdd(requireLabel(arg, "add"));
      break;
    case "list":
      cmdList();
      break;
    case "use":
      await cmdUse(requireLabel(arg, "use"));
      break;
    case "current":
      await cmdCurrent();
      break;
    case "status":
      await cmdStatus();
      break;
    case "remove":
      cmdRemove(requireLabel(arg, "remove"));
      break;
    case "daemon":
      await runDaemon();
      break;
    case "daemon:install":
      launchd.install();
      break;
    case "daemon:uninstall":
      launchd.uninstall();
      break;
    case "config":
      cmdConfig(arg, process.argv[4]);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      help();
      break;
    default:
      console.error(`Comando desconhecido: ${cmd}\n`);
      help();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error("Erro:", (e as Error).message);
  process.exit(1);
});
