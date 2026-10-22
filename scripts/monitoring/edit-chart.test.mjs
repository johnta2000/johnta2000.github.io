import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const context = { window: {} };
runInNewContext(await readFile(new URL('../../tools/monitoring/edit-chart.js', import.meta.url), 'utf8'), context);
const chart = context.window.EditDailyChart;
const details = { launchDate: '2026-10-17', queries: [{ baseline: { position: 2.48 } }], daily: [
  { date: '2026-10-16', position: 2.5, impressions: 4, clicks: 0 },
  { date: '2026-10-18', position: 3.5, impressions: 2, clicks: 1 },
  { date: '2026-10-19', position: null, impressions: null, clicks: null },
] };
test('calendar gaps and missing values break lines rather than become rank zero', () => {
  const points = chart.series(details.daily, 'position');
  assert.equal(points.length, 4);
  assert.equal(points[1].value, null);
  const html = chart.plot(details);
  const path = html.match(/class="query-chart-line edit-chart-line" d="([^"]+)"/)[1];
  assert.equal((path.match(/M/g) ?? []).length, 2);
  assert.ok(!path.includes('L'));
  assert.match(html, /Not observed/);
});
test('baseline and launch marker stay distinct and counts preserve zero', () => {
  assert.match(chart.plot(details), /Oct 10–16 baseline: 2.48/);
  assert.match(chart.plot(details), /Select launch/);
  assert.doesNotMatch(chart.plot(details, 'clicks'), /edit-chart-baseline/);
  assert.equal(chart.series(details.daily, 'clicks')[0].value, 0);
});
test('empty, one-day and narrow charts have no invalid SVG values', () => {
  for (const d of [{}, details, { daily: [details.daily[0]] }]) {
    for (const metric of ['position', 'clicks', 'impressions']) assert.doesNotMatch(chart.plot(d, metric, 300), /NaN|undefined|Infinity/);
  }
  assert.match(chart.markup(), /not proof of causation/);
});
