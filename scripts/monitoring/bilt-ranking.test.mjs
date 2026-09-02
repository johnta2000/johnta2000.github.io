import test from "node:test";
import assert from "node:assert/strict";
import { assess, parseLivePage } from "./bilt-ranking.mjs";

test("parseLivePage extracts Bilt calculator SEO health fields", () => {
  const page = parseLivePage(`<!doctype html><html><head>
    <title>Bilt 2.0 Calculator</title>
    <link rel="canonical" href="https://www.nextcard.com/tools/bilt-calculator">
    <meta name="robots" content="index,follow">
  </head><body><h1>Bilt Calculator</h1></body></html>`, 200);
  assert.deepEqual(page, {
    httpStatus: 200,
    canonical: "https://www.nextcard.com/tools/bilt-calculator",
    title: "Bilt 2.0 Calculator",
    robots: "index,follow",
    h1Count: 1,
  });
});

test("assess alerts when Google selects a parameterized canonical", () => {
  const result = assess({
    current: { clicks: 20, impressions: 500, position: 6 },
    previous: { clicks: 20, impressions: 500, position: 6 },
    queries: [],
    inspection: {
      verdict: "PASS",
      fetchState: "SUCCESSFUL",
      robots: "ALLOWED",
      googleCanonical: "https://www.nextcard.com/tools/bilt-calculator?rent=3000",
    },
    live: {
      httpStatus: 200,
      robots: "index,follow",
      canonical: "https://www.nextcard.com/tools/bilt-calculator",
    },
  });
  assert.equal(result.status, "alert");
  assert.match(result.reason, /different canonical/i);
});

test("assess watches a material ranking decline", () => {
  const result = assess({
    current: { clicks: 20, impressions: 500, position: 8 },
    previous: { clicks: 20, impressions: 500, position: 6.5 },
    queries: [],
    inspection: { verdict: "PASS", fetchState: "SUCCESSFUL", robots: "ALLOWED" },
    live: {
      httpStatus: 200,
      robots: "index,follow",
      canonical: "https://www.nextcard.com/tools/bilt-calculator",
    },
  });
  assert.equal(result.status, "watch");
  assert.match(result.reason, /worsened/i);
});
