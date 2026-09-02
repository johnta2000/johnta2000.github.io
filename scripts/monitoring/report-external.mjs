#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONVEX_URL = process.env.CONVEX_URL || "https://rapid-shark-565.convex.cloud";
const DEFAULT_SECRET_FILE = resolve(homedir(), ".codex/secrets/john-ta-monitoring-report-secret");
const MONITOR_IDS = new Set(["paze-clover-map-ranking", "bilt-calculator-ranking", "transfer-bonus-discovery", "chase-sapphire-reserve-tables"]);
const STATUSES = new Set(["healthy", "watch", "alert", "unavailable", "error"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateExternalReport(value) {
  if (!isRecord(value)) throw new Error("Report must be a JSON object.");
  if (!MONITOR_IDS.has(value.monitorId)) throw new Error(`Unsupported monitorId: ${value.monitorId ?? "missing"}`);
  if (!STATUSES.has(value.status)) throw new Error(`Unsupported status: ${value.status ?? "missing"}`);
  if (!value.timestamp || !Number.isFinite(Date.parse(value.timestamp))) throw new Error("timestamp must be valid ISO-8601.");
  if (typeof value.summary !== "string" || !value.summary.trim() || value.summary.trim().length > 800) {
    throw new Error("summary must be between 1 and 800 characters.");
  }
  if (value.durationMs != null && (!Number.isFinite(value.durationMs) || value.durationMs < 0)) {
    throw new Error("durationMs must be a non-negative number.");
  }
  if (value.metrics != null && !isRecord(value.metrics)) throw new Error("metrics must be an object.");
  if (value.details != null && !isRecord(value.details)) throw new Error("details must be an object.");
  if (value.sourceUrls != null && (!Array.isArray(value.sourceUrls) || value.sourceUrls.length > 12 || value.sourceUrls.some((url) => !/^https:\/\//.test(url)))) {
    throw new Error("sourceUrls must contain no more than 12 HTTPS URLs.");
  }

  return {
    monitorId: value.monitorId,
    timestamp: value.timestamp,
    status: value.status,
    summary: value.summary.trim(),
    durationMs: value.durationMs ?? null,
    meaningful: value.meaningful === true,
    eventType: typeof value.eventType === "string" && value.eventType.trim() ? value.eventType.trim() : "status",
    metrics: value.metrics ?? {},
    details: value.details ?? {},
    sourceUrls: value.sourceUrls ?? [],
  };
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

export async function submitExternalReport(report, {
  fetchImpl = fetch,
  secret,
  convexUrl = CONVEX_URL,
} = {}) {
  const validated = validateExternalReport(report);
  if (!secret || secret.trim().length < 32) throw new Error("Monitoring report secret is missing or invalid.");

  const response = await fetchImpl(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "monitoring:report", args: { secret: secret.trim(), report: validated } }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") {
    throw new Error(result.errorMessage || result.message || "Secure external monitor report failed.");
  }
  return result.value;
}

async function main() {
  const inlineIndex = process.argv.indexOf("--json");
  const raw = inlineIndex >= 0 ? process.argv[inlineIndex + 1] : await readStdin();
  if (!raw?.trim()) throw new Error("Pass a JSON report on stdin or with --json.");

  const secretFile = process.env.MONITORING_REPORT_SECRET_FILE || DEFAULT_SECRET_FILE;
  const secret = process.env.MONITORING_REPORT_SECRET || await readFile(secretFile, "utf8");
  const report = JSON.parse(raw);
  await submitExternalReport(report, { secret });
  console.log(`Reported ${report.monitorId}: ${report.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
