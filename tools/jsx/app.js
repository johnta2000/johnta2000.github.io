(() => {
  'use strict';
  const data = window.JSX_FARES;
  const $ = id => document.getElementById(id);
  const fields = ['origin', 'destination', 'budget', 'after', 'before', 'weekend', 'sort'];
  const controls = Object.fromEntries(fields.map(id => [id, $(id)]));
  const airports = new Map();
  data.fares.forEach(f => { airports.set(f.origin, f.originCity); airports.set(f.destination, f.destinationCity); });
  ['origin', 'destination'].forEach(id => {
    controls[id].add(new Option(id === 'origin' ? 'Any departure' : 'Anywhere', ''));
    [...airports].sort((a, b) => a[1].localeCompare(b[1])).forEach(([code, city]) => controls[id].add(new Option(`${city} (${code})`, code)));
  });
  const pickers = ['origin', 'destination', 'sort'].map(id => SearchableSelect.enhance(controls[id]));
  let trip = 'one_way', page = 1;
  const perPage = 30;
  const date = value => new Date(`${value}T12:00:00`);
  const fmt = value => date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function restore() {
    const params = new URLSearchParams(location.search);
    fields.forEach(id => {
      if (id === 'weekend') controls[id].checked = params.get(id) === '1';
      else if (params.has(id)) {
        const value = params.get(id);
        if (controls[id].tagName !== 'SELECT' || [...controls[id].options].some(o => o.value === value)) controls[id].value = value;
      }
    });
    if (['all', 'one_way', 'round_trip'].includes(params.get('trip'))) trip = params.get('trip');
    pickers.forEach(p => p.sync());
  }
  function save() {
    const params = new URLSearchParams();
    if (trip !== 'one_way') params.set('trip', trip);
    fields.forEach(id => {
      const value = id === 'weekend' ? (controls[id].checked ? '1' : '') : controls[id].value;
      if (value && !(id === 'sort' && value === 'price')) params.set(id, value);
    });
    try { history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash); } catch { /* Local file use can restrict history updates. */ }
  }
  function cell(text, className) { const node = document.createElement('td'); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function row(f) {
    const tr = document.createElement('tr');
    const route = cell();
    const wrap = document.createElement('div'); wrap.className = 'route';
    [[f.origin, f.originCity], [f.destination, f.destinationCity]].forEach(([code, city], i) => {
      if (i) { const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→'; arrow.setAttribute('aria-label', 'to'); wrap.append(arrow); }
      const airport = document.createElement('div'); airport.className = 'airport';
      const strong = document.createElement('strong'); strong.textContent = code;
      const name = document.createElement('span'); name.textContent = city; airport.append(strong, name); wrap.append(airport);
    });
    route.append(wrap);
    const travel = cell(fmt(f.departDate), 'travel-date');
    const returnText = document.createElement('span'); returnText.className = 'detail';
    returnText.textContent = f.returnDate ? `Return ${fmt(f.returnDate)}` : `${date(f.departDate).toLocaleDateString('en-US', {weekday:'long'})} departure`; travel.append(returnText);
    const price = cell(); const amount = document.createElement('span'); amount.className = 'price'; amount.textContent = money(f.priceUsd);
    const type = document.createElement('span'); type.className = 'detail'; type.textContent = f.tripType === 'round_trip' ? 'Round-trip total' : 'One-way'; price.append(amount, type);
    const booking = cell(); const link = document.createElement('a'); link.className = 'book';
    const params = new URLSearchParams({o:f.origin,d:f.destination,dd:f.departDate,adt:'1',curr:'USD'});
    if (f.returnDate) params.set('rd', f.returnDate);
    link.href = `https://www.jsx.com/booking/select?${params}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Check on JSX ↗';
    link.setAttribute('aria-label', `Check ${f.originCity} to ${f.destinationCity}, ${fmt(f.departDate)}${f.returnDate ? ', returning ' + fmt(f.returnDate) : ''} on JSX`);
    booking.append(link); tr.append(route, travel, price, booking); return tr;
  }
  function render() {
    const today = localToday();
    const after = controls.after.value, before = controls.before.value;
    const invalidDates = after && before && after > before;
    let fares = data.fares.filter(f => f.departDate >= today &&
      (trip === 'all' || f.tripType === trip) &&
      (!controls.origin.value || f.origin === controls.origin.value) &&
      (!controls.destination.value || f.destination === controls.destination.value) &&
      (controls.budget.value === '' || f.priceUsd <= Number(controls.budget.value)) &&
      (!after || f.departDate >= after) && (!before || f.departDate <= before) &&
      (!controls.weekend.checked || [0, 5, 6].includes(date(f.departDate).getDay())));
    const comparators = { price:(a,b)=>a.priceUsd-b.priceUsd, highest:(a,b)=>b.priceUsd-a.priceUsd, date:(a,b)=>a.departDate.localeCompare(b.departDate), route:(a,b)=>a.originCity.localeCompare(b.originCity)||a.destinationCity.localeCompare(b.destinationCity) };
    fares.sort((a,b) => comparators[controls.sort.value](a,b) || a.departDate.localeCompare(b.departDate) || a.origin.localeCompare(b.origin));
    const pages = Math.max(1, Math.ceil(fares.length / perPage)); page = Math.min(page, pages);
    $('fares').replaceChildren(...fares.slice((page-1)*perPage,page*perPage).map(row));
    $('results-title').textContent = `${fares.length.toLocaleString()} fares to explore`;
    $('snapshot').textContent = `Snapshot · ${fmt(data.asOf)} · One adult · USD`;
    $('empty').hidden = fares.length > 0;
    $('empty').querySelector('p').textContent = invalidDates ? 'The first departure date must be on or before the last date.' : today > data.fares.reduce((max,f) => f.departDate > max ? f.departDate : max, '') ? 'This snapshot has no future departures left. A fresh fare snapshot is needed.' : 'Try another airport, a wider date range, or a higher budget.';
    $('range').textContent = fares.length ? `Showing ${(page-1)*perPage+1}–${Math.min(page*perPage,fares.length)} of ${fares.length.toLocaleString()}` : 'No matching fares';
    $('page').textContent = `${page} / ${pages}`; $('prev').disabled = page === 1; $('next').disabled = page === pages;
    $('status').textContent = `${fares.length} matching fares. Page ${page} of ${pages}.`;
    document.querySelectorAll('[data-trip]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.trip === trip)));
    save();
  }
  function reset() { trip = 'one_way'; page = 1; fields.forEach(id => { if (id === 'weekend') controls[id].checked = false; else controls[id].value = id === 'sort' ? 'price' : ''; }); pickers.forEach(p => p.sync()); render(); }
  fields.forEach(id => controls[id].addEventListener(['budget'].includes(id) ? 'input' : 'change', () => { page = 1; render(); }));
  document.querySelectorAll('[data-trip]').forEach(button => button.addEventListener('click', () => { trip = button.dataset.trip; page = 1; render(); }));
  $('swap').addEventListener('click', () => { [controls.origin.value, controls.destination.value] = [controls.destination.value, controls.origin.value]; pickers.forEach(p => p.sync()); page=1; render(); });
  ['reset','empty-reset'].forEach(id => $(id).addEventListener('click', reset));
  ['prev','next'].forEach(id => $(id).addEventListener('click', () => { page += id === 'next' ? 1 : -1; render(); $('results-title').scrollIntoView({block:'start'}); }));
  $('coverage').textContent = `${data.fares.length.toLocaleString()} samples across ${data.routeCount-data.emptyRoutes} routes. ${data.emptyRoutes} additional routes had no sampled fares and are not listed. Past departure dates are hidden.`;
  restore(); render();
})();
