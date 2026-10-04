import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const captureSource = await readFile(new URL('./hertz-browser-snapshot.js', import.meta.url), 'utf8');

function capture(layout, hiddenOld = false) {
  const element = (innerText, hidden = false) => ({ innerText, hidden, parentElement: null,
    getAttribute: () => null, getBoundingClientRect: () => ({ width: 100, height: 40 }) });
  const heading = { ...element('7 Passenger SUV'), id: 'FRAR-vehicle_type' };
  const features = element('7\n2\nAuto');
  const price = element('Pay now and save\n$81\n/day\n$459\nest. total');
  const oldPrice = hiddenOld ? element('$1\n/day', true) : price;
  const card = { ...element(`7 Passenger SUV\n${features.innerText}\n${price.innerText}`),
    contains: node => [heading, features, price, oldPrice].includes(node), querySelectorAll: () => [heading] };
  heading.parentElement = features.parentElement = price.parentElement = card;
  const nodes = { 'FRAR-vehicle_features': features, [layout]: price };
  if (hiddenOld) nodes['FRAR-best-available-pricing'] = oldPrice;
  const document = { title: 'Book', body: { innerText: '1 Results' },
    querySelectorAll: () => [heading], getElementById: id => nodes[id] ?? null };
  return vm.runInNewContext(`(${captureSource})()`, { document, location: { href: 'https://www.hertz.com/' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) });
}

test('captures the original and new rendered Hertz price layouts', () => {
  for (const layout of ['FRAR-best-available-pricing', 'FRAR-dual-discount-rates']) {
    const snapshot = capture(layout);
    assert.equal(snapshot.cards.length, 1);
    assert.match(snapshot.cards[0].pricingText, /\$81\n\/day/);
  }
});

test('ignores a hidden old pricing block when a visible new block exists', () => {
  const snapshot = capture('FRAR-dual-discount-rates', true);
  assert.equal(snapshot.cards.length, 1);
  assert.doesNotMatch(snapshot.cards[0].pricingText, /\$1\n/);
});
