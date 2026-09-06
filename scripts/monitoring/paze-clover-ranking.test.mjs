import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_QUERIES,
  CORE_QUERIES,
  GUIDE_URL,
  MAP_URL,
  TOOLS_URL,
  aggregateRows,
  assess,
  parseLivePage,
  periodBounds,
  queryDetails,
  summarizeCore,
} from "./paze-clover-ranking.mjs";

test("builds adjacent finalized seven-day periods", () => {
  assert.deepEqual(periodBounds("2026-08-28"), {
    period: { startDate: "2026-08-22", endDate: "2026-08-28" },
    previousPeriod: { startDate: "2026-08-15", endDate: "2026-08-21" },
  });
});

test("parses the crawlable map safeguards from live HTML", () => {
  const live = parseLivePage(`
    <html><head>
      <title>Paze Clover Map</title>
      <link rel="canonical" href="${MAP_URL}">
    </head><body>
      <h1>Paze Clover Map</h1>
      <p>35,501 merchants available</p>
      <h2>Sample Clover merchants in the Paze map</h2>
    </body></html>
  `, 200);

  assert.equal(live.httpStatus, 200);
  assert.equal(live.canonical, MAP_URL);
  assert.equal(live.h1Count, 1);
  assert.equal(live.hasMerchantCount, true);
  assert.equal(live.hasMerchantSample, true);
  assert.equal(live.hasPrematureEmptyState, false);
  assert.equal(live.hasInitialSignupCallout, false);
});

test("ignores empty-state phrases and substrings that only occur in scripts or larger counts", () => {
  const live = parseLivePage(`
    <html><head><link rel="canonical" href="${MAP_URL}"></head><body>
      <h1>Paze Clover Map</h1>
      <p>35,501 merchants available</p>
      <p>Sample Clover merchants in the Paze map</p>
      <p>Found 700 restaurants with no delivery fee</p>
      <script>self.__next_f.push(["No restaurants found", "0 restaurants", "Sign up to fully unlock"])</script>
    </body></html>
  `, 200);

  assert.equal(live.hasPrematureEmptyState, false);
  assert.equal(live.hasInitialSignupCallout, false);
});

test("watches when impression ownership stays below half but the map has not lost core queries", () => {
  const stableLive = {
    httpStatus: 200,
    canonical: MAP_URL,
    robots: "none",
    h1Count: 1,
    hasMerchantCount: true,
    hasMerchantSample: true,
    hasPrematureEmptyState: false,
    hasInitialSignupCallout: false,
  };
  const result = assess({
    current: {
      clicks: 20,
      impressions: 400,
      position: 3,
      mapClickShare: 40,
      mapImpressionShare: 35,
      totalClicks: 50,
      totalImpressions: 1_000,
    },
    previous: {
      clicks: 25,
      impressions: 450,
      position: 2.5,
      mapClickShare: 45,
      mapImpressionShare: 40,
      totalClicks: 55,
      totalImpressions: 1_100,
    },
    queries: [],
    inspection: {
      verdict: "PASS",
      fetchState: "SUCCESSFUL",
      robots: "ALLOWED",
      googleCanonical: MAP_URL,
    },
    live: stableLive,
    provisionalWindows: [],
  });

  assert.equal(result.status, "watch");
  assert.match(result.warnings.join(" "), /below 50%/);
  assert.equal(result.failures.length, 0);
});

test("aggregates core metrics without mixing discovery queries", () => {
  const rows = [
    { keys: [CORE_QUERIES[0], MAP_URL], clicks: 4, impressions: 10, position: 2 },
    { keys: [CORE_QUERIES[0], TOOLS_URL], clicks: 0, impressions: 5, position: 6 },
    { keys: [CORE_QUERIES[0], GUIDE_URL], clicks: 1, impressions: 5, position: 7 },
    { keys: [ALL_QUERIES[5], MAP_URL], clicks: 100, impressions: 100, position: 1 },
  ];
  const aggregated = aggregateRows(rows);
  assert.deepEqual(summarizeCore(aggregated), {
    clicks: 4,
    impressions: 10,
    ctr: 40,
    position: 2,
    mapClickShare: 80,
    mapImpressionShare: 50,
    totalClicks: 5,
    totalImpressions: 20,
  });
});

test("emits all 15 query rows in stable core-then-discovery order", () => {
  const details = queryDetails(aggregateRows([]));
  assert.equal(details.length, 15);
  assert.deepEqual(details.map(({ query }) => query), ALL_QUERIES);
  assert.equal(details[0].tier, "core");
  assert.equal(details[5].tier, "discovery");
});
