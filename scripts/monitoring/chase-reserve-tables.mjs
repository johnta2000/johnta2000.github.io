#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { CITY_SOURCES } from "./chase-reserve-sources.mjs";
export { CITY_SOURCES };
export const COLLECTION_VERSION = 2;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");
const DATA_DIR = resolve(ROOT, ".github/monitoring-data");
const CONVEX_URL = process.env.CONVEX_URL || "https://rapid-shark-565.convex.cloud";
const MONITOR_ID = "chase-sapphire-reserve-tables";
const HISTORY_LIMIT = 180;
const FEED_LIMIT = 100;

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

export function parseCityPage(html, city, expectedPage = 1) {
  if (!/<h1[^>]*>[\s\S]*?Exclusive Tables[\s\S]*?<\/h1>/i.test(html)) {
    throw new Error(`${city.name} did not contain the Exclusive Tables heading.`);
  }

  const script = html.match(/<script\b[^>]*\bid="primary-window-vars"[^>]*>([\s\S]*?)<\/script>/i);
  const data = script && JSON.parse(script[1]).windowVariables?.__INITIAL_STATE__?.chaseDiningProgramLanding;
  if (!data || data.isLoading !== false || data.activeTab !== "reservations"
    || data.metroId !== city.metroId || data.pageNumber !== expectedPage
    || !Number.isInteger(data.totalRestaurantCount) || data.totalRestaurantCount < 0 || data.totalRestaurantCount > 2000
    || !Number.isInteger(data.limit) || data.limit < 1 || data.limit > 200
    || !Array.isArray(data.restaurants)) {
    throw new Error(`${city.name}: missing or invalid city/pagination metadata for page ${expectedPage}.`);
  }
  const restaurants = data.restaurants.map(({ restaurantId, name }) => {
    if (!Number.isInteger(restaurantId) || restaurantId <= 0 || typeof name !== "string" || !cleanName(name)) {
      throw new Error(`${city.name}: invalid restaurant identity on page ${expectedPage}.`);
    }
    return { id: String(restaurantId), name: cleanName(name), key: `opentable:${restaurantId}` };
  });
  const expectedCount = Math.max(0, Math.min(data.limit, data.totalRestaurantCount - (expectedPage - 1) * data.limit));
  if (restaurants.length !== expectedCount || new Set(restaurants.map(r => r.key)).size !== restaurants.length) {
    throw new Error(`${city.name}: incomplete or duplicate restaurants on page ${expectedPage}.`);
  }
  return { restaurants, total: data.totalRestaurantCount, pageNumber: data.pageNumber, limit: data.limit };
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
  pageNumber = 1,
  crawlId = "primary",
  freshness = createFreshnessContext(),
  wait = (delay) => new Promise((done) => setTimeout(done, delay)),
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL(city.url);
      url.searchParams.set("pageNumber", String(pageNumber));
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
      return parseCityPage(await response.text(), city, pageNumber);
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
  // Bound concurrency as coverage grows. A failure anywhere preserves the entire baseline.
  const cities = new Array(sources.length);
  let cursor = 0;
  const results = await Promise.allSettled(Array.from({ length: Math.min(4, sources.length) }, async () => {
    while (cursor < sources.length) {
      const index = cursor++;
      const city = sources[index];
      const first = await fetchWithRetry(city, fetchImpl, { crawlId, freshness });
      const restaurants = [...first.restaurants];
      const pageCount = Math.max(1, Math.ceil(first.total / first.limit));
      for (let pageNumber = 2; pageNumber <= pageCount; pageNumber++) {
        const page = await fetchWithRetry(city, fetchImpl, { crawlId, freshness, pageNumber });
        if (page.total !== first.total || page.limit !== first.limit) {
          throw new Error(`${city.name}: pagination totals changed during collection.`);
        }
        restaurants.push(...page.restaurants);
      }
      if (new Set(restaurants.map(r => r.key)).size !== first.total) {
        throw new Error(`${city.name}: pagination overlap or missing restaurants; refusing partial list.`);
      }
      cities[index] = { ...city, restaurants: restaurants.sort((a, b) => a.key.localeCompare(b.key)),
        completeness: { total: first.total, pages: pageCount, complete: true } };
    }
  }));
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw new Error(failures.map(result => result.reason.message).join("; "));
  return { cities, cache: freshness.snapshot() };
}

export function needsRebaseline(baseline, sources = CITY_SOURCES) {
  return baseline.collectionVersion !== COLLECTION_VERSION
    || baseline.cities.length !== sources.length
    || sources.some(source => !baseline.cities.some(city => city.id === source.id && city.metroId === source.metroId));
}

export function restaurantTotals(cities, previous = cities) {
  const keys = new Set(cities.flatMap(city => city.restaurants.map(r => r.key)));
  const before = new Set(previous.flatMap(city => city.restaurants.map(r => r.key)));
  return { count: keys.size, previousCount: before.size,
    listingCount: cities.reduce((sum, city) => sum + city.restaurants.length, 0),
    addedCount: [...keys].filter(key => !before.has(key)).length,
    removedCount: [...before].filter(key => !keys.has(key)).length };
}

export function correctHistoricalCounts(history, baseline) {
  let knownSnapshot = false;
  for (const run of [...history.runs].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))) {
    if (run.timestamp === baseline.capturedAt) knownSnapshot = true;
    if (run.collectionVersion === COLLECTION_VERSION && run.countUnit !== "unique-restaurants") {
      run.countUnit = "market-listings";
      if (knownSnapshot && run.status !== "error") {
        run.listingCount = run.count;
        run.count = restaurantTotals(baseline.cities).count;
        run.countUnit = "unique-restaurants";
        if (run.initialized || !run.changed) run.previousCount = run.count;
        else run.previousCount = null; // Old overlapping totals cannot establish a unique prior count.
        if (run.initialized) run.summary = `Established a complete ${baseline.cities.length}-market baseline of ${run.count} unique restaurants.`;
        else if (!run.changed) run.summary = `No restaurant-list changes across ${baseline.cities.length} markets (${run.count} unique restaurants).`;
      }
    }
    // Stable runs share the same complete snapshot, so their older totals can be
    // corrected exactly. Stop at a membership change; never guess prior totals.
    if (run.changed) knownSnapshot = false;
  }
}

export function markLegacyClaims(history, feed) {
  for (const run of history.runs) {
    if (run.changed && run.collectionVersion !== COLLECTION_VERSION) {
      run.legacyClaim = { summary: run.summary, cities: run.cities };
      run.changed = false;
      run.confirmed = false;
      run.meaningful = false;
      run.eventType = "legacy-unverified";
      run.summary = "Unverified historical change: the old collector did not read all pages.";
    }
  }
  for (const event of feed.events) {
    if (event.monitorId === MONITOR_ID && event.type === "restaurant_change" && event.collectionVersion !== COLLECTION_VERSION) {
      event.legacyClaim = { summary: event.summary, cities: event.cities };
      event.type = "monitor_correction";
      event.severity = "info";
      event.title = "Historical Chase list alert is unverified";
      event.summary = "This alert came from an incomplete list. A corrected baseline replaces it; it is not evidence of a restaurant joining or leaving.";
      event.cities = [];
    }
  }
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
  const addedCount = run.addedCount ?? 0;
  const removedCount = run.removedCount ?? 0;
  const monitor = {
    id: MONITOR_ID,
    name: "Chase Sapphire Reserve Exclusive Tables",
    description: `Tracks complete restaurant lists across ${CITY_SOURCES.length} OpenTable Sapphire Reserve Exclusive Tables markets.`,
    configured: true,
    status: run.status === "success" ? "healthy" : "error",
    sourceUrl: CITY_SOURCES[0].url,
    sourceUrls: CITY_SOURCES.map(({ url }) => url),
    cadence: "Every 4 hours",
    latestRunAt: run.timestamp,
    latestSuccessAt: run.status === "success" ? run.timestamp : previousMonitor.latestSuccessAt ?? null,
    latestChangeAt: run.initialized ? null : run.changed ? run.timestamp : previousMonitor.latestChangeAt ?? null,
    durationMs: run.durationMs,
    summary: run.summary,
    error: run.error,
    metrics: {
      restaurantCount: restaurantTotals(baseline.cities).count,
      uniqueRestaurantCount: restaurantTotals(baseline.cities).count,
      listingCount: restaurantTotals(baseline.cities).listingCount,
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
      collectionVersion: baseline.collectionVersion ?? 1,
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

export async function runMonitor({ fetchImpl = fetch, now = () => new Date(), dataPaths = paths,
  sources = CITY_SOURCES, publish = publishToConvex } = {}) {
  const paths = dataPaths;
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
    const first = await collectCities(fetchImpl, { crawlId: "primary", freshness, sources });
    const initialized = needsRebaseline(baseline, sources);
    const cities = initialized
      ? first.cities.map((city) => ({ id: city.id, name: city.name, url: city.url, count: city.restaurants.length, previousCount: city.restaurants.length, added: [], removed: [] }))
      : diffCities(baseline.cities, first.cities);
    const changed = !initialized && hasChanges(cities);
    let confirmed = !changed;

    if (changed || initialized) {
      const confirmation = await collectCities(fetchImpl, { crawlId: "confirmation", freshness, sources });
      if (!sameCities(first.cities, confirmation.cities)) {
        throw new Error("A potential restaurant-list change was not reproduced by the confirmation crawl.");
      }
      confirmed = true;
    }

    nextBaseline = {
      schemaVersion: 1,
      collectionVersion: COLLECTION_VERSION,
      monitorId: MONITOR_ID,
      capturedAt: timestamp,
      sources,
      cities: first.cities,
    };
    const totals = restaurantTotals(first.cities, initialized ? first.cities : baseline.cities);
    const { count: totalCount, previousCount, addedCount, removedCount } = totals;
    const summary = initialized
      ? `Established a complete ${sources.length}-market baseline of ${totalCount} unique restaurants; coverage corrections are not membership changes.`
      : changed
        ? `${addedCount} unique restaurants added and ${removedCount} removed; market lists changed across ${sources.length} markets.`
        : `No restaurant-list changes across ${sources.length} markets (${totalCount} unique restaurants).`;

    run = {
      id: timestamp,
      monitorId: MONITOR_ID,
      timestamp,
      status: "success",
      collectionVersion: COLLECTION_VERSION,
      changed,
      initialized,
      confirmed,
      meaningful: changed,
      eventType: changed ? "restaurant-change" : "status",
      durationMs: Math.round(performance.now() - started),
      count: totalCount,
      countUnit: "unique-restaurants",
      listingCount: totals.listingCount,
      addedCount,
      removedCount,
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
      previousCount: restaurantTotals(baseline.cities).count,
      countUnit: "unique-restaurants",
      cities: [],
      cache: freshness.snapshot(),
      summary: "The full-market crawl was incomplete; the last successful restaurant baseline was preserved.",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let event = null;
  correctHistoricalCounts(history, baseline);
  if (run.status === "success" && run.initialized) markLegacyClaims(history, feed);
  if (run.changed) {
    event = {
      id: eventId(timestamp, "restaurant-change"),
      type: "restaurant_change",
      collectionVersion: COLLECTION_VERSION,
      severity: "change",
      monitorId: MONITOR_ID,
      timestamp,
      title: "Chase Sapphire Reserve Exclusive Tables changed",
      summary: run.summary,
      count: run.count,
      countUnit: run.countUnit,
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
    await publish({
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
