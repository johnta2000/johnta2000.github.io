(() => {
  'use strict';
  const data = window.JSX_FARES;
  const track = (name, properties = {}) => window.SiteAnalytics?.capture(name, properties);
  const $ = id => document.getElementById(id);
  const ids = ['search', 'trip', 'origin', 'destination', 'min-price', 'budget', 'after', 'before', 'weekend', 'sort', 'per-page'];
  const controls = Object.fromEntries(ids.map(id => [id, $(id)]));
  const defaults = { trip: 'one_way', sort: 'price', 'per-page': '100' };
  const airports = new Map();
  [...(window.JSX_MAP_DATA?.routes || []), ...data.fares].forEach(f => { airports.set(f.origin, f.originCity); airports.set(f.destination, f.destinationCity); });
  ['origin', 'destination'].forEach(id => {
    controls[id].add(new Option('Any airport', ''));
    [...airports].sort((a,b) => a[1].localeCompare(b[1])).forEach(([code, city]) => controls[id].add(new Option(`${city} (${code})`, code)));
  });
  const pickers = Object.fromEntries(['trip', 'origin', 'destination', 'sort', 'per-page'].map(id => [id, SearchableSelect.enhance(controls[id])]));
  let page = 1, pages = 1;
  const date = value => new Date(`${value}T12:00:00`);
  const fmt = value => `${date(value).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})} (${date(value).toLocaleDateString('en-US', {weekday:'short'})})`;
  const money = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const maxDeparture = data.fares.reduce((max,f) => f.departDate > max ? f.departDate : max, '');
  function today() { const now=new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
  function icon(name) { const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('class','icon'); svg.setAttribute('aria-hidden','true'); const use=document.createElementNS('http://www.w3.org/2000/svg','use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg; }
  function restore() {
    const params = new URLSearchParams(location.search);
    ids.forEach(id => {
      const field=controls[id], value=params.get(id) ?? defaults[id] ?? '';
      if (id==='weekend') field.checked=value==='1';
      else if (field.tagName!=='SELECT' || [...field.options].some(o=>o.value===value)) field.value=value;
    });
    Object.values(pickers).forEach(p=>p.sync());
  }
  function save() {
    const params=new URLSearchParams();
    ids.forEach(id => { const value=id==='weekend' ? (controls[id].checked?'1':'') : controls[id].value; if(value && value!==defaults[id]) params.set(id,value); });
    try { history.replaceState(null,'',location.pathname+(params.size?`?${params}`:'')+location.hash); } catch { /* Opening the HTML directly can restrict history updates. */ }
  }
  function cell(text, className) { const td=document.createElement('td'); if(text) td.textContent=text; if(className) td.className=className; return td; }
  const accountDialog = $('account-dialog');
  const promptStorageKey = 'jsx-account-prompt-seen-v1';
  let accountPromptSeen = false;
  try { accountPromptSeen = localStorage.getItem(promptStorageKey) === '1'; } catch { /* The prompt still works when browser storage is unavailable. */ }
  function askAboutAccount(event) {
    const placement = event.currentTarget.dataset.analyticsPlacement;
    track('jsx_booking_clicked', { placement });
    if (accountPromptSeen || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      track('jsx_booking_opened', { placement }); return;
    }
    event.preventDefault();
    $('account-continue').href = event.currentTarget.href;
    track('jsx_account_prompt_shown', { placement });
    accountDialog.showModal();
    accountPromptSeen = true;
    document.querySelectorAll('.book[aria-haspopup]').forEach(link => link.removeAttribute('aria-haspopup'));
    try { localStorage.setItem(promptStorageKey, '1'); } catch { /* Remember for this page visit even if storage is blocked. */ }
  }
  const closeAccountPrompt = () => { track('jsx_account_prompt_closed', { placement: 'account_dialog' }); accountDialog.close(); };
  $('account-close').addEventListener('click', closeAccountPrompt);
  accountDialog.addEventListener('cancel', () => track('jsx_account_prompt_closed', { placement: 'account_dialog' }));
  const trackContinue = () => track('jsx_booking_opened', { placement: 'account_dialog' });
  $('account-continue').addEventListener('click', trackContinue);
  $('account-continue').addEventListener('auxclick', event => { if (event.button === 1) trackContinue(); });
  document.querySelectorAll('a[data-analytics-control="referral"]').forEach(link => {
    const referralClick = () => track('jsx_referral_clicked', { placement: link.dataset.analyticsPlacement });
    link.addEventListener('click', referralClick);
    link.addEventListener('auxclick', event => { if (event.button === 1) referralClick(); });
  });
  ['account-signup', 'account-continue'].forEach(id => $(id).addEventListener('click', () => accountDialog.close()));
  accountDialog.addEventListener('click', event => {
    const bounds = accountDialog.getBoundingClientRect();
    if (event.target === accountDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeAccountPrompt();
  });
  function row(f) {
    const tr=document.createElement('tr');
    const route=cell('', 'fare-route');
    const mapLink=document.createElement('a'); mapLink.className='fare-route-link';
    mapLink.href='#route-map'; mapLink.textContent=`${f.originCity} (${f.origin}) → ${f.destinationCity} (${f.destination})`;
    mapLink.setAttribute('aria-label',`Show ${f.originCity} to ${f.destinationCity} on the map`);
    mapLink.dataset.analyticsControl='map_jump'; mapLink.dataset.analyticsPlacement='fare_table';
    mapLink.append(' ',icon('pin'));
    mapLink.addEventListener('click',event=>{
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
      event.preventDefault();
      controls.origin.value=f.origin; controls.destination.value=f.destination;
      pickers.origin.sync(); pickers.destination.sync(); changed();
      track('jsx_map_route_selected',{placement:'fare_table'});
      $('route-map').scrollIntoView({behavior:'smooth',block:'start'});
      $('map-title').focus({preventScroll:true});
    });
    route.append(mapLink);
    const trip=cell(f.tripType==='round_trip'?'Round-trip':'One-way', 'fare-trip');
    const dates=cell(fmt(f.departDate), 'fare-dates');
    if(f.returnDate) { const back=document.createElement('span'); back.className='return-date'; back.textContent=`Return ${fmt(f.returnDate)}`; dates.append(back); }
    const price=cell(money(f.priceUsd), 'fare-price');
    const booking=cell('', 'fare-booking'); booking.append(makeBookingLink(f));
    tr.append(route,trip,dates,price,booking); return tr;
  }
  function makeBookingLink(f, placement = 'fare_table') {
    const link=document.createElement('a'); link.className='book';
    link.dataset.analyticsControl = 'book'; link.dataset.analyticsPlacement = placement;
    const params=new URLSearchParams({o:f.origin,d:f.destination,dd:f.departDate,adt:'1',curr:'USD'});
    if(f.returnDate) params.set('rd',f.returnDate);
    link.href=`https://www.jsx.com/booking/select?${params}`; link.target='_blank'; link.rel='noopener noreferrer'; link.append('Book on JSX ',icon('external'));
    link.setAttribute('aria-label',`Book ${f.originCity} to ${f.destinationCity}, ${fmt(f.departDate)}${f.returnDate?', returning '+fmt(f.returnDate):''} on JSX, opens in a new tab`);
    if (!accountPromptSeen) link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', askAboutAccount);
    link.addEventListener('auxclick', event => { if (event.button === 1) askAboutAccount(event); });
    return link;
  }
  let routeMap = null;
  try {
    routeMap = window.JSXRouteMap.create({
      geography: window.JSX_MAP_DATA, makeBookingLink,
      onChooseRoute(origin, destination) {
        controls.origin.value = origin; controls.destination.value = destination;
        pickers.origin.sync(); pickers.destination.sync(); changed();
      },
      onChooseAirport(origin) {
        controls.origin.value = origin;
        if (controls.destination.value === origin) controls.destination.value = '';
        pickers.origin.sync(); pickers.destination.sync(); changed();
      },
      onClearRoute() {
        controls.origin.value = ''; controls.destination.value = '';
        pickers.origin.sync(); pickers.destination.sync(); changed();
      }

    });
  } catch (error) {
    $('map-summary').textContent = 'The route map could not load. You can still browse all fares in the table above.';
    console.warn('JSX route map unavailable', error);
  }
  function chip(id, label, active) {
    const trigger=$(`${id}-trigger`);
    trigger.querySelector('.search-select-value').textContent=label;
    controls[id].closest('.chip-select').classList.toggle('active', active);
  }
  function render() {
    const now=today(), after=controls.after.value, before=controls.before.value;
    const query=controls.search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const fares=data.fares.filter(f=>f.departDate>=now &&
      (controls.trip.value==='all'||f.tripType===controls.trip.value) &&
      (!controls.origin.value||f.origin===controls.origin.value) && (!controls.destination.value||f.destination===controls.destination.value) &&
      (controls['min-price'].value===''||f.priceUsd>=Number(controls['min-price'].value)) && (controls.budget.value===''||f.priceUsd<=Number(controls.budget.value)) &&
      (!after||f.departDate>=after)&&(!before||f.departDate<=before)&&
      (!controls.weekend.checked||[0,5,6].includes(date(f.departDate).getDay())) &&
      query.every(word=>`${f.originCity} ${f.origin} ${f.destinationCity} ${f.destination}`.toLowerCase().includes(word)));
    const compare={price:(a,b)=>a.priceUsd-b.priceUsd,highest:(a,b)=>b.priceUsd-a.priceUsd,date:(a,b)=>a.departDate.localeCompare(b.departDate),latest:(a,b)=>b.departDate.localeCompare(a.departDate),route:(a,b)=>a.originCity.localeCompare(b.originCity)||a.destinationCity.localeCompare(b.destinationCity)};
    fares.sort((a,b)=>compare[controls.sort.value](a,b)||a.originCity.localeCompare(b.originCity)||a.destinationCity.localeCompare(b.destinationCity)||a.departDate.localeCompare(b.departDate));
    const perPage=Number(controls['per-page'].value); pages=Math.max(1,Math.ceil(fares.length/perPage)); page=Math.min(page,pages);
    $('fares').replaceChildren(...fares.slice((page-1)*perPage,page*perPage).map(row));
    $('empty').hidden=fares.length>0;
    $('empty').querySelector('p').textContent=after&&before&&after>before?'The first departure date must be on or before the last date.':now>maxDeparture?'This snapshot has no future departures left. A fresh fare snapshot is needed.':'Try another airport, a wider date range, or a higher budget.';
    $('total').dataset.resultCount = fares.length;
    $('total').textContent=`${fares.length.toLocaleString()} ${fares.length===1?'fare':'fares'}`; $('page').textContent=`Page ${page} of ${pages}`;
    $('page-controls').hidden=pages===1;
    if(pages===1) pickers['per-page'].close();
    ['first','prev'].forEach(id=>$(id).disabled=page===1); ['next','last'].forEach(id=>$(id).disabled=page===pages);
    $('status').textContent=`${fares.length} matching fares. Page ${page} of ${pages}.`;
    chip('trip',controls.trip.value==='all'?'Trip':'Trip · 1',controls.trip.value!=='all');
    chip('origin',controls.origin.value?`From · ${controls.origin.value}`:'From',!!controls.origin.value);
    chip('destination',controls.destination.value?`To · ${controls.destination.value}`:'To',!!controls.destination.value);
    chip('sort','Sort',false);
    const priceActive=controls.budget.value!==''||controls['min-price'].value!=='';
    $('price-label').textContent=priceActive?'Price · 1':'Price'; $('price-panel').classList.toggle('active',priceActive);
    const datesActive=!!(after||before||controls.weekend.checked);
    $('date-label').textContent=datesActive?'Departure · 1':'Departure'; $('date-panel').classList.toggle('active',datesActive);
    $('reset').hidden=!ids.some(id=>id!=='sort'&&id!=='per-page'&&(id==='weekend'?controls[id].checked:controls[id].value!==(defaults[id]||'')));
    $('price-heading').setAttribute('aria-sort',controls.sort.value==='price'?'ascending':controls.sort.value==='highest'?'descending':'none');
    $('dates-heading').setAttribute('aria-sort',controls.sort.value==='date'?'ascending':controls.sort.value==='latest'?'descending':'none');
    $('sort-price').querySelector('span').textContent=controls.sort.value==='price'?'↑':controls.sort.value==='highest'?'↓':'↕';
    $('sort-dates').querySelector('span').textContent=controls.sort.value==='date'?'↑':controls.sort.value==='latest'?'↓':'↕';
    // The network map always includes the full catalog, independently of table filters.
    const mapFiltered = ids.some(id => !['sort', 'per-page'].includes(id) && (id === 'weekend' ? controls[id].checked : controls[id].value !== (defaults[id] || '')));
    routeMap?.update(data.fares.filter(f => f.tripType === 'one_way' && f.departDate >= now), { matches: fares, filtered: mapFiltered, origin: controls.origin.value, destination: controls.destination.value });
    save();
  }
  function changed() { page=1; render(); }
  const filterTimers = new Map();
  function trackFilter(id) {
    track('jsx_filter_changed', { filter_name: id, trip_type: controls.trip.value, result_count: Number($('total').dataset.resultCount || 0) });
  }
  function reset() { filterTimers.forEach(clearTimeout); filterTimers.clear(); ids.forEach(id=>{if(id==='weekend') controls[id].checked=false;else controls[id].value=defaults[id]||'';}); Object.values(pickers).forEach(p=>p.sync()); changed(); }
  ids.forEach(id=>controls[id].addEventListener(['search','min-price','budget'].includes(id)?'input':'change', () => {
    changed();
    clearTimeout(filterTimers.get(id));
    if (['search','min-price','budget'].includes(id)) filterTimers.set(id, setTimeout(() => trackFilter(id), 600));
    else trackFilter(id);
  }));
  ['reset','empty-reset'].forEach(id=>$(id).addEventListener('click',() => { reset(); trackFilter('reset'); }));
  $('clear-price').addEventListener('click',()=>{controls.budget.value='';controls['min-price'].value='';changed();trackFilter('clear-price');});
  $('clear-dates').addEventListener('click',()=>{controls.after.value='';controls.before.value='';controls.weekend.checked=false;changed();trackFilter('clear-dates');});
  ['first','prev','next','last'].forEach(id=>$(id).addEventListener('click',()=>{page=id==='first'?1:id==='last'?pages:page+(id==='next'?1:-1);render();document.querySelector('.table-wrap').scrollTop=0;}));
  $('sort-price').addEventListener('click',()=>{controls.sort.value=controls.sort.value==='price'?'highest':'price';pickers.sort.sync();changed();});
  $('sort-dates').addEventListener('click',()=>{controls.sort.value=controls.sort.value==='date'?'latest':'date';pickers.sort.sync();changed();});
  const panels=[$('price-panel'),$('date-panel')];
  panels.forEach(panel=>{
    panel.addEventListener('toggle',()=>{if(panel.open){panels.forEach(other=>{if(other!==panel)other.open=false;});Object.values(pickers).forEach(p=>p.close()); position(panel);}});
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();panel.open=false;panel.querySelector('summary').focus();}});
  });
  function position(panel) {
    const menu=panel.querySelector('.filter-menu'); menu.style.transform='';
    const rect=menu.getBoundingClientRect(), pad=12;
    if(rect.left<pad) menu.style.transform=`translateX(${pad-rect.left}px)`;
    else if(rect.right>innerWidth-pad) menu.style.transform=`translateX(${innerWidth-pad-rect.right}px)`;
  }
  document.addEventListener('pointerdown',event=>panels.forEach(panel=>{if(!panel.contains(event.target)) panel.open=false;}));
  document.addEventListener('focusin',event=>panels.forEach(panel=>{if(!panel.contains(event.target)) panel.open=false;}));
  window.addEventListener('resize',()=>panels.filter(p=>p.open).forEach(position));
  window.addEventListener('popstate',()=>{restore();changed();});
  const guideStorageKey = 'jsx-guide-hidden-v1';
  function setGuideHidden(hidden, moveFocus = false) {
    $('offer-guide').hidden = hidden;
    $('guide-restore').hidden = !hidden;
    $('show-guide').setAttribute('aria-expanded', String(!hidden));
    if (moveFocus) (hidden ? $('show-guide') : $('offer-title')).focus({ preventScroll: true });
  }
  $('hide-guide').addEventListener('click', () => {
    setGuideHidden(true, true);
    try { localStorage.setItem(guideStorageKey, '1'); } catch { /* Dismissal still works without storage. */ }
  });
  $('show-guide').addEventListener('click', () => {
    setGuideHidden(false, true);
    try { localStorage.removeItem(guideStorageKey); } catch { /* Reopening still works without storage. */ }
  });
  try { setGuideHidden(localStorage.getItem(guideStorageKey) === '1'); } catch { /* Show the guide by default. */ }
  $('snapshot').textContent=fmt(data.asOf);
  $('coverage').textContent=`${data.emptyRoutes} of ${data.routeCount} JSX routes had no sampled fares and aren’t listed.`;
  restore();render();
})();
