import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeNameSearch } from '../named-picks.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const catalog = JSON.parse(html.match(/id="catalog-data">(.*?)<\/script>/s)[1]).data;
const find = makeNameSearch(catalog);

test('a spoken list retains distinct items, exact sizes and unmatched names', () => {
  const result = find("I'd like an espresso machine and a Govee 9.8ft light strip, plus a sailboat");
  assert.deepEqual(result, { ids: ['item-156','item-133'], missing: ['a sailboat'] });
});

test('alternative names stay selectable and repeated requests cannot duplicate matches', () => {
  const variants = find('Govee light strip').ids;
  assert.ok(variants.includes('item-133') && variants.includes('item-131'));
  assert.deepEqual(find('Govee light strips\nGovee lightstrip').ids, variants);
  assert.deepEqual(find('6 qt and 2 qt slow cooker duo').ids, ['item-159']);
  assert.equal(find('coffee maker').ids[0], 'item-150');
  assert.deepEqual(find('I would like some please').ids, []);
});
