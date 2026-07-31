import { homedir } from "node:os";
import { join } from "node:path";

/** Diretório e arquivo onde guardamos as contas registradas. */
export const CONFIG_DIR = join(homedir(), ".config", "ccswitch");
export const STORE_PATH = join(CONFIG_DIR, "accounts.json");
export const USAGE_CACHE_PATH = join(CONFIG_DIR, "usage-cache.json");
export const USER_CONFIG_PATH = join(CONFIG_DIR, "config.json");

/** Arquivo de credenciais do Claude Code no Linux/WSL (no macOS é o Keychain). */
export const LINUX_CREDS_PATH = join(homedir(), ".claude", ".credentials.json");

/** Nome do item genérico no Keychain do macOS. */
export const KEYCHAIN_SERVICE = "Claude Code-credentials";

/** Endpoint de uso (mesmo que o `/usage` do Claude Code consulta). */
export const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
export const OAUTH_BETA_HEADER = "oauth-2025-04-20";

/** Lê um número de env com fallback. */
function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Percentual em que avisamos que está chegando perto do limite. */
export const WARN_PCT = envNum("CCSWITCH_WARN_PCT", 80);
/** Percentual em que trocamos de conta automaticamente. */
export const SWITCH_PCT = envNum("CCSWITCH_SWITCH_PCT", 95);
/** Intervalo entre verificações do daemon (ms). Padrão 2 min — folgado o
 *  bastante pra não esbarrar no rate limit do endpoint de uso. */
export const POLL_MS = envNum("CCSWITCH_POLL_MS", 120_000);
