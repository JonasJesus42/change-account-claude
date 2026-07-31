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

/**
 * Retorna o uso de todas as contas. Para contas inativas com `lastUsage` salvo
 * e `resetsAt` ainda no futuro, usa o dado local sem bater na API — evita 401
 * de tokens inválidos e 429 por excesso de chamadas.
 * Só faz chamada à API para a conta ativa ou contas cujo reset já passou.
 */
export async function usageForAll(s: Store): Promise<AccountUsage[]> {
  const results: AccountUsage[] = [];
  const now = new Date();

  for (const account of s.accounts) {
    const isActive = account.label === s.activeLabel;

    if (!isActive) {
      // Conta inativa: nunca bate na API.
      // Se tem dado salvo e reset não chegou → usa dado local.
      // Se não tem dado salvo → "aguardando monitoramento" (evita 401/429 desnecessário).
      if (account.lastUsage) {
        results.push({ account, usage: account.lastUsage });
      } else {
        results.push({ account, error: "sem dados salvos (conta ainda não foi monitorada ativa)" });
      }
      continue;
    }

    // Só bate na API para a conta ATIVA.
    try {
      const usage = await fetchUsage(account.credentials.claudeAiOauth.accessToken);
      results.push({ account, usage });
    } catch (e) {
      if (account.lastUsage) {
        results.push({ account, usage: account.lastUsage });
      } else {
        results.push({ account, error: (e as Error).message });
      }
    }

    // Pausa só quando há próxima conta que vai bater na API.
    const idx = s.accounts.indexOf(account);
    if (idx < s.accounts.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
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
