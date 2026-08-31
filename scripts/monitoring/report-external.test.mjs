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

test("rejects unsupported monitors and non-HTTPS sources", () => {
  assert.throws(() => validateExternalReport({ ...sample, monitorId: "other" }), /Unsupported monitorId/);
  assert.throws(() => validateExternalReport({ ...sample, sourceUrls: ["http://example.com"] }), /HTTPS/);
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
