import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

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
  assert.match(app, /monitoring:overview/);
  assert.match(app, /Authorization: `Bearer \$\{token\}`/);
});

test("public page does not reference repository JSON", () => {
  assert.doesNotMatch(html, /data\/change-feed\.json/);
  assert.doesNotMatch(app, /loadJson|DATA_ROOT/);
  assert.match(app, /_monitor_ts/);
  assert.match(app, /cache: "no-store"/);
  assert.match(app, /Cache-Control": "no-cache, no-store, max-age=0/);
});

test("dashboard assets and authenticated snapshot refresh cannot remain stale", () => {
  assert.match(html, /styles\.css\?v=20261022\.1/);
  assert.match(html, /app\.js\?v=20261028\.1/);
  assert.match(html, /id="refresh-button"/);
  assert.match(app, /function refreshDashboard/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /60_000/);
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
  assert.match(app, /function positionHistoryMarkup/);
  assert.match(app, />Position history</);
  assert.match(app, /Starred dates are partial/);
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

test("Chase Exclusive Tables runs every four hours with complete, fresh market crawls", () => {
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
  assert.match(backend, /saveMonitor/);
  assert.match(backend, /bilt-calculator-ranking/);
});

test("an incomplete Chase check shows its cause, saved-list time, and unverified changes", () => {
  const context = vm.createContext({ document: { querySelector: () => ({}) }, Intl, Date });
  vm.runInContext(app.slice(0, app.indexOf('els.lockButton.addEventListener')), context);
  const monitor = { id: "chase-sapphire-reserve-tables", status: "error",
    error: "Atlanta: The operation was aborted due to timeout", latestSuccessAt: "2026-10-27T20:47:50.610Z",
    metrics: { uniqueRestaurantCount: 435, cityCount: 52, addedCount: 0, removedCount: 0 }, details: {} };
  const render = status => vm.runInContext(`currentSnapshot = {monitorHistory:{}}; chaseDialogMarkup(${JSON.stringify({ ...monitor, status })})`, context);
  const failed = render("error");
  assert.match(failed, /Atlanta: The operation was aborted due to timeout/);
  assert.match(failed, /Last verified/);
  assert.match(failed, /Oct 27, 2026/);
  assert.match(failed, /Saved restaurant lists/);
  assert.match(failed, /Latest additions<\/span><strong>—<\/strong>/);
  assert.match(failed, /Latest removals<\/span><strong>—<\/strong>/);
  assert.match(failed, />435<\/strong>/);
  const healthy = render("healthy");
  assert.match(healthy, /Latest additions<\/span><strong>0<\/strong>/);
  assert.match(healthy, /All markets checked successfully/);
  assert.doesNotMatch(healthy, /Not verified — check incomplete/);
});
