import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { CONFIG_DIR, STORE_PATH } from "./config.js";
import type { Account, Store } from "./types.js";

const EMPTY: Store = { activeLabel: null, accounts: [] };

/** Lê o store de contas (retorna vazio se ainda não existe). */
export function load(): Store {
  if (!existsSync(STORE_PATH)) return { ...EMPTY };
  try {
    const raw = readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return {
      activeLabel: parsed.activeLabel ?? null,
      accounts: parsed.accounts ?? [],
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Persiste o store de forma atômica e com permissão restrita (0600). */
export function save(store: Store): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${STORE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  renameSync(tmp, STORE_PATH);
}

export function find(store: Store, label: string): Account | undefined {
  return store.accounts.find((a) => a.label === label);
}

/** Insere ou substitui uma conta pelo label. */
export function upsert(store: Store, account: Account): void {
  const idx = store.accounts.findIndex((a) => a.label === account.label);
  if (idx >= 0) store.accounts[idx] = account;
  else store.accounts.push(account);
}

/** Remove uma conta; retorna true se removeu. */
export function remove(store: Store, label: string): boolean {
  const before = store.accounts.length;
  store.accounts = store.accounts.filter((a) => a.label !== label);
  if (store.activeLabel === label) store.activeLabel = null;
  return store.accounts.length < before;
}
