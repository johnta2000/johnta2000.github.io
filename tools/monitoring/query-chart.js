/* Charts use private, finalized Search Console snapshots already retained by the monitor. */
(() => {
  const metrics = {
    position: { label: 'Average position', hint: 'Lower is better', digits: 2 },
    clicks: { label: 'Clicks', hint: 'Higher is better', digits: 0 },
    impressions: { label: 'Impressions', hint: 'Higher is better', digits: 0 },
    ctr: { label: 'CTR', hint: 'Higher is better', digits: 2, suffix: '%' },
  };
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const dateLabel = (date) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const format = (value, metric) => Number.isFinite(value)
    ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: metrics[metric].digits }).format(value)}${metrics[metric].suffix || ''}` : '—';

  function windows(monitor, runs = []) {
    const byDate = new Map();
    // Prefer the newest completed report for each finalized window, even on hourly refreshes.
    const reports = [...runs, { ...monitor, timestamp: monitor.latestRunAt }]
      .filter((run) => !['error', 'unavailable'].includes(run.status))
      .sort((a, b) => Date.parse(a.timestamp || '') - Date.parse(b.timestamp || ''));
    for (const run of reports) {
      const range = run.details?.currentRange;
      if (!range || !/^\d{4}-\d{2}-\d{2}$/.test(range.endDate) || !Number.isFinite(Date.parse(range.endDate))) continue;
      byDate.set(range.endDate, { date: range.endDate, startDate: range.startDate, metrics: run.metrics || {}, queries: run.details?.queries || [] });
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function points(history, query, metric) {
    return history.map((window) => {
      const row = query ? window.queries.find((row) => row.query === query) : window.metrics;
      const raw = row?.[metric];
      return { ...window, value: Number.isFinite(raw) && (metric !== 'position' || raw > 0) ? raw * (metric === 'ctr' ? 100 : 1) : null };
    });
  }

  function plot(data, metric, query, width) {
    const valid = data.filter((point) => Number.isFinite(point.value));
    if (!valid.length) return '<p class="empty-state">No saved values for this query and metric yet. Future completed checks will appear here.</p>';
    const height = 280, left = 58, right = 28, top = 26, bottom = 42;
    const values = valid.map((point) => point.value);
    const low = metric === 'position' ? Math.max(1, Math.floor(Math.min(...values) - 1)) : 0;
    const high = Math.max(low + (metric === 'position' ? 2 : 1), Math.max(...values) * (metric === 'position' ? 1 : 1.12));
    const first = Date.parse(data[0].date), last = Date.parse(data.at(-1).date);
    const x = (date) => last === first ? (left + width - right) / 2 : left + (Date.parse(date) - first) / (last - first) * (width - left - right);
    const y = (value) => top + (metric === 'position' ? (value - low) : (high - value)) / (high - low) * (height - top - bottom);
    let path = '', connected = false;
    for (const point of data) {
      if (!Number.isFinite(point.value)) { connected = false; continue; }
      path += `${connected ? 'L' : 'M'}${x(point.date).toFixed(2)},${y(point.value).toFixed(2)} `;
      connected = true;
    }
    const ticks = Array.from({ length: 5 }, (_, i) => {
      const value = low + (high - low) * i / 4;
      return `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="query-chart-grid"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${format(value, metric)}</text>`;
    }).join('');
    const labels = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].map((index) => {
      const point = data[index];
      return `<text x="${x(point.date)}" y="${height - 14}" text-anchor="middle">${escape(dateLabel(point.date))}</text>`;
    }).join('');
    return `<svg class="query-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(metrics[metric].label)} over finalized 7-day windows for ${escape(query || 'all calculator searches')}"><title>${escape(metrics[metric].label)} over time</title>${ticks}${labels}<path d="${path}" class="query-chart-line"/>${valid.map((point) => `<circle cx="${x(point.date)}" cy="${y(point.value)}" r="4" class="query-chart-dot"><title>${escape(point.date)} · ${escape(metrics[metric].label)}: ${format(point.value, metric)}</title></circle>`).join('')}</svg>`;
  }

  function markup() {
    return `<section class="dialog-section query-chart-section" aria-labelledby="query-chart-title">
      <div class="dialog-section-heading"><div><p class="eyebrow">Search performance history</p><h3 id="query-chart-title">Queries over time</h3></div></div>
      <div class="query-chart-controls"><div class="query-chart-picker"><label id="query-chart-query-label" for="query-chart-query">Search query</label><select id="query-chart-query" aria-labelledby="query-chart-query-label"></select></div>
      <div class="query-chart-metrics" role="group" aria-label="Chart metric">${Object.entries(metrics).map(([key, metric]) => `<button type="button" data-chart-metric="${key}" aria-pressed="${key === 'position'}">${metric.label}</button>`).join('')}</div></div>
      <div id="query-chart-result" aria-live="polite"></div>
      <p class="query-chart-footnote">Each point is a finalized 7-day Search Console window, dated by its last day. Repeated checks of the same window are combined. Missing query rows are gaps, not zeroes. This chart uses retained monitor history.</p>
    </section>`;
  }

  function mount(section, monitor, runs) {
    const select = section.querySelector('#query-chart-query');
    const result = section.querySelector('#query-chart-result');
    const picker = window.SearchableSelect.enhance(select);
    let history = [], metric = 'position';
    function draw() {
      const data = points(history, select.value, metric);
      const valid = data.filter((point) => Number.isFinite(point.value));
      const latest = valid.at(-1);
      const delta = valid.length > 1 ? latest.value - valid[0].value : null;
      result.innerHTML = `<div class="query-chart-summary"><div><span>${escape(metrics[metric].label)} · ${metrics[metric].hint}</span><strong>${format(latest?.value, metric)}</strong></div><p>${latest ? `Window ending ${escape(dateLabel(latest.date))}` : 'Waiting for finalized data'}${delta !== null ? `<br>${delta > 0 ? '+' : delta < 0 ? '−' : ''}${format(Math.abs(delta), metric)} since ${escape(dateLabel(valid[0].date))}` : ''}</p></div>
        ${plot(data, metric, select.value, Math.max(320, Math.min(760, result.clientWidth || 760)))}
        ${valid.length === 1 ? '<p class="query-chart-note">One finalized window saved so far. The trend will grow as new windows arrive.</p>' : ''}
        ${valid.length ? `<details class="query-chart-data"><summary>View chart data · ${valid.length} window${valid.length === 1 ? '' : 's'}</summary><div class="query-chart-data-scroll"><table><caption>${escape(select.selectedOptions[0]?.textContent || 'All calculator searches')} · finalized 7-day windows</caption><thead><tr><th scope="col">Window ending</th><th scope="col">${escape(metrics[metric].label)}</th></tr></thead><tbody>${data.map((point) => `<tr><th scope="row">${escape(point.date)}</th><td>${format(point.value, metric)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
      section.querySelectorAll('[data-chart-metric]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.chartMetric === metric)));
    }
    function update(nextMonitor, nextRuns) {
      const previousQuery = select.value;
      history = windows(nextMonitor, nextRuns);
      const queries = [...new Set(history.flatMap((window) => window.queries.map((row) => row.query)).filter(Boolean))].sort();
      select.innerHTML = `<option value="">All calculator searches</option>${queries.map((query) => `<option value="${escape(query)}">${escape(query)}</option>`).join('')}`;
      select.value = queries.includes(previousQuery) ? previousQuery : '';
      picker.sync();
      draw();
    }
    select.addEventListener('change', draw);
    section.querySelectorAll('[data-chart-metric]').forEach((button) => button.addEventListener('click', () => { metric = button.dataset.chartMetric; draw(); }));
    update(monitor, runs);
    return { update };
  }
  window.MonitorQueryChart = { markup, mount, windows, points };
})();
