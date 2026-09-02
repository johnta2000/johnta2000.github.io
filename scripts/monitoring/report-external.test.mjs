import test from "node:test";
import assert from "node:assert/strict";

import { submitExternalReport, validateExternalReport } from "./report-external.mjs";

const sample = {
  monitorId: "paze-clover-map-ranking",
  timestamp: "2026-08-31T18:00:00.000Z",
  status: "healthy",
  summary: "The map leads all five core queries.",
  meaningful: false,
  metrics: { clicks: 2653, impressions: 6368 },
  details: { inspection: { indexed: true } },
  sourceUrls: ["https://www.nextcard.com/tools/clover-paze-map"],
};

test("validates a sanitized external report", () => {
  assert.deepEqual(validateExternalReport(sample), {
    ...sample,
    durationMs: null,
    eventType: "status",
  });
});

test("accepts the Chase Exclusive Tables monitor identity", () => {
  const report = validateExternalReport({ ...sample, monitorId: "chase-sapphire-reserve-tables" });
  assert.equal(report.monitorId, "chase-sapphire-reserve-tables");
});

test("rejects unsupported monitors and non-HTTPS sources", () => {
  assert.throws(() => validateExternalReport({ ...sample, monitorId: "other" }), /Unsupported monitorId/);
  assert.throws(() => validateExternalReport({ ...sample, sourceUrls: ["http://example.com"] }), /HTTPS/);
  assert.throws(() => validateExternalReport({ ...sample, sourceUrls: Array(13).fill("https://example.com") }), /12 HTTPS/);
});

test("accepts the Bilt calculator ranking monitor", () => {
  const report = validateExternalReport({
    ...sample,
    monitorId: "bilt-calculator-ranking",
    summary: "The Bilt calculator remains indexed and its core-query position is stable.",
    metrics: { clicks: 143, impressions: 1289, position: 4.9, ctr: 11.1 },
    sourceUrls: ["https://www.nextcard.com/tools/bilt-calculator"],
  });
  assert.equal(report.monitorId, "bilt-calculator-ranking");
  assert.equal(report.metrics.position, 4.9);
});

test("submits only the secret and validated report to Convex", async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ status: "success", value: { updatedAt: 1 } }) };
  };

  await submitExternalReport(sample, {
    fetchImpl,
    secret: "x".repeat(32),
    convexUrl: "https://example.convex.cloud",
  });

  assert.equal(request.url, "https://example.convex.cloud/api/mutation");
  const body = JSON.parse(request.init.body);
  assert.equal(body.path, "monitoring:report");
  assert.equal(body.args.secret, "x".repeat(32));
  assert.equal(body.args.report.monitorId, sample.monitorId);
  assert.equal(body.args.report.durationMs, null);
});
