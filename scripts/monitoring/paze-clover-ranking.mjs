#!/usr/bin/env node

import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { submitExternalReport } from "./report-external.mjs";

export const MAP_URL = "https://www.nextcard.com/tools/clover-paze-map";
export const TOOLS_URL = "https://www.nextcard.com/tools";
export const GUIDE_URL = "https://www.nextcard.com/articles/paze-clover-dining-guide";
export const URLS = [MAP_URL, TOOLS_URL, GUIDE_URL];
export const CORE_QUERIES = [
  "paze clover map",
  "clover paze map",
  "paze clover",
  "clover paze",
  "paze map",
];
export const DISCOVERY_QUERIES = [
  "paze restaurants",
  "paze restaurant map",
  "paze restaurants near me",
  "restaurants that accept paze",
  "where can i use paze",
  "paze locations",
  "paze stores",
  "stores that accept paze",
  "clover restaurants paze",
  "paze clover restaurants",
];
export const ALL_QUERIES = [...CORE_QUERIES, ...DISCOVERY_QUERIES];

const SITE = "sc-domain:nextcard.com";
const KEY_PATH = process.env.GSC_KEY_FILE
  || resolve(homedir(), ".codex/secrets/nextcard-gsc-readonly.json");
const REPORT_SECRET_PATH = process.env.MONITORING_REPORT_SECRET_FILE
  || resolve(homedir(), ".codex/secrets/john-ta-monitoring-report-secret");
const SEARCH_ANALYTICS_URL = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;
const INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const PRIMARY_QUERY = CORE_QUERIES[0];

const round = (value, digits = 2) => value == null ? null : Number(value.toFixed(digits));
const isoDate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);
const blankMetric = () => ({ clicks: 0, impressions: 0, weightedPosition: 0 });

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

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken(credentials, fetchImpl = fetch) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
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
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || `OAuth token request failed with HTTP ${response.status}`);
  }
  return result.access_token;
}

async function googlePost(url, token, body, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `Google API returned HTTP ${response.status}.`);
  return result;
}

function filters() {
  const queryExpression = `^(${ALL_QUERIES.map((query) => query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`;
  return [{ filters: [
    { dimension: "query", operator: "includingRegex", expression: queryExpression },
    {
      dimension: "page",
      operator: "includingRegex",
      expression: "^https://www\\.nextcard\\.com/(tools/clover-paze-map|tools|articles/paze-clover-dining-guide)$",
    },
  ] }];
}

export function periodBounds(latestFinalized) {
  const end = new Date(`${latestFinalized}T00:00:00Z`);
  const start = addDays(end, -6);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -6);
  return {
    period: { startDate: isoDate(start), endDate: isoDate(end) },
    previousPeriod: { startDate: isoDate(previousStart), endDate: isoDate(previousEnd) },
  };
}

export function aggregateRows(rows) {
  const byQuery = Object.fromEntries(ALL_QUERIES.map((query) => [
    query,
    Object.fromEntries(URLS.map((url) => [url, blankMetric()])),
  ]));
  for (const row of rows) {
    const [query, page] = row.keys ?? [];
    if (!byQuery[query]?.[page]) continue;
    const metric = byQuery[query][page];
    metric.clicks += row.clicks ?? 0;
    metric.impressions += row.impressions ?? 0;
    metric.weightedPosition += (row.position ?? 0) * (row.impressions ?? 0);
  }
  return Object.fromEntries(Object.entries(byQuery).map(([query, pages]) => [
    query,
    Object.fromEntries(Object.entries(pages).map(([page, metric]) => [page, {
      clicks: metric.clicks,
      impressions: metric.impressions,
      ctr: metric.impressions ? round(metric.clicks / metric.impressions * 100) : null,
      position: metric.impressions ? round(metric.weightedPosition / metric.impressions) : null,
    }])),
  ]));
}

export function summarizeCore(byQuery) {
  const totals = Object.fromEntries(URLS.map((url) => [url, blankMetric()]));
  for (const query of CORE_QUERIES) {
    for (const url of URLS) {
      const value = byQuery[query][url];
      totals[url].clicks += value.clicks;
      totals[url].impressions += value.impressions;
      totals[url].weightedPosition += (value.position ?? 0) * value.impressions;
    }
  }
  const map = totals[MAP_URL];
  const totalClicks = Object.values(totals).reduce((sum, value) => sum + value.clicks, 0);
  const totalImpressions = Object.values(totals).reduce((sum, value) => sum + value.impressions, 0);
  return {
    clicks: map.clicks,
    impressions: map.impressions,
    ctr: map.impressions ? round(map.clicks / map.impressions * 100) : null,
    position: map.impressions ? round(map.weightedPosition / map.impressions) : null,
    mapClickShare: totalClicks ? round(map.clicks / totalClicks * 100) : null,
    mapImpressionShare: totalImpressions ? round(map.impressions / totalImpressions * 100) : null,
    totalClicks,
    totalImpressions,
  };
}

function winningPage(pages) {
  return URLS
    .map((url) => ({ url, ...pages[url] }))
    .filter((page) => page.impressions > 0 && page.position != null)
    .sort((left, right) => left.position - right.position)[0] ?? null;
}

export function queryDetails(byQuery, previousByQuery = null) {
  return ALL_QUERIES.map((query) => {
    const pages = byQuery[query];
    const previousPages = previousByQuery?.[query];
    const totalImpressions = URLS.reduce((sum, url) => sum + pages[url].impressions, 0);
    const totalClicks = URLS.reduce((sum, url) => sum + pages[url].clicks, 0);
    const previousTotalImpressions = previousPages
      ? URLS.reduce((sum, url) => sum + previousPages[url].impressions, 0)
      : 0;
    const winner = winningPage(pages);
    return {
      query,
      tier: CORE_QUERIES.includes(query) ? "core" : "discovery",
      mapImpressionShare: totalImpressions ? round(pages[MAP_URL].impressions / totalImpressions * 100) : null,
      previousMapImpressionShare: previousTotalImpressions
        ? round(previousPages[MAP_URL].impressions / previousTotalImpressions * 100)
        : null,
      mapClickShare: totalClicks ? round(pages[MAP_URL].clicks / totalClicks * 100) : null,
      firstNextcardUrl: winner?.url ?? null,
      rank: winner?.position ?? null,
      pages,
    };
  });
}

function hourlyWindows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const [hour, query, page] = row.keys ?? [];
    if (!hour || !CORE_QUERIES.includes(query) || !URLS.includes(page)) continue;
    if (!grouped.has(hour)) grouped.set(hour, []);
    grouped.get(hour).push({ ...row, keys: [query, page] });
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([hour, hourRows]) => {
    const byQuery = aggregateRows(hourRows);
    const summary = summarizeCore(byQuery);
    const primary = byQuery[PRIMARY_QUERY];
    const primaryWinner = winningPage(primary);
    return {
      hour,
      clicks: summary.clicks,
      impressions: summary.impressions,
      position: summary.position,
      mapClickShare: summary.mapClickShare,
      mapImpressionShare: summary.mapImpressionShare,
      totalClicks: summary.totalClicks,
      totalImpressions: summary.totalImpressions,
      primaryQueryMapPosition: primary[MAP_URL].position,
      primaryQueryMapImpressions: primary[MAP_URL].impressions,
      primaryQueryWinner: primaryWinner?.url ?? null,
    };
  });
}

function latestQualifiedWindowSet(windows, count = 3) {
  const qualified = windows.filter((window) => window.totalImpressions >= 10);
  const latest = qualified.slice(-count);
  if (latest.length !== count) return [];
  const timestamps = latest.map((window) => Date.parse(window.hour));
  const consecutive = timestamps.every((timestamp, index) => index === 0 || timestamp - timestamps[index - 1] <= 7_200_000);
  return consecutive ? latest : [];
}

export function parseLivePage(html, status) {
  // Next.js repeats portions of the page model inside React Flight scripts.
  // Ranking safeguards should inspect crawlable DOM text, not strings embedded
  // in hydration data that are never rendered as the page's initial state.
  const crawlableHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const canonical = html.match(/<link\b[^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*\bhref=["']([^"']+)["']/i)?.[1]
    || html.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*canonical[^"']*["']/i)?.[1]
    || null;
  const robots = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bname=["']robots["']/i)?.[1]
    || null;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  return {
    httpStatus: status,
    canonical,
    robots: robots ?? "none",
    title,
    htmlBytes: Buffer.byteLength(html),
    h1Count: (crawlableHtml.match(/<h1\b/gi) ?? []).length,
    hasMerchantCount: /35[,.]?\d{3}.{0,24}merchants available/i.test(crawlableHtml),
    hasMerchantSample: /Sample Clover merchants in the Paze map/i.test(crawlableHtml),
    hasPrematureEmptyState: /(?:^|[^\d])0 restaurants\b|No restaurants found/i.test(crawlableHtml),
    hasInitialSignupCallout: /Sign up to fully unlock/i.test(crawlableHtml),
  };
}

export function assess({ current, previous, queries, inspection, live, provisionalWindows }) {
  const failures = [];
  const warnings = [];
  const shifts = queries.filter((query) =>
    query.tier === "core"
    && query.mapImpressionShare != null
    && query.previousMapImpressionShare != null
    && query.previousMapImpressionShare - query.mapImpressionShare >= 20
    && query.firstNextcardUrl !== MAP_URL
  );
  const latestThree = latestQualifiedWindowSet(provisionalWindows);

  if (live.httpStatus !== 200) failures.push(`Live page returned HTTP ${live.httpStatus}.`);
  if (/noindex/i.test(live.robots || "")) failures.push("Live robots metadata contains noindex.");
  if (normalizeUrl(live.canonical) !== normalizeUrl(MAP_URL)) failures.push("Live canonical does not match the map URL.");
  if (live.h1Count !== 1) failures.push(`Live HTML contains ${live.h1Count} H1 elements instead of one.`);
  if (!live.hasMerchantCount || !live.hasMerchantSample) failures.push("Live HTML is missing the crawlable merchant count or sample.");
  if (live.hasPrematureEmptyState) failures.push("Live HTML contains a premature empty-results state.");
  if (live.hasInitialSignupCallout) warnings.push("The initial HTML again contains the full-map signup callout.");
  if (inspection.fetchState && inspection.fetchState !== "SUCCESSFUL") failures.push(`Google page fetch state is ${inspection.fetchState}.`);
  if (inspection.robots && inspection.robots !== "ALLOWED") failures.push(`Google robots state is ${inspection.robots}.`);
  if (inspection.googleCanonical && normalizeUrl(inspection.googleCanonical) !== normalizeUrl(MAP_URL)) failures.push("Google selected a different canonical URL.");
  if (inspection.verdict && inspection.verdict !== "PASS") warnings.push(`URL Inspection verdict is ${inspection.verdict}.`);

  if (current.totalImpressions >= 100 && previous.mapImpressionShare != null && current.mapImpressionShare != null) {
    const shareDrop = previous.mapImpressionShare - current.mapImpressionShare;
    if (shareDrop >= 15) warnings.push(`Core map impression share fell ${round(shareDrop, 1)} percentage points.`);
  }
  if (current.totalClicks >= 30 && current.mapClickShare != null && current.mapClickShare < 75) warnings.push(`The map received only ${round(current.mapClickShare, 1)}% of NextCard core-query clicks.`);
  if (current.impressions >= 100 && previous.position != null && current.position != null && current.position - previous.position >= 1) warnings.push(`The map's core average position worsened by ${round(current.position - previous.position, 1)}.`);
  if (shifts.length >= 3) failures.push(`${shifts.length} core queries shifted materially from the map to another NextCard URL.`);
  if (
    current.totalImpressions >= 100
    && previous.totalImpressions >= 100
    && current.mapImpressionShare != null
    && previous.mapImpressionShare != null
    && current.mapImpressionShare < 50
    && previous.mapImpressionShare < 50
  ) warnings.push("Map impression ownership remained below 50% across both finalized periods.");
  if (latestThree.length === 3 && latestThree.every((window) =>
    window.primaryQueryMapImpressions >= 5
    && window.primaryQueryMapPosition != null
    && window.primaryQueryMapPosition > 2.5
  )) warnings.push("The exact “paze clover map” query ranked below 2.5 for three consecutive qualified hours.");

  const status = failures.length ? "alert" : warnings.length ? "watch" : "healthy";
  const reason = failures[0]
    || warnings[0]
    || `The map owns ${round(current.mapClickShare, 1)}% of core-query clicks at position ${current.position?.toFixed(2) ?? "n/a"}.`;
  return { status, reason, failures, warnings, shifts, latestThree };
}

async function collect(fetchImpl = fetch) {
  const started = performance.now();
  const credentials = JSON.parse(await readFile(KEY_PATH, "utf8"));
  const token = await accessToken(credentials, fetchImpl);
  const today = new Date();
  const dateRows = await googlePost(SEARCH_ANALYTICS_URL, token, {
    startDate: isoDate(addDays(today, -14)), endDate: isoDate(today), dimensions: ["date"],
    dataState: "final", type: "web", rowLimit: 100,
  }, fetchImpl);
  const latestFinalized = (dateRows.rows ?? []).map((row) => row.keys?.[0]).filter(Boolean).sort().at(-1);
  if (!latestFinalized) throw new Error("Search Console returned no finalized date.");
  const periods = periodBounds(latestFinalized);
  const base = {
    dimensions: ["query", "page"], dimensionFilterGroups: filters(),
    dataState: "final", type: "web", rowLimit: 25_000,
  };
  const [currentResponse, previousResponse, hourlyResponse, inspectionResponse, liveResponse] = await Promise.all([
    googlePost(SEARCH_ANALYTICS_URL, token, { ...base, ...periods.period }, fetchImpl),
    googlePost(SEARCH_ANALYTICS_URL, token, { ...base, ...periods.previousPeriod }, fetchImpl),
    googlePost(SEARCH_ANALYTICS_URL, token, {
      startDate: isoDate(addDays(today, -2)), endDate: isoDate(today), dimensions: ["hour", "query", "page"],
      dimensionFilterGroups: filters(), dataState: "hourly_all", type: "web", rowLimit: 25_000,
    }, fetchImpl),
    googlePost(INSPECTION_URL, token, { inspectionUrl: MAP_URL, siteUrl: SITE, languageCode: "en-US" }, fetchImpl),
    fetchImpl(MAP_URL, {
      redirect: "follow", cache: "no-store",
      headers: {
        "cache-control": "no-cache, no-store, max-age=0",
        pragma: "no-cache",
        "user-agent": "john-ta-monitor/1.0 (+https://john-ta.com/tools/monitoring/)",
      },
      signal: AbortSignal.timeout(30_000),
    }),
  ]);

  const currentByQuery = aggregateRows(currentResponse.rows ?? []);
  const previousByQuery = aggregateRows(previousResponse.rows ?? []);
  const current = summarizeCore(currentByQuery);
  const previous = summarizeCore(previousByQuery);
  const queries = queryDetails(currentByQuery, previousByQuery);
  const provisionalWindows = hourlyWindows(hourlyResponse.rows ?? []);
  const live = parseLivePage(await liveResponse.text(), liveResponse.status);
  const idx = inspectionResponse.inspectionResult?.indexStatusResult ?? {};
  const inspection = {
    verdict: idx.verdict ?? null,
    indexed: idx.verdict === "PASS" && /indexed/i.test(idx.coverageState ?? ""),
    coverageState: idx.coverageState ?? null,
    lastCrawl: idx.lastCrawlTime ?? null,
    fetchState: idx.pageFetchState ?? null,
    robots: idx.robotsTxtState ?? null,
    googleCanonical: idx.googleCanonical ?? null,
    userCanonical: idx.userCanonical ?? null,
  };
  const assessment = assess({ current, previous, queries, inspection, live, provisionalWindows });
  const latestWindow = provisionalWindows.at(-1) ?? null;
  const mapFirstCount = queries.filter((query) => query.tier === "core" && query.firstNextcardUrl === MAP_URL).length;

  return {
    monitorId: "paze-clover-map-ranking",
    timestamp: new Date().toISOString(),
    status: assessment.status,
    summary: `Paze Clover map: ${assessment.reason}`,
    durationMs: Math.round(performance.now() - started),
    // The backend already creates feed items when status changes. Mark only
    // alerts as independently meaningful so a stable WATCH does not spam the
    // feed three times per day.
    meaningful: assessment.status === "alert",
    eventType: assessment.failures.length
      ? assessment.failures.some((failure) => /Live|Google|canonical|robots|fetch|H1/i.test(failure))
        ? "technical-failure"
        : "cannibalization"
      : assessment.warnings.length ? "ranking-change" : "status",
    metrics: {
      clicks: current.clicks,
      previousClicks: previous.clicks,
      impressions: current.impressions,
      previousImpressions: previous.impressions,
      ctr: current.ctr,
      previousCtr: previous.ctr,
      position: current.position,
      previousPosition: previous.position,
      mapImpressionShare: current.mapImpressionShare,
      previousMapImpressionShare: previous.mapImpressionShare,
      mapClickShare: current.mapClickShare,
      previousMapClickShare: previous.mapClickShare,
      mapFirstCount,
      queryCount: CORE_QUERIES.length,
      serpMapFirstCount: mapFirstCount,
      serpQueryCount: CORE_QUERIES.length,
    },
    details: {
      period: `${periods.period.startDate} to ${periods.period.endDate}`,
      previousPeriod: `${periods.previousPeriod.startDate} to ${periods.previousPeriod.endDate}`,
      provisional: latestWindow ? {
        asOf: latestWindow.hour,
        clicks: latestWindow.clicks,
        impressions: latestWindow.impressions,
        position: latestWindow.position,
        mapClickShare: latestWindow.mapClickShare,
        mapImpressionShare: latestWindow.mapImpressionShare,
      } : null,
      provisionalWindows: provisionalWindows.slice(-12),
      queries,
      inspection,
      live,
      failures: assessment.failures,
      warnings: assessment.warnings,
      shiftedCoreQueries: assessment.shifts.map((query) => query.query),
      recommendation: assessment.failures[0] || assessment.warnings[0] || "No immediate change; preserve the current map, guide, and hub state.",
    },
    sourceUrls: [MAP_URL, GUIDE_URL, TOOLS_URL],
  };
}

function unavailableReport(error, started) {
  return {
    monitorId: "paze-clover-map-ranking",
    timestamp: new Date().toISOString(),
    status: "unavailable",
    summary: `Paze Clover map monitoring unavailable: ${error.message}`,
    durationMs: Math.round(performance.now() - started),
    meaningful: false,
    eventType: "technical-failure",
    metrics: {},
    details: {
      failures: [error.message],
      recommendation: "Restore Google API or network access, then rerun; do not infer a ranking change from this incomplete check.",
    },
    sourceUrls: [MAP_URL, GUIDE_URL, TOOLS_URL],
  };
}

export async function collectReport(fetchImpl = fetch) {
  return collect(fetchImpl);
}

async function main() {
  const started = performance.now();
  let report;
  try {
    report = await collectReport();
  } catch (error) {
    report = unavailableReport(error instanceof Error ? error : new Error("Unknown monitor failure"), started);
  }

  if (process.argv.includes("--report")) {
    const secret = process.env.MONITORING_REPORT_SECRET || await readFile(REPORT_SECRET_PATH, "utf8");
    await submitExternalReport(report, { secret });
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "unavailable" || report.status === "error") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Paze Clover ranking monitor failed: ${error.message}`);
    process.exitCode = 1;
  });
}
