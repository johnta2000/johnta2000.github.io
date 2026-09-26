import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanName,
  collectCities,
  createFreshnessContext,
  diffCities,
  fetchWithRetry,
  parseCityPage,
  restaurantKey,
  sameCities,
  needsRebaseline,
  COLLECTION_VERSION,
  CITY_SOURCES,
  runMonitor,
  markLegacyClaims,
  restaurantTotals,
  correctHistoricalCounts,
} from "./chase-reserve-tables.mjs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const city = { id: "test-city", metroId: 8, name: "Test City", url: "https://www.opentable.com/sapphire-reserve/test-city" };
const page = (names, overrides = {}) => `<h1>Exclusive Tables</h1><script id="primary-window-vars" type="application/json">${JSON.stringify({ windowVariables: { __INITIAL_STATE__: { chaseDiningProgramLanding: {
  metroId: 8, isLoading: false, activeTab: "reservations", pageNumber: 1, limit: 30,
  totalRestaurantCount: names.length, restaurants: names.map((name, index) => ({ restaurantId: index + 1, name })), ...overrides,
} } } })}</script>`;

test("headline and change totals count each restaurant ID once across overlapping markets", () => {
  const a = { key: "opentable:1", name: "Shared restaurant" };
  const b = { key: "opentable:2", name: "Second" };
  const previous = [{ restaurants: [a] }, { restaurants: [a] }];
  const current = [{ restaurants: [a, b] }, { restaurants: [a, b] }];
  assert.deepEqual(restaurantTotals(current, previous), { count: 2, previousCount: 1, listingCount: 4, addedCount: 1, removedCount: 0 });
  assert.equal(restaurantTotals([{ restaurants: [a] }], previous).removedCount, 0);
  const history = { runs: [{ collectionVersion: 2, timestamp: "baseline", initialized: true, count: 4, previousCount: 4 }] };
  correctHistoricalCounts(history, { capturedAt: "baseline", cities: current });
  assert.equal(history.runs[0].count, 2);
  assert.equal(history.runs[0].previousCount, 2);
  assert.equal(history.runs[0].countUnit, "unique-restaurants");
  assert.match(history.runs[0].summary, /2 unique restaurants/);
});

test("normalizes restaurant names and HTML entities", () => {
  assert.equal(cleanName(" O&#x27; by  Claude &amp; Co. "), "O' by Claude & Co.");
  assert.equal(restaurantKey("Harriet’s"), restaurantKey("Harriet's"));
});

test("extracts only a plausible Exclusive Tables restaurant list", () => {
  assert.deepEqual(parseCityPage(page(["Lazy Betty", "Füm"]), city).restaurants.map(({ name }) => name), ["Lazy Betty", "Füm"]);
  assert.throws(() => parseCityPage("<h3>Unrelated</h3>", city), /Exclusive Tables heading/);
  assert.throws(() => parseCityPage(page([], { totalRestaurantCount: 3 }), city), /incomplete/);
  assert.throws(() => parseCityPage(page(["A"], { metroId: 99 }), city), /metadata/);
  assert.throws(() => parseCityPage("<h1>Exclusive Tables</h1><h3>A</h3>", city), /metadata/);
});

test("cache-busts every request and retry with no-store headers", async () => {
  const calls = [];
  const freshness = createFreshnessContext({ now: () => 1_700_000_000_000, runId: "tables-run" });
  const fakeFetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    if (calls.length === 1) throw new Error("temporary failure");
    return new Response(page(["Restaurant A"]), { status: 200 });
  };

  await fetchWithRetry(city, fakeFetch, { attempts: 2, freshness, wait: async () => {} });

  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].url.searchParams.get("_monitor_ts"), calls[1].url.searchParams.get("_monitor_ts"));
  for (const call of calls) {
    assert.equal(call.init.cache, "no-store");
    assert.equal(call.init.headers["cache-control"], "no-cache, no-store, max-age=0");
    assert.equal(call.init.headers.pragma, "no-cache");
  }
});

test("collects every configured city with distinct freshness identifiers", async () => {
  const sources = [city, { ...city, id: "second", name: "Second", url: "https://www.opentable.com/sapphire-reserve/second" }];
  const urls = [];
  const freshness = createFreshnessContext({ now: () => 1_700_000_000_000, runId: "six-city-run" });
  const fakeFetch = async (url) => {
    urls.push(new URL(url));
    return new Response(page([url.toString().includes("second") ? "Second Place" : "First Place"]), { status: 200 });
  };

  const result = await collectCities(fakeFetch, { sources, freshness });

  assert.equal(result.cities.length, 2);
  assert.equal(result.cache.requestCount, 2);
  assert.equal(new Set(urls.map((url) => url.searchParams.get("_monitor_ts"))).size, 2);
});

test("detects additions and removals independently by city", () => {
  const restaurant = (name) => ({ name, key: restaurantKey(name) });
  const previous = [{ ...city, restaurants: [restaurant("Alpha"), restaurant("Gone")] }];
  const current = [{ ...city, restaurants: [restaurant("Alpha"), restaurant("Added")] }];

  assert.deepEqual(diffCities(previous, current), [{
    id: city.id,
    name: city.name,
    url: city.url,
    count: 2,
    previousCount: 2,
    added: ["Added"],
    removed: ["Gone"],
  }]);
});

test("requires the confirmation crawl to reproduce every city set", () => {
  const restaurant = (name) => ({ name, key: restaurantKey(name) });
  const first = [{ ...city, restaurants: [restaurant("Alpha"), restaurant("Beta")] }];
  const same = [{ ...city, restaurants: [restaurant("Alpha"), restaurant("Beta")] }];
  const different = [{ ...city, restaurants: [restaurant("Alpha"), restaurant("Gamma")] }];

  assert.equal(sameCities(first, same), true);
  assert.equal(sameCities(first, different), false);
});

test("collects page two and ignores ordering and names for membership identity", async () => {
  const fetchImpl = async url => new Response(new URL(url).searchParams.get("pageNumber") === "2"
    ? page([], { pageNumber: 2, limit: 2, totalRestaurantCount: 3, restaurants: [{ restaurantId: 3, name: "Mitsuru" }] })
    : page(["Blu on the Hudson", "Razza"], { limit: 2, totalRestaurantCount: 3 }));
  const result = await collectCities(fetchImpl, { sources: [city] });
  assert.equal(result.cities[0].restaurants.length, 3);
  assert.equal(result.cities[0].completeness.pages, 2);
  assert.equal(result.cache.requestCount, 2);
  const renamed = structuredClone(result.cities);
  renamed[0].restaurants[0].name = "Renamed";
  assert.equal(sameCities(result.cities, renamed), true);
  assert.deepEqual(diffCities(result.cities, renamed)[0].removed, []);
});

test("rejects overlapping pages and changing totals, even with plausible headings", async () => {
  for (const scenario of ["duplicate", "total"]) {
    const fetchImpl = async url => {
      const second = new URL(url).searchParams.get("pageNumber") === "2";
      return new Response(page([], { pageNumber: second ? 2 : 1, limit: 1,
        totalRestaurantCount: second && scenario === "total" ? 3 : 2,
        restaurants: [{ restaurantId: second && scenario === "total" ? 2 : 1, name: "A" }] }));
    };
    await assert.rejects(collectCities(fetchImpl, { sources: [city] }), /pagination/);
  }
});

test("coverage includes every verified official market, including New Jersey", () => {
  assert.equal(CITY_SOURCES.length, 52);
  assert.equal(new Set(CITY_SOURCES.map(c => c.metroId)).size, 52);
  assert.ok(CITY_SOURCES.some(c => c.id === "new-jersey"));
  assert.ok(CITY_SOURCES.some(c => c.id === "seattle"));
  assert.equal(needsRebaseline({ cities: [city] }, [city]), true);
  assert.equal(needsRebaseline({ collectionVersion: COLLECTION_VERSION, cities: [city] }, [city]), false);
  assert.equal(needsRebaseline({ collectionVersion: COLLECTION_VERSION, cities: [city] }, CITY_SOURCES), true);
});

test("withdraws legacy alerts without deleting historical evidence or touching other monitors", () => {
  const cities = [{ name: "New York City", added: ["Blu"], removed: ["Mitsuru"] }];
  const history = { runs: [{ changed: true, confirmed: true, summary: "Old claim", cities }] };
  const feed = { events: [{ monitorId: "chase-sapphire-reserve-tables", type: "restaurant_change", summary: "Old claim", cities },
    { monitorId: "other", type: "restaurant_change", summary: "Keep" }] };
  markLegacyClaims(history, feed);
  assert.equal(history.runs[0].changed, false);
  assert.equal(history.runs[0].confirmed, false);
  assert.deepEqual(history.runs[0].legacyClaim.cities, cities);
  assert.equal(feed.events[0].type, "monitor_correction");
  assert.equal(feed.events[1].summary, "Keep");
});

test("migration is silent; partial or unconfirmed runs preserve the baseline; complete changes publish", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chase-monitor-test-"));
  const dataPaths = Object.fromEntries(["baseline", "history", "pazeBaseline", "pazeHistory", "state", "feed"].map(key => [key, join(dir, `${key}.json`)]));
  const old = { cities: [{ ...city, restaurants: [{ name: "Old partial list", key: "old" }] }] };
  await writeFile(dataPaths.baseline, JSON.stringify(old));
  const options = { dataPaths, sources: [city], publish: async () => {}, now: () => new Date("2026-09-26T20:00:00Z") };
  let calls = 0;
  const initial = await runMonitor({ ...options, fetchImpl: async () => { calls++; return new Response(page(["Blu", "Mitsuru"])); } });
  assert.equal(initial.initialized, true);
  assert.equal(initial.changed, false);
  assert.equal(calls, 2);
  assert.deepEqual(JSON.parse(await readFile(dataPaths.feed)).events, []);
  const goodBaseline = await readFile(dataPaths.baseline, "utf8");
  calls = 0;
  const failed = await runMonitor({ ...options, fetchImpl: async () => new Response(page(["Blu"], { restaurants: [{ restaurantId: ++calls === 1 ? 3 : 4, name: "New" }] })) });
  assert.equal(failed.status, "error");
  assert.equal(await readFile(dataPaths.baseline, "utf8"), goodBaseline);
  process.exitCode = 0;
  const changed = await runMonitor({ ...options, fetchImpl: async () => new Response(page(["Blu"])) });
  assert.equal(changed.changed, true);
  assert.deepEqual(changed.cities[0].removed, ["Mitsuru"]);
});
