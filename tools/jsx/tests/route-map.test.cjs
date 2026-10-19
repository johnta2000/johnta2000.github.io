const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { groupRoutes, project, band } = require('../route-map.js');
const fixture = {window:{}};
vm.runInNewContext(fs.readFileSync('tools/jsx/fares.js','utf8'), fixture);
vm.runInNewContext(fs.readFileSync('tools/jsx/map-data.js','utf8'), fixture);
const data = fixture.window.JSX_FARES, geography = fixture.window.JSX_MAP_DATA;
test('map groups directions separately and uses the lowest fare across all table pages', () => {
  const fares = data.fares.filter(f => f.tripType === 'one_way');
  const routes = groupRoutes(fares);
  assert.equal(routes.length, new Set(fares.map(f => `${f.origin}-${f.destination}`)).size);
  const outbound = routes.find(r => r.key === 'OAK-LAS');
  const inbound = routes.find(r => r.key === 'LAS-OAK');
  assert.ok(outbound && inbound);
  assert.equal(outbound.cheapest.priceUsd, Math.min(...fares.filter(f => f.origin === 'OAK' && f.destination === 'LAS').map(f => f.priceUsd)));
  assert.equal(routes.reduce((sum,r) => sum + r.fares.length, 0), fares.length);
});
test('round-trip details retain the real return date and total price', () => {
  const routes = groupRoutes(data.fares.filter(f => f.tripType === 'round_trip'));
  assert.ok(routes.length);
  for (const route of routes) {
    assert.ok(route.cheapest.returnDate);
    assert.equal(route.cheapest.tripType, 'round_trip');
    assert.equal(route.cheapest.priceUsd, Math.min(...route.fares.map(f => f.priceUsd)));
  }
});
test('every fare airport has a coordinate inside the map, including JSX-specific codes', () => {
  const codes = new Set(geography.routes.flatMap(f => [f.origin,f.destination]));
  for (const code of codes) {
    const point = geography.airports[code]; assert.ok(point, code);
    const [x,y] = project(point.lon,point.lat);
    assert.ok(x>0 && x<1000 && y>0 && y<600, code);
  }
  assert.ok(geography.airports.CSW.lat<24);
  assert.ok(geography.airports.DJT.lon>-81);
});
test('empty filters produce no routes and price-band edges are consistent', () => {
  assert.deepEqual(groupRoutes([]), []);
  assert.deepEqual([199,200,299,300,499,500].map(band), [0,1,1,2,2,3]);
});

test('full catalog preserves pairings without a sampled fare', () => {
  const routes = groupRoutes(data.fares.filter(f => f.tripType === 'one_way'), geography.routes);
  assert.equal(routes.length,133);
  assert.equal(routes.find(r=>r.key==='DAL-SAF').cheapest,null);
  assert.ok(routes.find(r=>r.key==='OAK-LAS').cheapest);
  assert.equal(new Set(routes.flatMap(r=>[r.origin,r.destination])).size,29);
});
