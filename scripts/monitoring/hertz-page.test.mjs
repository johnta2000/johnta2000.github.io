import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const html = await readFile(resolve(root, "hertz-las-may-2027/index.html"), "utf8");
const app = await readFile(resolve(root, "hertz-las-may-2027/app.js"), "utf8");
const styles = await readFile(resolve(root, "hertz-las-may-2027/styles.css"), "utf8");
const workflow = await readFile(resolve(root, ".github/workflows/hertz-las-may-2027-monitor.yml"), "utf8");

test("Hertz price watch is a standalone static page", () => {
  assert.ok(html.includes("JT<span>/</span>HERTZ WATCH"));
  assert.match(html, /id="price-chart"/);
  assert.match(html, /id="options-chart"/);
  assert.match(html, /id="capacity-chart"/);
  assert.match(html, /id="run-rows"/);
  assert.match(app, /fetch\(`history\.json\?ts=/);
  assert.doesNotMatch(html, /Clerk|Convex|tools\/monitoring/);
  assert.doesNotMatch(app, /Clerk|Convex|tools\/monitoring/);
});

test("standalone page includes threshold, evidence, and failure presentation", () => {
  assert.match(app, /thresholdDailyRateUsd/);
  assert.match(app, /criteriaVersion/);
  assert.match(app, /legacySuccessful/);
  assert.match(app, /eligibleVehicles/);
  assert.match(app, /rawEvidenceExcerpt/);
  assert.match(app, /Latest attempt unavailable/);
  assert.match(html, /6–12 seats/);
  assert.match(styles, /chart-threshold/);
});

test("scheduled job updates both durable and public history", () => {
  assert.match(workflow, /cron: "27 15 \* \* \*"/);
  assert.match(workflow, /\.github\/monitoring-data\/hertz-las-may-2027-history\.json/);
  assert.match(workflow, /git add hertz-las-may-2027\/history\.json/);
  assert.doesNotMatch(workflow, /Report collector failure/);
  assert.doesNotMatch(workflow, /MONITORING_REPORT_SECRET|convex/i);
});
