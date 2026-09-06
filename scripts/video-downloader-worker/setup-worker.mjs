import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoDir = join(scriptDir, "..", "..");
const localEnv = await readFile(join(repoDir, ".env.local"), "utf8");
const convexUrl = localEnv.match(/^CONVEX_URL=(.+)$/m)?.[1]?.trim();
if (!convexUrl) throw new Error("CONVEX_URL is missing from .env.local.");

let secret = crypto.randomBytes(32).toString("hex");
try {
  const existing = await readFile(join(repoDir, ".env.worker"), "utf8");
  secret = existing.match(/^DOWNLOADER_WORKER_SECRET=(.+)$/m)?.[1]?.trim() || secret;
} catch {}

const result = spawnSync("npx", ["convex", "env", "set", "DOWNLOADER_WORKER_SECRET", secret], {
  cwd: repoDir,
  encoding: "utf8",
});
if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Could not configure the worker secret in Convex.");

await writeFile(join(repoDir, ".env.worker"), [
  "# Local secret for the john-ta.com video downloader worker.",
  `CONVEX_URL=${convexUrl}`,
  `DOWNLOADER_WORKER_SECRET=${secret}`,
  "DOWNLOADER_WORKER_ID=john-primary-mac",
  "",
].join("\n"), { mode: 0o600 });

console.log("Downloader worker credentials are configured.");
