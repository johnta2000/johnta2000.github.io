#!/usr/bin/env node

import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { submitExternalReport } from "./report-external.mjs";

const PAGE_URL = "https://www.nextcard.com/tools/bilt-calculator";
const SITE_URL = "sc-domain:nextcard.com";
const KEY_FILE = process.env.GSC_KEY_FILE || resolve(homedir(), ".codex/secrets/nextcard-gsc-readonly.json");
const REPORT_SECRET_FILE = process.env.MONITORING_REPORT_SECRET_FILE
  || resolve(homedir(), ".codex/secrets/john-ta-monitoring-report-secret");
const SEARCH_ANALYTICS_URL = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`;
const INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const CORE_QUERY_PATTERN = /\bbilt(?:\s+2\.0)?\s+(?:points?\s+|card\s+)?calculator\b/i;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value;
  }
}

async function accessToken(credentials, fetchImpl = fetch) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, "base64url")}`;
  const response = await fetchImpl(credentials.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error(result.error_description || result.error || "GSC authentication failed.");
  return result.access_token;
}

async function googleJson(url, token, body, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `Google API returned HTTP ${response.status}.`);
  return result;
}

async function searchAnalytics(token, body, fetchImpl = fetch) {
  return googleJson(SEARCH_ANALYTICS_URL, token, body, fetchImpl);
}

function pageFilter() {
  return [{ dimension: "page", operator: "equals", expression: PAGE_URL }];
}

async function latestFinalDate(token, fetchImpl = fetch) {
  const today = new Date();
  const result = await searchAnalytics(token, {
    startDate: isoDate(new Date(today.getTime() - 14 * 86_400_000)),
    endDate: isoDate(new Date(today.getTime() - 86_400_000)),
    dimensions: ["date"],
    dimensionFilterGroups: [{ filters: pageFilter() }],
    dataState: "final",
    rowLimit: 25,
  }, fetchImpl);
  const dates = (result.rows || []).map((row) => row.keys?.[0]).filter(Boolean).sort();
  if (!dates.length) throw new Error("GSC returned no finalized dates for the Bilt calculator page.");
  return dates.at(-1);
}

async function periodData(token, startDate, endDate, fetchImpl = fetch) {
  const base = {
    startDate,
    endDate,
    dimensionFilterGroups: [{ filters: pageFilter() }],
    dataState: "final",
  };
  const [totals, queries] = await Promise.all([
    searchAnalytics(token, { ...base, rowLimit: 1 }, fetchImpl),
    searchAnalytics(token, { ...base, dimensions: ["query"], rowLimit: 25_000 }, fetchImpl),
  ]);
  const total = totals.rows?.[0] || {};
  return {
    clicks: total.clicks || 0,
    impressions: total.impressions || 0,
    ctr: total.ctr || 0,
    position: total.position || null,
    queries: (queries.rows || []).map((row) => ({
      query: row.keys?.[0] || "",
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || null,
    })),
  };
}

async function hourlySignal(token, endDate, fetchImpl = fetch) {
  const startDate = addDays(endDate, -2);
  const result = await searchAnalytics(token, {
    startDate,
    endDate,
    dimensions: ["hour"],
    dimensionFilterGroups: [{ filters: pageFilter() }],
    dataState: "hourly_all",
    rowLimit: 100,
  }, fetchImpl);
  const rows = (result.rows || []).map((row) => ({
    hour: row.keys?.[0] || null,
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || null,
  }));
  return rows.at(-1) || null;
}

async function inspectUrl(token, fetchImpl = fetch) {
  const result = await googleJson(INSPECTION_URL, token, {
    inspectionUrl: PAGE_URL,
    siteUrl: SITE_URL,
    languageCode: "en-US",
  }, fetchImpl);
  const index = result.inspectionResult?.indexStatusResult || {};
  return {
    verdict: index.verdict || null,
    coverageState: index.coverageState || null,
    lastCrawl: index.lastCrawlTime || null,
    fetchState: index.pageFetchState || null,
    robots: index.robotsTxtState || null,
    userCanonical: index.userCanonical || null,
    googleCanonical: index.googleCanonical || null,
    indexed: index.verdict === "PASS",
  };
}

export function parseLivePage(html, status) {
  const canonical = html.match(/<link\b[^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*\bhref=["']([^"']+)["']/i)?.[1]
    || html.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*canonical[^"']*["']/i)?.[1]
    || null;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
  const robots = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bname=["']robots["']/i)?.[1]
    || null;
  return {
    httpStatus: status,
    canonical,
    title,
    robots,
    h1Count: (html.match(/<h1\b/gi) || []).length,
  };
}

async function livePage(fetchImpl = fetch) {
  const response = await fetchImpl(PAGE_URL, {
    redirect: "follow",
    cache: "no-store",
    headers: {
      "cache-control": "no-cache, no-store, max-age=0",
      pragma: "no-cache",
      "user-agent": "john-ta-monitor/1.0 (+https://john-ta.com/tools/monitoring/)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  return parseLivePage(await response.text(), response.status);
}

function queryComparison(current, previous) {
  const previousByQuery = new Map(previous.queries.map((row) => [row.query, row]));
  return current.queries
    .filter((row) => CORE_QUERY_PATTERN.test(row.query))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20)
    .map((row) => ({ ...row, previousPosition: previousByQuery.get(row.query)?.position || null }));
}

export function assess({ current, previous, queries, inspection, live }) {
  const failures = [];
  const warnings = [];
  if (live.httpStatus !== 200) failures.push(`Live page returned HTTP ${live.httpStatus}.`);
  if (/noindex/i.test(live.robots || "")) failures.push("Live robots metadata contains noindex.");
  if (normalizeUrl(live.canonical) !== normalizeUrl(PAGE_URL)) failures.push("Live canonical does not match the base calculator URL.");
  if (inspection.fetchState && inspection.fetchState !== "SUCCESSFUL") failures.push(`Google page fetch state is ${inspection.fetchState}.`);
  if (inspection.robots && inspection.robots !== "ALLOWED") failures.push(`Google robots state is ${inspection.robots}.`);
  if (inspection.googleCanonical && normalizeUrl(inspection.googleCanonical) !== normalizeUrl(PAGE_URL)) {
    failures.push("Google selected a different canonical URL.");
  }
  if (inspection.verdict && inspection.verdict !== "PASS") warnings.push(`URL Inspection verdict is ${inspection.verdict}.`);
  if (current.impressions >= 100 && previous.position && current.position - previous.position >= 1) {
    warnings.push(`Average position worsened by ${(current.position - previous.position).toFixed(1)}.`);
  }
  if (previous.clicks >= 10 && current.clicks <= previous.clicks * 0.7) {
    warnings.push(`Clicks fell ${Math.round((1 - current.clicks / previous.clicks) * 100)}%.`);
  }
  const materialQueryDrop = queries.find((row) => row.impressions >= 100 && row.previousPosition && row.position - row.previousPosition >= 2);
  if (materialQueryDrop) warnings.push(`“${materialQueryDrop.query}” worsened by ${(materialQueryDrop.position - materialQueryDrop.previousPosition).toFixed(1)} positions.`);

  const status = failures.length ? "alert" : warnings.length ? "watch" : "healthy";
  const reason = failures[0] || warnings[0] || `Indexed with an average position of ${current.position?.toFixed(1) || "n/a"} in the latest finalized 7-day window.`;
  return { status, reason, failures, warnings };
}

export async function collectReport(fetchImpl = fetch) {
  const started = performance.now();
  const credentials = JSON.parse(await readFile(KEY_FILE, "utf8"));
  const token = await accessToken(credentials, fetchImpl);
  const latestDate = await latestFinalDate(token, fetchImpl);
  const currentRange = { startDate: addDays(latestDate, -6), endDate: latestDate };
  const previousRange = { startDate: addDays(latestDate, -13), endDate: addDays(latestDate, -7) };
  const [current, previous, inspection, live, hourly] = await Promise.all([
    periodData(token, currentRange.startDate, currentRange.endDate, fetchImpl),
    periodData(token, previousRange.startDate, previousRange.endDate, fetchImpl),
    inspectUrl(token, fetchImpl),
    livePage(fetchImpl),
    hourlySignal(token, isoDate(new Date()), fetchImpl),
  ]);
  const queries = queryComparison(current, previous);
  const assessment = assess({ current, previous, queries, inspection, live });

  return {
    monitorId: "bilt-calculator-ranking",
    timestamp: new Date().toISOString(),
    status: assessment.status,
    summary: `Bilt calculator: ${assessment.reason}`,
    durationMs: Math.round(performance.now() - started),
    meaningful: assessment.status !== "healthy",
    eventType: assessment.failures.length ? "technical-alert" : assessment.warnings.length ? "ranking-watch" : "status",
    metrics: {
      clicks: current.clicks,
      previousClicks: previous.clicks,
      impressions: current.impressions,
      previousImpressions: previous.impressions,
      position: current.position,
      previousPosition: previous.position,
      ctr: current.ctr,
      previousCtr: previous.ctr,
    },
    details: {
      currentRange,
      previousRange,
      queries,
      inspection,
      live,
      hourly,
      failures: assessment.failures,
      warnings: assessment.warnings,
      recommendation: assessment.failures[0] || assessment.warnings[0] || "No immediate action; continue monitoring.",
    },
    sourceUrls: [PAGE_URL],
  };
}

async function main() {
  const report = await collectReport();
  if (process.argv.includes("--report")) {
    const secret = await readFile(REPORT_SECRET_FILE, "utf8");
    await submitExternalReport(report, { secret });
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Bilt ranking monitor failed: ${error.message}`);
    process.exitCode = 1;
  });
}
