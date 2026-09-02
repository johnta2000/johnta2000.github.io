#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");
const DATA_DIR = resolve(ROOT, ".github/monitoring-data");
const CONVEX_URL = process.env.CONVEX_URL || "https://rapid-shark-565.convex.cloud";
const MONITOR_ID = "chase-sapphire-reserve-tables";
const HISTORY_LIMIT = 180;
const FEED_LIMIT = 100;

export const CITY_SOURCES = [
  { id: "atlanta", name: "Atlanta", url: "https://www.opentable.com/sapphire-reserve/atlanta" },
  { id: "san-francisco", name: "San Francisco", url: "https://www.opentable.com/sapphire-reserve/san-francisco" },
  { id: "los-angeles", name: "Los Angeles", url: "https://www.opentable.com/sapphire-reserve/los-angeles" },
  { id: "new-york-city", name: "New York City", url: "https://www.opentable.com/sapphire-reserve/new-york-city" },
  { id: "chicago", name: "Chicago", url: "https://www.opentable.com/sapphire-reserve/chicago" },
  { id: "boston", name: "Boston", url: "https://www.opentable.com/sapphire-reserve/boston" },
];

const paths = {
  baseline: resolve(DATA_DIR, "chase-reserve-tables-baseline.json"),
  history: resolve(DATA_DIR, "chase-reserve-tables-history.json"),
  pazeBaseline: resolve(DATA_DIR, "paze-baseline.json"),
  pazeHistory: resolve(DATA_DIR, "history.json"),
  state: resolve(DATA_DIR, "state.json"),
  feed: resolve(DATA_DIR, "change-feed.json"),
};

export function decodeHtml(value) {
  const named = { amp: "&", apos: "'", quot: '"', nbsp: " ", lt: "<", gt: ">" };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower[0] === "#") {
      const hex = lower[1] === "x";
      const point = Number.parseInt(lower.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return named[lower] ?? match;
  });
}

export function cleanName(value) {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, " ")
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function restaurantKey(value) {
  return cleanName(value)
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseCityPage(html, city) {
  if (!/<h1[^>]*>[\s\S]*?Exclusive Tables[\s\S]*?<\/h1>/i.test(html)) {
    throw new Error(`${city.name} did not contain the Exclusive Tables heading.`);
  }

  const restaurants = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)]
    .map((match) => cleanName(match[1]))
    .filter(Boolean)
    .map((name) => ({ name, key: restaurantKey(name) }));
  const unique = [...new Map(restaurants.map((restaurant) => [restaurant.key, restaurant])).values()];

  if (!unique.length || unique.length > 60) {
    throw new Error(`${city.name} returned an implausible restaurant count of ${unique.length}.`);
  }
  if (unique.length !== restaurants.length) {
    throw new Error(`${city.name} contained duplicate normalized restaurant headings.`);
  }

  return unique.sort((a, b) => a.key.localeCompare(b.key));
}

export function createFreshnessContext({ now = Date.now, runId = String(now()) } = {}) {
  let sequence = 0;
  const requests = [];
  return {
    runId,
    next({ crawlId, cityId, attempt }) {
      sequence += 1;
      const requestId = String((now() * 1000) + sequence);
      requests.push({ requestId, crawlId, cityId, attempt });
      return requestId;
    },
    snapshot() {
      return {
        runId,
        requestCount: requests.length,
        crawlIds: [...new Set(requests.map(({ crawlId }) => crawlId))],
        requestIds: requests.map(({ requestId }) => requestId),
      };
    },
  };
}

export async function fetchWithRetry(city, fetchImpl, {
  attempts = 3,
  crawlId = "primary",
  freshness = createFreshnessContext(),
  wait = (delay) => new Promise((done) => setTimeout(done, delay)),
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL(city.url);
      url.searchParams.set("_monitor_ts", freshness.next({ crawlId, cityId: city.id, attempt }));
      const response = await fetchImpl(url, {
        cache: "no-store",
        redirect: "follow",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache, no-store, max-age=0",
          pragma: "no-cache",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return parseCityPage(await response.text(), city);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(750 * attempt);
    }
  }
  throw new Error(`${city.name}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function collectCities(fetchImpl = fetch, {
  crawlId = "primary",
  freshness = createFreshnessContext(),
  sources = CITY_SOURCES,
} = {}) {
  const cities = await Promise.all(sources.map(async (city) => ({
    ...city,
    restaurants: await fetchWithRetry(city, fetchImpl, { crawlId, freshness }),
  })));
  return { cities, cache: freshness.snapshot() };
}

export function diffCities(previous = [], current = []) {
  const previousById = new Map(previous.map((city) => [city.id, city]));
  return current.map((city) => {
    const before = previousById.get(city.id)?.restaurants ?? [];
    const beforeKeys = new Set(before.map(({ key }) => key));
    const currentKeys = new Set(city.restaurants.map(({ key }) => key));
    return {
      id: city.id,
      name: city.name,
      url: city.url,
      count: city.restaurants.length,
      previousCount: before.length,
      added: city.restaurants.filter(({ key }) => !beforeKeys.has(key)).map(({ name }) => name),
      removed: before.filter(({ key }) => !currentKeys.has(key)).map(({ name }) => name),
    };
  });
}

function hasChanges(cities) {
  return cities.some((city) => city.added.length || city.removed.length);
}

export function sameCities(first, second) {
  if (first.length !== second.length) return false;
  return first.every((city, index) => (
    city.id === second[index]?.id
    && city.restaurants.length === second[index].restaurants.length
    && city.restaurants.every((restaurant, restaurantIndex) => restaurant.key === second[index].restaurants[restaurantIndex]?.key)
  ));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function eventId(timestamp, type) {
  return `${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}-${MONITOR_ID}-${type}`;
}

function createState({ previousState, run, baseline, feed }) {
  const previousMonitors = Array.isArray(previousState?.monitors) ? previousState.monitors : [];
  const previousMonitor = previousMonitors.find(({ id }) => id === MONITOR_ID) ?? {};
  const addedCount = run.cities.reduce((sum, city) => sum + city.added.length, 0);
  const removedCount = run.cities.reduce((sum, city) => sum + city.removed.length, 0);
  const monitor = {
    id: MONITOR_ID,
    name: "Chase Sapphire Reserve Exclusive Tables",
    description: "Tracks restaurant-list membership across six OpenTable Sapphire Reserve Exclusive Tables markets.",
    configured: true,
    status: run.status === "success" ? "healthy" : "error",
    sourceUrl: CITY_SOURCES[0].url,
    sourceUrls: CITY_SOURCES.map(({ url }) => url),
    cadence: "Every 4 hours",
    latestRunAt: run.timestamp,
    latestSuccessAt: run.status === "success" ? run.timestamp : previousMonitor.latestSuccessAt ?? null,
    latestChangeAt: run.changed ? run.timestamp : previousMonitor.latestChangeAt ?? null,
    durationMs: run.durationMs,
    summary: run.summary,
    error: run.error,
    metrics: {
      restaurantCount: baseline.cities.reduce((sum, city) => sum + city.restaurants.length, 0),
      cityCount: baseline.cities.length,
      addedCount,
      removedCount,
    },
    details: {
      cities: baseline.cities.map((city) => {
        const cityRun = run.cities.find(({ id }) => id === city.id);
        return {
          id: city.id,
          name: city.name,
          url: city.url,
          count: city.restaurants.length,
          restaurants: city.restaurants.map(({ name }) => name),
          added: cityRun?.added ?? [],
          removed: cityRun?.removed ?? [],
        };
      }),
      cache: run.cache,
    },
  };

  const monitors = previousMonitors.filter(({ id }) => id !== MONITOR_ID);
  monitors.push(monitor);
  const order = ["paze-directory", "paze-clover-map-ranking", "transfer-bonus-discovery", MONITOR_ID];
  monitors.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const activeStatuses = monitors.filter(({ configured }) => configured).map(({ status }) => status);
  const overallStatus = activeStatuses.some((status) => status === "error" || status === "alert")
    ? "attention"
    : activeStatuses.some((status) => status === "watch" || status === "unavailable") ? "watch" : "healthy";

  return {
    ...(previousState ?? {}),
    schemaVersion: 1,
    generatedAt: run.timestamp,
    overallStatus,
    latestEventId: feed.events[0]?.id ?? null,
    monitors,
  };
}

async function publishToConvex(snapshot) {
  const secret = process.env.MONITORING_INGEST_SECRET;
  if (!secret) {
    if (process.env.CI) throw new Error("MONITORING_INGEST_SECRET is not configured for secure Convex sync.");
    return { skipped: true };
  }
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "monitoring:ingest", args: { secret, snapshot } }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") {
    throw new Error(result.errorMessage || result.message || "Secure Convex sync failed.");
  }
  return result.value;
}

export async function runMonitor({ fetchImpl = fetch, now = () => new Date() } = {}) {
  const started = performance.now();
  const startedAt = now();
  const timestamp = startedAt.toISOString();
  const freshness = createFreshnessContext({ runId: String(startedAt.getTime()) });
  const baseline = await readJson(paths.baseline, {
    schemaVersion: 1,
    monitorId: MONITOR_ID,
    capturedAt: null,
    sources: CITY_SOURCES,
    cities: [],
  });
  const history = await readJson(paths.history, { schemaVersion: 1, maxRuns: HISTORY_LIMIT, runs: [] });
  const pazeBaseline = await readJson(paths.pazeBaseline, {});
  const pazeHistory = await readJson(paths.pazeHistory, {});
  const previousState = await readJson(paths.state, null);
  const feed = await readJson(paths.feed, {
    schemaVersion: 1,
    feedId: "john-ta-monitoring-changes",
    generatedAt: timestamp,
    latestEventId: null,
    events: [],
  });
  const priorStatus = previousState?.monitors?.find(({ id }) => id === MONITOR_ID)?.status;
  let nextBaseline = baseline;
  let run;

  try {
    const first = await collectCities(fetchImpl, { crawlId: "primary", freshness });
    const initialized = !baseline.cities.length;
    const cities = initialized
      ? first.cities.map((city) => ({ id: city.id, name: city.name, url: city.url, count: city.restaurants.length, previousCount: city.restaurants.length, added: [], removed: [] }))
      : diffCities(baseline.cities, first.cities);
    const changed = !initialized && hasChanges(cities);
    let confirmed = !changed;

    if (changed) {
      const confirmation = await collectCities(fetchImpl, { crawlId: "confirmation", freshness });
      if (!sameCities(first.cities, confirmation.cities)) {
        throw new Error("A potential restaurant-list change was not reproduced by the confirmation crawl.");
      }
      confirmed = true;
    }

    nextBaseline = {
      schemaVersion: 1,
      monitorId: MONITOR_ID,
      capturedAt: timestamp,
      sources: CITY_SOURCES,
      cities: first.cities,
    };
    const totalCount = first.cities.reduce((sum, city) => sum + city.restaurants.length, 0);
    const previousCount = initialized
      ? totalCount
      : baseline.cities.reduce((sum, city) => sum + city.restaurants.length, 0);
    const addedCount = cities.reduce((sum, city) => sum + city.added.length, 0);
    const removedCount = cities.reduce((sum, city) => sum + city.removed.length, 0);
    const summary = initialized
      ? `Validated the initial six-city baseline of ${totalCount} restaurants.`
      : changed
        ? `${addedCount} restaurants added and ${removedCount} removed across six cities.`
        : `No restaurant-list changes across six cities (${totalCount} restaurants).`;

    run = {
      id: timestamp,
      monitorId: MONITOR_ID,
      timestamp,
      status: "success",
      changed,
      initialized,
      confirmed,
      meaningful: changed,
      eventType: changed ? "restaurant-change" : "status",
      durationMs: Math.round(performance.now() - started),
      count: totalCount,
      previousCount,
      cities,
      cache: freshness.snapshot(),
      summary,
      error: null,
    };
  } catch (error) {
    run = {
      id: timestamp,
      monitorId: MONITOR_ID,
      timestamp,
      status: "error",
      changed: false,
      initialized: false,
      confirmed: false,
      meaningful: priorStatus !== "error",
      eventType: "fetch-failure",
      durationMs: Math.round(performance.now() - started),
      count: null,
      previousCount: baseline.cities.reduce((sum, city) => sum + city.restaurants.length, 0) || null,
      cities: [],
      cache: freshness.snapshot(),
      summary: "The six-city crawl was incomplete; the last successful restaurant baseline was preserved.",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let event = null;
  if (run.changed) {
    event = {
      id: eventId(timestamp, "restaurant-change"),
      type: "restaurant_change",
      severity: "change",
      monitorId: MONITOR_ID,
      timestamp,
      title: "Chase Sapphire Reserve Exclusive Tables changed",
      summary: run.summary,
      count: run.count,
      cities: run.cities.filter((city) => city.added.length || city.removed.length),
      dashboardUrl: "https://john-ta.com/tools/monitoring/",
      sourceUrls: CITY_SOURCES.map(({ url }) => url),
    };
  } else if (run.status === "error" && priorStatus !== "error") {
    event = {
      id: eventId(timestamp, "failure"),
      type: "monitor_failure",
      severity: "error",
      monitorId: MONITOR_ID,
      timestamp,
      title: "Chase Exclusive Tables monitor failed",
      summary: run.error,
      dashboardUrl: "https://john-ta.com/tools/monitoring/",
      sourceUrls: CITY_SOURCES.map(({ url }) => url),
    };
  } else if (run.status === "success" && priorStatus === "error") {
    event = {
      id: eventId(timestamp, "recovery"),
      type: "monitor_recovery",
      severity: "recovery",
      monitorId: MONITOR_ID,
      timestamp,
      title: "Chase Exclusive Tables monitor recovered",
      summary: run.summary,
      dashboardUrl: "https://john-ta.com/tools/monitoring/",
      sourceUrls: CITY_SOURCES.map(({ url }) => url),
    };
  }

  if (event) feed.events.unshift(event);
  feed.generatedAt = timestamp;
  feed.events = feed.events.slice(0, FEED_LIMIT);
  feed.latestEventId = feed.events[0]?.id ?? null;
  history.runs = [run, ...history.runs].slice(0, HISTORY_LIMIT);
  history.maxRuns = HISTORY_LIMIT;
  const state = createState({ previousState, run, baseline: nextBaseline, feed });

  await Promise.all([
    writeJson(paths.baseline, nextBaseline),
    writeJson(paths.history, history),
    writeJson(paths.feed, feed),
    writeJson(paths.state, state),
  ]);

  try {
    await publishToConvex({
      state,
      history: pazeHistory,
      baseline: pazeBaseline,
      feed,
      monitorHistory: { [MONITOR_ID]: history },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }

  const label = run.status === "success" ? "PASS" : "FAIL";
  console.log(`${label} ${run.summary} (${run.durationMs} ms; freshness ${run.cache.runId})`);
  if (run.error) console.error(run.error);
  if (run.status !== "success") process.exitCode = 1;
  return run;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runMonitor();
}
