import { target, canModel, price, changeQuantity, decodeCart, encodeCart, quote, subtotalOf, saleSavings, parseAmount, rankedAdditions, cheapestSubset } from './optimizer.mjs?v=depth1';
import { pickStore, selectionKey, callPicks } from './pick-storage.mjs?v=2';
import { familyStore } from './family-store.mjs?v=2';
import { changedItems } from './family-picks.mjs';
import { makeNameSearch } from './named-picks.mjs';

const $ = id => document.getElementById(id);
const { data, categories, deals, picks: featured, config = {} } = JSON.parse($('catalog-data').textContent);
const byId = new Map(data.map(item => [item.id, item]));
const eligible = new Map(data.filter(canModel).map(item => [item.id, item]));
const findNames = makeNameSearch(data);
const shortName = item => item.short || item.name;
const sources = { shop: 'Deal items', door: 'DoorDash', uber: 'Uber Eats', both: 'All listings' };
const stores = config.stores || {
  door: 'https://www.doordash.com/en/convenience/store/26060658',
  uber: 'https://www.ubereats.com/store/best-buy-70-worcester-providence-tpke-ste-140/J20OVzdqUt2PWoYppRk5Ww',
};
const groupNames = { 'Home & kitchen': 'Kitchen', 'Lighting': 'Lighting', 'Gaming': 'Games', 'TV & streaming': 'TV' };
const firstShelf = config.shelf || [156, 133, 109, 147, 138, 161, 170, 150, 153, 112, 163, 171, 139, 148, 142, 151, 132, 110];
const shelfRank = new Map(firstShelf.map((id, i) => ['item-' + id, i]));
const closestStarter=rankedAdditions(0,[...eligible.values()],new Map(),{limit:1})[0];
const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd = cents => formatter.format(cents / 100);
const fullPrice = item => usd(price(item)) + (item.high ? '–' + usd(Math.round(item.high * 100)) : '');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let browserStorage;
try { browserStorage = window.localStorage; } catch { /* Direct links also restore the list. */ }
const catalogKey = config.key || 'worcester-best-buy';
const store = pickStore({ storage: browserStorage, recoveryKey: catalogKey + '.picks.v1' });
const families=new Map();
let creation;
let current;
let loadAttempt = 0;
let attemptedKey = '';
let saveState = '';
let timer;
let searchTyping = false;
let baseDraft;
let baseProblem = false;
const draftKey = catalogKey + '.subtotal-draft';
const nameDrafts = new Map();

function nameDraft(s) {
  const key = catalogKey + '.names.' + (s.family || new URLSearchParams(location.search).get('list') || 'personal');
  if (!nameDrafts.has(key)) {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(key)); } catch {}
    nameDrafts.set(key, { key, text: typeof saved?.text === 'string' ? saved.text : '', route:saved?.route });
  }
  return nameDrafts.get(key);
}

function saveNames(draft) {
  try { sessionStorage.setItem(draft.key, JSON.stringify({text:draft.text, route:draft.route})); } catch {}
}

function listingIds(param) {
  return [...new Set((param || '').split('.').map(n => 'item-' + n).filter(id => byId.has(id)))];
}

function idParam(ids) { return ids.map(id => id.slice(5)).join('.'); }

function loadDraft(value) {
  try {
    const draft=JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    return draft?.key===selectionKey(value) && typeof draft.text==='string' ? draft.text : undefined;
  } catch { return undefined; }
}

function href(section = 'catalog', changes = {}, clean = false) {
  const u = new URL(location.href);
  if (clean) u.search = '';
  if (section !== 'catalog') u.searchParams.delete('pg');
  if (section !== 'list') { u.searchParams.delete('matches'); u.searchParams.delete('checked'); }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === null || value === '') u.searchParams.delete(key);
    else u.searchParams.set(key, String(value));
  }
  u.hash = section;
  return u.pathname + u.search + u.hash;
}

function a(label, dest, cls = '', attrs = '') {
  return `<a data-nav href="${esc(dest)}" class="${cls}" ${attrs}>${esc(label)}</a>`;
}

function out(label, dest, cls = '') {
  return `<a href="${esc(dest)}" target="_blank" rel="noopener" class="${cls}">${esc(label)}</a>`;
}

function absolute(path) { return new URL(path, location.origin).href; }
function pill(label, dest, active) { return a(label, dest, 'chip' + (active ? ' active' : ''), active ? 'aria-current="true"' : ''); }
function itemCount(cart) { return [...cart.values()].reduce((sum, n) => sum + n, 0); }
function countText(cart) { const n = itemCount(cart); return n + (n === 1 ? ' pick' : ' picks'); }
function eligiblePicks(cart) { return new Map([...cart].filter(([id]) => eligible.has(id))); }
function snapshot(cart, base, extra) { return { picks: encodeCart(cart), base, extra }; }
function inlineSelection(value) { return { list: '', cart: value.picks || '0', base: value.base ? (value.base / 100).toFixed(2) : '', extra: value.extra ? '' : '0' }; }
function viewName() {
  const name = location.hash.slice(1);
  return ['catalog','list','builder','picks','deal','share','uber'].includes(name) || byId.has(name) ? name : 'catalog';
}

function familyFor(id) {
  if (!families.has(id)) {
    const family=familyStore(id,{catalogKey,storage:browserStorage,notify:()=>familyChanged(id)});
    families.set(id,family);
  }
  return families.get(id);
}

function familyChanged(id) {
  if (current?.family!==id || new URLSearchParams(location.search).get('family')!==id) return;
  const value=familyFor(id).value();
  if (!value || selectionKey(value)===selectionKey(current.value)) { updateSync(); return; }
  const field=document.activeElement;
  const focus=field?.id;
  const cursor=field?.matches('input[type="search"],#base,#names') ? field.selectionStart : undefined;
  void restore({focus,cursor});
}
function read(value, p) {
  const cart = decodeCart(value.picks, byId);
  const items = eligiblePicks(cart);
  return {
    cart, value, items, family:p.get('family'), estimate: quote(value.base + subtotalOf(items, eligible), value.extra), section: viewName(),
    app: Object.hasOwn(sources, p.get('app')) ? p.get('app') : 'both',
    q: (p.get('q') || '').slice(0,100),
    category: categories.includes(p.get('category')) ? p.get('category') : '',
    under: p.get('max') === '15',
    sort: ['near','low','high','store'].includes(p.get('sort')) ? p.get('sort') : 'featured',
    named: p.has('matches') ? listingIds(p.get('matches')) : null,
    checked: new Set(listingIds(p.get('checked'))),
    settings: p.get('settings') === '1', tune: p.get('tune') === '1',
    maxItems: ['1','2'].includes(p.get('n')) ? Number(p.get('n')) : 3,
    scope: categories.includes(p.get('scope')) ? p.get('scope') : '',
    rank: p.get('rank') === 'sale' ? 'sale' : 'near',
    preview: decodeCart(p.get('deal'), eligible), hasPreview: p.has('deal'),
    previewBase: p.get('basis') === '0' ? 0 : value.base,
    shareDeal: p.get('of') === 'deal' && p.has('deal'),
  };
}

function productUrl(item) {
  if (item.platform === 'uber') return stores.uber;
  const search = shortName(item).split(' ').slice(0, item.product ? 1 : 6).join(' ');
  return stores.door + '/search/' + encodeURIComponent(search) +
    (item.product ? '?product_id=' + encodeURIComponent(item.product) : '');
}

function reason(item) {
  if (item.platform === 'uber') return 'Uber Eats listing';
  if (item.flag === 'promo excluded') return 'Excluded from the DoorDash offer';
  if (item.flag === 'out of stock') return 'Listed out of stock';
  if (item.high) return 'Price depends on the option';
  if (item.flag === 'guest listing') return 'Guest price · check availability';
  return '';
}

function photo(item, cls = '', lazy = true) {
  return item.photo ? `<img class="${cls}" src="${esc(item.photoURL || (config.photoRoot || './photos/') + item.photo)}" alt="" loading="${lazy ? 'lazy' : 'eager'}" decoding="async">` : '';
}

function pickButton(item, cart) {
  const chosen = cart.has(item.id);
  return `<button type="button" class="pick-button${chosen ? ' chosen' : ''}" data-pick="${item.id}" id="pick-${item.id}"
    aria-pressed="${chosen}" aria-label="${esc((chosen ? 'Remove ' : 'Pick ') + shortName(item))}"><span aria-hidden="true">${chosen ? '✓' : '+'}</span> ${chosen ? 'Picked' : 'Pick'}</button>`;
}

function quantityPicker(item, qty) {
  const step = (direction, symbol) => `<button type="button" data-qty="${item.id}" data-by="${direction}" aria-label="${esc((direction < 0 ? 'Decrease ' : qty ? 'Increase ' : 'Pick ') + shortName(item))}" ${(qty === 99 && direction > 0 || qty === 0 && direction < 0) ? 'disabled' : ''}>${symbol}</button>`;
  return `<div class="stepper">${step(-1,'−')}<span aria-label="Quantity ${qty}">${qty}</span>${step(1,'+')}</div>`;
}

function productCard(item, state, position) {
  const detail = href(item.id);
  const old = !item.high && item.compare > item.price ? `<s>${usd(Math.round(item.compare*100))}</s>` : '';
  const note = reason(item);
  return `<article class="product ${state.cart.has(item.id) ? 'selected' : ''} ${item.photo ? '' : 'no-photo'}">
    ${item.photo ? `<a data-nav href="${esc(detail)}" class="photo" tabindex="-1" aria-hidden="true">${photo(item, '', position > 5)}</a>` : ''}
    <div class="product-info"><span class="category-label">${esc(item.cat)}</span>
    <h2>${a(shortName(item), detail)}</h2>${note ? `<small class="source-note">${esc(note)}</small>` : ''}
    <div class="product-bottom"><div class="prices"><strong>${fullPrice(item)}</strong>${old}</div>${quantityPicker(item, state.cart.get(item.id) || 0)}</div></div></article>`;
}

function resultSet(state) {
  const tokens = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean).map(term=>term==='lights'?'light':term);
  const matches = data.filter(item => {
    if (state.app === 'shop' ? !canModel(item) : state.app !== 'both' && item.platform !== state.app) return false;
    if (state.category && item.cat !== state.category && !item.departments?.includes(state.category) || state.under && (item.high || item.price) > 15) return false;
    const words = (item.name + ' ' + (item.short || '') + ' ' + item.cat + ' ' + (groupNames[item.cat] || '')).toLowerCase();
    return tokens.every(token => words.includes(token));
  });
  const gap = state.estimate.gap || target;
  const order = item => shelfRank.get(item.id) ?? (item.photo ? 100 : 200);
  if (state.sort === 'featured') matches.sort((a,b) => order(a) - order(b));
  if (state.sort === 'near') matches.sort((a,b) => Math.abs(price(a)-gap) - Math.abs(price(b)-gap));
  if (state.sort === 'low') matches.sort((a,b) => price(a)-price(b));
  if (state.sort === 'high') matches.sort((a,b) => price(b)-price(a));
  return matches;
}

function statusLine() { return '<div class="save-line" data-save role="status"></div>'; }

function progress(estimate, extra, hasItems) {
  const discount = extra ? '$50' : '$40';
  const text = estimate.gap ? (hasItems ? usd(estimate.gap) + ' to reach $100' : '$100 unlocks ' + discount + ' off') : discount + ' in estimated discounts';
  return `<div class="progress"><div class="track" role="progressbar" aria-label="Eligible merchandise toward $100" aria-valuenow="${Math.min(estimate.subtotal/100,100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(estimate.subtotal/100,100)}%"></i></div><span>${text}</span></div>`;
}

function rail(s) {
  const picks = [...s.cart];
  const total = s.estimate;
  const emptyHelp = s.section === 'list' ? 'Check the items you want, then tap Add.' : 'Tap + on an item to add it to your list.';
  return `<aside class="rail${picks.length ? ' has-picks' : ''}" aria-label="Shopping list summary"><div class="rail-head"><h2>My picks</h2><span class="bubble">${itemCount(s.cart)}</span></div>
    ${picks.length ? `<ul class="mini-lines">${picks.map(([id,qty]) => { const item = byId.get(id); return `<li><span>${qty > 1 ? qty + ' × ' : ''}${esc(shortName(item))}</span><b>${item.high ? fullPrice(item) : usd(price(item)*qty)}</b></li>`; }).join('')}</ul>` : `<p>${emptyHelp}</p>`}
    <div class="rail-price"><span>Deal subtotal</span><strong>${usd(total.subtotal)}</strong></div>
    ${progress(total, s.value.extra, !!total.subtotal)}
    ${total.savings ? `<div class="net-line"><span>After offers</span><b>${usd(total.net)}</b></div>` : ''}
    ${a('Review my picks',href('builder'),'button primary wide')}
    ${statusLine()}</aside>`;
}

function mobileTray(s) {
  if (s.section !== 'catalog' && s.section !== 'list' && !byId.has(s.section)) return '';
  const total = s.estimate;
  const startHint = s.section === 'list' ? 'Tap Add to save your choices' : 'Tap + to start your list';
  const caption = !total.gap ? usd(total.net) + ' after offers' : total.subtotal ? usd(total.gap) + ' to reach $100' : startHint;
  return `<div class="tray"><div><strong>${countText(s.cart)} · ${usd(total.subtotal)}</strong><small>${caption}${s.family?' <span data-family-tray></span>':''}</small></div>${a('Review picks',href('builder'),'button lime')}</div>`;
}

function shop(s) {
  const filterUrl = changes => href('catalog', {pg:'', ...changes});
  const reset = filterUrl({app:'', q:'', category:'', sort:'', max:'', filters:''});
  const matches = resultSet(s);
  const pageSize = config.pageSize || Math.max(1,matches.length);
  const pages = Math.max(1,Math.ceil(matches.length/pageSize));
  const page = Math.min(pages,Math.max(1,parseInt(new URLSearchParams(location.search).get('pg'),10)||1));
  const rows = matches.slice((page-1)*pageSize,page*pageSize);
  const pagination = pages > 1 ? `<nav class="chips" aria-label="Catalog pages">
    ${page>1?a('← Previous',href('catalog',{pg:page-1}),'button outline'):''}<span>Page ${page} of ${pages}</span>
    ${page<pages?a('Next →',href('catalog',{pg:page+1}),'button outline'):''}</nav>` : '';
  const primaryFilters = [
    pill('All',filterUrl({category:'',max:''}),!s.category && !s.under),
    ...categories.map(name => pill(groupNames[name] || name,filterUrl({category:name,max:''}),s.category === name && !s.under)),
    pill('$15 or less',filterUrl({max:s.under ? '' : '15', category:''}),s.under),
  ].join('');
  const filtersActive = s.q || s.category || s.under || s.app !== 'both' || s.sort !== 'featured';
  const filters = `<div class="filter-box">
    <div><strong>Listings</strong><div class="chips">${Object.entries(sources).map(([v,t]) => pill(t,filterUrl({app:v === 'both' ? '' : v}),s.app===v)).join('')}</div></div>
    <div><strong>Sort by</strong><div class="chips">${[['featured','Featured'],['low','Price ↑'],['high','Price ↓'],['near','Near my target'],['store','Store order']].map(([v,t])=>pill(t,filterUrl({sort:v==='featured'?'':v}),s.sort===v)).join('')}</div></div>
    ${a('Compare the Uber Eats offer',href('uber'),'inline-link')}</div>`;
  return `<section class="shop-intro">${s.family?'<div class="family-label">Shared family list · picks update for both of you</div>':''}<h1>Pick your favorites<span class="accent-dot">.</span></h1><p>Use <b>+</b> and <b>−</b> to choose how many of each item you want. At <b>$100</b> in eligible items, ${s.value.extra ? 'the $40 DoorDash offer plus your extra $10 brings the estimate to <b>$50</b>.' : 'the $40 DoorDash offer brings the estimate to <b>$60</b>.'}</p></section>
    <div class="shop-layout"><div class="shelves">
    <div class="shop-search"><form id="search-form" class="search" role="search"><span class="glass" aria-hidden="true"></span><input id="search" aria-label="Search products" type="search" maxlength="100" placeholder="Search products" value="${esc(s.q)}" autocomplete="off"></form>${a('Pick several by name',href('list'),'button outline')}</div>
    <nav class="chips quick" aria-label="Product categories">${primaryFilters}</nav>
    <div class="result-bar"><span>${matches.length} ${s.app==='shop' ? 'DoorDash items' : 'listings'}</span><div>${filtersActive ? a('Clear',reset,'text-button') : ''}</div></div>
    ${filters}
    ${config.departments?.[s.category] ? out('Open this department on DoorDash ↗',config.departments[s.category],'inline-link') : ''}
    <div class="grid">${rows.map((item,i)=>productCard(item,s,i)).join('') || `<div class="empty"><h2>No matching products</h2><p>Try a different search or browse all the products again.</p>${s.app!=='both'?a('Search all '+data.length+' listings',filterUrl({app:'both',category:'',max:''}),'button outline'):a('Clear filters',reset,'button outline')}</div>`}</div>
    ${pagination}</div>${rail(s)}</div>`;
}

function pickByName(s) {
  const draft = nameDraft(s);
  const ids = s.named || [];
  const text = s.named === null || draft.route === idParam(ids) ? draft.text : history.state?.namesText || '';
  const missing = history.state?.missingNames || [];
  const count = ids.filter(id => s.checked.has(id) && !s.cart.has(id)).length;
  const rows = ids.map(id => {
    const item = byId.get(id);
    const picked = s.cart.has(id);
    const note = [picked ? 'Already picked' : '', reason(item) || 'DoorDash deal item'].filter(Boolean).join(' · ');
    return `<label class="named-option"><input id="check-${id}" data-named="${id}" type="checkbox" ${picked || s.checked.has(id) ? 'checked' : ''} ${picked ? 'disabled' : ''}>
      ${photo(item,'thumb')}<span><b>${esc(shortName(item))}</b><small>${esc(note)}</small></span><strong>${fullPrice(item)}</strong></label>`;
  }).join('');
  return `<div class="view-intro">${a('← Browse products',href('catalog'),'back')}<h1>Pick several by name<span class="accent-dot">.</span></h1></div>
    <div class="shop-layout"><section class="panel named-panel">
      <form id="names-form"><label for="names">What would you like?</label>
      <p id="names-help">Type or use your keyboard’s microphone. Separate items with commas, “and” or a new line.</p>
      <textarea id="names" rows="2" maxlength="800" required aria-describedby="names-help" placeholder="An espresso machine and a Govee light strip">${esc(text)}</textarea>
      <button class="button outline" type="submit">Find items</button></form>
      ${s.named === null ? '' : `<section class="named-results" aria-labelledby="matches-title"><h2 id="matches-title" tabindex="-1">${ids.length ? 'Choose your items' : 'No matching items'}</h2>
        ${missing.length ? `<p>No match for ${missing.map(part=>'“'+esc(part)+'”').join(', ')}. Try a brand or product name.</p>` : !ids.length ? '<p>Try a brand or product name.</p>' : ''}
        ${ids.length ? `<form id="add-names"><div class="named-actions"><button class="button primary" id="add-checked" type="submit" ${count ? '' : 'disabled'}>${addLabel(count)}</button></div>${rows}</form>` : ''}</section>`}
    </section>${rail(s)}</div>`;
}

function addLabel(count) {
  return count ? 'Add ' + count + (count === 1 ? ' item' : ' items') + ' to my picks' : 'Select items to add';
}

function line(item, qty, edit = false, note = '') {
  const priceLabel = item.high ? fullPrice(item) : usd(price(item) * qty);
  return `<div class="line">${photo(item,'thumb')}<div class="line-copy">${a(shortName(item),href(item.id),'line-name')}
    <small>${esc(note || reason(item) || (qty>1 ? usd(price(item))+' each' : groupNames[item.cat] || item.cat))}</small></div>
    <div class="line-right"><strong>${priceLabel}</strong>${edit ? quantityPicker(item, qty) : qty>1 ? `<small>Qty ${qty}</small>` : ''}</div></div>`;
}

function receipt(estimate, value, cart) {
  const saved = saleSavings(cart, eligible, value.base);
  const row = (label,n,cls='') => `<div class="${cls}"><dt>${esc(label)}</dt><dd>${n}</dd></div>`;
  return `<div class="receipt-card"><h2>Deal estimate</h2>
    ${progress(estimate,value.extra,!!estimate.subtotal)}
    <dl class="receipt">${row('Eligible merchandise',usd(estimate.subtotal))}
    ${row('$40 off $100+',estimate.mainDiscount?'−$40.00':'$0.00')}
    ${row('Extra $10 offer',estimate.extraDiscount?'−$10.00':'$0.00')}
    ${row('Estimated price',usd(estimate.net),'due')}</dl>
    <p class="fine">Before tax, fees and tip. Check that ${value.extra ? 'both offers appear' : 'the $40 offer appears'} at DoorDash checkout.</p>
    ${saved.markdown && estimate.savings ? `<p class="markdown-note">${saved.complete ? `${((saved.markdown+estimate.savings)*100/(estimate.subtotal+saved.markdown)).toFixed(1)}% below the listed comparison total of ${usd(estimate.subtotal+saved.markdown)}.` : `Includes ${usd(saved.markdown)} in listed product markdowns before the order offers.`}</p>` : ''}
    </div>`;
}

function suggest(s) {
  const opt = {category:s.scope, maxItems:s.maxItems, rank:s.rank, limit:3};
  const pool = [...eligible.values()];
  const browse = a('Keep picking',href('catalog'),'inline-link');
  if (!s.estimate.subtotal) return '';
  if (!s.estimate.gap) {
    const smaller = cheapestSubset(s.items,eligible,s.estimate.subtotal,s.value.base);
    if (!smaller) return `<div class="deal-note"><h3>Your picks reach $100</h3><p>You’ve reached the full ${usd(s.estimate.savings)} in estimated order discounts.</p></div>`;
    const dest = href('deal',{deal:encodeCart(smaller.items)||'0',basis:'',of:''});
    return `<div class="suggestions"><h2>A smaller qualifying order</h2><p>A selection from your picks reaches ${usd(smaller.subtotal)}. You could leave ${usd(s.estimate.subtotal-smaller.subtotal)} of merchandise for later.</p>${a('Preview smaller order',dest,'button outline')}</div>`;
  }
  const combos = rankedAdditions(s.estimate.subtotal,pool,s.items,opt);
  // A one-item finish is usually easier to shop. Show it alongside the closest total
  // when the extra convenience costs at most one dollar.
  const simple = s.rank === 'near' && s.maxItems>1 ? rankedAdditions(s.estimate.subtotal,pool,s.items,{...opt,maxItems:1,limit:1})[0] : null;
  if (simple && combos.length && simple.subtotal <= combos[0].subtotal + 100) {
    const i = combos.findIndex(x=>x.items.length===1 && x.items[0].id===simple.items[0].id);
    if (i !== -1) combos.splice(i,1);
    combos.unshift(simple);
  }
  const controls = s.tune ? `<div class="filter-box"><div><strong>Rank suggestions</strong><div class="chips">
    ${pill('Closest to $100',href('builder',{rank:''}),s.rank==='near')}${pill('Biggest markdown under $110',href('builder',{rank:'sale'}),s.rank==='sale')}</div></div>
    <div><strong>Items to add</strong><div class="chips">${[1,2,3].map(n=>pill(n===1?'One':'Up to '+n,href('builder',{n:n===3?'':n}),s.maxItems===n)).join('')}</div></div>
    <div><strong>Category</strong><div class="chips">${pill('Any',href('builder',{scope:''}),!s.scope)}${Object.entries(groupNames).map(([c,t])=>pill(t,href('builder',{scope:c}),s.scope===c)).join('')}</div></div></div>` : '';
  return `<section class="suggestions"><div class="section-row"><h2>Ways to reach $100</h2>${a(s.tune?'Hide options':'Options',href('builder',{tune:s.tune?'':'1'}),'text-button')}</div>
    <p>You’re ${usd(s.estimate.gap)} away. Preview an idea or share the items you’ve already picked.</p>${controls}
    ${combos.slice(0,3).map(match => {
      const demo = new Map(s.items);
      for (const item of match.items) demo.set(item.id,1);
      const discounted = quote(match.subtotal,s.value.extra);
      const diff = s.estimate.net - discounted.net;
      return `<article class="suggest"><div><strong>${esc(match.items.map(shortName).join(' + '))}</strong>
        <p>Add ${usd(match.subtotal-s.estimate.subtotal)} · ${usd(match.subtotal)} subtotal</p>
        <p class="benefit">${usd(discounted.net)} after offers${diff>0 ? ' · Pay '+usd(diff)+' less' : ''}</p></div>
        ${a('Preview',href('deal',{deal:encodeCart(demo),basis:'',of:''}),'button outline','aria-label="'+esc('Preview '+match.items.map(shortName).join(' + '))+'"')}</article>`;
    }).join('') || `<p>No match with these options. ${browse}</p>`}</section>`;
}

function settings(s) {
  return `<div class="settings">${a(s.settings ? 'Hide offer settings' : 'Offer settings',href('builder',{settings:s.settings?'':'1'}),'text-button','aria-expanded="'+s.settings+'"')}
    ${s.settings ? `<div class="setting-body"><label class="check"><input id="extra" type="checkbox" ${s.value.extra?'checked':''}> Include my extra $10 at $100</label>
    <form id="base-form"><label for="base">Already have eligible items in DoorDash?</label>
    <div class="base-fields"><input id="base" inputmode="decimal" maxlength="16" placeholder="$0.00" value="${esc(baseDraft ?? (s.value.base?(s.value.base/100).toFixed(2):''))}" aria-label="Other eligible merchandise subtotal" ${baseProblem?'aria-invalid="true"':''}><button class="button outline">Apply</button></div>
    ${baseProblem?'<small role="alert">Enter a dollar amount with up to two decimal places.</small>':'<small>Enter their subtotal before order discounts.</small>'}</form>
    <p class="fine">Reported $40 code <b>BBCYBER40</b>. Confirm both offers in your DoorDash account. ${out('Promo report ↗','https://www.uscardforum.com/t/topic/549512')}</p></div>` : ''}</div>`;
}

function review(s) {
  const others = [...s.cart].filter(([id]) => !eligible.has(id));
  const has = !!(s.cart.size || s.value.base);
  const back = a('← Keep picking',href('catalog'),'back');
  return `<div class="view-intro">${back}<h1>My picks<span class="accent-dot">.</span></h1><p>${s.family ? 'This is your shared family list. Picks made from either link appear here automatically.' : has ? 'Share your list as it is, or see how it fits the DoorDash offer.' : 'Choose the things you like. You can share your list at any subtotal.'}</p></div>
    <div class="review-layout"><div>
    <section class="panel"><div class="section-row"><h2>${countText(s.cart)}</h2>${a('Browse products',href('catalog'),'inline-link')}</div>
    ${[...s.items].map(([id,qty])=>line(byId.get(id),qty,true)).join('')}
    ${s.value.base ? `<div class="base-line"><span>Other eligible items in DoorDash</span><strong>${usd(s.value.base)}</strong></div>` : ''}
    ${others.length ? `<h3 class="subhead">Outside the DoorDash estimate</h3>${others.map(([id,qty])=>line(byId.get(id),qty,true)).join('')}` : ''}
    ${has ? `<div class="panel-actions">${a('Share my picks',href('share',{of:''}),'button primary')}${statusLine()}</div>` :
      `<p>Tap <b>+ Pick</b> under a product to add it here.</p>${a('Pick my first item',href('catalog'),'button primary')} ${s.family ? a('Share family link',href('share',{of:''}),'button outline') : '<button data-action="family" class="button outline">Start a shared list</button>'}${statusLine()}<span data-create-note role="status"></span>`}</section>
    ${suggest(s)}</div><aside class="review-aside">${receipt(s.estimate,s.value,s.items)}${settings(s)}
    ${s.estimate.subtotal ? out('Open Best Buy on DoorDash ↗',stores.door,'relink') : ''}</aside></div>`;
}

function ideas(s) {
  const allIdeas=[...featured];
  if (closestStarter) allIdeas.push({title:'Closest to $100',items:closestStarter.items.map(i=>i.id),
    note:closestStarter.items.map(shortName).join(' + ')+'.'});
  return `<div class="view-intro"><h1>Deal ideas<span class="accent-dot">.</span></h1><p>Start with a combination you like. Each of these reaches $100 using local DoorDash prices.</p></div>
    <div class="ideas-grid">${allIdeas.map(pick=>{
      const cart=new Map(pick.items.map(id=>[id,1]));
      const items=pick.items.map(id=>byId.get(id));
      const est=quote(subtotalOf(cart,eligible),s.value.extra);
      return `<article class="idea-card"><div class="idea-pics">${items.map(i=>photo(i,'',false)).join('')}</div><div><h2>${esc(pick.title)}</h2><p>${esc(pick.note)}</p><strong>${usd(est.net)} after offers</strong><small>${usd(est.subtotal)} subtotal</small>
      ${a('See this deal',href('deal',{deal:encodeCart(cart),basis:'0',of:''}),'button outline','aria-label="'+esc('See '+pick.title)+'"')}</div></article>`;
    }).join('')}</div>
    <div class="alternate">${a('Compare the Uber Eats offer →',href('uber'),'inline-link')}</div>`;
}

function preview(s) {
  if (!s.hasPreview || !s.preview.size && !s.previewBase) return `<div class="empty"><h1>Choose a deal to preview</h1>${a('Browse deal ideas',href('picks'),'button primary')}</div>`;
  const total = quote(s.previewBase+subtotalOf(s.preview,eligible),s.value.extra);
  const additions = [...s.preview].some(([id,qty])=>qty>(s.cart.get(id)||0));
  return `<div class="view-intro">${a('← My picks',href('builder',{deal:'',basis:'',of:''}),'back')}<h1>Deal preview<span class="accent-dot">.</span></h1>
    <p>${s.cart.size ? 'See this order on its own. Your full list is still in My picks.' : 'See the items and estimated price, then pick anything you’d like.'}</p></div>
    <div class="review-layout"><section class="panel"><h2>Items in this deal</h2>
    ${[...s.preview].map(([id,qty])=>line(byId.get(id),qty,false,s.cart.has(id)?'From your picks':'Suggested item')).join('')}
    ${s.previewBase ? `<div class="base-line">Other eligible items <strong>${usd(s.previewBase)}</strong></div>` : ''}
    <div class="panel-actions">${additions?'<button type="button" class="button primary" data-action="keep">Add suggestions to my picks</button>':''}
    ${a('Share this deal',href('share',{of:'deal'}),'button outline')}</div></section>
    <aside class="review-aside">${receipt(total,{base:s.previewBase,extra:s.value.extra},s.preview)}${out('Open Best Buy on DoorDash ↗',stores.door,'relink')}</aside></div>`;
}

function sharedHref(s) {
  if (s.family) return absolute(href(s.shareDeal?'deal':s.cart.size || s.value.base?'builder':'catalog',{
    family:s.family,...(s.shareDeal?{deal:encodeCart(s.preview)||'0',basis:s.previewBase===0 && s.value.base?'0':''}:{}),
  },true));
  const saved = store.savedId(s.value);
  const basis = s.previewBase===0 && s.value.base ? '0' : '';
  return absolute(href(s.shareDeal?'deal':'builder',{
    ...(saved?{list:saved}:inlineSelection(s.value)),
    ...(s.shareDeal?{deal:encodeCart(s.preview)||'0',basis}:{}),
  },true));
}

function share(s) {
  if (!s.cart.size && !s.value.base && !s.shareDeal && !s.family) return `<div class="empty"><h1>Pick something to share</h1>${a('Browse products',href('catalog'),'button primary')}</div>`;
  const label = s.shareDeal?'this deal':'my picks';
  return `<div class="narrow"><div class="view-intro">${a(s.shareDeal?'← Deal preview':'← My picks',href(s.shareDeal?'deal':'builder',{of:''}),'back')}<h1>Share ${label}<span class="accent-dot">.</span></h1><p>${s.family?'Anyone with this family link can see and change the picks.':'Send this link so someone else can open your exact selections.'}</p></div>
    <section class="panel share-panel"><h2>${s.shareDeal?'Your deal':countText(s.cart)}</h2>
    <ul class="share-items">${[...(s.shareDeal?s.preview:s.cart)].map(([id,n])=>`<li>${n>1?n+' × ':''}${esc(shortName(byId.get(id)))}</li>`).join('')}</ul>
    ${(s.shareDeal?s.previewBase:s.value.base)?`<p>Other eligible merchandise · ${usd(s.shareDeal?s.previewBase:s.value.base)}</p>`:''}
    <label for="share-url">Link to ${label}</label><input id="share-url" readonly type="url" value="${esc(sharedHref(s))}">
    <div class="panel-actions">${typeof navigator.share==='function'?'<button class="button primary" data-action="native">Share link…</button>':''}<button class="button ${typeof navigator.share==='function'?'outline':'primary'}" data-action="copy">Copy link</button></div>
    <div id="share-message" role="status"></div>${statusLine()}
    ${s.family || s.shareDeal?'':'<div class="create-family"><button data-action="family" class="text-button">Start a shared family list</button><p>Keep picking together from one link.</p><span data-create-note role="status"></span></div>'}</section></div>`;
}

function detail(s) {
  const item=byId.get(s.section);
  return `<div class="view-intro">${a('← Browse products',href('catalog'),'back')}</div><div class="detail">
    ${item.photo?`<div class="detail-photo">${photo(item,'',false)}</div>`:''}
    <div><span class="category-label">${esc(groupNames[item.cat]||item.cat)} · ${esc(sources[item.platform])}</span><h1>${esc(shortName(item))}</h1>
    ${item.short && item.short!==item.name?`<p>${esc(item.name)}</p>`:''}<div class="prices"><strong>${fullPrice(item)}</strong>
    ${!item.high&&item.compare>item.price?`<s>${usd(Math.round(item.compare*100))}</s>`:''}</div><p>${esc(reason(item) || 'Included in the $100 DoorDash estimate.')}</p>
    <div class="panel-actions">${pickButton(item,s.cart)}${a('Review my picks',href('builder'),'button outline')}</div>
    ${out('View on '+sources[item.platform]+' ↗',productUrl(item),'relink')}</div></div>`;
}

function uber() {
  return `<div class="view-intro">${a('← Deal ideas',href('picks'),'back')}<h1>Uber Eats offers<span class="accent-dot">.</span></h1><p>Eligible Uber One members with the Nov. 27–30 offer can take $40 off $100 at Best Buy. These examples use Uber’s $40 offer alone.</p></div>
    <div class="ideas-grid">${deals.filter(d=>d.app==='uber').map(d=>{
      const items=d.items.map(i=>byId.get(i.id));const total=items.reduce((sum,i)=>sum+price(i),0);
      return `<article class="panel"><h2>${esc(d.title)}</h2>${items.map(i=>line(i,1)).join('')}<p><b>${usd(quote(total,false).net)} after Uber’s offer</b> · ${usd(total)} subtotal</p></article>`;
    }).join('')}</div><div class="alternate">${a('Browse Uber Eats listings',href('catalog',{app:'uber',filters:'',q:'',category:'',max:'',sort:''}),'button outline')} ${out('Uber offer details ↗','https://www.uber.com/us/en/blog/holiday-member-days-2026/','inline-link')}</div>`;
}

function updateSync() {
  if (!current) return;
  if (current.section==='share' && $('share-url')) $('share-url').value=sharedHref(current);
  const family=current.family && familyFor(current.family);
  const phase=family ? family.phase() : saveState;
  let label='';
  if (family) {
    label=phase==='error' ? (family.pending() ? 'Picks waiting to sync. Keep this link and retry. ' : 'Couldn’t refresh the family list. ') :
      phase==='saving' ? 'Saving to your family list…' : 'Saved to your shared family list.';
    const tray=document.querySelector('[data-family-tray]');
    if (tray) tray.textContent=phase==='saving'?'· Saving…':phase==='saved'?'· Shared':'';
  } else if (current.value.picks || current.value.base) {
    if (store.savedId(current.value)) label='Saved · anyone with your shared link can open it.';
    else if (saveState==='error') label='Couldn’t sync. Your picks are in the page link. ';
    else label='Saving your picks…';
  }
  document.querySelectorAll('[data-save]').forEach(el=>{
    el.replaceChildren(document.createTextNode(label));
    if (phase==='error' && (family || !store.savedId(current.value))) {
      const retry=document.createElement('button');
      retry.type='button'; retry.className='inline-link'; retry.dataset.action='retry'; retry.textContent='Retry save';
      el.append(retry);
    }
  });
  const mobileError=$('mobile-save');
  if (mobileError) {
    mobileError.hidden=phase!=='error';
    if (phase==='error') mobileError.textContent=label;
  }
}

function saveSelection(value, immediate=false) {
  const key=selectionKey(value);
  if (attemptedKey===key && !immediate) return updateSync();
  clearTimeout(timer);
  attemptedKey=key;
  saveState='';
  if (!value.picks && !value.base || store.savedId(value)) return updateSync();
  saveState='saving';
  updateSync();
  const perform=async()=>{
    try {
      await store.save(value);
      if (attemptedKey===key) saveState='saved';
    } catch {
      if (attemptedKey===key) saveState='error';
    }
    if (attemptedKey===key) updateSync();
  };
  if (immediate) void perform();
  else timer=setTimeout(perform,250);
}

function draw(s) {
  const section=s.section;
  const quickScroll=document.querySelector('.quick')?.scrollLeft || 0;
  const shopTab=section==='catalog'||section==='list'||byId.has(section);
  const navLinks=[['catalog','Shop',shopTab],['builder','My picks ('+itemCount(s.cart)+')',['builder','share','deal'].includes(section)],['picks','Deal ideas',['picks','uber'].includes(section)]];
  $('nav').innerHTML=navLinks.map(([view,title,active])=>a(title,href(view,{of:''}),'nav-link',active?'aria-current="page"':'')).join('');
  $('shop-brand').href=href('catalog');
  if (section==='catalog') $('main').innerHTML=shop(s);
  else if (section==='list') $('main').innerHTML=pickByName(s);
  else if (section==='builder') $('main').innerHTML=review(s);
  else if (section==='picks') $('main').innerHTML=ideas(s);
  else if (section==='deal') $('main').innerHTML=preview(s);
  else if (section==='share') $('main').innerHTML=share(s);
  else if (section==='uber') $('main').innerHTML=uber();
  else $('main').innerHTML=detail(s);
  const quick=document.querySelector('.quick');
  if (quick) {
    quick.scrollLeft=quickScroll;
    const active=quick.querySelector('[aria-current]');
    if (active && active.offsetLeft+active.offsetWidth>quick.offsetLeft+quick.clientWidth+quick.scrollLeft) {
      quick.scrollLeft=active.offsetLeft-quick.offsetLeft;
    }
  }
  $('mobile-tray').innerHTML=shopTab ? mobileTray(s)+'<div id="mobile-save" hidden>Couldn’t sync. Your picks are in the page link.</div>' : '';
  document.body.classList.toggle('with-tray',shopTab);
  const name=({catalog:'Pick your favorites',list:'Pick several by name',builder:'My picks',picks:'Deal ideas',deal:'Deal preview',share:'Share your picks',uber:'Uber Eats offers'})[section]||shortName(byId.get(section));
  document.title=name+' · Best Buy '+(config.city || 'Millbury');
  updateSync();
}

function loading(failed) {
  current=null;
  $('nav').replaceChildren(); $('mobile-tray').replaceChildren();
  $('shop-brand').href=href('catalog',{cart:'0',list:''},true);
  $('main').innerHTML=failed
    ? `<div class="empty"><h1>Couldn’t open this list</h1><p>The saved link may be incomplete, or the connection may have dropped.</p><div class="panel-actions"><button class="button primary" data-action="reload-list">Try again</button>${a('Open a fresh list',href('catalog',{cart:'0'},true),'button outline')}</div></div>`
    : '<div class="empty" role="status"><h1>Opening shared picks…</h1></div>';
}

async function restore(options={}) {
  const ticket=++loadAttempt;
  const p=new URLSearchParams(location.search);
  const list=p.get('list');
  const familyId=p.get('family');
  let value;
  if (familyId) {
    const seen=families.has(familyId);
    const family=familyFor(familyId);
    value=family.value();
    if (!value) {
      loading(false);
      try { await family.refresh(); value=family.value(); }
      catch { if (ticket===loadAttempt) loading(true); return; }
      if (ticket!==loadAttempt) return;
    } else if (!seen) void family.refresh().catch(()=>{});
  } else if (list && !p.has('cart')) {
    value=store.cached(list);
    if (!value) {
      loading(false);
      try { value=await store.load(list); }
      catch { if (ticket===loadAttempt) loading(true); return; }
      if (ticket!==loadAttempt) return;
    }
  } else {
    value=snapshot(decodeCart(p.get('cart'),byId),parseAmount(p.get('base')) || 0,p.get('extra')!=='0');
  }
  const sameSelection=current && selectionKey(current.value)===selectionKey(value);
  if (!sameSelection) { baseDraft=loadDraft(value); baseProblem=false; }
  current=read(value,p);
  draw(current);
  if (!familyId) saveSelection(value,current.section==='share' && !store.savedId(value));
  if (options.top) {
    window.scrollTo(0,0);
    $('main').focus({preventScroll:true});
  } else if (options.focus && $(options.focus)) {
    const input=$(options.focus);
    input.focus({preventScroll:true});
    if (options.cursor!=null && input.setSelectionRange) input.setSelectionRange(options.cursor,options.cursor);
  }
}

function go(dest,options={}) {
  const url=new URL(dest,location.href);
  if (url.href!==location.href) history[options.replace?'replaceState':'pushState'](options.state || null,'',url);
  else if (options.state) history.replaceState(options.state,'',url);
  void restore(options);
}

function edit(cart,base=current.value.base,extra=current.value.extra,view=current.section,focus,relative) {
  if (current.family) {
    const change={items:relative?[relative]:changedItems(current.cart,cart)};
    if (base!==current.value.base) change.base=base;
    if (extra!==current.value.extra) change.extra=extra;
    const top=view!==current.section;
    if (change.items.length || change.base!==undefined || change.extra!==undefined) familyFor(current.family).edit(change);
    go(href(view,{of:'',deal:'',basis:''}),{top,focus});
    return;
  }
  const value=snapshot(cart,base,extra);
  store.recover(value);
  go(href(view,{...inlineSelection(value),of:'',deal:'',basis:''}),{top:view!==current.section,focus});
}

async function createFamily(button) {
  const value=current.value;
  const key=selectionKey(value);
  const startUrl=location.href;
  if (creation?.key!==key) creation={key,request:crypto.randomUUID()};
  button.disabled=true;
  try {
    const id=await callPicks('createFamily',{picks:value.picks,base:value.base,extra:value.extra,request:creation.request});
    if (location.href===startUrl) go(href('share',{family:id},true),{top:true});
  } catch {
    const note=document.querySelector('[data-create-note]');
    if (location.href===startUrl && note) note.textContent='Couldn’t start a shared list. Your picks are here. Try again.';
  } finally { button.disabled=false; }
}

function refreshFamily() {
  if (current?.family && !document.hidden) void familyFor(current.family).refresh().catch(()=>{});
}

async function deliver(native) {
  const url=sharedHref(current);
  const message=$('share-message');
  if (native && typeof navigator.share==='function') {
    try { await navigator.share({title:current.shareDeal?'Best Buy deal':'My Best Buy picks',url}); message.textContent='Link shared.'; return; }
    catch (error) { if (error.name==='AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url); message.textContent='Link copied. Paste it into a text or email.';
  } catch {
    const field=$('share-url'); field.focus(); field.select(); message.textContent='Copy the selected link, then paste it into a text or email.';
  }
}

document.addEventListener('click',event=>{
  if (event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (event.target.closest('a.skip')) {
    event.preventDefault(); $('main').focus(); $('main').scrollIntoView({block:'start'}); return;
  }
  const anchor=event.target.closest('a[data-nav]');
  if (anchor) {
    event.preventDefault(); searchTyping=false;
    const next=new URL(anchor.href);
    go(anchor.href,{top:next.hash.slice(1)!==current?.section});
    return;
  }
  const button=event.target.closest('button');
  if (!button) return;
  if (button.dataset.action==='reload-list') { void restore(); return; }
  if (!current) return;
  if (button.dataset.pick) {
    const id=button.dataset.pick;
    const cart=new Map(current.cart);
    const removed=cart.delete(id);
    if (!removed) cart.set(id,1);
    edit(cart,current.value.base,current.value.extra,current.section,button.id);
    $('notice').textContent=shortName(byId.get(id))+(removed?' removed. ':' picked. ')+countText(cart)+'.';
  } else if (button.dataset.qty) {
    const id=button.dataset.qty;
    const by=Number(button.dataset.by);
    edit(changeQuantity(current.cart,id,by),current.value.base,current.value.extra,current.section,undefined,{id:Number(id.slice(5)),count:by,relative:true});
    const replacement=document.querySelector('[data-qty="'+id+'"][data-by="'+button.dataset.by+'"]');
    if (replacement && !replacement.disabled) replacement.focus({preventScroll:true});
    else (document.querySelector('[data-qty="'+id+'"]:enabled') || $('main')).focus({preventScroll:true});
  } else if (button.dataset.action==='keep') {
    const combined=new Map(current.cart);
    for (const [id,n] of current.preview) combined.set(id,Math.max(n,combined.get(id)||0));
    edit(combined,current.value.base,current.value.extra,'builder');
  } else if (button.dataset.action==='family') void createFamily(button);
  else if (button.dataset.action==='retry') {
    if (current.family) refreshFamily(); else saveSelection(current.value,true);
  }
  else if (button.dataset.action==='copy' || button.dataset.action==='native') void deliver(button.dataset.action==='native');
});

document.addEventListener('input',event=>{
  if (event.target.id==='names') {
    const draft=nameDraft(current);
    draft.text=event.target.value;
    draft.route=current.named ? idParam(current.named) : null;
    saveNames(draft);
    return;
  }
  if (event.target.id==='base') {
    baseDraft=event.target.value;
    try { sessionStorage.setItem(draftKey,JSON.stringify({key:selectionKey(current.value),text:baseDraft})); } catch {}
    return;
  }
  if (event.target.id!=='search') return;
  const input=event.target;
  go(href('catalog',{q:input.value,pg:''}),{replace:searchTyping,focus:'search',cursor:input.selectionStart});
  searchTyping=true;
});

document.addEventListener('submit',event=>{
  if (event.target.id==='names-form') {
    event.preventDefault();
    const draft=nameDraft(current);
    draft.text=$('names').value;
    const { ids, missing }=findNames(draft.text);
    // Keep any checked choices when looking up more names before adding them.
    const checked=(current.named || []).filter(id=>current.checked.has(id) && !current.cart.has(id));
    const combined=[...new Set([...ids,...checked])];
    draft.route=idParam(combined); saveNames(draft);
    go(href('list',{matches:idParam(combined)||'0',checked:idParam(checked)}),{focus:'matches-title',state:{namesText:draft.text,missingNames:missing}});
    $('matches-title')?.scrollIntoView({block:'nearest'});
    return;
  }
  if (event.target.id==='add-names') {
    event.preventDefault();
    const cart=new Map(current.cart);
    for (const id of current.named || []) if (current.checked.has(id) && !cart.has(id)) cart.set(id,1);
    if (cart.size!==current.cart.size) edit(cart,current.value.base,current.value.extra,'builder');
    return;
  }
  if (event.target.id==='search-form') { event.preventDefault(); searchTyping=false; $('search').blur(); }
  if (event.target.id==='base-form') {
    event.preventDefault();
    const amount=parseAmount($('base').value);
    if (amount===null) { baseProblem=true; draw(current); $('base').focus(); return; }
    baseDraft=undefined; baseProblem=false;
    try { sessionStorage.removeItem(draftKey); } catch {}
    edit(current.cart,amount);
    $('notice').textContent='Other eligible merchandise updated.';
  }
});
document.addEventListener('change',event=>{
  const id=event.target.dataset.named;
  if (id && current?.named?.includes(id) && !current.cart.has(id)) {
    if (event.target.checked) current.checked.add(id);
    else current.checked.delete(id);
    history.replaceState(history.state,'',href('list',{checked:idParam([...current.checked])}));
    const count=current.named.filter(item=>current.checked.has(item) && !current.cart.has(item)).length;
    $('add-checked').textContent=addLabel(count); $('add-checked').disabled=!count;
    return;
  }
  if (event.target.id==='extra') edit(current.cart,current.value.base,event.target.checked,'builder','extra');
});
window.addEventListener('popstate',()=>{ searchTyping=false; void restore(); });
window.addEventListener('online',()=>{ if (current?.family) refreshFamily(); else if (current && saveState==='error') saveSelection(current.value,true); });
window.addEventListener('focus',refreshFamily);
document.addEventListener('visibilitychange',refreshFamily);
setInterval(refreshFamily,6000);
window.addEventListener('pagehide',()=>{
  if (current && !current.family && (current.value.picks || current.value.base) && !store.savedId(current.value)) {
    clearTimeout(timer);
    void store.save(current.value).catch(()=>{});
  }
});

// Pin the initial selection into browser history so Back and reload can return
// to the original empty list even after the visitor has saved later picks.
const start=new URLSearchParams(location.search);
if (start.has('page')) history.replaceState(null,'',href(viewName()));
if (!start.has('family') && !start.has('list') && !start.has('cart') && !start.has('base') && !start.has('extra')) {
  const last=!location.search && !location.hash && store.last();
  const value=last || {picks:'',base:0,extra:true};
  history.replaceState(null,'',href(viewName(),inlineSelection(value)));
}
void restore();
