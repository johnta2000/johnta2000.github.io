import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const html = await readFile(resolve(root, "tools/monitoring/index.html"), "utf8");
const app = await readFile(resolve(root, "tools/monitoring/app.js"), "utf8");
const workflow = await readFile(resolve(root, ".github/workflows/paze-monitor.yml"), "utf8");

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
});

test("hourly workflow syncs with a secret and stores history outside the Pages path", () => {
  assert.match(workflow, /MONITORING_INGEST_SECRET: \$\{\{ secrets\.MONITORING_INGEST_SECRET \}\}/);
  assert.match(workflow, /git add \.github\/monitoring-data/);
});
