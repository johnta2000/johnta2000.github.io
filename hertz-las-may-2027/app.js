const els = Object.fromEntries([
  "monitor-status", "last-success-relative", "latest-rate", "latest-vehicle", "latest-total", "latest-alert",
  "pickup-time", "pickup-location", "return-time", "return-location", "threshold-rate", "threshold-note",
  "price-change", "price-change-note", "successful-count", "failed-count", "history-summary", "chart-current",
  "price-chart", "evidence-vehicle", "evidence-date", "evidence-tax", "evidence-copy", "run-rows",
  "booking-link-top", "booking-link-evidence",
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

function renderChart(runs, threshold) {
  const points = [...runs].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt));
  if (!points.length) {
    els["price-chart"].innerHTML = `<p>No successful observations yet.</p>`;
    return;
  }
  const width = 1000, height = 390, margin = { top: 22, right: 24, bottom: 48, left: 58 };
  const innerWidth = width - margin.left - margin.right, innerHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(threshold, ...points.map((point) => point.lowestVisibleDailyRateUsd));
  const yMaximum = Math.max(150, Math.ceil((maximum * 1.08) / 50) * 50);
  const x = (index) => margin.left + (points.length === 1 ? innerWidth / 2 : index / (points.length - 1) * innerWidth);
  const y = (value) => margin.top + innerHeight - value / yMaximum * innerHeight;
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.lowestVisibleDailyRateUsd).toFixed(1)}`).join(" ");
  const area = `${margin.left},${margin.top + innerHeight} ${line} ${width - margin.right},${margin.top + innerHeight}`;
  const tickStep = yMaximum <= 200 ? 50 : yMaximum <= 500 ? 100 : 200;
  const yTicks = Array.from({ length: Math.floor(yMaximum / tickStep) + 1 }, (_, index) => index * tickStep);
  if (yTicks.at(-1) !== yMaximum) yTicks.push(yMaximum);
  const labels = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const shortDate = (value) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(value));
  els["price-chart"].innerHTML = `<svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Historical Hertz daily rates with a ${money(threshold)} threshold">
    <defs><linearGradient id="rate-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf1a" stop-opacity=".26"/><stop offset="1" stop-color="#ffcf1a" stop-opacity="0"/></linearGradient></defs>
    ${yTicks.map((tick) => `<line class="chart-grid" x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}"/><text class="chart-axis" x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end">$${tick}</text>`).join("")}
    <line class="chart-threshold" x1="${margin.left}" y1="${y(threshold)}" x2="${width - margin.right}" y2="${y(threshold)}"/><text class="chart-threshold-label" x="${width - margin.right - 4}" y="${y(threshold) - 8}" text-anchor="end">$${threshold}/day</text>
    <polygon class="chart-area" points="${area}"/><polyline class="chart-series" points="${line}"/>
    ${points.map((point, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(point.lowestVisibleDailyRateUsd)}" r="4"><title>${escapeHtml(fullDate(point.checkedAt))}: ${money(point.lowestVisibleDailyRateUsd)}/day · ${escapeHtml(point.vehicle)}</title></circle>`).join("")}
    ${labels.map((index) => `<text class="chart-axis" x="${x(index)}" y="${height - 15}" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${escapeHtml(shortDate(points[index].checkedAt))}</text>`).join("")}
  </svg>`;
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
  const failed = scopedRuns.filter((run) => run.status !== "success");
  const latestRun = scopedRuns[0] ?? null;
  const latestSuccess = successful[0] ?? null;
  const firstSuccess = successful.at(-1) ?? null;
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
  els["price-change-note"].textContent = firstSuccess ? `Since ${fullDate(firstSuccess.checkedAt).split(",")[0]}` : "Across successful checks";
  els["successful-count"].textContent = String(successful.length);
  els["failed-count"].textContent = `${failed.length} unavailable scoped attempt${failed.length === 1 ? "" : "s"}`;
  els["history-summary"].textContent = successful.length === 1
    ? `1 qualifying observation on ${fullDate(latestSuccess?.checkedAt).split(",")[0]}. Legacy all-vehicle rates remain in the run log but are excluded from this chart.`
    : `${successful.length} qualifying observations from ${fullDate(firstSuccess?.checkedAt).split(",")[0]} through ${fullDate(latestSuccess?.checkedAt).split(",")[0]}. Legacy all-vehicle rates are excluded.`;
  els["chart-current"].textContent = `${money(latestSuccess?.lowestVisibleDailyRateUsd)}/day`;
  els["evidence-vehicle"].textContent = latestSuccess ? `${latestSuccess.vehicle} · ${latestSuccess.passengerCapacity ?? "?"} seats` : "No successful qualifying check yet";
  els["evidence-date"].textContent = fullDate(latestSuccess?.checkedAt);
  els["evidence-tax"].textContent = `Taxes/fees: ${(latestSuccess?.taxesFeesVisibility ?? "unknown").replaceAll("_", " ")}`;
  els["evidence-copy"].textContent = latestSuccess?.rawEvidenceExcerpt ?? "Rendered evidence will appear here.";
  for (const id of ["booking-link-top", "booking-link-evidence"]) els[id].href = data.bookingUrl;

  if (!latestOkay && latestRun) {
    els["latest-alert"].hidden = false;
    els["latest-alert"].innerHTML = `<strong>Latest attempt unavailable.</strong> ${escapeHtml(latestRun.error ?? "No visible rendered vehicle-card rate was found.")} The last successful rate is preserved.`;
  }
  renderChart(successful, threshold);
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
