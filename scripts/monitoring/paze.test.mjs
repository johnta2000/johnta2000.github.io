import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanName,
  merchantKey,
  parsePage,
  diffMerchants,
  collectDirectory,
  createFreshnessContext,
  fetchWithRetry,
} from "./paze.mjs";

function page(names, next = null) {
  const cards = names.map((name) => `<a aria-label="Visit ${name} website"></a>`).join("");
  const pager = next === null
    ? ""
    : `<a class="button" href="?page=${next}" title="Load more items" rel="next">Load More</a>`;
  return `${cards}${pager}`;
}

test("normalizes superficial merchant formatting", () => {
  assert.equal(cleanName(" Harry &amp;  David "), "Harry & David");
  assert.equal(merchantKey("The Harry & David"), merchantKey("Harry and David"));
});

test("extracts server-rendered aria-labels and continuation", () => {
  const parsed = parsePage(page(["Acme", "Harry &amp; David"], 1), 0);
  assert.deepEqual(parsed.merchants.map(({ name }) => name), ["Acme", "Harry & David"]);
  assert.equal(parsed.nextHref, "?page=1");
});

test("collects only consecutive paginated results", async () => {
  const responses = [page(["Alpha"], 1), page(["Beta"])];
  const fakeFetch = async (url) => {
    const index = Number(new URL(url).searchParams.get("page"));
    return new Response(responses[index], { status: 200 });
  };
  const result = await collectDirectory(fakeFetch);
  assert.equal(result.merchants.length, 2);
  assert.deepEqual(result.pagination.pageCounts, [1, 1]);
});

test("validates consecutive pagination when Paze echoes an HTML-escaped cache key", async () => {
  const responses = [
    page(["Alpha"], 1).replace('href="?page=1"', 'href="?_monitor_ts=123&amp;page=1"'),
    page(["Beta"]),
  ];
  const fakeFetch = async (url) => new Response(responses[Number(new URL(url).searchParams.get("page"))], { status: 200 });
  const result = await collectDirectory(fakeFetch);
  assert.deepEqual(result.pagination.pageCounts, [1, 1]);
});

test("cache-busts every request and retry with no-store headers", async () => {
  const calls = [];
  const freshness = createFreshnessContext({ now: () => 1_700_000_000_000, runId: "run-1" });
  const fakeFetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    if (calls.length === 1) throw new Error("temporary failure");
    return new Response(page(["Alpha"]), { status: 200 });
  };

  await fetchWithRetry("https://www.paze.com/merchant-directory?page=0", fakeFetch, {
    attempts: 2,
    freshness,
    wait: async () => {},
  });

  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].url.searchParams.get("_monitor_ts"), calls[1].url.searchParams.get("_monitor_ts"));
  for (const { url, init } of calls) {
    assert.match(url.searchParams.get("_monitor_ts"), /^\d+$/);
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers["cache-control"], "no-cache, no-store, max-age=0");
    assert.equal(init.headers.pragma, "no-cache");
  }
});

test("uses distinct cache identifiers for primary and confirmation crawls", async () => {
  const urls = [];
  const freshness = createFreshnessContext({ now: () => 1_700_000_000_000, runId: "run-2" });
  const fakeFetch = async (url) => {
    urls.push(new URL(url));
    return new Response(page(["Alpha"]), { status: 200 });
  };

  await collectDirectory(fakeFetch, { crawlId: "primary", freshness });
  const confirmation = await collectDirectory(fakeFetch, { crawlId: "confirmation", freshness });

  assert.notEqual(urls[0].searchParams.get("_monitor_ts"), urls[1].searchParams.get("_monitor_ts"));
  assert.deepEqual(confirmation.cache.crawlIds, ["primary", "confirmation"]);
  assert.equal(confirmation.cache.requestCount, 2);
  assert.equal(confirmation.cache.runId, "run-2");
});

test("rejects broken pagination", async () => {
  const fakeFetch = async () => new Response(page(["Alpha"], 2), { status: 200 });
  await assert.rejects(() => collectDirectory(fakeFetch), /pointed to page 2/);
});

test("distinguishes additions, removals, and likely renames", () => {
  const wrap = (names) => names.map((name) => ({ name, key: merchantKey(name) }));
  assert.deepEqual(diffMerchants(wrap(["Alpha", "Old Merchant", "Gone"]), wrap(["Alpha", "New Merchant", "Added"])), {
    added: ["Added"],
    removed: ["Gone"],
    renamed: [{ from: "Old Merchant", to: "New Merchant" }],
  });
});
