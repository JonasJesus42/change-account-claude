import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { userInfo } from "node:os";
import { KEYCHAIN_SERVICE, LINUX_CREDS_PATH } from "./config.js";
import type { CredentialBlob } from "./types.js";

/**
 * Camada multiplataforma sobre o cofre de credenciais do Claude Code.
 * - macOS (darwin): Keychain, via o binário `security`.
 * - Linux/WSL: arquivo texto ~/.claude/.credentials.json.
 * O resto do código só usa read()/write() sem saber qual é.
 */

const isMac = process.platform === "darwin";

function readKeychain(): CredentialBlob | null {
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8" },
    ).trim();
    if (!raw) return null;
    return JSON.parse(raw) as CredentialBlob;
  } catch {
    // Item não existe ou usuário negou acesso.
    return null;
  }
}

function writeKeychain(blob: CredentialBlob): void {
  const json = JSON.stringify(blob);
  // -U faz upsert. Passamos o JSON como ARGUMENTO (não string de shell),
  // então não há problema de aspas/escape.
  execFileSync("security", [
    "add-generic-password",
    "-U",
    "-a",
    userInfo().username,
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
    json,
  ]);
}

function readFile(): CredentialBlob | null {
  try {
    const raw = readFileSync(LINUX_CREDS_PATH, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as CredentialBlob;
  } catch {
    return null;
  }
}

function writeFileAtomic(blob: CredentialBlob): void {
  mkdirSync(dirname(LINUX_CREDS_PATH), { recursive: true });
  const tmp = `${LINUX_CREDS_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(blob), { mode: 0o600 });
  renameSync(tmp, LINUX_CREDS_PATH);
}

/** Lê o blob de credenciais atualmente em uso pelo Claude Code. */
export function read(): CredentialBlob | null {
  return isMac ? readKeychain() : readFile();
}

/** Escreve um blob de credenciais (troca a conta ativa do Claude Code). */
export function write(blob: CredentialBlob): void {
  if (isMac) writeKeychain(blob);
  else writeFileAtomic(blob);
}

/** Onde as credenciais moram, pra mensagens ao usuário. */
export function location(): string {
  return isMac
    ? `Keychain do macOS (item "${KEYCHAIN_SERVICE}")`
    : LINUX_CREDS_PATH;
}
