import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CONFIG_DIR, USER_CONFIG_PATH } from "./config.js";

export interface UserConfig {
  /** Troca automática de conta quando o limite é atingido. Padrão: true. */
  autoSwitch: boolean;
  /** Notificações nativas do macOS. Padrão: true. */
  notifications: boolean;
  /** Envia uma mensagem de warmup ("oi") no terminal após trocar de conta. Padrão: true. */
  warmupAfterSwitch: boolean;
  /** % de uso em que avisa que está chegando perto. Padrão: 80. */
  warnPct: number;
  /** % de uso em que troca de conta automaticamente. Padrão: 95. */
  switchPct: number;
}

const DEFAULTS: UserConfig = {
  autoSwitch: true,
  notifications: true,
  warmupAfterSwitch: true,
  warnPct: 80,
  switchPct: 95,
};

export function loadUserConfig(): UserConfig {
  try {
    const raw = JSON.parse(readFileSync(USER_CONFIG_PATH, "utf8")) as Partial<UserConfig>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveUserConfig(cfg: Partial<UserConfig>): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const current = loadUserConfig();
  const merged = { ...current, ...cfg };
  writeFileSync(USER_CONFIG_PATH, JSON.stringify(merged, null, 2));
  return;
}
