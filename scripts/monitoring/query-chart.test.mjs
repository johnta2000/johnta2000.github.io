import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../../tools/monitoring/query-chart.js', import.meta.url), 'utf8'), context);
const { windows, points } = context.window.MonitorQueryChart;
const run = (date, timestamp, clicks = 10, extra = {}) => ({
  timestamp, status: 'healthy', metrics: { clicks, ctr: 0.025, position: 4 },
  details: { currentRange: { startDate: '2026-09-28', endDate: date }, queries: [{ query: 'bilt calculator', clicks, ctr: 0.1, position: 3 }] }, ...extra,
});
test('windows are chronological, deduplicated by final date, and prefer the newest completed check', () => {
  const history = windows({ ...run('2026-10-02', '2026-10-05T16:00:00Z', 30), latestRunAt: '2026-10-05T16:00:00Z' }, [
    run('2026-10-02', '2026-10-05T10:00:00Z', 20),
    run('2026-10-01', '2026-10-04T10:00:00Z'),
    run('2026-10-02', '2026-10-05T18:00:00Z', 0, { status: 'error' }),
    { timestamp: '2026-10-05T20:00:00Z', details: {} },
  ]);
  assert.deepEqual(Array.from(history, (window) => window.date), ['2026-10-01', '2026-10-02']);
  assert.equal(history[1].metrics.clicks, 30);
});
test('query gaps stay missing, zero clicks stay zero, and CTR converts fractions to percent', () => {
  const history = windows({}, [
    run('2026-10-01', '2026-10-04T10:00:00Z', 0),
    run('2026-10-02', '2026-10-05T10:00:00Z', 10, { details: { currentRange: { endDate: '2026-10-02' }, queries: [] } }),
  ]);
  assert.deepEqual(Array.from(points(history, 'bilt calculator', 'clicks'), (point) => point.value), [0, null]);
  assert.equal(points(history, 'bilt calculator', 'ctr')[0].value, 10);
  assert.equal(points(history, '', 'ctr')[0].value, 2.5);
});
test('null metrics and zero positions are not plotted as a ranking gain', () => {
  const history = [{ date: '2026-10-01', metrics: { position: 0, clicks: null }, queries: [] }];
  assert.equal(points(history, '', 'position')[0].value, null);
  assert.equal(points(history, '', 'clicks')[0].value, null);
});
