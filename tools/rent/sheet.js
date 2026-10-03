/* Spreadsheet-style rent entry. All data arrives through the authenticated API. */
window.RentSheet = function ({ root, save, refreshed, selectMonth, canEdit, cellControls, reviewCount, reviewProof }) {
  const make = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const dollars = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n / 100);
  const exact = n => (n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const label = month => new Date(month + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const colors = ['#427860', '#92a66c', '#c5956c', '#818db7'];
  const svg = (tag, attrs = {}, text) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text !== undefined) n.textContent = text; return n; };
  const fields = ['rent', 'parking', 'p0', 'p1', 'p2', 'p3'];
  let records = [], payments = [], selected = '', year = new Date().getFullYear(), drafts = new Map(), pending = false, attempt = null, generation = 0, locked = false;
  let reviewButton, tableBody, error, status, saveButton, undoButton, yearText, trend, split, summary, chartNote;
  const button = (text, fn, cls = 'quiet') => { const b = make('button', text, cls); b.type = 'button'; b.onclick = fn; return b; };
  function cents(value) {
    const s = value.trim().replace(/[$,]/g, '');
    if (!s) return 0;
    if (!/^\d+(\.\d{0,2})?$/.test(s)) throw Error('Use a positive dollar amount with up to two decimal places.');
    const n = Math.round(Number(s) * 100); RentMath.money(n); return n;
  }
  function base(month) {
    const item = records.find(r => r.month === month);
    const previous = records.filter(r => r.month < month).sort((a, b) => b.month.localeCompare(a.month))[0];
    const config = item?.config || previous?.config;
    if (!config) return null;
    const active = payments.filter(p => p.month === month && !p.voidedAt);
    const amounts = [0, 1, 2, 3].map(payer => active.filter(p => p.payer === payer).reduce((s, p) => s + p.amountCents, 0));
    return { item, config, active, amounts, values: [config.rentCents, item?.parkingCents || 0, ...amounts] };
  }
  function rowValue(month) {
    const original = base(month); if (!original) return null;
    const draft = drafts.get(month) || {};
    const values = original.values.map((v, i) => draft[fields[i]] === undefined ? v : cents(draft[fields[i]]));
    const config = { ...original.config, rentCents: values[0] };
    const calculation = RentMath.calculate(config, values[1]);
    const totals = RentMath.summary(calculation, values.slice(2).map((amountCents, payer) => ({ payer, amountCents })));
    return { ...original, values, config, calculation, totals };
  }
  function mark(month, field, value) {
    const original = base(month); if (!original) return;
    let draft = { ...(drafts.get(month) || {}) };
    let same = false; try { same = cents(value) === original.values[fields.indexOf(field)]; } catch {}
    if (same) delete draft[field]; else draft[field] = value;
    if (Object.keys(draft).length) drafts.set(month, draft); else drafts.delete(month);
  }
  function updateState() {
    const count = [...drafts.values()].reduce((n, d) => n + Object.keys(d).length, 0);
    status.textContent = pending ? 'Saving changes…' : count ? `${count} edited ${count === 1 ? 'cell' : 'cells'} in ${drafts.size} ${drafts.size === 1 ? 'month' : 'months'}` : 'All changes saved';
    saveButton.disabled = !count || pending || locked; undoButton.disabled = !count || pending || locked || !!attempt;
    root.classList.toggle('has-edits', count > 0);
    root.querySelectorAll('.cell-receipts button,.cell-receipts input').forEach(n=>{n.disabled=pending||locked||count>0||n.dataset.empty==='true';});
    root.querySelectorAll('.rent-cell').forEach(input => { input.readOnly = pending || locked || !!attempt; input.classList.toggle('edited', drafts.get(input.dataset.month)?.[input.dataset.field] !== undefined); });
  }
  function rowTotals(month) {
    const tr = [...tableBody.rows].find(r => r.dataset.month === month); if (!tr) return;
    try {
      const r = rowValue(month); if (!r) return;
      tr.classList.remove('invalid-row'); tr.querySelector('.row-total').textContent = exact(r.calculation.landlordCents);
      tr.querySelector('.row-balance').textContent = exact(r.totals.remaining);
      const badge = tr.querySelector('.row-status');
      badge.textContent = !r.item && !drafts.has(month) ? 'Not started' : r.totals.overpaid ? 'Overpaid' : r.totals.remaining === 0 ? 'Covered' : r.item?.sourceNote ? 'Review history' : r.totals.received ? 'Partial' : 'Open';
      badge.className = `row-status ${r.totals.remaining === 0 ? 'covered' : ''}`;
      badge.title = r.totals.overpaid ? `${dollars(r.totals.overpaid)} overpaid; other balances remain separate.` : r.item?.sourceNote ? 'Imported entries are preserved in month details and are not automatically counted as paid.' : '';
    } catch (e) { tr.classList.add('invalid-row'); tr.querySelector('.row-balance').textContent = 'Check inputs'; }
  }
  function drawRows() {
    const latest = records.find(m => m.month === selected) || [...records].sort((a, b) => b.month.localeCompare(a.month))[0];
    const names = [...(latest?.config.people.map(p => p.name) || ['Resident 1', 'Resident 2', 'Resident 3']), 'Affil'];
    const header = root.querySelector('.sheet-table thead tr:last-child');
    header.replaceChildren(...['Month', 'Rent', 'Parking credit', ...names, 'To cover', 'Left to collect', 'Status'].map((text, i) => { const th = make('th', text); th.scope = 'col'; if (i === 3) th.className = 'payer-start'; return th; }));
    yearText.textContent = String(year); tableBody.replaceChildren();const reviews=reviewCount();reviewButton.textContent=`${reviews} unmatched transfer${reviews===1?'':'s'}`;reviewButton.hidden=!reviews;
    for (let n = 1; n <= 12; n++) {
      const month = `${year}-${String(n).padStart(2, '0')}`, original = base(month), tr = make('tr'); tr.dataset.month = month; tr.classList.toggle('selected-month', month === selected);
      const monthCell = make('th'); monthCell.scope = 'row'; const open = button(new Date(month + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short' }), () => { if (drafts.size || pending) return showError('Save or discard your cell edits before opening month details.'); selectMonth(month); }, 'month-link');
      open.setAttribute('aria-label', `Open ${label(month)} details`); monthCell.append(open); if (!original?.item) monthCell.append(make('span', 'new', 'new-month')); tr.append(monthCell);
      fields.forEach((field, i) => {
        const td = make('td', undefined, i === 2 ? 'payer-start' : ''), input = make('input', undefined, 'rent-cell');
        input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.spellcheck = false; input.dataset.month = month; input.dataset.field = field;
        input.setAttribute('aria-label', `${label(month)} ${i < 2 ? ['rent', 'parking credit'][i] : names[i - 2] + ' received'}`);
        input.disabled = !original; input.placeholder = original ? '—' : 'Set up';
        input.value = drafts.get(month)?.[field] ?? (original && (i < 2 || original.values[i] !== 0) ? (original.values[i] / 100).toFixed(2) : '');
        input.title = i >= 2 ? 'Total received for this payer in this month. Editing replaces the recorded total and keeps earlier entries in history.' : i === 0 ? 'Apartment rent before parking credit' : 'Parking credit, entered as a positive amount';
        input.onfocus = () => input.select();
        input.oninput = () => { if (!canEdit()) { input.value = original ? (original.values[i] / 100).toFixed(2) : ''; return; } mark(month, field, input.value); showError(''); rowTotals(month); updateState(); drawCharts(); };
        input.onblur = () => { try { if (input.value.trim()) input.value = (cents(input.value) / 100).toFixed(2); input.removeAttribute('aria-invalid'); } catch { input.setAttribute('aria-invalid', 'true'); } };
        input.onkeydown = e => {
          if(e.key==='Tab'){const inputs=[...root.querySelectorAll('.rent-cell:not(:disabled)')],next=inputs[inputs.indexOf(input)+(e.shiftKey?-1:1)];if(next){e.preventDefault();next.focus();}}
          if (['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); const next = e.key === 'ArrowUp' || e.shiftKey ? -1 : 1; tableBody.rows[n - 1 + next]?.querySelector(`[data-field="${field}"]`)?.focus(); }
          if (e.key === 'Escape' && !attempt) { const d = drafts.get(month); if (d) { delete d[field]; if (!Object.keys(d).length) drafts.delete(month); } input.value = original && (i < 2 || original.values[i]) ? (original.values[i] / 100).toFixed(2) : ''; rowTotals(month); updateState(); drawCharts(); }
        };
        input.onpaste = e => {
          const text = e.clipboardData.getData('text'); if (!/[\t\n]/.test(text)) return;
          e.preventDefault(); if (pending || locked || attempt || !canEdit()) return;
          try {
            const matrix = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
            if (n - 1 + matrix.length > 12 || matrix.some(r => i + r.length > fields.length)) throw Error('Paste must fit within the editable cells for this year.');
            const changes = [];
            matrix.forEach((line, dy) => line.forEach((value, dx) => { cents(value); const target = tableBody.rows[n - 1 + dy].querySelector(`[data-field="${fields[i + dx]}"]`); if (target.disabled) throw Error('Set up the starting rent split before pasting into this month.'); changes.push({ target, value }); }));
            changes.forEach(({ target, value }) => { target.value = value; mark(target.dataset.month, target.dataset.field, value); rowTotals(target.dataset.month); }); showError(''); updateState(); drawCharts();
          } catch (e) { showError(e.message); }
        };
        td.append(input);
        const source = i >= 2 ? original?.item?.sourcePayments?.find(p => p.payer === i - 2) : null;
        if (source?.amountCents > 0 && !original.active.some(p => p.sourcePayer === i - 2 || p.payer === i - 2 && p.date === month)) { const hint = make('span', `Import ${exact(source.amountCents)} · review`, 'source-cell-note'); hint.title = 'Original workbook amount; not counted as received until confirmed in month details or entered above.'; td.append(hint); }
        if(i>=2)td.append(cellControls(month,i-2));
        tr.append(td);
      });
      tr.append(make('td', '—', 'row-total computed'), make('td', '—', 'row-balance computed'), make('td', '', 'row-status')); tableBody.append(tr); if (original) rowTotals(month);
    }
    updateState(); drawCharts();
  }
  function showError(text) { error.textContent = text; error.hidden = !text; }
  function drawCharts() {
    const rows = [];
    for (let n = 1; n <= 12; n++) { const month = `${year}-${String(n).padStart(2, '0')}`; try { const r = rowValue(month); if (r && (r.item || drafts.has(month))) rows.push({ month, n, ...r }); } catch {} }
    const due = rows.reduce((s, r) => s + r.calculation.landlordCents, 0), received = rows.reduce((s, r) => s + r.totals.received, 0), remaining = rows.reduce((s, r) => s + r.totals.remaining, 0);
    summary.replaceChildren(...[['Rent to cover', due], ['Confirmed received', received], ['Left to collect', remaining]].map(([title, value]) => { const n = make('div'); n.append(make('span', title), make('strong', dollars(value))); return n; }));
    chartNote.textContent = `${year} · ${rows.length} saved or edited months${drafts.size ? ' · Includes unsaved edits' : ''}. Imported entries awaiting review are excluded from received totals.`;
    trend.replaceChildren();
    const chart = svg('svg', { viewBox: '0 0 720 205', role: 'img', 'aria-label': `${year} monthly rent coverage. ${dollars(received)} recorded, ${dollars(remaining)} left to collect.` }); chart.append(svg('title', {}, 'Monthly rent coverage')); const defs=svg('defs'), pattern=svg('pattern',{id:'outstanding-hatch',width:8,height:8,patternUnits:'userSpaceOnUse'});pattern.append(svg('rect',{width:8,height:8,fill:'#f7d19a'}),svg('path',{d:'M-2 2L2 -2M0 8L8 0M6 10L10 6',stroke:'#b5782a','stroke-width':1.5}));defs.append(pattern);chart.append(defs);
    const max = Math.max(100, ...rows.map(r => r.calculation.landlordCents));
    for (let tick = 0; tick <= 2; tick++) { const y = 150 - tick * 62; chart.append(svg('line', { x1: 50, x2: 709, y1: y, y2: y, stroke: '#e6e8e1', 'stroke-dasharray': '3 5' }), svg('text', { x: 40, y: y + 4, 'text-anchor': 'end', fill: '#7d887f', 'font-size': 10 }, dollars(max * tick / 2))); }
    for (let n = 1; n <= 12; n++) {
      const r = rows.find(r => r.n === n), x = 57 + (n - 1) * 54, short = new Date(year, n - 1, 15).toLocaleDateString('en-US', { month: 'short' });
      chart.append(svg('text', { x: x + 17, y: 178, 'text-anchor': 'middle', fill: '#6c776e', 'font-size': 11 }, short));
      if (!r) { chart.append(svg('rect', { x, y: 147, width: 34, height: 3, rx: 1.5, fill: '#e9ece5' })); continue; }
      const h = r.calculation.landlordCents / max * 124, paid = (r.calculation.landlordCents - r.totals.remaining) / max * 124;
      const g = svg('g'); g.append(svg('title', {}, `${label(r.month)}: ${dollars(r.calculation.landlordCents)} rent, ${dollars(r.totals.received)} received, ${dollars(r.totals.remaining)} outstanding${r.totals.overpaid ? `, ${dollars(r.totals.overpaid)} overpaid` : ''}`), svg('rect', { x, y: 150 - h, width: 34, height: h, rx: 4, fill: 'url(#outstanding-hatch)' }));
      if (paid > 0) g.append(svg('rect', { x, y: 150 - paid, width: 34, height: paid, rx: 3, fill: '#176b64' })); chart.append(g);
    }
    trend.append(chart); split.replaceChildren();
    let r; try { r = rowValue(selected); } catch {}
    r ||= rows.at(-1);
    if (!r) { split.append(make('p', 'Your rent split appears after you set up a month.', 'muted')); return; }
    const dueAmounts = [...r.calculation.rows.map(p => p.dueCents), r.calculation.affilCents], names = [...r.config.people.map(p => p.name), 'Affil'];
    const donut = svg('svg', { viewBox: '0 0 180 180', role: 'img', 'aria-label': 'Rent split: ' + names.map((n, i) => `${n} ${dollars(dueAmounts[i])}`).join(', ') });
    donut.append(svg('circle', { cx: 90, cy: 90, r: 66, fill: 'none', stroke: '#edf0e8', 'stroke-width': 19 })); let offset = 0; const circumference = 2 * Math.PI * 66;
    dueAmounts.forEach((value, i) => { const length = r.calculation.landlordCents ? value / r.calculation.landlordCents * circumference : 0; if (length > 0) { const arc = svg('circle', { cx: 90, cy: 90, r: 66, fill: 'none', stroke: colors[i], 'stroke-width': 19, 'stroke-dasharray': `${Math.max(0, length - 3)} ${circumference}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 90 90)' }); donut.append(arc); } offset += length; });
    donut.append(svg('text', { x: 90, y: 87, 'text-anchor': 'middle', fill: '#253b32', 'font-size': 22, 'font-weight': 600 }, dollars(r.calculation.landlordCents)), svg('text', { x: 90, y: 107, 'text-anchor': 'middle', fill: '#7d887f', 'font-size': 10 }, label(r.item?.month || selected)));
    const legend = make('div', undefined, 'split-legend'); names.forEach((name, i) => { const line = make('div'), dot = make('i'); dot.style.background = colors[i]; line.append(dot, make('span', name), make('strong', dollars(dueAmounts[i]))); legend.append(line); }); split.append(donut, legend);
  }
  async function commit() {
    if (pending || locked || !drafts.size || !canEdit()) return;
    const current = generation;
    try {
      if (!attempt) {
        if (drafts.size > 24) throw Error('Save at most 24 months at once. Use Escape on cells to remove extra edits.');
        const rows = [...drafts].map(([month, draft]) => { const r = rowValue(month); return { month, config: r.config, parkingCents: r.values[1], expectedVersion: r.item?.version || 0, expectedPayments: r.active.map(p => p._id).sort().join('|'), receipts: [0, 1, 2, 3].filter(i => draft['p' + i] !== undefined).map(payer => ({ payer, amountCents: r.values[payer + 2] })) }; });
        attempt = { rows, requestKey: crypto.randomUUID() };
      }
      pending = true; showError(''); updateState(); await save(attempt); if (current !== generation) return;
      drafts.clear(); attempt = null; pending = false; updateState(); await refreshed();
    } catch (e) {
      if (current !== generation) return;
      if (/another device/.test(e.message)) { attempt = null; showError(e.message + ' Copy your edits before using Discard edits to reload the latest values.'); }
      else showError((e.message || 'Couldn’t save.') + (attempt ? ' Your exact changes are preserved. Click Save changes to retry safely.' : ''));
    } finally { if (current === generation) { pending = false; updateState(); } }
  }
  function mount() {
    root.replaceChildren();
    const insights = make('div', undefined, 'rent-insights'), coverage = make('section', undefined, 'coverage-card'), side = make('section', undefined, 'split-card');
    const heading = make('div', undefined, 'chart-heading'); const legend=make('div',undefined,'coverage-legend');legend.append(make('span','Received','legend-received'),make('span','Outstanding','legend-outstanding'));heading.append(make('h2', 'The year at a glance'), legend); coverage.append(heading);
    summary = make('div', undefined, 'year-summary'); trend = make('div', undefined, 'rent-trend'); chartNote = make('p', undefined, 'chart-note'); coverage.append(summary, trend, chartNote);
    side.append(make('h2', 'Who covers what')); split = make('div', undefined, 'rent-split'); side.append(split); insights.append(coverage, side); root.append(insights);
    const panel = make('section', undefined, 'sheet-panel'), toolbar = make('div', undefined, 'sheet-toolbar'), title = make('div'); title.append(make('h2', 'Monthly ledger'), make('p', 'Type or paste monthly amounts. The corner icon opens payment proof and checks.'));
    const controls = make('div', undefined, 'sheet-year'); yearText = make('strong', String(year));
    const changeYear = delta => { if (year + delta < 2000 || year + delta > 2099) return; year += delta; drawRows(); };
    const prev = button('←', () => changeYear(-1)), next = button('→', () => changeYear(1)); prev.setAttribute('aria-label', 'Previous ledger year'); next.setAttribute('aria-label', 'Next ledger year'); controls.append(prev, yearText, next); reviewButton=button('Unmatched transfers',()=>{if(drafts.size)return showError('Save or discard your edits first.');reviewProof();},'review-transfers');reviewButton.hidden=true;const right=make('div',undefined,'ledger-toolbar-actions');right.append(reviewButton,controls);toolbar.append(title,right);panel.append(toolbar);
    const wrap = make('div', undefined, 'sheet-scroll'); wrap.tabIndex = 0; wrap.setAttribute('aria-label', 'Editable monthly rent ledger; scroll horizontally for all columns');
    const table = make('table', undefined, 'sheet-table'), head = make('thead'), groups = make('tr'), columns = make('colgroup');
    [105,115,115,115,115,115,115,115,130,130].forEach(width => { const col = make('col'); col.style.width = width + 'px'; columns.append(col); }); table.append(columns);
    for (const [text, span, cls] of [['', 1, ''], ['MONTHLY CHARGES', 2, ''], ['TOTAL RECEIVED · EDIT TO UPDATE', 4, 'received-heading'], ['CALCULATED', 3, '']]) { const th = make('th', text, cls); th.colSpan = span; groups.append(th); }
    head.append(groups, make('tr')); tableBody = make('tbody'); table.append(head, tableBody); wrap.append(table); panel.append(wrap);
    const foot = make('div', undefined, 'sheet-footer'); foot.append(make('span', 'Received cells are monthly totals, not additional payments. Earlier entries stay in history. Blank received cells = $0 confirmed.'));
    const actions = make('div', undefined, 'sheet-actions'); status = make('span'); status.setAttribute('role', 'status'); undoButton = button('Discard edits', async () => { drafts.clear(); attempt = null; showError(''); drawRows(); await refreshed(); }, 'quiet'); saveButton = button('Save changes', commit, 'primary'); actions.append(status, undoButton, saveButton); foot.append(actions); panel.append(foot);
    error = make('p', '', 'sheet-error'); error.hidden = true; error.setAttribute('role', 'alert'); panel.append(error); root.append(panel);
  }
  mount();
  return {
    load(result, month) { if (drafts.size || pending) return; records = result.months; payments = result.payments; if (!selected || selected.slice(0,4) !== month.slice(0,4)) year = Number(month.slice(0, 4)); selected = month; drawRows(); },
    clear() { generation++; records = []; payments = []; drafts.clear(); selected = ''; attempt = null; pending = false; root.replaceChildren(); mount(); },
    hasChanges: () => drafts.size > 0 || pending,
    setLocked(value) { locked = value; updateState(); },
  };
};
