import * as credstore from "./credstore.js";
import * as store from "./store.js";
import { fetchUsage, invalidateCache } from "./usage.js";
import { WARN_PCT } from "./config.js";
import type { Account, Store, Usage } from "./types.js";

/** Aplica uma conta: escreve as credenciais no cofre e marca como ativa. */
export function apply(s: Store, account: Account): void {
  // Invalida cache do token antigo antes de trocar.
  const oldCreds = credstore.read();
  if (oldCreds?.claudeAiOauth?.accessToken) {
    invalidateCache(oldCreds.claudeAiOauth.accessToken);
  }
  credstore.write(account.credentials);
  s.activeLabel = account.label;
  store.save(s);
}

/** Captura o blob de credenciais atualmente em uso e salva com o label dado. */
export function capture(s: Store, label: string): Account {
  const creds = credstore.read();
  if (!creds?.claudeAiOauth?.accessToken) {
    throw new Error(
      `Nenhuma credencial válida encontrada em ${credstore.location()}. ` +
        `Faça login no Claude Code primeiro (\`claude\`).`,
    );
  }
  const account: Account = {
    label,
    credentials: creds,
    addedAt: new Date().toISOString(),
  };
  store.upsert(s, account);
  // Quem está no Keychain agora É a conta ativa — sempre atualiza.
  s.activeLabel = label;
  store.save(s);
  return account;
}

export interface AccountUsage {
  account: Account;
  usage?: Usage;
  error?: string;
}

/** Consulta o uso de todas as contas do store em sequência com delay entre elas.
 *  Sequencial (não paralelo) evita disparar múltiplas requests simultâneas e
 *  causar 429. O cache de 90s garante que repetições sejam grátis. */
export async function usageForAll(s: Store): Promise<AccountUsage[]> {
  const results: AccountUsage[] = [];
  for (const account of s.accounts) {
    try {
      const usage = await fetchUsage(account.credentials.claudeAiOauth.accessToken);
      results.push({ account, usage });
    } catch (e) {
      results.push({ account, error: (e as Error).message });
    }
    // Pequena pausa entre contas pra não saturar o endpoint.
    if (s.accounts.indexOf(account) < s.accounts.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return results;
}

/**
 * Escolhe a melhor conta pra trocar: a de menor uso que esteja abaixo de
 * WARN_PCT, excluindo a conta atual. Retorna null se nenhuma tem folga.
 */
export function pickBest(
  all: AccountUsage[],
  excludeLabel: string | null,
): AccountUsage | null {
  const candidates = all
    .filter((a) => a.account.label !== excludeLabel)
    .filter((a) => a.usage && a.usage.worstPct < WARN_PCT)
    .sort((a, b) => a.usage!.worstPct - b.usage!.worstPct);
  return candidates[0] ?? null;
}
