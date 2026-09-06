import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const label = "com.johnta.video-downloader-worker";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoDir = join(scriptDir, "..", "..");
const appDir = join(homedir(), "Library", "Application Support", "JohnTaVideoDownloader");
const workerPath = join(appDir, "downloader-worker.mjs");
const configPath = join(appDir, ".env.worker");
const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
const logsDir = join(homedir(), "Library", "Logs", "JohnTaVideoDownloader");
const plistPath = join(launchAgentsDir, `${label}.plist`);

function xml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

await mkdir(launchAgentsDir, { recursive: true });
await mkdir(logsDir, { recursive: true });
await mkdir(appDir, { recursive: true });
await copyFile(join(scriptDir, "downloader-worker.mjs"), workerPath);
await copyFile(join(repoDir, ".env.worker"), configPath);
await chmod(configPath, 0o600);
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(workerPath)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(appDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>DOWNLOADER_WORKER_CONFIG</key><string>${xml(configPath)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(join(logsDir, "worker.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(join(logsDir, "worker-error.log"))}</string>
</dict>
</plist>
`;
await writeFile(plistPath, plist, { mode: 0o600 });

const domain = `gui/${process.getuid()}`;
spawnSync("launchctl", ["bootout", domain, plistPath], { stdio: "ignore" });
const result = spawnSync("launchctl", ["bootstrap", domain, plistPath], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || "Could not start the background worker.");

console.log("Video downloader worker is installed and running in the background.");
