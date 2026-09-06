import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { spawn, spawnSync } from "node:child_process";

const VERSION = "1.0.0";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(SCRIPT_DIR, "..", "..");
const ENV_FILE = process.env.DOWNLOADER_WORKER_CONFIG || join(REPO_DIR, ".env.worker");
const TEMP_ROOT = join(tmpdir(), "john-ta-video-downloader");
const MAX_FILE_BYTES = 200 * 1_000_000;
const POLL_MS = 3_000;
const HEARTBEAT_MS = 5_000;

const FORMATS = {
  best: "bv*[ext=mp4][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4]",
  "1080": "bv*[ext=mp4][vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[ext=mp4][height<=1080]",
  "720": "bv*[ext=mp4][vcodec^=avc1][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]",
  "480": "bv*[ext=mp4][vcodec^=avc1][height<=480]+ba[ext=m4a]/b[ext=mp4][height<=480]",
};

let activeJobId;
let stopping = false;

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function loadConfig() {
  const fileValues = parseEnv(await readFile(ENV_FILE, "utf8"));
  const convexUrl = process.env.CONVEX_URL || fileValues.CONVEX_URL;
  const secret = process.env.DOWNLOADER_WORKER_SECRET || fileValues.DOWNLOADER_WORKER_SECRET;
  if (!convexUrl || !secret) throw new Error("Run setup-worker.command before starting the downloader worker.");
  return {
    convexUrl: convexUrl.replace(/\/$/, ""),
    secret,
    workerId: process.env.DOWNLOADER_WORKER_ID || fileValues.DOWNLOADER_WORKER_ID || `john-mac-${hostname()}`,
  };
}

function checkCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 10_000 });
  if (result.status !== 0) throw new Error(`${command} is missing. Install it with Homebrew first.`);
}

async function mutation(config, path, args = {}, timeout = 20_000) {
  const response = await fetch(`${config.convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args: { secret: config.secret, ...args } }),
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") {
    throw new Error(result.errorMessage || result.message || `Convex mutation ${path} failed.`);
  }
  return result.value;
}

function workerFields(config) {
  return { workerId: config.workerId, hostname: hostname(), version: VERSION };
}

async function heartbeat(config) {
  await mutation(config, "videoDownloads:heartbeat", {
    ...workerFields(config),
    ...(activeJobId ? { currentJobId: activeJobId } : {}),
  });
}

function runDownload(config, job, directory) {
  return new Promise((resolve, reject) => {
    const outputTemplate = join(directory, "%(title).180B [%(id)s].%(ext)s");
    const args = [
      "--no-playlist",
      "--newline",
      "--no-warnings",
      "--restrict-filenames",
      "--windows-filenames",
      "--embed-metadata",
      "--merge-output-format", "mp4",
      "--max-filesize", "200M",
      "--match-filter", "duration <= 3600",
      "--format", FORMATS[job.quality] || FORMATS.best,
      "--output", outputTemplate,
      "--print", "before_dl:meta:%(title)s",
      "--print", "after_move:file:%(filepath)s",
      "--progress-template", "download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
      "--", job.videoUrl,
    ];
    const child = spawn("yt-dlp", args, { shell: false, windowsHide: true });
    const stderr = [];
    let stdout = "";
    let filePath = "";
    let title = "YouTube video";
    let lastUpdate = 0;
    let pendingUpdate = Promise.resolve();

    function parseLine(rawLine) {
      const line = rawLine.trim();
      if (line.startsWith("meta:")) title = line.slice(5).trim() || title;
      if (line.startsWith("file:")) filePath = line.slice(5).trim();
      const match = line.match(/download:\s*([\d.]+)%\|\s*([^|]*)\|\s*(.*)$/);
      if (!match) return;
      const now = Date.now();
      if (now - lastUpdate < 1_500 && Number(match[1]) < 99) return;
      lastUpdate = now;
      pendingUpdate = mutation(config, "videoDownloads:updateProgress", {
        workerId: config.workerId,
        jobId: job.id,
        progress: Number(match[1]) || 0,
        speed: match[2].trim() === "NA" ? undefined : match[2].trim(),
        eta: match[3].trim() === "NA" ? undefined : match[3].trim(),
        title,
      }).catch(() => {});
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || "";
      for (const line of lines) parseLine(line);
    });
    child.stderr.on("data", (chunk) => {
      const line = chunk.toString().trim();
      if (line) stderr.push(line);
      if (stderr.length > 8) stderr.shift();
    });
    child.on("error", reject);
    child.on("close", async (code) => {
      if (stdout.trim()) parseLine(stdout);
      await pendingUpdate;
      if (code === 0 && filePath) resolve({ filePath, title });
      else reject(new Error(stderr.join(" ").replace(/^ERROR:\s*/i, "") || `yt-dlp exited with code ${code}.`));
    });
  });
}

function verifyMp4(filePath) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=format_name",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ], { encoding: "utf8", timeout: 20_000 });
  if (result.status !== 0 || !result.stdout.toLowerCase().includes("mp4")) {
    throw new Error("The generated file did not pass MP4 verification.");
  }
}

async function upload(config, job, filePath, title) {
  const file = await stat(filePath);
  if (file.size > MAX_FILE_BYTES) throw new Error("The finished video is over the 200 MB team limit.");
  verifyMp4(filePath);
  const uploadUrl = await mutation(config, "videoDownloads:createUploadUrl", {
    workerId: config.workerId,
    jobId: job.id,
  });
  const stream = Readable.toWeb(createReadStream(filePath));
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(file.size),
    },
    body: stream,
    duplex: "half",
    signal: AbortSignal.timeout(115_000),
  });
  if (!response.ok) throw new Error(`Temporary file upload failed (${response.status}).`);
  const { storageId } = await response.json();
  await mutation(config, "videoDownloads:complete", {
    workerId: config.workerId,
    jobId: job.id,
    storageId,
    filename: basename(filePath),
    title,
    fileSize: file.size,
  });
}

async function processJob(config, job) {
  activeJobId = job.id;
  const safeId = String(job.id).replace(/[^A-Za-z0-9_-]/g, "");
  const directory = join(TEMP_ROOT, safeId);
  await mkdir(directory, { recursive: true });
  console.log(`Processing ${job.id}`);
  try {
    const { filePath, title } = await runDownload(config, job, directory);
    await upload(config, job, filePath, title);
    console.log(`Completed ${job.id}: ${basename(filePath)}`);
  } catch (error) {
    const message = String(error?.message || error || "Download failed.").slice(0, 700);
    console.error(`Failed ${job.id}: ${message}`);
    await mutation(config, "videoDownloads:fail", {
      workerId: config.workerId,
      jobId: job.id,
      error: message,
    }).catch(() => {});
  } finally {
    activeJobId = undefined;
    await rm(directory, { recursive: true, force: true });
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  checkCommand("yt-dlp", ["--version"]);
  checkCommand("ffmpeg", ["-version"]);
  checkCommand("ffprobe", ["-version"]);
  const config = await loadConfig();
  await mkdir(TEMP_ROOT, { recursive: true });
  console.log(`Video downloader worker ${VERSION} is online as ${config.workerId}.`);

  const heartbeatTimer = setInterval(() => heartbeat(config).catch((error) => {
    console.error(`Heartbeat failed: ${error.message}`);
  }), HEARTBEAT_MS);

  try {
    while (!stopping) {
      try {
        const job = await mutation(config, "videoDownloads:claimNext", workerFields(config));
        if (job) await processJob(config, job);
      } catch (error) {
        console.error(`Worker loop: ${error.message}`);
      }
      if (!stopping) await sleep(POLL_MS);
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
