/** Blob de credenciais exatamente como o Claude Code guarda (Keychain/arquivo). */
export interface CredentialBlob {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
    [k: string]: unknown;
  };
}

/** Uma conta registrada no store. */
export interface Account {
  label: string;
  credentials: CredentialBlob;
  addedAt: string;
  /** Último uso conhecido — salvo quando a conta era ativa. Evita chamadas desnecessárias à API. */
  lastUsage?: Usage & { savedAt: string };
}

/** Formato do arquivo ~/.config/ccswitch/accounts.json. */
export interface Store {
  activeLabel: string | null;
  accounts: Account[];
}

/** Uso resumido de uma conta. */
export interface Usage {
  fiveHourPct: number;
  sevenDayPct: number;
  /** Maior das duas janelas — "quão perto do limite estou". */
  worstPct: number;
  /** Qual janela está mais cheia ("sessão" = 5h, "semana" = 7 dias). */
  worstWindow: "sessão" | "semana";
  /** resets_at da janela mais cheia. */
  resetsAt: string | null;
  /** Pior severity do array limits ("normal" | "warning" | "critical" | ...). */
  severity: string;
}
