import { execFile } from "node:child_process";
import * as credstore from "./credstore.js";
import * as store from "./store.js";
import * as switcher from "./switcher.js";
import { fetchUsage, UsageError } from "./usage.js";
import { notify } from "./notify.js";
import { loadUserConfig } from "./userconfig.js";
import { WARN_PCT, SWITCH_PCT, POLL_MS } from "./config.js";
// warnPct e switchPct são lidos do userconfig a cada tick (configuráveis em runtime).

/** Formata um ISO timestamp como HH:MM local. */
function hhmm(iso: string | null | undefined): string {
  if (!iso) return "?";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Envia uma mensagem de "oi" via claude CLI pra aquecer a sessão após troca. */
function warmup(): void {
  // LaunchAgent tem PATH limitado — procura o binário em locais comuns.
  const candidates = [
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    process.env.HOME ? `${process.env.HOME}/.npm-global/bin/claude` : "",
  ].filter(Boolean);

  const bin = candidates.find((p) => {
    try { return require("node:fs").existsSync(p); } catch { return false; }
  }) ?? "claude";

  execFile(bin, ["--print", "oi"], { timeout: 30_000 }, (err) => {
    if (err) console.warn("[ccswitch] warmup falhou (não crítico):", err.message);
    else console.log("[ccswitch] warmup enviado.");
  });
}

/**
 * Guarda qual resetsAt já foi notificado como "todas no limite".
 * Evita chamar usageForAll + notificar toda tick enquanto não há reset.
 */
let allLimitedUntil: string | null = null;

async function tick(warned: Set<string>): Promise<void> {
  const cfg = loadUserConfig();
  const s = store.load();
  if (!s.activeLabel) {
    console.log("[ccswitch] nenhuma conta ativa; rode `ccswitch add <label>`.");
    return;
  }

  const creds = credstore.read();
  const token = creds?.claudeAiOauth?.accessToken;
  if (!token) {
    console.log("[ccswitch] sem credencial no cofre; pulando ciclo.");
    return;
  }

  let usage;
  try {
    usage = await fetchUsage(token);
  } catch (e) {
    if (e instanceof UsageError && e.status === 401) {
      if (cfg.notifications) {
        notify("Token inválido", `Conta ${s.activeLabel} retornou 401. Talvez precise relogar.`);
      }
    } else {
      console.error("[ccswitch] erro ao consultar uso:", (e as Error).message);
    }
    return;
  }

  // Persiste o último uso conhecido da conta ativa — usado por outras contas inativas.
  const activeAccount = store.find(s, s.activeLabel);
  if (activeAccount) {
    activeAccount.lastUsage = { ...usage, savedAt: new Date().toISOString() };
    store.save(s);
  }

  const { worstPct, worstWindow, resetsAt, severity } = usage;
  const breakdown = `sessão ${usage.fiveHourPct}% · semana ${usage.sevenDayPct}%`;
  console.log(`[ccswitch] ${s.activeLabel}: ${breakdown} (severity=${severity})`);

  const warnPct = cfg.warnPct;
  const switchPct = cfg.switchPct;

  // Rearma o aviso quando o uso cai (após reset ou troca).
  if (worstPct < warnPct) warned.delete(s.activeLabel);

  if (!cfg.autoSwitch && !cfg.notifications) return;

  const mustSwitch = worstPct >= switchPct || severity === "critical";

  if (mustSwitch) {
    if (!cfg.autoSwitch) {
      if (cfg.notifications && !warned.has(s.activeLabel)) {
        warned.add(s.activeLabel);
        notify(
          "Limite atingido (troca desativada)",
          `"${s.activeLabel}": ${breakdown}. Auto-switch desativado.`,
        );
      }
      return;
    }

    // Se já sabemos que todas estão no limite e o reset ainda não chegou, não
    // consulta de novo (evita N chamadas à API + 429 a cada tick).
    if (allLimitedUntil && new Date(allLimitedUntil) > new Date()) {
      console.log(`[ccswitch] todas no limite até ${hhmm(allLimitedUntil)}, aguardando reset.`);
      return;
    }
    allLimitedUntil = null;

    const all = await switcher.usageForAll(s);
    const best = switcher.pickBest(all, s.activeLabel);

    if (best) {
      allLimitedUntil = null;
      const from = s.activeLabel;
      warned.delete(from);
      switcher.apply(s, best.account);
      if (cfg.notifications) {
        notify(
          "Troquei de conta",
          `"${from}" bateu o limite de ${worstWindow} (${worstPct}%). Agora usando "${best.account.label}" (${best.usage!.worstWindow} ${best.usage!.worstPct}%). Reinicie a sessão.`,
        );
      }
      if (cfg.warmupAfterSwitch) warmup();
    } else {
      const resets = all
        .map((a) => a.usage?.resetsAt)
        .filter((x): x is string => !!x);
      if (resetsAt) resets.push(resetsAt);
      const nextReset = resets.sort()[0] ?? null;
      allLimitedUntil = nextReset;
      if (cfg.notifications) {
        notify(
          "Todas as contas no limite",
          `Nenhuma conta com folga. Próximo reset por volta de ${hhmm(nextReset)}.`,
        );
      }
    }
    return;
  }

  // Se uso voltou ao normal, rearma o allLimitedUntil.
  allLimitedUntil = null;

  if (worstPct >= warnPct && cfg.notifications) {
    if (!warned.has(s.activeLabel)) {
      warned.add(s.activeLabel);
      notify(
        "Chegando no limite",
        `"${s.activeLabel}": ${breakdown}. Limite de ${worstWindow} em ${worstPct}% (reset ~${hhmm(resetsAt)}).`,
      );
    }
  }
}

export async function runDaemon(): Promise<void> {
  console.log(
    `[ccswitch] daemon iniciado. poll=${POLL_MS}ms warn=${WARN_PCT}% switch=${SWITCH_PCT}%`,
  );
  const warned = new Set<string>();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick(warned);
    } catch (e) {
      console.error("[ccswitch] erro inesperado no ciclo:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
