import { target, canModel, price, changeQuantity, decodeCart, encodeCart, quote, subtotalOf, saleSavings, parseAmount, rankedAdditions, cheapestSubset } from './optimizer.mjs';

const $ = id => document.getElementById(id);
const { data, categories, deals, picks } = JSON.parse($('catalog-data').textContent);
const byId = new Map(data.map(item => [item.id, item]));
const inventory = new Map(data.filter(canModel).map(item => [item.id, item]));
const closestStarter = rankedAdditions(0, [...inventory.values()], new Map(), {limit:1})[0];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd = cents => money.format(cents / 100);
const shortName = item => item.short || item.name;
const apps = { door: 'DoorDash', uber: 'Uber Eats', both: 'Both apps' };
const stores = {
  door: 'https://www.doordash.com/en/convenience/store/26060658',
  uber: 'https://www.ubereats.com/store/best-buy-70-worcester-providence-tpke-ste-140/J20OVzdqUt2PWoYppRk5Ww',
};
const ideaGroups = [['', 'Any category'], ['Lighting', 'Lights'], ['Home & kitchen', 'Kitchen'], ['Gaming', 'Gaming'], ['TV & streaming', 'TV']];
const photoBase = 'https://img.cdn4dd.com/cdn-cgi/image/fit=contain,width=550,height=550,format=auto,quality=50/https://doordash-static.s3.amazonaws.com/media/photosV2/';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function link(label, href, className = '', local = false) {
  const a = el('a', className, label);
  a.href = href;
  if (local) a.dataset.nav = '';
  return a;
}

// Product choices and quantities are public catalog references. A copied URL opens
// the same estimate on another device without an account, cookie or local storage.
function route(changes, section, clean = false) {
  const url = new URL(location.href);
  if (clean) url.search = '';
  for (const [key, value] of Object.entries(changes)) {
    if (value === '' || value == null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  url.hash = section;
  return url.pathname + url.search + url.hash;
}

function readState() {
  const p = new URLSearchParams(location.search);
  const item = byId.get(location.hash.slice(1));
  const app = Object.hasOwn(apps, p.get('app')) ? p.get('app') : (item?.platform || 'door');
  return {
    cart: decodeCart(p.get('cart'), inventory),
    base: parseAmount(p.get('base')) || 0,
    extra: p.get('extra') !== '0',
    scope: ideaGroups.some(([name]) => name === p.get('scope')) ? p.get('scope') : '',
    maxItems: ['1','2'].includes(p.get('n')) ? Number(p.get('n')) : 3,
    rank: p.get('rank') === 'sale' ? 'sale' : 'near',
    app,
    q: (p.get('q') || '').trim().slice(0, 100),
    category: categories.includes(p.get('category')) ? p.get('category') : '',
    sort: ['near', 'low', 'high', 'store'].includes(p.get('sort')) ? p.get('sort') : (app === 'door' ? 'near' : 'store'),
    under: p.get('max') === '15',
  };
}

function cartLink(cart, section = 'builder', changes = {}) {
  return route({ cart: encodeCart(cart), ...changes }, section);
}

function storeProduct(item) {
  if (item.platform !== 'door') return 'https://www.bestbuy.com/site/searchpage.jsp?id=pcat17071&st=' + encodeURIComponent(item.name);
  const search = item.product ? shortName(item).split(' ')[0] : shortName(item).split(' ').slice(0, 6).join(' ');
  return 'https://www.doordash.com/convenience/store/26060658/search/' + encodeURIComponent(search) +
    (item.product ? '?product_id=' + encodeURIComponent(item.product) : '');
}

function productLink(item, className) {
  const a = link(shortName(item), storeProduct(item), className);
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

function itemList(items) {
  const list = el('ul', 'tiny-lines');
  for (const item of items) {
    const li = el('li');
    li.append(productLink(item), el('span', 'num', usd(price(item))));
    list.append(li);
  }
  return list;
}

function chip(label, href, active) {
  const a = link(label, href, 'chip', true);
  if (active) a.setAttribute('aria-current', 'true');
  return a;
}

function drawPicks(state) {
  const starterCart = new Map(closestStarter.items.map(item => [item.id,1]));
  $('example-subtotal').textContent = usd(closestStarter.subtotal);
  $('example-extra').textContent = state.extra ? '−$10.00' : '$0.00';
  $('example-net').textContent = usd(quote(closestStarter.subtotal, state.extra).net);
  $('example-link').href = cartLink(starterCart, 'builder', {base:''});
  $('example-link').dataset.nav = '';
  $('example-link').textContent = 'See this ' + usd(closestStarter.subtotal) + ' cart';
  const nodes = picks.map(pick => {
    const items = pick.items.map(id => byId.get(id));
    const cart = new Map(items.map(item => [item.id, 1]));
    const estimate = quote(subtotalOf(cart, inventory), state.extra);
    const card = el('article', pick.featured ? 'pick featured' : 'pick');
    const img = el('img', 'pick-image');
    img.alt = ''; img.width = 248; img.height = 125; img.src = photoBase + pick.image;
    img.addEventListener('error', () => img.hidden = true, { once: true });
    const body = el('div', 'pick-body');
    const bottom = el('div', 'breakdown');
    const totals = el('div', 'pick-totals');
    totals.append(el('div', '', usd(estimate.subtotal) + ' subtotal · ' + usd(estimate.subtotal - target) + ' over'),
      el('span', 'net', usd(estimate.net)), ' after ' + usd(estimate.savings).replace('.00', '') + ' off');
    const { markdown, complete } = saleSavings(cart,inventory,0);
    if (complete) {
      const regular = estimate.subtotal + markdown;
      const savedPercent = (100 * (regular-estimate.net) / regular).toFixed(1);
      totals.append(el('p','comparison',savedPercent + '% below DoorDash’s listed ' + usd(regular) + ' comparison total.'));
    }
    const choose = link('Use this cart', cartLink(cart, 'builder', {base:''}), 'button ghost', true);
    choose.setAttribute('aria-label', 'Use this cart: ' + pick.title);
    bottom.append(itemList(items), totals, choose);
    body.append(el('h3', '', pick.title), el('p', 'details', pick.note), bottom);
    card.append(img, body);
    return card;
  });
  $('picks-list').replaceChildren(...nodes);
}

function drawCart(state, estimate, keepTypedAmount) {
  const lines = [];
  if (!estimate.subtotal) lines.push(el('p', 'empty', 'Choose a ready-made cart, add a product, or enter a starting subtotal.'));
  if (state.base) lines.push(el('p', 'base-line', 'Starting DoorDash subtotal · ' + usd(state.base)));
  for (const [id, quantity] of state.cart) {
    const item = inventory.get(id);
    const row = el('div', 'cart-line');
    const info = el('div');
    const unit = usd(price(item));
    info.append(productLink(item, 'line-title'), el('div', 'secondary',
      (quantity === 1 ? unit : quantity + ' × ' + unit + ' = ' + usd(quantity * price(item))) +
      (item.flag === 'guest listing' ? ' · Guest price' : '')));
    const stepper = el('div', 'quantity');
    const minus = link('−', cartLink(changeQuantity(state.cart, id, -1)), '', true);
    minus.setAttribute('aria-label', (quantity === 1 ? 'Remove ' : 'Decrease quantity of ') + shortName(item));
    const plus = quantity === 99 ? el('span', 'limit', '+') : link('+', cartLink(changeQuantity(state.cart, id, 1)), '', true);
    plus.setAttribute('aria-label', 'Increase quantity of ' + shortName(item));
    stepper.append(minus, el('b', '', String(quantity)), plus);
    row.append(info, stepper); lines.push(row);
  }
  $('cart-lines').replaceChildren(...lines);
  if (!keepTypedAmount) $('base').value = state.base ? (state.base / 100).toFixed(2) : '';
  $('base-error').hidden = true;
  $('base').removeAttribute('aria-invalid');
  const progress = !estimate.gap && estimate.subtotal === target ? 'Exactly $100.00 · minimum reached' :
    (estimate.gap ? usd(estimate.gap) + ' to reach $100' : usd(estimate.subtotal - target) + ' over the $100 minimum');
  $('progress-label').textContent = progress;
  $('progress').value = Math.min(target, estimate.subtotal);
  $('subtotal').textContent = usd(estimate.subtotal);
  $('discount-main').textContent = (estimate.mainDiscount ? '−' : '') + usd(estimate.mainDiscount);
  $('discount-extra').textContent = (estimate.extraDiscount ? '−' : '') + usd(estimate.extraDiscount);
  $('extra').checked = state.extra;
  $('net').textContent = usd(estimate.net);
  const percent = estimate.savings ? (100 * estimate.savings / estimate.subtotal).toFixed(1) + '% off merchandise. ' : '';
  $('savings-note').textContent = percent + 'Before tax, fees and tip. Both savings are estimated once eligible merchandise reaches $100.';
  $('cart-actions').hidden = !estimate.subtotal;
  $('share-status').textContent = '';
  $('share-fallback').hidden = true;
  $('choose-link').href = route({ app: 'door', category: '', q: '', sort: '', max: '' }, 'catalog');
  $('choose-link').dataset.nav = '';
  $('cart-jump').href = route({}, 'builder');
  $('cart-jump').textContent = estimate.subtotal ? 'View cart · ' + usd(estimate.net) + ' estimated' : 'View cart';
}

function showSaleStack(targetList, state, estimate) {
  const { markdown, complete } = saleSavings(state.cart, inventory, state.base);
  if (!markdown) return;
  const section = el('div','sale-stack');
  section.append(el('h4','','Store sale + order offers'));
  const receipt = el('dl','receipt');
  const line = (label, amount) => {
    const div = el('div');
    div.append(el('dt','',label), el('dd','',usd(amount)));
    receipt.append(div);
  };
  if (complete) line('DoorDash comparison prices', estimate.subtotal + markdown);
  line('Listed store markdowns', markdown);
  line('Order discounts', estimate.savings);
  const savings = markdown + estimate.savings;
  line('Combined savings shown', savings);
  section.append(receipt);
  if (complete) {
    section.append(el('p','secondary',(100 * savings / (estimate.subtotal + markdown)).toFixed(1) + '% below the listed comparison prices.'));
  }
  targetList.append(section);
}

function drawIdeas(state, estimate) {
  const targetList = $('ideas-list');
  const group = $('idea-categories');
  const description = $('ideas-description');
  const rank = $('idea-rank');
  rank.replaceChildren();
  rank.hidden = !estimate.gap;
  const count = $('idea-count');
  count.replaceChildren();
  count.hidden = !estimate.gap;
  group.replaceChildren();
  group.hidden = !estimate.gap;
  targetList.replaceChildren();
  if (!estimate.gap) {
    const smaller = cheapestSubset(state.cart, inventory, estimate.subtotal, state.base);
    $('ideas-title').textContent = smaller ? 'Spend less with these items' : 'Your cart clears $100';
    if (!smaller) {
      description.textContent = 'You have reached the full ' + usd(estimate.savings) + ' discount for this estimate. No additional item is needed.';
      showSaleStack(targetList,state,estimate);
      return;
    }
    description.textContent = 'You can remove ' + usd(estimate.subtotal - smaller.subtotal) + ' of merchandise and keep the same discounts.';
    const kept = [...smaller.items].map(([id, qty]) => (qty > 1 ? qty + ' × ' : '') + shortName(inventory.get(id)));
    if (state.base) kept.unshift('Starting subtotal ' + usd(state.base));
    const reduced = quote(smaller.subtotal, state.extra);
    const info = el('div', 'idea'); const left = el('div');
    left.append(el('p', 'idea-name', kept.join(' + ')), el('p', 'secondary', usd(reduced.subtotal) + ' subtotal · ' + usd(reduced.net) + ' after discounts'));
    info.append(left,link('Use smaller cart', cartLink(smaller.items), 'button ghost', true));
    targetList.append(info);
    showSaleStack(targetList,state,estimate);
    return;
  }
  const hasCart = estimate.subtotal > 0;
  $('ideas-title').textContent = hasCart ? 'Finish this cart' : 'Find a DoorDash cart';
  rank.append(chip('Closest to $100',route({rank:''},'builder'), state.rank === 'near'),
    chip('Biggest store markdown',route({rank:'sale'},'builder'),state.rank === 'sale'));
  description.textContent = state.rank === 'sale' ?
    'Carts from $100 to $110, ranked by the dollar markdowns DoorDash lists on the suggested products.' :
    'Local DoorDash products, ranked by the smallest amount over $100.';
  for (const n of [1,2,3]) count.append(chip(n === 1 ? '1 item' : 'Up to ' + n + ' items', route({ n:n === 3 ? '' : n }, 'builder'), state.maxItems === n));
  for (const [value, label] of ideaGroups) group.append(chip(label, route({ scope: value }, 'builder'), state.scope === value));
  const matches = rankedAdditions(estimate.subtotal, [...inventory.values()], state.cart,
    {category:state.scope, maxItems:state.maxItems, rank:state.rank});
  for (const match of matches) {
    const row = el('div', 'idea'); const left = el('div');
    const names = match.items.map(shortName).join(' + ');
    const numbers = el('p', 'secondary');
    numbers.append(usd(match.subtotal) + ' subtotal · ' + usd(match.subtotal - target) + ' over · ',
      el('strong', '', usd(quote(match.subtotal, state.extra).net) + ' after discounts'));
    left.append(el('p', 'idea-name', names), numbers);
    if (state.rank === 'sale') left.append(el('p','secondary',usd(match.markdown) + ' in listed store markdowns before order discounts.'));
    if (hasCart) {
      const added = match.subtotal - estimate.subtotal;
      const saved = estimate.net - quote(match.subtotal, state.extra).net;
      const change = saved > 0 ? ' · Pay ' + usd(saved) + ' less than now' : '';
      left.append(el('p','secondary','Add ' + usd(added) + ' in merchandise' + change));
    }
    const next = new Map(state.cart);
    for (const item of match.items) next.set(item.id, 1);
    const add = link(hasCart ? 'Add' : 'Use cart', cartLink(next), 'button ghost', true);
    add.setAttribute('aria-label', (hasCart ? 'Add ' : 'Use cart with ') + names);
    row.append(left, add); targetList.append(row);
  }
  if (!matches.length) targetList.append(el('p', 'empty', 'No match with these settings. Try more items or another category.'));
  targetList.append(link('Browse DoorDash add-ons at $15 or less', route({ app:'door', max:'15', sort:'low', category:'', q:'' }, 'catalog'), 'small-link', true));
}

function drawFilterGroup(id, label, key, entries, current) {
  const nav = $(id);
  nav.replaceChildren(el('span', 'filter-label', label));
  for (const [value, name] of entries) nav.append(chip(name, route({ [key]: value }, 'catalog'), current === value));
}

function drawCatalog(state, estimate) {
  $('search').value = state.q;
  drawFilterGroup('apps', 'App', 'app', Object.entries(apps), state.app);
  drawFilterGroup('categories', 'Category', 'category', [['', 'All categories'], ...categories.map(c => [c, c])], state.category);
  const gap = estimate.gap || target;
  drawFilterGroup('sort', 'Sort', 'sort', [
    ['near', estimate.gap && estimate.subtotal ? 'Near the ' + usd(gap) + ' gap' : 'Near $100'],
    ['low', 'Lowest price'], ['high', 'Highest price'], ['store', 'Store order'],
  ], state.sort);
  $('sort').append(chip('$15 or less', route({ max: state.under ? '' : '15' }, 'catalog'), state.under));
  $('reset-filters').href = route({ app: 'door', q:'', category:'', sort:'', max:'' }, 'catalog');
  $('reset-filters').dataset.nav = '';
  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = data.filter(item => {
    const words = (item.name + ' ' + (item.short || '') + ' ' + item.cat).toLowerCase();
    return (state.app === 'both' || item.platform === state.app) && (!state.category || item.cat === state.category)
      && (!state.under || price(item) <= 1500) && terms.every(term => words.includes(term));
  });
  if (state.sort === 'near') matches.sort((a,b) => Math.abs(price(a)-gap) - Math.abs(price(b)-gap));
  if (state.sort === 'low') matches.sort((a,b) => price(a)-price(b));
  if (state.sort === 'high') matches.sort((a,b) => price(b)-price(a));
  $('result-count').textContent = matches.length + ' of ' + data.length + ' listings';
  const fragment = document.createDocumentFragment();
  if (!matches.length) fragment.append(el('p','empty','No products match. Clear the filters or try another search.'));
  for (const item of matches) {
    const row = el('article','row'); row.id = item.id;
    const info = el('div');
    const title = productLink(item, 'row-title'); title.textContent = item.name;
    const source = el('div','row-info');
    source.append(link(apps[item.platform],stores[item.platform]), ' · ' + item.cat);
    if (item.flag === 'promo excluded') source.append(' · Promo excluded');
    else if (item.flag === 'guest listing') source.append(' · Guest price · Confirm local availability');
    if (item.high) source.append(' · Price varies by option');
    info.append(title,source);
    const side = el('div','row-side'); const cost = el('div','price');
    cost.append(el('strong','',item.high ? usd(price(item)) + '–' + usd(Math.round(item.high*100)) : usd(price(item))));
    if (!item.high && item.compare > item.price) cost.append(el('s','',usd(Math.round(item.compare*100))));
    side.append(cost);
    const quantity = state.cart.get(item.id) || 0;
    if (canModel(item) && quantity < 99) {
      const add = link(quantity ? 'Add one more' : 'Add to cart', cartLink(changeQuantity(state.cart,item.id,1)), 'button ghost', true);
      add.setAttribute('aria-label', 'Add to cart: ' + shortName(item)); side.append(add);
    }
    row.append(info,side); fragment.append(row);
  }
  $('results').replaceChildren(fragment);
}

function drawUber() {
  const nodes = deals.filter(deal => deal.app === 'uber').map(deal => {
    const card = el('article','uber-card'); const list = el('ul','tiny-lines');
    let subtotal = 0;
    for (const entry of deal.items) {
      const item = byId.get(entry.id);
      const label = link(entry.label, route({ app:'uber', q:'', category:'', max:'' }, item.id), '', true);
      const li = el('li'); li.append(label, el('span','num',usd(price(item)))); list.append(li);
      subtotal += price(item);
    }
    card.append(el('h3','',deal.title), list, el('p','secondary',usd(subtotal) + ' subtotal · ' + usd(quote(subtotal,false).net) + ' after Uber’s $40 offer'));
    return card;
  });
  $('uber-picks').replaceChildren(...nodes);
}

function render(keepTypedAmount = false) {
  const state = readState();
  const estimate = quote(state.base + subtotalOf(state.cart,inventory), state.extra);
  drawPicks(state); drawCart(state,estimate,keepTypedAmount); drawIdeas(state,estimate); drawCatalog(state,estimate); drawUber();
}

function scrollToHash() {
  document.getElementById(location.hash.slice(1))?.scrollIntoView({ block:'start' });
}

function navigate(href, scroll = true) {
  const keyboardLink = document.activeElement?.matches('a:focus-visible') ? document.activeElement : null;
  const oldLabel = keyboardLink?.getAttribute('aria-label') || keyboardLink?.textContent;
  const oldHash = location.hash;
  if (new URL(href,location.href).href !== location.href) history.pushState(null,'',href);
  render();
  if (scroll) scrollToHash();
  if (keyboardLink && !keyboardLink.isConnected) {
    const target = document.getElementById(location.hash.slice(1));
    const matching = oldHash === location.hash && [...(target?.querySelectorAll('a') || [])].find(a => (a.getAttribute('aria-label') || a.textContent) === oldLabel);
    const focus = matching || target?.querySelector('h2,h3,a');
    if (focus) { if (!focus.matches('a')) focus.tabIndex = -1; focus.focus({preventScroll:true}); }
  }
}

$('extra').addEventListener('change', event => navigate(route({ extra: event.target.checked ? '' : '0' }, 'builder'), false));
let baseEditStarted = false;
$('base').addEventListener('focus', () => { baseEditStarted = false; });
function readStartingAmount() {
  const base = parseAmount($('base').value);
  if (base === null) {
    $('base-error').textContent = 'Enter a nonnegative dollar amount with up to two decimal places.';
    $('base-error').hidden = false;
    $('base').setAttribute('aria-invalid','true');
  }
  return base;
}
$('base').addEventListener('input', () => {
  const base = readStartingAmount();
  if (base === null) return;
  const href = route({base:base ? (base / 100).toFixed(2) : ''}, 'builder');
  if (new URL(href,location.href).href !== location.href) {
    if (baseEditStarted) history.replaceState(null,'',href);
    else history.pushState(null,'',href);
    baseEditStarted = true;
  }
  render(true);
});
$('base-form').addEventListener('submit', event => {
  event.preventDefault();
  const base = readStartingAmount();
  if (base === null) {
    $('base').focus();
    return;
  }
  navigate(route({base:base ? (base / 100).toFixed(2) : ''}, 'builder'), false);
});
$('search-form').addEventListener('submit', event => {
  event.preventDefault();
  navigate(route({ q:$('search').value.trim().slice(0,100) }, 'catalog'));
});
document.addEventListener('click', event => {
  const a = event.target.closest('a[data-nav]');
  if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(a.href);
});
$('share').addEventListener('click', async () => {
  const state = readState();
  const href = new URL(route({ cart:encodeCart(state.cart), base:state.base ? (state.base / 100).toFixed(2) : '', extra: state.extra ? '' : '0' }, 'builder', true), location.origin).href;
  try {
    await navigator.clipboard.writeText(href);
    $('share-status').textContent = 'Cart link copied.';
  } catch {
    $('share-fallback').hidden = false;
    $('share-url').value = href; $('share-url').focus(); $('share-url').select();
    $('share-status').textContent = 'Select and copy the cart link below.';
  }
});
window.addEventListener('popstate', () => { render(); requestAnimationFrame(scrollToHash); });
render();
if (location.hash) requestAnimationFrame(scrollToHash);
