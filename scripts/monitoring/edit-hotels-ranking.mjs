#!/usr/bin/env node
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { accessToken, parseLivePage } from './bilt-ranking.mjs';
import { submitExternalReport } from './report-external.mjs';

export const ORIGINAL = 'https://www.nextcard.com/articles/cheapest-edit-hotels';
export const SELECT = 'https://www.nextcard.com/articles/cheapest-select-hotels-credit-edit-hotels';
export const KEYWORDS = [
  ['cheapest edit hotels', 'Primary'],
  ['cheapest the edit hotels', 'Core'],
  ['cheapest edit hotels chase', 'Core'],
  ['cheapest the edit hotels chase', 'Core'],
  ['cheapest chase edit hotels', 'Core'],
  ['cheapest chase the edit hotels', 'Core'],
  ['cheap edit hotels', 'Value'],
  ['cheap chase edit hotels', 'Value'],
  ['most affordable edit hotels chase', 'Value'],
  ['best value edit hotels chase', 'Value'],
  ['cheapest the edit hotels in the us', 'Value'],
  ['cheapest chase edit hotels in usa', 'Value'],
  ['chase edit hotels', 'Broad'],
  ['the edit hotels', 'Broad'],
  ['select hotels credit', 'Select overlap'],
  ['select hotels credit $250', 'Select overlap'],
  ['the edit and ihg credit chase', 'Select overlap'],
];
const SITE = 'sc-domain:nextcard.com';
const API = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;
const CACHE = resolve(import.meta.dirname, '../../.cache/monitoring/edit-hotels.json');
const day = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const regex = `^(${KEYWORDS.map(([q]) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`;
const filters = [{ dimension: 'country', expression: 'usa', operator: 'equals' }, { dimension: 'query', expression: regex, operator: 'includingRegex' }];

// A missing disclosed query row is not a zero rank or proof of deindexing.
export function aggregate(rows) {
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  return { clicks: impressions ? clicks : null, impressions: impressions || null,
    position: impressions ? rows.reduce((n, r) => n + r.position * r.impressions, 0) / impressions : null,
    ctr: impressions ? clicks / impressions : null };
}
const inRange = (rows, range) => rows.filter(r => r.date >= range.startDate && r.date <= range.endDate);
export function buildDetails(rows, latestDate, ownership) {
  const currentRange = { startDate: day(latestDate, -6), endDate: latestDate };
  const previousRange = { startDate: day(latestDate, -13), endDate: day(latestDate, -7) };
  const recentRange = { startDate: day(latestDate, -2), endDate: latestDate };
  const baselineRange = { startDate: '2026-10-10', endDate: '2026-10-16' };
  const queries = KEYWORDS.map(([query, group]) => {
    const selected = rows.filter(r => r.query === query);
    const current = aggregate(inRange(selected, currentRange));
    const previous = aggregate(inRange(selected, previousRange));
    const baseline = aggregate(inRange(selected, baselineRange));
    const recent = aggregate(inRange(selected, recentRange));
    const urls = [...new Set(ownership.filter(r => r.query === query).map(r => r.page))].map(page => ({
      page, ...aggregate(ownership.filter(r => r.query === query && r.page === page)),
    })).sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0));
    return { query, group, ...current, previousPosition: previous.position, previousImpressions: previous.impressions,
      baseline, recent, urls,
      devices: ['MOBILE', 'DESKTOP'].map(device => ({ device, ...aggregate(inRange(selected.filter(r => r.device === device), recentRange)) })) };
  });
  const daily = [];
  for (let date = day(latestDate, -27); date <= latestDate; date = day(date, 1)) {
    daily.push({ date, ...aggregate(rows.filter(r => r.query === KEYWORDS[0][0] && r.date === date)) });
  }
  return { currentRange, previousRange, recentRange, baselineRange, queries, daily };
}

export function assess(details, failures = [], issues = []) {
  const primary = details.queries[0];
  const warnings = [];
  const signals = [];
  for (const q of details.queries.filter(q => ['Primary', 'Core'].includes(q.group))) {
    if (q.recent.impressions >= 5 && q.baseline.impressions >= 10 && q.recent.position - q.baseline.position >= 1) {
      warnings.push(`“${q.query}”: recent position ${q.recent.position.toFixed(2)} versus pre-launch ${q.baseline.position.toFixed(2)}.`);
      signals.push(`${q.query}:position-loss`);
    }
    if (q.baseline.impressions >= 14 && (q.recent.impressions ?? 0) / 3 < q.baseline.impressions / 7 * .5) {
      warnings.push(`“${q.query}”: disclosed impressions/day below half the pre-launch baseline; not proof of rank loss.`);
      signals.push(`${q.query}:visibility-loss`);
    }
    if (q.urls.some(u => u.page === SELECT)) {
      warnings.push(`Select Hotels appeared for “${q.query}”; overlap observed, not proven cannibalization.`);
      signals.push(`${q.query}:select-overlap`);
    }
  }
  const status = failures.length ? 'alert' : issues.length ? 'unavailable' : warnings.length ? 'watch' : primary.recent.impressions >= 5 ? 'healthy' : 'unavailable';
  return { status, warnings, signals, summary: failures[0] || issues[0] || warnings[0] ||
    (status === 'healthy' ? `Exact query position ${primary.recent.position.toFixed(2)} across ${primary.recent.impressions} recent US impressions.` : 'Too few recent exact-query impressions to assess ranking confidently.') };
}

async function load(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
async function save(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
  await rename(temporary, path);
}

export async function collectReport({ fetchImpl = fetch, cache = {}, persist = async () => {}, now = new Date() } = {}) {
  const started = Date.now();
  cache.entries ??= {};
  let token;
  const checks = {}, issues = [], failures = [];
  async function request(name, url, body, ttl = 86400000) {
    const key = createHash('sha256').update(JSON.stringify([url, body])).digest('hex');
    const cached = cache.entries[key];
    if (cached && now - new Date(cached.fetchedAt) < ttl) {
      checks[name] = { status: 'cached', fetchedAt: cached.fetchedAt }; return cached.data;
    }
    try {
      if (cache.cooldownUntil > now.getTime()) throw new Error('Google API quota cooldown; retry on a later scheduled run.');
      token ??= await accessToken(JSON.parse(await readFile(process.env.GSC_KEY_FILE || resolve(homedir(), '.codex/secrets/nextcard-gsc-readonly.json'), 'utf8')), fetchImpl);
      const response = await fetchImpl(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429 || /quota|rateLimit/i.test(JSON.stringify(data.error))) {
          cache.cooldownUntil = now.getTime() + 6 * 3600000; await persist(cache);
        }
        throw new Error(data.error?.message || `Google API HTTP ${response.status}`);
      }
      cache.entries[key] = { fetchedAt: now.toISOString(), data };
      checks[name] = { status: 'fresh', fetchedAt: now.toISOString() };
      for (const [k, entry] of Object.entries(cache.entries)) if (now - new Date(entry.fetchedAt) > 35 * 86400000) delete cache.entries[k];
      await persist(cache);
      return data;
    } catch (e) { issues.push(`${name}: ${e.message}`); checks[name] = { status: 'unavailable' }; return null; }
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const availability = await request('finalizedDates', API, { startDate: day(today, -10), endDate: day(today, -1), dimensions: ['date'], dataState: 'final', type: 'web', rowLimit: 25 }, 3 * 3600000);
  const latestDate = availability?.rows?.map(r => r.keys[0]).sort().at(-1) ?? null;
  let details = null;
  if (latestDate) {
    const startDate = day(latestDate, -27);
    const base = { startDate, endDate: latestDate, dataState: 'final', type: 'web', dimensionFilterGroups: [{ filters }], rowLimit: 25000 };
    // Site aggregation measures the site's topmost result. Page aggregation is kept separate for ownership.
    const daily = await request('dailyQueries', API, { ...base, aggregationType: 'byProperty', dimensions: ['date', 'query', 'device'] });
    const baseline = await request('preLaunchBaseline', API, { ...base, startDate: '2026-10-10', endDate: '2026-10-16', aggregationType: 'byProperty', dimensions: ['date', 'query', 'device'] }, 365 * 86400000);
    const urls = await request('queryUrls', API, { ...base, startDate: day(latestDate, -2), aggregationType: 'byPage', dimensions: ['query', 'page'] });
    if (daily?.rows?.length === 25000 || urls?.rows?.length === 25000) issues.push('Row limit reached; query coverage may be truncated.');
    const disclosed = new Map([...(baseline?.rows ?? []), ...(daily?.rows ?? [])].map(r => [JSON.stringify(r.keys), r]));
    const rows = [...disclosed.values()].map(r => ({ date: r.keys[0], query: r.keys[1], device: r.keys[2], clicks: r.clicks, impressions: r.impressions, position: r.position }));
    const ownership = (urls?.rows ?? []).map(r => ({ query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position }));
    details = buildDetails(rows, latestDate, ownership);
    if (day(today, -4) > latestDate) issues.push(`Finalized data is stale: ends ${latestDate}.`);
  } else issues.push('No finalized GSC date available.');
  const pages = [];
  for (const url of [ORIGINAL, SELECT]) {
    let live = null;
    try {
      const response = await fetchImpl(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(25000) });
      live = { ...parseLivePage(await response.text(), response.status), headerRobots: response.headers.get('x-robots-tag') };
      if (live.httpStatus !== 200 || /noindex/i.test(`${live.robots} ${live.headerRobots}`) || live.canonical !== url) failures.push(`${url}: HTTP, noindex, or canonical check failed.`);
    } catch (e) { issues.push(`${url}: live check unavailable: ${e.message}`); }
    const inspection = await request(`index:${url}`, 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: SITE, languageCode: 'en-US' });
    const index = inspection?.inspectionResult?.indexStatusResult ?? null;
    if (index && (index.verdict !== 'PASS' || (index.googleCanonical && index.googleCanonical !== url))) failures.push(`${url}: indexed canonical or coverage needs review.`);
    pages.push({ url, live, index });
  }
  const assessment = details ? assess(details, failures, issues) : { status: 'unavailable', warnings: [], signals: [], summary: issues[0] };
  const fingerprint = JSON.stringify([assessment.status, assessment.signals, failures, issues.map(i => i.split(':')[0])]);
  const meaningful = cache.lastPublishedFingerprint !== fingerprint;
  const primary = details?.queries[0];
  return { report: { monitorId: 'edit-hotels-ranking', timestamp: now.toISOString(), status: assessment.status,
    summary: `Edit hotels: ${assessment.summary}`, durationMs: Date.now() - started, meaningful,
    eventType: failures.length ? 'technical-alert' : issues.length ? 'data-unavailable' : assessment.status === 'watch' ? 'ranking-watch' : 'status',
    metrics: { ...aggregate([]), ...(primary ? { clicks: primary.clicks, impressions: primary.impressions, position: primary.position, ctr: primary.ctr, recentPosition: primary.recent.position, baselinePosition: primary.baseline.position } : {}), keywordCount: KEYWORDS.length },
    details: { ...details, pages, checks, issues, failures, warnings: assessment.warnings,
      source: 'US Google Web Search; finalized data only. Average position is not a live organic rank. Query privacy can suppress rows. URL counts are page-aggregated and must not be summed into site totals.',
      launchDate: '2026-10-17', latestFinalDate: latestDate }, sourceUrls: [ORIGINAL, SELECT] }, fingerprint };
}

async function main() {
  const cache = await load(CACHE);
  const { report, fingerprint } = await collectReport({ cache, persist: data => save(CACHE, data) });
  if (process.argv.includes('--report')) {
    const secret = await readFile(resolve(homedir(), '.codex/secrets/john-ta-monitoring-report-secret'), 'utf8');
    await submitExternalReport(report, { secret });
    // Only acknowledge a new alert state after the dashboard accepted the report.
    cache.lastPublishedFingerprint = fingerprint;
    await save(CACHE, cache);
  }
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(`Edit monitor failed: ${e.message}`); process.exitCode = 1; });
