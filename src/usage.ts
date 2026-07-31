import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { USAGE_URL, OAUTH_BETA_HEADER, USAGE_CACHE_PATH } from "./config.js";
import type { Usage } from "./types.js";

interface RawWindow {
  utilization?: number | null;
  resets_at?: string | null;
}
interface RawLimit {
  severity?: string | null;
}
interface UsageResponse {
  five_hour?: RawWindow;
  seven_day?: RawWindow;
  limits?: RawLimit[];
}

const SEVERITY_RANK: Record<string, number> = {
  normal: 0,
  low: 1,
  warning: 2,
  high: 3,
  critical: 4,
};

/** TTL do cache em disco: 90 segundos. */
const CACHE_TTL_MS = 90_000;

interface CacheFile {
  [tokenKey: string]: { usage: Usage; fetchedAt: number };
}

function cacheKey(token: string): string {
  return token.slice(0, 16);
}

function loadCache(): CacheFile {
  try {
    return JSON.parse(readFileSync(USAGE_CACHE_PATH, "utf8")) as CacheFile;
  } catch {
    return {};
  }
}

function saveCache(c: CacheFile): void {
  try {
    mkdirSync(dirname(USAGE_CACHE_PATH), { recursive: true });
    const tmp = `${USAGE_CACHE_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(c), { mode: 0o600 });
    renameSync(tmp, USAGE_CACHE_PATH);
  } catch {
    /* falha silenciosa — cache é best-effort */
  }
}

/** Erro com status HTTP anexado, pra o daemon distinguir 401 de erro de rede. */
export class UsageError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "UsageError";
  }
}

function parseResponse(data: UsageResponse): Usage {
  const fiveHourPct = Math.round(data.five_hour?.utilization ?? 0);
  const sevenDayPct = Math.round(data.seven_day?.utilization ?? 0);
  const sessionWins = fiveHourPct >= sevenDayPct;
  const worstPct = sessionWins ? fiveHourPct : sevenDayPct;
  const worstWindow: "sessão" | "semana" = sessionWins ? "sessão" : "semana";
  const resetsAt = sessionWins
    ? (data.five_hour?.resets_at ?? null)
    : (data.seven_day?.resets_at ?? null);

  let severity = "normal";
  for (const l of data.limits ?? []) {
    const s = l.severity ?? "normal";
    if ((SEVERITY_RANK[s] ?? 0) > (SEVERITY_RANK[severity] ?? 0)) severity = s;
  }

  return { fiveHourPct, sevenDayPct, worstPct, worstWindow, resetsAt, severity };
}

/**
 * Consulta uso — com cache em disco de 90s compartilhado entre daemon e CLI.
 * Passe `{ force: true }` pra forçar consulta fresca (ex: logo após troca de conta).
 */
export async function fetchUsage(
  accessToken: string,
  opts?: { force?: boolean },
): Promise<Usage> {
  const key = cacheKey(accessToken);
  const now = Date.now();
  const cacheFile = loadCache();

  if (!opts?.force) {
    const entry = cacheFile[key];
    if (entry && now - entry.fetchedAt < CACHE_TTL_MS) {
      return entry.usage;
    }
  }

  let res: Response;
  try {
    res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": OAUTH_BETA_HEADER,
      },
    });
  } catch (e) {
    const stale = cacheFile[key];
    if (stale) return stale.usage;
    throw new UsageError(`Falha de rede: ${(e as Error).message}`);
  }

  if (res.status === 429) {
    const stale = cacheFile[key];
    if (stale) {
      console.warn("[ccswitch] 429 — usando cache anterior.");
      return stale.usage;
    }
    throw new UsageError("Rate limited (429) sem cache disponível.", 429);
  }

  if (!res.ok) {
    throw new UsageError(`HTTP ${res.status} ao consultar uso`, res.status);
  }

  const data = (await res.json()) as UsageResponse;
  const usage = parseResponse(data);
  cacheFile[key] = { usage, fetchedAt: now };
  saveCache(cacheFile);
  return usage;
}

/** Remove entrada do cache (chamar após troca de conta). */
export function invalidateCache(accessToken: string): void {
  const key = cacheKey(accessToken);
  const c = loadCache();
  delete c[key];
  saveCache(c);
}
