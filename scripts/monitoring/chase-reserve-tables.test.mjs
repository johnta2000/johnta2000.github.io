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
} from "./chase-reserve-tables.mjs";

const city = { id: "test-city", name: "Test City", url: "https://www.opentable.com/sapphire-reserve/test-city" };
const page = (names) => `<main><h1>Exclusive Tables</h1>${names.map((name) => `<h3>${name}</h3>`).join("")}</main>`;

test("normalizes restaurant names and HTML entities", () => {
  assert.equal(cleanName(" O&#x27; by  Claude &amp; Co. "), "O' by Claude & Co.");
  assert.equal(restaurantKey("Harriet’s"), restaurantKey("Harriet's"));
});

test("extracts only a plausible Exclusive Tables restaurant list", () => {
  assert.deepEqual(parseCityPage(page(["Lazy Betty", "Füm"]), city).map(({ name }) => name), ["Füm", "Lazy Betty"]);
  assert.throws(() => parseCityPage("<h3>Unrelated</h3>", city), /Exclusive Tables heading/);
  assert.throws(() => parseCityPage(page([]), city), /implausible restaurant count/);
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
  const sources = [city, { id: "second", name: "Second", url: "https://www.opentable.com/sapphire-reserve/second" }];
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
