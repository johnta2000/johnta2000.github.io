/* A local SVG route map. No map keys, tiles, or visitor data leave this module. */
(function (root) {
  'use strict';
  function groupRoutes(fares, catalog = []) {
    const routes = new Map();
    for (const fare of fares) {
      const key = `${fare.origin}-${fare.destination}`;
      let route = routes.get(key);
      if (!route) {
        route = { key, origin: fare.origin, destination: fare.destination, originCity: fare.originCity, destinationCity: fare.destinationCity, fares: [], cheapest: fare };
        routes.set(key, route);
      }
      route.fares.push(fare);
      if (fare.priceUsd < route.cheapest.priceUsd || (fare.priceUsd === route.cheapest.priceUsd && fare.departDate < route.cheapest.departDate)) route.cheapest = fare;
    }
    for (const item of catalog) {
      const key = `${item.origin}-${item.destination}`;
      if (!routes.has(key)) routes.set(key, { ...item, key, fares: [], cheapest: null });
    }
    return [...routes.values()].sort((a, b) => routePrice(a) - routePrice(b) || a.originCity.localeCompare(b.originCity) || a.destinationCity.localeCompare(b.destinationCity));
  }
  const colors = ['#398875', '#c18a32', '#ce6d43', '#a96b85'];
  const routePrice = route => route.cheapest?.priceUsd ?? Infinity;
  const routeColor = route => route.cheapest ? colors[band(routePrice(route))] : '#9aa4ad';
  const band = price => price < 200 ? 0 : price < 300 ? 1 : price < 500 ? 2 : 3;
  const mercator = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  function project(lon, lat) { return [40 + (lon + 127) / 62 * 920, 32 + (mercator(50) - mercator(lat)) / (mercator(50) - mercator(21)) * 510]; }
  function create({ geography, onChooseRoute, makeBookingLink }) {
    const $ = id => document.getElementById(id);
    const svg = $('flight-map');
    const ns = 'http://www.w3.org/2000/svg';
    const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    const fmt = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', weekday: 'short' });
    const createSvg = (tag, attrs = {}) => { const node = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; };
    const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
    let routes = [], focus = '', selected = '', box = { x: 0, y: 0, w: 1000, h: 600 };
    let cities = new Map(), lastSignature = null, drag = null;
    let filtered = false, matches = new Map();
    const displayRoute = route => filtered ? (matches.get(route.key) || route) : route;
    const isMatch = route => (!focus || route.origin === focus || route.destination === focus) && (!filtered || matches.has(route.key));
    const airportPicker = window.SearchableSelect.enhance($('map-airport'));
    const title = createSvg('title'); title.textContent = 'JSX route map: select an airport or route to explore sampled fares.'; svg.append(title);
    const land = createSvg('g', { 'aria-hidden': 'true' });
    const lines = createSvg('g', { class: 'map-lines' });
    const points = createSvg('g', { class: 'map-points' });
    const labels = createSvg('g', { 'aria-hidden': 'true', 'pointer-events': 'none' });
    svg.append(land, lines, points, labels);
    function pathFor(geometry) {
      const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
      return polygons.map(poly => poly.map(ring => ring.map(([lon, lat], i) => `${i ? 'L' : 'M'}${project(lon, lat).map(n => n.toFixed(2)).join(',')}`).join('') + 'Z').join('')).join('');
    }
    geography.countries.forEach(country => land.append(createSvg('path', { d: pathFor(country.geometry), class: 'map-land' })));
    geography.states.forEach(state => land.append(createSvg('path', { d: pathFor(state), class: 'map-state' })));
    [['UNITED STATES', -101, 44], ['MEXICO', -103, 24.3]].forEach(([name, lon, lat]) => { const [x, y] = project(lon, lat); const text = createSvg('text', { x, y, class: 'map-country-label', 'text-anchor': 'middle' }); text.textContent = name; land.append(text); });
    function visibleRoutes() { return routes.map(displayRoute).filter(r => !focus || r.origin === focus || r.destination === focus).sort((a, b) => Number(isMatch(b)) - Number(isMatch(a)) || routePrice(a) - routePrice(b)); }
    function coordinate(code) { const port = geography.airports[code]; return port && project(port.lon, port.lat); }
    function setBox(next) {
      const w = Math.max(250, Math.min(1000, next.w)), h = w * 0.6;
      box = { x: Math.max(0, Math.min(1000 - w, next.x)), y: Math.max(0, Math.min(600 - h, next.y)), w, h };
      svg.setAttribute('viewBox', `${box.x} ${box.y} ${w} ${h}`);
      $('map-zoom-out').disabled = w >= 1000;
      $('map-zoom-in').disabled = w <= 250;
      drawGraph();
    }
    function zoom(factor) {
      const center = (focus && coordinate(focus)) || [box.x + box.w / 2, box.y + box.h / 2];
      const w = Math.max(250, Math.min(1000, box.w * factor));
      setBox({ x: center[0] - w / 2, y: center[1] - w * .3, w });
    }
    function graphButton(node, label, callback) {
      node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0'); node.setAttribute('aria-label', label);
      node.addEventListener('click', callback);
      node.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); callback();
        const replacement = [...svg.querySelectorAll('[role=button]')].find(item => item.getAttribute('aria-label') === label);
        (replacement || $('map-airport-trigger')).focus({ preventScroll: true });
      });
      const tip = createSvg('title'); tip.textContent = label; node.append(tip);
    }
    function drawGraph() {
      lines.replaceChildren(); points.replaceChildren(); labels.replaceChildren();
      const visible = routes.map(displayRoute), chosen = visible.find(r => r.key === selected);
      const highlighting = filtered || !!focus, matchedPorts = new Set(visible.filter(isMatch).flatMap(r => [r.origin, r.destination]));
      const ports = new Map(), corridors = new Map();
      visible.forEach(route => {
        [route.origin, route.destination].forEach(code => { const current = ports.get(code); if (!current || (isMatch(route) && !isMatch(current)) || (isMatch(route) === isMatch(current) && routePrice(current) > routePrice(route))) ports.set(code, route); });
        const key = [route.origin, route.destination].sort().join('-');
        const old = corridors.get(key); if (!old || (isMatch(route) && !isMatch(old)) || (isMatch(route) === isMatch(old) && routePrice(route) < routePrice(old))) corridors.set(key, route);
      });
      const scale = Math.max(box.w / (svg.clientWidth || 700), box.h / (svg.clientHeight || 430));
      const labelRects = [];
      for (const route of corridors.values()) {
        const a = coordinate(route.origin), b = coordinate(route.destination); if (!a || !b) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], direction = route.origin < route.destination ? 1 : -1;
        const bend = Math.min(.14, 55 / (Math.hypot(dx, dy) || 1)) * direction;
        const d = `M${a.join(',')}Q${(a[0] + b[0]) / 2 - dy * bend},${(a[1] + b[1]) / 2 + dx * bend} ${b.join(',')}`;
        const active = chosen && [route.origin, route.destination].sort().join('-') === [chosen.origin, chosen.destination].sort().join('-');
        const lit = highlighting && isMatch(route);
        const muted = !active && ((highlighting && !lit) || (chosen && !active));
        const group = createSvg('g', { class: `map-connection${active ? ' is-selected' : ''}${lit ? ' is-matching' : ''}${muted ? ' is-muted' : ''}`, 'data-route': route.key });
        group.append(createSvg('path', { d, class: 'map-route-hit', 'vector-effect': 'non-scaling-stroke' }), createSvg('path', { d, class: 'map-route-line', stroke: routeColor(route), 'stroke-dasharray': route.cheapest ? 'none' : '4 4', 'vector-effect': 'non-scaling-stroke' }));
        graphButton(group, `${route.originCity} (${route.origin}) ↔ ${route.destinationCity} (${route.destination}), ${route.cheapest ? `from ${money(routePrice(route))}` : 'no sampled one-way fare'}. Explore route.`, () => selectRoute(route.key));
        lines.append(group);
      }
      if (chosen) {
        const a = coordinate(chosen.origin), b = coordinate(chosen.destination);
        if (a && b) {
          const dx = b[0] - a[0], dy = b[1] - a[1], direction = chosen.origin < chosen.destination ? 1 : -1;
          const bend = Math.min(.14, 55 / (Math.hypot(dx, dy) || 1)) * direction;
          const text = `${chosen.origin} → ${chosen.destination} ${chosen.cheapest ? money(routePrice(chosen)) : 'No fare sample'}`;
          const w = (text.length * 6.5 + 16) * scale, h = 25 * scale;
          const x = Math.max(box.x + 4 * scale, Math.min(box.x + box.w - w - 4 * scale, (a[0] + b[0]) / 2 - dy * bend / 2 - w / 2));
          const y = Math.max(box.y + 4 * scale, Math.min(box.y + box.h - h - 4 * scale, (a[1] + b[1]) / 2 + dx * bend / 2 - h / 2));
          labelRects.push({ x, y, w, h });
          labels.append(createSvg('rect', { x, y, width: w, height: h, rx: 6 * scale, fill: '#fff5e8', stroke: '#eea34f', 'stroke-width': scale }));
          const caption = createSvg('text', { x: x + w / 2, y: y + h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 12 * scale, 'font-weight': 700, fill: '#493c35' });
          caption.textContent = text; labels.append(caption);
        }
      }
      // Label the selected airport first, then the lowest-fare airports. Place labels
      // around dense airport clusters rather than moving their actual coordinates.
      const ordered = [...ports].sort((a, b) => (b[0] === focus) - (a[0] === focus) || routePrice(a[1]) - routePrice(b[1]));
      for (const [code, route] of ordered) {
        const p = coordinate(code); if (!p) continue;
        const lit = highlighting && matchedPorts.has(code);
        const active = lit || code === focus || (chosen && [chosen.origin, chosen.destination].includes(code));
        const group = createSvg('g', { class: `map-airport${active ? ' is-selected' : ''}${lit ? ' is-matching' : ''}${highlighting && !active ? ' is-muted' : ''}` });
        if (lit) group.append(createSvg('circle', { cx: p[0], cy: p[1], r: 10 * scale, fill: routeColor(route), opacity: '.18', 'pointer-events': 'none' }));
        group.append(createSvg('circle', { cx: p[0], cy: p[1], r: 22 * scale, class: 'map-airport-hit' }));
        group.append(createSvg('circle', { cx: p[0], cy: p[1], r: (active ? 5 : 3.8) * scale, fill: routeColor(route), stroke: '#fff', 'stroke-width': 1.8 * scale }));
        group.dataset.code = code;
        group.setAttribute('aria-pressed', String(code === focus));
        graphButton(group, `${cities.get(code)} (${code}), ${route.cheapest ? `lowest sampled one-way fare involving this airport ${money(routePrice(route))}` : 'no sampled one-way fare'}. Show its routes.`, () => setFocus(code === focus ? '' : code));
        points.append(group);
        if (p[0] < box.x || p[0] > box.x + box.w || p[1] < box.y || p[1] > box.y + box.h) continue;
        const text = `${code}${route.cheapest ? ` ${money(routePrice(route))}` : ''}`;
        const w = (text.length * 6.4 + 12) * scale, h = 22 * scale, gap = 9 * scale;
        const candidates = [
          [p[0] + gap, p[1] - h / 2], [p[0] - w - gap, p[1] - h / 2],
          [p[0] - w / 2, p[1] - h - gap], [p[0] - w / 2, p[1] + gap],
          [p[0] + gap, p[1] - h - gap], [p[0] - w - gap, p[1] + gap]
        ];
        const spot = candidates.find(([x, y]) => x >= box.x + 3 * scale && y >= box.y + 3 * scale && x + w < box.x + box.w - 3 * scale && y + h < box.y + box.h - 3 * scale && !labelRects.some(r => x < r.x + r.w + 2 * scale && x + w + 2 * scale > r.x && y < r.y + r.h + 2 * scale && y + h + 2 * scale > r.y));
        if (!spot) continue;
        const [x, y] = spot; labelRects.push({ x, y, w, h });
        labels.append(createSvg('line', { x1: p[0], y1: p[1], x2: x + w / 2, y2: y + h / 2, stroke: '#bdb6b2', 'stroke-width': scale, opacity: '.7' }));
        const label = createSvg('g');
        label.append(createSvg('rect', { x, y, width: w, height: h, rx: 5 * scale, fill: '#fff', stroke: active ? '#eea34f' : '#e5e1dd', 'stroke-width': scale }));
        const t = createSvg('text', { x: x + w / 2, y: y + h / 2, 'dominant-baseline': 'central', 'text-anchor': 'middle', fill: '#493c35', 'font-size': 11.5 * scale, 'font-weight': active ? 750 : 600 });
        t.textContent = text; label.append(t); labels.append(label);
      }
    }
    function renderDetail() {
      const panel = $('map-detail'), route = routes.map(displayRoute).find(r => r.key === selected); panel.replaceChildren(); panel.hidden = !route;
      if (!route) return;
      const f = route.cheapest;
      panel.append(el('h4', '', `${route.originCity} → ${route.destinationCity}`), el('p', 'map-detail-codes', `${route.origin} → ${route.destination}`));
      if (!f) {
        panel.append(el('p', 'map-detail-dates', 'This pairing is in the route catalog, but there is no future one-way fare in this snapshot. Check JSX for current schedules and availability.'));
        const link = el('a', 'book', 'Check route on JSX ↗');
        link.href = `https://www.jsx.com/home/search?o=${route.origin}&d=${route.destination}`;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; panel.append(link);
        return;
      }
      const price = el('p', 'map-detail-price', money(f.priceUsd)); price.append(el('span', '', f.tripType === 'round_trip' ? ' round-trip total' : ' one-way')); panel.append(price);
      panel.append(el('p', 'map-detail-dates', fmt(f.departDate) + (f.returnDate ? ` · Return ${fmt(f.returnDate)}` : '')));
      panel.append(el('p', 'map-detail-samples', `Lowest of ${route.fares.length} matching fare ${route.fares.length === 1 ? 'sample' : 'samples'}. Confirm on JSX.`));
      const actions = el('div', 'map-detail-actions'), view = el('button', '', 'See fares in table ↑'); view.type = 'button';
      view.addEventListener('click', () => onChooseRoute(route.origin, route.destination, f.tripType));
      actions.append(view, makeBookingLink(f)); panel.append(actions);
    }
    function renderList() {
      const visible = visibleRoutes();
      $('map-list-title').textContent = focus ? `${cities.get(focus)} routes` : 'Routes by lowest fare';
      $('map-clear').hidden = !focus && !selected;
      $('map-routes').replaceChildren(...visible.map(route => {
        const button = el('button', `map-route-option${filtered && isMatch(route) ? ' is-matching' : ''}`); button.type = 'button'; button.dataset.route = route.key;
        button.setAttribute('aria-pressed', String(selected === route.key));
        const copy = el('span', 'map-route-copy'); copy.append(el('strong', '', `${route.origin} → ${route.destination}`), el('span', '', `${route.originCity} → ${route.destinationCity}`));
        const price = el('span', 'map-route-price', route.cheapest ? `From ${money(routePrice(route))}` : 'No fare sample'); price.style.color = routeColor(route);
        button.append(copy, price); button.addEventListener('click', () => {
          selectRoute(route.key);
          $('map-routes').querySelector(`[data-route="${route.key}"]`)?.focus({ preventScroll: true });
        }); return button;
      }));
      if (!visible.length) $('map-routes').append(el('p', 'map-no-routes', focus ? 'No matching fares for this airport. Try “All airports” or adjust the filters above.' : 'No routes match the current fare filters.'));
      const count = new Set(visible.flatMap(r => [r.origin, r.destination])).size;
      $('map-summary').textContent = `${filtered ? `${visible.filter(isMatch).length} routes match your fare filters · ` : ''}${visible.length} directional ${visible.length === 1 ? 'route' : 'routes'} · ${count} airports${visible[0]?.cheapest ? ` · One-way from ${money(routePrice(visible[0]))}` : ''}`;
      $('map-empty').hidden = visible.length > 0;
    }
    function selectRoute(key) { selected = key; drawGraph(); renderDetail(); renderList(); }
    function setFocus(code) {
      focus = code; selected = ''; $('map-airport').value = code; airportPicker.sync();
      drawGraph(); renderDetail(); renderList();
    }
    $('map-airport').addEventListener('change', () => setFocus($('map-airport').value));
    $('map-clear').addEventListener('click', () => setFocus(''));
    $('map-zoom-in').addEventListener('click', () => zoom(.7));
    $('map-zoom-out').addEventListener('click', () => zoom(1 / .7));
    $('map-fit').addEventListener('click', () => setBox({ x: 0, y: 0, w: 1000 }));
    svg.addEventListener('wheel', event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoom(event.deltaY < 0 ? .85 : 1 / .85); } }, { passive: false });
    svg.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('[role="button"]') || box.w === 1000) return;
      drag = { x: event.clientX, y: event.clientY, box: { ...box } }; svg.setPointerCapture(event.pointerId); svg.classList.add('is-dragging');
    });
    svg.addEventListener('pointermove', event => { if (drag) setBox({ x: drag.box.x - (event.clientX - drag.x) * drag.box.w / svg.clientWidth, y: drag.box.y - (event.clientY - drag.y) * drag.box.h / svg.clientHeight, w: drag.box.w }); });
    const stopDrag = () => { drag = null; svg.classList.remove('is-dragging'); };
    svg.addEventListener('pointerup', stopDrag); svg.addEventListener('pointercancel', stopDrag);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(drawGraph).observe(svg);
    return {
      update(fares, options = {}) {
        const nextMatches = options.matches || [];
        const signature = String(!!options.filtered) + ':' + nextMatches.map(f => `${f.origin}-${f.destination}-${f.departDate}-${f.returnDate}-${f.priceUsd}-${f.tripType}`).sort().join('|') + ':' + fares.map(f => `${f.origin}-${f.destination}-${f.departDate}-${f.returnDate}-${f.priceUsd}-${f.tripType}`).sort().join('|');
        if (signature === lastSignature) return; lastSignature = signature;
        filtered = !!options.filtered; matches = new Map(groupRoutes(nextMatches).map(route => [route.key, route]));
        routes = groupRoutes(fares, geography.routes); cities = new Map(fares.flatMap(f => [[f.origin, f.originCity], [f.destination, f.destinationCity]]));
        // Preserve airport choices even when a table filter yields no fares there.
        const allCities = new Map(geography.routes.flatMap(f => [[f.origin, f.originCity], [f.destination, f.destinationCity]]));
        cities = new Map([...allCities, ...cities]);
        if ($('map-airport').options.length === 1) {
          [...allCities].sort((a, b) => a[1].localeCompare(b[1])).forEach(([code, city]) => $('map-airport').add(new Option(`${city} (${code})`, code)));
          airportPicker.sync();
        }
        if (!routes.some(r => r.key === selected)) selected = '';
        $('map-date').textContent = `Fare snapshot: ${fmt(window.JSX_FARES.asOf)}.`;
        drawGraph(); renderDetail(); renderList();
      }
    };
  }
  const api = { groupRoutes, project, band, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JSXRouteMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
