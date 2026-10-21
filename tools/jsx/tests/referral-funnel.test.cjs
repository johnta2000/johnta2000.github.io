const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');

test('closing the guide preserves the offer; dynamic route referrals track once and retain the selected fare', () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://www.john-ta.com/tools/jsx/?origin=OAK&destination=LAS', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window, d = w.document, events = [];
  w.HTMLElement.prototype.scrollIntoView = function() {};
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  const D = w.Date;
  w.Date = class extends D { constructor(...args) { super(...(args.length ? args : ['2026-10-20T12:00:00-07:00'])); } };
  let observe;
  w.IntersectionObserver = class { constructor(callback) { observe = callback; } observe() {} unobserve() {} };
  w.SiteAnalytics = { capture: (event, properties) => events.push({ event, properties }) };
  d.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
  for (const file of ['searchable-select.js', 'fares.js', 'map-data.js', 'route-map.js', 'app.js']) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  const count = (event, placement) => events.filter(e => e.event === event && e.properties.placement === placement).length;
  const exposure = (target, intersectionRatio = 1) => observe([{ target, intersectionRatio, isIntersecting: intersectionRatio > 0 }]);
  d.getElementById('hide-guide').click();
  const offer = d.querySelector('[data-analytics-placement="fare_offer"]');
  assert.equal(d.getElementById('offer-guide').hidden, true);
  assert.equal(offer.closest('[hidden]'), null);
  exposure(offer, 0.4); assert.equal(count('jsx_referral_seen', 'fare_offer'), 0);
  exposure(offer); exposure(offer); assert.equal(count('jsx_referral_seen', 'fare_offer'), 1);
  exposure(d.getElementById('account-signup')); assert.equal(count('jsx_referral_seen', 'account_dialog'), 0);
  const book = d.querySelector('#map-detail .book'); const fareURL = book.href;
  let routeOffer = d.querySelector('[data-analytics-placement="selected_route"]');
  routeOffer.click(); assert.equal(count('jsx_referral_clicked', 'selected_route'), 1);
  assert.match(routeOffer.href, /create-profile\/6QWTIE$/);
  exposure(routeOffer);
  // Re-render the same route via sort; neither impressions nor click handlers multiply.
  const sort = d.getElementById('sort'); sort.value = 'date'; sort.dispatchEvent(new w.Event('change'));
  routeOffer = d.querySelector('[data-analytics-placement="selected_route"]');
  exposure(routeOffer); routeOffer.click();
  assert.equal(count('jsx_referral_seen', 'selected_route'), 1);
  assert.equal(count('jsx_referral_clicked', 'selected_route'), 2);
  book.click(); assert.equal(d.getElementById('account-dialog').open, true);
  assert.equal(d.getElementById('account-continue').href, fareURL);
  exposure(d.getElementById('account-signup')); assert.equal(count('jsx_referral_seen', 'account_dialog'), 1);
  assert.ok(events.every(e => e.properties.referral_variant === 'credit_near_fares_v1'));
  w.close();
});
