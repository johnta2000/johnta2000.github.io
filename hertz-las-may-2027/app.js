const els = Object.fromEntries([
  "monitor-status", "last-success-relative", "latest-rate", "latest-vehicle", "latest-total", "latest-alert",
  "pickup-time", "pickup-location", "return-time", "return-location", "threshold-rate", "threshold-note",
  "price-change", "price-change-note", "successful-count", "failed-count", "history-summary", "chart-current",
  "price-chart", "evidence-vehicle", "evidence-date", "evidence-tax", "evidence-copy", "run-rows",
  "booking-link-top", "booking-link-evidence", "options-count", "options-range", "under-threshold-count",
  "options-chart", "capacity-chart", "legacy-count",
].map((id) => [id, document.getElementById(id)]));

let history = null;
let activeFilter = "all";

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const money = (value) => Number.isFinite(value) ? `$${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}` : "—";
const fullDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(value)) : "Unknown";
const tripDate = (value) => value ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(new Date(value)) : "Unknown";

function relativeTime(value) {
  if (!value) return "Never checked";
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const units = [["year", 31_536_000], ["month", 2_592_000], ["day", 86_400], ["hour", 3_600], ["minute", 60], ["second", 1]];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) if (Math.abs(seconds) >= size || unit === "second") return formatter.format(Math.round(seconds / size), unit);
}

function renderChart(legacyRuns, scopedRuns, threshold) {
  const legacy = [...legacyRuns].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  const scoped = [...scopedRuns].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  const points = [...legacy, ...scoped].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  if (!points.length) {
    els["price-chart"].innerHTML = `<p>No successful observations yet.</p>`;
    return;
  }
  const width = 1000, height = 390, margin = { top: 22, right: 24, bottom: 48, left: 58 };
  const innerWidth = width - margin.left - margin.right, innerHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(threshold, ...points.map((point) => point.lowestVisibleDailyRateUsd));
  const yMaximum = Math.max(150, Math.ceil((maximum * 1.08) / 50) * 50);
  const times = points.map((point) => Date.parse(point.checkedAt));
  const minTime = Math.min(...times), maxTime = Math.max(...times);
  const x = (point) => margin.left + (minTime === maxTime ? innerWidth / 2 : (Date.parse(point.checkedAt) - minTime) / (maxTime - minTime) * innerWidth);
  const y = (value) => margin.top + innerHeight - value / yMaximum * innerHeight;
  const legacyLine = legacy.map((point) => `${x(point).toFixed(1)},${y(point.lowestVisibleDailyRateUsd).toFixed(1)}`).join(" ");
  const scopedLine = scoped.map((point) => `${x(point).toFixed(1)},${y(point.lowestVisibleDailyRateUsd).toFixed(1)}`).join(" ");
  const tickStep = yMaximum <= 200 ? 50 : yMaximum <= 500 ? 100 : 200;
  const yTicks = Array.from({ length: Math.floor(yMaximum / tickStep) + 1 }, (_, index) => index * tickStep);
  if (yTicks.at(-1) !== yMaximum) yTicks.push(yMaximum);
  const labels = [points[0], points[Math.floor((points.length - 1) / 2)], points.at(-1)].filter((point, index, values) => values.indexOf(point) === index);
  const shortDate = (value) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(value));
  els["price-chart"].innerHTML = `<svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Historical Hertz daily rates with a ${money(threshold)} threshold">
    ${yTicks.map((tick) => `<line class="chart-grid" x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}"/><text class="chart-axis" x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end">$${tick}</text>`).join("")}
    <line class="chart-threshold" x1="${margin.left}" y1="${y(threshold)}" x2="${width - margin.right}" y2="${y(threshold)}"/><text class="chart-threshold-label" x="${width - margin.right - 4}" y="${y(threshold) - 8}" text-anchor="end">$${threshold}/day</text>
    ${legacyLine ? `<polyline class="chart-series legacy-series" points="${legacyLine}"/>` : ""}
    ${scopedLine && scoped.length > 1 ? `<polyline class="chart-series scoped-series" points="${scopedLine}"/>` : ""}
    ${legacy.map((point) => `<circle class="chart-point legacy-point" cx="${x(point)}" cy="${y(point.lowestVisibleDailyRateUsd)}" r="4"><title>Legacy all-vehicle · ${escapeHtml(fullDate(point.checkedAt))}: ${money(point.lowestVisibleDailyRateUsd)}/day · ${escapeHtml(point.vehicle)}</title></circle>`).join("")}
    ${scoped.map((point) => `<circle class="chart-point scoped-point" cx="${x(point)}" cy="${y(point.lowestVisibleDailyRateUsd)}" r="6"><title>6–12 seats, no trucks · ${escapeHtml(fullDate(point.checkedAt))}: ${money(point.lowestVisibleDailyRateUsd)}/day · ${escapeHtml(point.vehicle)}</title></circle>`).join("")}
    ${labels.map((point, index) => `<text class="chart-axis" x="${x(point)}" y="${height - 15}" text-anchor="${index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}">${escapeHtml(shortDate(point.checkedAt))}</text>`).join("")}
  </svg>`;
}

function renderOptionsChart(options, threshold) {
  const sorted = [...(options || [])].filter((option) => Number.isFinite(option.dailyRateUsd)).sort((a, b) => a.dailyRateUsd - b.dailyRateUsd);
  if (!sorted.length) {
    els["options-chart"].innerHTML = `<p>No qualifying vehicle snapshot is available yet.</p>`;
    els["capacity-chart"].innerHTML = `<p>Seat mix will appear after a successful check.</p>`;
    return;
  }
  const width = 920, rowHeight = 38, margin = { top: 18, right: 70, bottom: 44, left: 285 };
  const height = margin.top + margin.bottom + sorted.length * rowHeight;
  const maxRate = Math.ceil(Math.max(threshold, ...sorted.map((option) => option.dailyRateUsd)) / 25) * 25;
  const x = (value) => margin.left + value / maxRate * (width - margin.left - margin.right);
  const shortVehicle = (option) => option.vehicleClass || option.vehicle.split("—")[0].trim();
  const ticks = Array.from({ length: Math.floor(maxRate / 50) + 1 }, (_, index) => index * 50);
  if (ticks.at(-1) !== maxRate) ticks.push(maxRate);
  els["options-chart"].innerHTML = `<svg class="options-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Current qualifying Hertz vehicle rates">
    ${ticks.map((tick) => `<line class="option-grid" x1="${x(tick)}" y1="${margin.top}" x2="${x(tick)}" y2="${height - margin.bottom}"/><text class="chart-axis" x="${x(tick)}" y="${height - 14}" text-anchor="middle">$${tick}</text>`).join("")}
    <line class="option-threshold" x1="${x(threshold)}" y1="${margin.top - 6}" x2="${x(threshold)}" y2="${height - margin.bottom}"/><text class="chart-threshold-label" x="${x(threshold) - 6}" y="12" text-anchor="end">$${threshold}</text>
    ${sorted.map((option, index) => {
      const y = margin.top + index * rowHeight + 8;
      const barWidth = Math.max(3, x(option.dailyRateUsd) - margin.left);
      return `<text class="option-label" x="${margin.left - 12}" y="${y + 11}" text-anchor="end">${escapeHtml(shortVehicle(option))} · ${option.passengerCapacity} seats</text><rect class="option-bar ${option.dailyRateUsd <= threshold ? "under" : "over"}" x="${margin.left}" y="${y}" width="${barWidth}" height="19" rx="3"><title>${escapeHtml(option.vehicle)} · ${money(option.dailyRateUsd)}/day · ${money(option.estimatedTotalUsd)} total</title></rect><text class="option-value" x="${Math.min(width - 42, x(option.dailyRateUsd) + 8)}" y="${y + 14}">${money(option.dailyRateUsd)}</text>`;
    }).join("")}
  </svg>`;

  const capacities = [...new Set(sorted.map((option) => option.passengerCapacity))].sort((a, b) => a - b);
  const counts = capacities.map((capacity) => ({ capacity, count: sorted.filter((option) => option.passengerCapacity === capacity).length }));
  const maxCount = Math.max(...counts.map((item) => item.count));
  els["capacity-chart"].innerHTML = counts.map((item) => `<div class="capacity-row"><div><strong>${item.capacity}</strong><span>seats</span></div><div class="capacity-track"><span style="width:${item.count / maxCount * 100}%"></span></div><b>${item.count} option${item.count === 1 ? "" : "s"}</b></div>`).join("");
}

function renderRows() {
  const runs = history.runs.filter((run) => activeFilter === "all" || (activeFilter === "success" ? run.status === "success" : run.status !== "success"));
  els["run-rows"].innerHTML = runs.length ? runs.map((run) => {
    const success = run.status === "success";
    const legacy = run.criteriaVersion !== history.criteriaVersion;
    return `<tr>
      <td>${escapeHtml(fullDate(run.checkedAt))}</td>
      <td><span class="run-status ${legacy ? "legacy" : success ? "success" : "failure"}">${legacy ? "Legacy scope" : success ? "Recorded" : "Unavailable"}</span></td>
      <td>${success ? `${money(run.lowestVisibleDailyRateUsd)}/day` : "—"}</td>
      <td>${run.passengerCapacity ?? "—"}</td>
      <td>${escapeHtml(run.vehicle ?? run.error ?? "No visible card rate")}</td>
      <td>${money(run.estimatedTotalUsd)}</td>
      <td>${escapeHtml(run.source ?? "unknown")}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="7">No runs match this filter.</td></tr>`;
}

function render(data) {
  history = data;
  const criteriaVersion = data.criteriaVersion ?? 2;
  const scopedRuns = data.runs.filter((run) => run.criteriaVersion === criteriaVersion);
  const successful = scopedRuns.filter((run) => run.status === "success" && Number.isFinite(run.lowestVisibleDailyRateUsd));
  const legacySuccessful = data.runs.filter((run) => run.criteriaVersion !== criteriaVersion && run.status === "success" && Number.isFinite(run.lowestVisibleDailyRateUsd));
  const allSuccessful = [...legacySuccessful, ...successful].sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt));
  const failed = scopedRuns.filter((run) => run.status !== "success");
  const latestRun = scopedRuns[0] ?? null;
  const latestSuccess = successful[0] ?? null;
  const firstSuccess = allSuccessful.at(-1) ?? null;
  const threshold = data.thresholdDailyRateUsd ?? 120;
  const latestOkay = latestRun?.status === "success";

  els["monitor-status"].textContent = latestOkay ? "Current" : "Last run unavailable";
  els["monitor-status"].className = `status-pill ${latestOkay ? "success" : "failure"}`;
  els["last-success-relative"].textContent = latestSuccess ? `Success ${relativeTime(latestSuccess.checkedAt)}` : "No successful check";
  els["latest-rate"].textContent = money(latestSuccess?.lowestVisibleDailyRateUsd);
  els["latest-vehicle"].textContent = latestSuccess ? `${latestSuccess.vehicle} · ${latestSuccess.passengerCapacity ?? "?"} seats` : "No successful qualifying card observation";
  els["latest-total"].textContent = money(latestSuccess?.estimatedTotalUsd);
  els["pickup-time"].textContent = tripDate(data.itinerary.pickupAt);
  els["pickup-location"].textContent = data.itinerary.pickupLocation;
  els["return-time"].textContent = tripDate(data.itinerary.returnAt);
  els["return-location"].textContent = data.itinerary.returnLocation;
  els["threshold-rate"].textContent = `${money(threshold)}/day`;
  const gap = latestSuccess ? threshold - latestSuccess.lowestVisibleDailyRateUsd : null;
  els["threshold-note"].textContent = Number.isFinite(gap) ? `${money(Math.abs(gap))} ${gap >= 0 ? "below" : "above"} target` : "Target daily rate";
  const change = latestSuccess && firstSuccess ? latestSuccess.lowestVisibleDailyRateUsd - firstSuccess.lowestVisibleDailyRateUsd : null;
  els["price-change"].textContent = Number.isFinite(change) ? `${change > 0 ? "+" : change < 0 ? "−" : ""}${money(Math.abs(change))}` : "—";
  els["price-change-note"].textContent = firstSuccess ? `Since ${fullDate(firstSuccess.checkedAt).split(",")[0]} · mixed scopes` : "Across successful checks";
  els["successful-count"].textContent = String(allSuccessful.length);
  els["failed-count"].textContent = `${successful.length} family-scope · ${legacySuccessful.length} legacy`;
  els["legacy-count"].textContent = `${legacySuccessful.length} legacy all-vehicle observations + ${successful.length} family-vehicle observation${successful.length === 1 ? "" : "s"}`;
  els["history-summary"].textContent = `Every successful observation from ${fullDate(firstSuccess?.checkedAt).split(",")[0]} through ${fullDate(allSuccessful[0]?.checkedAt).split(",")[0]}. The line preserves the original all-vehicle history; larger family vehicles are overlaid as a distinct series.`;
  els["chart-current"].textContent = `${money(latestSuccess?.lowestVisibleDailyRateUsd)}/day`;
  els["evidence-vehicle"].textContent = latestSuccess ? `${latestSuccess.vehicle} · ${latestSuccess.passengerCapacity ?? "?"} seats` : "No successful qualifying check yet";
  els["evidence-date"].textContent = fullDate(latestSuccess?.checkedAt);
  els["evidence-tax"].textContent = `Taxes/fees: ${(latestSuccess?.taxesFeesVisibility ?? "unknown").replaceAll("_", " ")}`;
  els["evidence-copy"].textContent = latestSuccess?.rawEvidenceExcerpt ?? "Rendered evidence will appear here.";
  const options = latestSuccess?.eligibleVehicles ?? [];
  const optionRates = options.map((option) => option.dailyRateUsd).filter(Number.isFinite);
  els["options-count"].textContent = String(options.length || latestSuccess?.eligibleVehicleCardCount || 0);
  els["options-range"].textContent = optionRates.length ? `${money(Math.min(...optionRates))}–${money(Math.max(...optionRates))}` : "—";
  els["under-threshold-count"].textContent = String(options.filter((option) => option.dailyRateUsd <= threshold).length);
  for (const id of ["booking-link-top", "booking-link-evidence"]) els[id].href = data.bookingUrl;

  if (!latestOkay && latestRun) {
    els["latest-alert"].hidden = false;
    els["latest-alert"].innerHTML = `<strong>Latest attempt unavailable.</strong> ${escapeHtml(latestRun.error ?? "No visible rendered vehicle-card rate was found.")} The last successful rate is preserved.`;
  }
  renderChart(legacySuccessful, successful, threshold);
  renderOptionsChart(options, threshold);
  renderRows();
}

document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  renderRows();
}));

fetch(`history.json?ts=${Date.now()}`, { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error(`History request failed (${response.status})`);
    return response.json();
  })
  .then(render)
  .catch((error) => {
    els["monitor-status"].textContent = "Data error";
    els["monitor-status"].className = "status-pill failure";
    els["latest-alert"].hidden = false;
    els["latest-alert"].textContent = `The price history could not be loaded: ${error.message}`;
  });
