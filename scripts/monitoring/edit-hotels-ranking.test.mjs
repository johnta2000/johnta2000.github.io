import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aggregate, buildDetails, assess, KEYWORDS, ORIGINAL, SELECT } from './edit-hotels-ranking.mjs';
import { validateExternalReport } from './report-external.mjs';
const row = (date, position, impressions = 10, device = 'MOBILE', query = KEYWORDS[0][0]) => ({ date, position, impressions, device, query, clicks: 1 });
const rows = [row('2026-10-10', 2.5, 30), row('2026-10-18', 5, 10)];
test('missing observations are null, not rank zero', () => assert.deepEqual(aggregate([]), { clicks: null, impressions: null, position: null, ctr: null }));
test('position is impression weighted', () => assert.equal(aggregate([row('x', 2, 10), row('x', 4, 30)]).position, 3.5));
test('exact query is isolated from healthier variants and segments', () => {
  const d = buildDetails([...rows, row('2026-10-18', 1, 100, 'DESKTOP', KEYWORDS[1][0])], '2026-10-19', []);
  assert.equal(d.queries[0].recent.position, 5);
  assert.equal(d.queries[0].baseline.position, 2.5);
  assert.equal(d.queries[0].devices[1].position, null);
  assert.equal(d.daily.find(r => r.date === '2026-10-19').position, null);
  assert.equal(assess(d).status, 'watch');
});
test('ownership does not contaminate site aggregate; all nextcard URLs retained', () => {
  const d = buildDetails(rows, '2026-10-19', [ORIGINAL, SELECT, 'https://www.nextcard.com/other'].map(page => ({ ...row('2026-10-18', 3, 50), page })));
  assert.equal(d.queries[0].urls.length, 3);
  assert.equal(d.queries[0].recent.impressions, 10);
  assert.match(assess(d).warnings.join(' '), /not proven cannibalization/);
});
test('API failures and sparse observations cannot report recovery', () => {
  const d = buildDetails([row('2026-10-18', 2, 1)], '2026-10-19', []);
  assert.equal(assess(d).status, 'unavailable');
  assert.equal(assess(buildDetails(rows, '2026-10-19', []), [], ['quota']).status, 'unavailable');
  assert.equal(assess(d, ['noindex']).status, 'alert');
});
test('bundle contains 17 distinct queries and report identity is accepted', () => {
  assert.equal(new Set(KEYWORDS.map(r => r[0])).size, 17);
  assert.equal(validateExternalReport({ monitorId: 'edit-hotels-ranking', timestamp: new Date().toISOString(), status: 'watch', summary: 'Test' }).monitorId, 'edit-hotels-ranking');
});
test('dashboard has dedicated exact-query, URL and daily evidence', async () => {
  const app = await readFile(new URL('../../tools/monitoring/app.js', import.meta.url), 'utf8');
  for (const label of ['editRankingDialogMarkup', 'Pre-launch position', 'Which nextcard URLs appeared?', 'Exact-query daily history']) assert.ok(app.includes(label));
});
