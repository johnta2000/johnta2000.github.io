/* Exact-query daily GSC observations; no interpolation or inferred live ranks. */
(() => {
  const metrics = { position: 'Average position', impressions: 'Impressions', clicks: 'Clicks' };
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const dateLabel = date => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
  const format = value => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'Not observed';

  function series(rows, metric) {
    const byDate = new Map(rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(Date.parse(r.date))).map(r => [r.date, r]));
    const dates = [...byDate.keys()].sort();
    if (!dates.length) return [];
    const result = [];
    for (let time = Date.parse(dates[0]); time <= Date.parse(dates.at(-1)); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10), row = byDate.get(date);
      const raw = row?.[metric];
      result.push({ date, value: Number.isFinite(raw) && raw >= 0 && (metric !== 'position' || raw >= 1) ? raw : null, impressions: row?.impressions ?? null });
    }
    return result;
  }

  function plot(details, metric = 'position', width = 740) {
    if (!metrics[metric]) metric = 'position';
    const data = series(details.daily ?? [], metric), valid = data.filter(r => r.value !== null);
    if (!valid.length) return '<p class="empty-state">No finalized observations available for this metric. Missing data is not zero.</p>';
    const baseline = metric === 'position' ? details.queries?.[0]?.baseline?.position : null;
    const values = [...valid.map(r => r.value), ...(Number.isFinite(baseline) ? [baseline] : [])];
    const low = metric === 'position' ? Math.max(1, Math.floor(Math.min(...values)) - 1) : 0;
    const high = Math.max(low + 2, Math.ceil(Math.max(...values)) + 1);
    const left = 48, right = 18, top = 45, bottom = 40, height = 280;
    const first = Date.parse(data[0].date), last = Date.parse(data.at(-1).date);
    const x = date => last === first ? (left + width - right) / 2 : left + (Date.parse(date) - first) / (last - first) * (width - left - right);
    const y = value => top + (metric === 'position' ? value - low : high - value) / (high - low) * (height - top - bottom);
    let path = '', connected = false;
    for (const r of data) {
      if (r.value === null) { connected = false; continue; }
      path += `${connected ? 'L' : 'M'}${x(r.date).toFixed(2)},${y(r.value).toFixed(2)} `;
      connected = true;
    }
    const ticks = Array.from({ length: 5 }, (_, i) => low + (high - low) * i / 4).map(v => `<line x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}" class="query-chart-grid"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${format(v)}</text>`).join('');
    const labels = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].map(i => `<text x="${x(data[i].date)}" y="${height - 14}" text-anchor="${i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}">${dateLabel(data[i].date)}</text>`).join('');
    const launch = details.launchDate ?? '2026-10-17';
    const launchVisible = Date.parse(launch) >= first && Date.parse(launch) <= last;
    const launchLine = launchVisible ? `<line class="edit-chart-launch" x1="${x(launch)}" x2="${x(launch)}" y1="${top}" y2="${height - bottom}"/><text x="${x(launch)}" y="27" text-anchor="${x(launch) > width * .7 ? 'end' : 'middle'}">Select launch</text>` : '';
    const baselineLine = Number.isFinite(baseline) ? `<line class="edit-chart-baseline" x1="${left}" x2="${width - right}" y1="${y(baseline)}" y2="${y(baseline)}"/>` : '';
    const newest = data.at(-1);
    return `<div class="query-chart-summary"><div><span>${metrics[metric]} · latest finalized day</span><strong>${format(newest.value)}</strong></div><p>${escape(newest.date)}<br>${metric === 'position' ? 'Lower is better' : 'Daily total'} · ${format(newest.impressions)} impressions</p></div>
      <svg class="query-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily ${metrics[metric].toLowerCase()} for cheapest edit hotels, US all devices"><title>Daily ${metrics[metric].toLowerCase()} for cheapest edit hotels</title>${ticks}${labels}${launchLine}${baselineLine}<path class="query-chart-line edit-chart-line" d="${path}"/>${valid.map(r => `<circle class="query-chart-dot" cx="${x(r.date)}" cy="${y(r.value)}" r="4"><title>${r.date}: ${format(r.value)}; ${format(r.impressions)} impressions</title></circle>`).join('')}</svg>
      ${Number.isFinite(baseline) ? `<p class="edit-chart-key"><span aria-hidden="true"></span>Oct 10–16 baseline: ${format(baseline)}</p>` : ''}`;
  }

  function markup() {
    return `<section class="dialog-section edit-daily-chart" aria-labelledby="edit-chart-title"><div class="dialog-section-heading"><div><p class="eyebrow">Exact query · US · all devices</p><h3 id="edit-chart-title">“Cheapest edit hotels” over time</h3></div></div>
      <div class="query-chart-metrics" role="group" aria-label="Daily chart metric">${Object.entries(metrics).map(([key, label]) => `<button type="button" data-edit-metric="${key}" aria-pressed="${key === 'position'}">${label}</button>`).join('')}</div><div class="edit-chart-result" aria-live="polite"></div>
      <p class="query-chart-footnote">Finalized daily GSC data, not live Google ranks. Missing observations leave gaps; they are not zeroes. The launch marker shows timing, not proof of causation. Exact values remain in the daily-history table below.</p></section>`;
  }

  function mount(section, details) {
    let metric = 'position';
    const result = section.querySelector('.edit-chart-result');
    const draw = () => {
      result.innerHTML = plot(details, metric, Math.max(300, Math.min(740, result.clientWidth || 740)));
      section.querySelectorAll('[data-edit-metric]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.editMetric === metric)));
    };
    section.querySelectorAll('[data-edit-metric]').forEach(b => b.addEventListener('click', () => { metric = b.dataset.editMetric; draw(); }));
    draw();
  }
  window.EditDailyChart = { series, plot, markup, mount };
})();
