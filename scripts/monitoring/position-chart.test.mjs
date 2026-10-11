import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const app = await readFile(new URL("../../tools/monitoring/app.js", import.meta.url), "utf8");
const source = app.slice(app.indexOf("function shortHistoryDate("), app.indexOf("function rankingDialogMarkup("));
const render = runInNewContext(source + "\npositionHistoryMarkup", { escapeHtml: String });

test("history defaults to 28 days and can switch to 7 or 90 without losing observations", () => {
  const history = Array.from({ length: 90 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 6, 14 + index)).toISOString().slice(0, 10),
    position: 3, exactPosition: 2, pazeMapPosition: 4,
  }));
  for (const [range, count] of [[undefined, 28], [7, 7], [90, 90]]) {
    const chart = render(history, range);
    assert.match(chart, new RegExp(`value="${count}" selected`));
    assert.equal((chart.match(/<circle /g) ?? []).length, count * 3);
    assert.ok((chart.match(/position-chart-date/g) ?? []).length <= 8);
    assert.match(chart, /Summary cards above remain finalized 7-day totals/);
  }
});

test("calendar gaps stay empty rather than joining disconnected observations", () => {
  const chart = render([
    { date: "2026-10-01", position: 2 },
    { date: "2026-10-03", position: 4 },
  ], 7);
  assert.match(chart, /2 observed days · 3 calendar days shown/);
  assert.match(chart, /less than 7 days of history available/);
  const path = chart.match(/class="position-chart-line core" d="([^"]+)"/)[1];
  assert.equal((path.match(/M/g) ?? []).length, 2);
  assert.doesNotMatch(path, /L/);
  assert.doesNotMatch(render([], 90), /NaN/);
});

test("three series retain visible, separated values at both chart extremes", () => {
  const chart = render([
    { date: "2026-09-26", position: 1, exactPosition: 1, pazeMapPosition: 1, pazeMapImpressions: 3 },
    { date: "2026-09-27", position: 8, exactPosition: 8, pazeMapPosition: 8, partial: true },
  ]);
  const labels = [...chart.matchAll(/<text class="position-chart-value (core|exact|broad)" x="([\d.]+)" y="([\d.]+)"/g)];
  assert.equal(labels.length, 6);
  assert.equal((chart.match(/<circle /g) || []).length, 6);
  for (const offset of [0, 3]) {
    const ys = labels.slice(offset, offset + 3).map(m => +m[3]).sort((a,b) => a-b);
    assert.ok(ys[0] >= 12 && ys[2] <= 240);
    assert.ok(ys[1] - ys[0] >= 25 && ys[2] - ys[1] >= 25);
  }
  assert.match(chart, /“paze map”/);
  assert.match(chart, /3 impressions/);
  assert.doesNotMatch(chart, /NaN|undefined/);
});

test("missing paze map observations are gaps, not zeroes or interpolated lines", () => {
  const chart = render([
    { date: "2026-09-25", position: 2, pazeMapPosition: 4 },
    { date: "2026-09-26", position: 2, pazeMapPosition: null },
    { date: "2026-09-27", position: 2, pazeMapPosition: 3 },
  ]);
  const path = chart.match(/class="position-chart-line broad" d="([^"]*)"/)[1];
  assert.equal((path.match(/M/g) || []).length, 2);
  assert.doesNotMatch(path, /L/);
  assert.equal((chart.match(/<circle class="broad"/g) || []).length, 2);
});

test("legacy snapshots without the new series still render", () => {
  const chart = render([
    { date: "2026-09-26", position: 2, exactPosition: 1 },
    { date: "2026-09-27", position: 2, exactPosition: 1 },
  ]);
  assert.doesNotMatch(chart, /NaN|undefined|<circle class="broad"/);
  assert.match(chart, /paze map <strong>—/);
});
