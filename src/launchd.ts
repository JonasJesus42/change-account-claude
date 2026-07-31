import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR } from "./config.js";

const LABEL = "cx.ccswitch";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

/** Caminho absoluto do cli.js compilado (este próprio pacote). */
function cliPath(): string {
  return fileURLToPath(new URL("./cli.js", import.meta.url));
}

function plistContent(): string {
  const node = process.execPath;
  const logDir = CONFIG_DIR;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${cliPath()}</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(logDir, "daemon.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(logDir, "daemon.err.log")}</string>
</dict>
</plist>
`;
}

export function install(): void {
  if (process.platform !== "darwin") {
    throw new Error("daemon:install só é suportado no macOS (launchd).");
  }
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(PLIST_PATH, plistContent());
  // Recarrega se já estava carregado.
  try {
    execFileSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" });
  } catch {
    /* não estava carregado, tudo bem */
  }
  execFileSync("launchctl", ["load", PLIST_PATH]);
  console.log(`LaunchAgent instalado e carregado: ${PLIST_PATH}`);
  console.log("Logs em:", join(CONFIG_DIR, "daemon.log"));
}

export function uninstall(): void {
  if (process.platform !== "darwin") {
    throw new Error("daemon:uninstall só é suportado no macOS (launchd).");
  }
  if (existsSync(PLIST_PATH)) {
    try {
      execFileSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" });
    } catch {
      /* já descarregado */
    }
    unlinkSync(PLIST_PATH);
    console.log("LaunchAgent removido:", PLIST_PATH);
  } else {
    console.log("Nada a remover (LaunchAgent não instalado).");
  }
}
