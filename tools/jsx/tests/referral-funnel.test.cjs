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

test('credit dismissal persists, survives route changes, and stops the account upsell without blocking JSX', () => {
  function setup({ hidden = false, blocked = false } = {}) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
      url: 'https://www.john-ta.com/tools/jsx/?origin=OAK&destination=LAS', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const w = dom.window, d = w.document;
    if (hidden) w.localStorage.setItem('jsx-credit-offers-hidden-v1', '1');
    if (blocked) Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked'); } });
    w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    w.HTMLDialogElement.prototype.close = function() { this.open = false; };
    const D = w.Date;
    w.Date = class extends D { constructor(...args) { super(...(args.length ? args : ['2026-10-20T12:00:00-07:00'])); } };
    const events = []; w.SiteAnalytics = { capture: (name, properties) => events.push({name, properties}) };
    d.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
    for (const f of ['searchable-select.js', 'fares.js', 'map-data.js', 'route-map.js', 'app.js']) w.eval(fs.readFileSync(path.join(root, f), 'utf8'));
    return { w, d, events };
  }
  for (const blocked of [false, true]) {
    const { w, d, events } = setup({ blocked });
    const before = d.getElementById('total').textContent;
    d.querySelector('.referral-strip .credit-close').click();
    assert.ok([...d.querySelectorAll('.credit-offer>aside')].every(el => el.hidden));
    assert.ok(d.activeElement.matches('.credit-restore'));
    if (!blocked) assert.equal(w.localStorage.getItem('jsx-credit-offers-hidden-v1'), '1');
    const sort = d.getElementById('sort'); sort.value = 'date'; sort.dispatchEvent(new w.Event('change'));
    assert.equal(d.querySelector('.route-referral').hidden, true);
    assert.equal(d.getElementById('total').textContent, before);
    const book = d.querySelector('#map-detail .book');
    assert.equal(book.hasAttribute('aria-haspopup'), false);
    book.click(); assert.equal(d.getElementById('account-dialog').open, false);
    assert.equal(events.filter(e => e.name === 'jsx_booking_opened').length, 1);
    d.querySelector('#map-detail .credit-restore').click();
    assert.ok([...d.querySelectorAll('.credit-offer>aside')].every(el => !el.hidden));
    assert.ok(d.activeElement.matches('.credit-close'));
    assert.equal(book.getAttribute('aria-haspopup'), 'dialog');
    if (!blocked) assert.equal(w.localStorage.getItem('jsx-credit-offers-hidden-v1'), null);
    d.querySelector('.route-referral .credit-close').click();
    assert.equal(d.querySelector('.referral-strip').hidden, true);
    assert.equal(events.filter(e => e.name === 'jsx_referral_dismissed').length, 2);
    w.close();
  }
  const { w, d } = setup({ hidden: true });
  assert.ok([...d.querySelectorAll('.credit-offer>aside')].every(el => el.hidden));
  assert.equal(d.querySelector('#fares .book').hasAttribute('aria-haspopup'), false);
  w.close();
});
