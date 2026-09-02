import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const html = await readFile(resolve(root, "tools/monitoring/index.html"), "utf8");
const app = await readFile(resolve(root, "tools/monitoring/app.js"), "utf8");
const workflow = await readFile(resolve(root, ".github/workflows/paze-monitor.yml"), "utf8");
const chaseWorkflow = await readFile(resolve(root, ".github/workflows/chase-reserve-tables-monitor.yml"), "utf8");
const chaseCollector = await readFile(resolve(root, "scripts/monitoring/chase-reserve-tables.mjs"), "utf8");
const reporter = await readFile(resolve(root, "scripts/monitoring/report-external.mjs"), "utf8");
const backend = await readFile(resolve(root, "convex/monitoring.ts"), "utf8");

test("dashboard starts locked and loads Clerk", () => {
  assert.match(html, /id="access-gate"/);
  assert.match(html, /id="app" hidden/);
  assert.match(html, /data-clerk-publishable-key=/);
  assert.match(app, /monitoring:dashboard/);
  assert.match(app, /Authorization: `Bearer \$\{token\}`/);
});

test("public page does not reference repository JSON", () => {
  assert.doesNotMatch(html, /data\/change-feed\.json/);
  assert.doesNotMatch(app, /loadJson|DATA_ROOT/);
  assert.match(app, /_monitor_ts/);
  assert.match(app, /cache: "no-store"/);
  assert.match(app, /Cache-Control": "no-cache, no-store, max-age=0/);
});

test("overview keeps monitor-specific detail inside an accessible dialog", () => {
  assert.match(html, /<dialog id="monitor-dialog"/);
  assert.doesNotMatch(html, />Current merchants</);
  assert.doesNotMatch(html, />Recent runs</);
  assert.match(app, /function openMonitorDialog/);
  assert.match(app, /data-monitor-id/);
  assert.match(app, /placeholderDialogMarkup/);
  assert.match(app, /rankingDialogMarkup/);
  assert.match(app, /bonusDialogMarkup/);
  assert.match(app, /monitorHistory/);
});

test("reporting cards use the existing Codex monitor identities", () => {
  assert.match(app, /paze-clover-map-ranking/);
  assert.match(app, /bilt-calculator-ranking/);
  assert.match(app, /transfer-bonus-discovery/);
  assert.match(app, /chase-sapphire-reserve-tables/);
  assert.match(app, /chaseDialogMarkup/);
  assert.doesNotMatch(app, /Paze bonus discovery/);
});

test("hourly workflow syncs with a secret and stores history outside the Pages path", () => {
  assert.match(workflow, /MONITORING_INGEST_SECRET: \$\{\{ secrets\.MONITORING_INGEST_SECRET \}\}/);
  assert.match(workflow, /git add \.github\/monitoring-data/);
});

test("Chase Exclusive Tables runs every four hours with complete, fresh six-city crawls", () => {
  assert.match(chaseWorkflow, /cron: "23 \*\/4 \* \* \*"/);
  assert.match(chaseWorkflow, /MONITORING_INGEST_SECRET/);
  assert.match(chaseWorkflow, /group: monitoring-data-writer/);
  assert.match(workflow, /group: monitoring-data-writer/);
  assert.match(chaseCollector, /CITY_SOURCES/);
  assert.match(chaseCollector, /confirmation/);
  assert.match(chaseCollector, /_monitor_ts/);
  assert.match(chaseCollector, /no-cache, no-store, max-age=0/);
});

test("external heartbeat reports use a separate write-only credential", () => {
  assert.match(reporter, /john-ta-monitoring-report-secret/);
  assert.match(reporter, /monitoring:report/);
  assert.match(backend, /MONITORING_REPORT_SECRET/);
  assert.match(backend, /MAX_EXTERNAL_RUNS = 60/);
  assert.match(backend, /mergeIngestSnapshot/);
  assert.match(backend, /bilt-calculator-ranking/);
});
