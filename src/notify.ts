import { execFile } from "node:child_process";

/** Escapa aspas duplas e barras pra dentro de uma string AppleScript. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Notificação nativa do macOS via osascript. Em outros SOs, cai pro console.
 * Nunca lança erro — notificação não pode derrubar o daemon.
 */
export function notify(title: string, message: string): void {
  const line = `[ccswitch] ${title} — ${message}`;
  console.log(line);

  if (process.platform !== "darwin") return;

  const script = `display notification "${esc(message)}" with title "${esc(
    title,
  )}" sound name "Ping"`;
  execFile("osascript", ["-e", script], (err) => {
    if (err) console.error("[ccswitch] falha ao notificar:", err.message);
  });
}
