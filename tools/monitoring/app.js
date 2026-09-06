const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const els = {
  gate: document.querySelector("#access-gate"),
  clerkSignIn: document.querySelector("#clerk-sign-in"),
  authStatus: document.querySelector("#auth-status"),
  authSignOut: document.querySelector("#auth-sign-out"),
  app: document.querySelector("#app"),
  refreshButton: document.querySelector("#refresh-button"),
  lockButton: document.querySelector("#lock-button"),
  monitorList: document.querySelector("#monitor-list"),
  monitorDialog: document.querySelector("#monitor-dialog"),
  monitorDialogTitle: document.querySelector("#monitor-dialog-title"),
  monitorDialogEyebrow: document.querySelector("#monitor-dialog-eyebrow"),
  monitorDialogContent: document.querySelector("#monitor-dialog-content"),
  monitorDialogClose: document.querySelector("#monitor-dialog-close"),
};

let currentSnapshot = null;
let refreshPromise = null;

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function relativeTime(value) {
  if (!value) return "Never";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const units = [
    ["year", 31_536_000], ["month", 2_592_000], ["day", 86_400],
    ["hour", 3_600], ["minute", 60], ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === "second") return formatter.format(Math.round(seconds / size), unit);
  }
}

function fullDate(value) {
  if (!value) return "No successful run yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function duration(value) {
  if (!Number.isFinite(value)) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`;
}

function number(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat().format(value) : "—";
}

function percent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

function statusMeta(status) {
  const states = {
    healthy: ["healthy", "Healthy"],
    watch: ["watch", "Watch"],
    alert: ["error", "Alert"],
    error: ["error", "Error"],
    unavailable: ["unavailable", "Unavailable"],
    not_configured: ["pending", "Not configured"],
  };
  const [className, label] = states[status] ?? ["pending", "Unknown"];
  return { className, label };
}

function monitorStats(monitor) {
  if (monitor.id === "paze-directory") {
    return [
      ["Merchants", monitor.currentCount ?? "—"],
      ["Pages", monitor.pagination?.pagesFetched ?? "—"],
      ["Duration", duration(monitor.durationMs)],
    ];
  }
  if (["paze-clover-map-ranking", "bilt-calculator-ranking"].includes(monitor.id)) {
    return [
      ["Clicks · 7d", number(monitor.metrics?.clicks)],
      ["Impressions · 7d", number(monitor.metrics?.impressions)],
      ["Position", Number.isFinite(monitor.metrics?.position) ? monitor.metrics.position.toFixed(2) : "—"],
    ];
  }
  if (monitor.id === "chase-sapphire-reserve-tables") {
    return [
      ["Restaurants", number(monitor.metrics?.restaurantCount)],
      ["Cities", number(monitor.metrics?.cityCount)],
      ["Latest diff", `+${number(monitor.metrics?.addedCount)} / −${number(monitor.metrics?.removedCount)}`],
    ];
  }
  return [
    ["Coverage", Number.isFinite(monitor.metrics?.programsChecked) ? `${monitor.metrics.programsChecked}/${monitor.metrics.totalPrograms ?? "—"}` : "—"],
    ["Failures", number(monitor.metrics?.failedPrograms)],
    ["Pending", number(monitor.metrics?.pendingEvents)],
  ];
}

function monitorCard(monitor, index) {
  const active = monitor.configured;
  const { className: statusClass, label: statusLabel } = statusMeta(monitor.status);
  let body;
  if (active) {
    const stats = monitorStats(monitor);
    body = `
      ${monitor.error ? `<div class="alert error-alert monitor-alert" role="alert"><strong>Incomplete run</strong><span>${escapeHtml(monitor.error)}</span></div>` : ""}
      <div class="monitor-stats">
        ${stats.map(([label, value]) => `<div class="monitor-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
      </div>
      <div class="monitor-footer">
        <span>${escapeHtml(monitor.cadence ?? "Manual")}</span>
        <span>Latest run ${escapeHtml(relativeTime(monitor.latestRunAt))}</span>
        <button class="monitor-open" type="button" data-monitor-id="${escapeHtml(monitor.id)}">View details <span aria-hidden="true">↗</span></button>
      </div>`;
  } else {
    body = `
      <p class="monitor-pending-copy">Collector slot ready when its inputs and cadence are configured.</p>
      <div class="monitor-footer">
        <span>Setup pending</span>
        <button class="monitor-open" type="button" data-monitor-id="${escapeHtml(monitor.id)}">View details <span aria-hidden="true">↗</span></button>
      </div>`;
  }

  return `
    <article class="monitor-card ${statusClass}">
      <div class="monitor-top">
        <span class="monitor-index">0${index + 1}</span>
        <span class="status-pill ${statusClass}">${statusLabel}</span>
      </div>
      <h3>${escapeHtml(monitor.name)}</h3>
      <p class="monitor-description">${escapeHtml(monitor.description)}</p>
      ${body}
    </article>`;
}

function diffMarkup(run) {
  const diff = run?.diff ?? { added: [], removed: [], renamed: [] };
  const changed = diff.added.length || diff.removed.length || diff.renamed.length;
  if (!changed) {
    return `<div class="no-change"><span class="check" aria-hidden="true">✓</span><div><strong>No merchant changes</strong><p>${escapeHtml(run?.summary ?? "The latest successful crawl matches the saved baseline.")}</p></div></div>`;
  }

  const list = (items) => items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p>None</p>`;
  return `
    <div class="diff-columns">
      <div class="diff-group added"><h3>Added · ${diff.added.length}</h3>${list(diff.added)}</div>
      <div class="diff-group removed"><h3>Removed · ${diff.removed.length}</h3>${list(diff.removed)}</div>
    </div>
    ${diff.renamed.length ? `<div class="rename-list" aria-label="Likely renames">${diff.renamed.map((item) => `<div class="rename-row"><span>${escapeHtml(item.from)}</span><span aria-hidden="true">→</span><span>${escapeHtml(item.to)}</span></div>`).join("")}</div>` : ""}`;
}

function runMarkup(run) {
  const kind = run.status === "failure" ? "failure" : run.changed ? "change" : "stable";
  const badge = run.status === "failure"
    ? `<span class="badge error">Failed</span>`
    : run.changed ? `<span class="badge change">Change</span>` : `<span class="badge success">Stable</span>`;
  const open = kind !== "stable" ? " open" : "";
  const pageText = run.pagination ? `${run.pagination.pagesFetched} pages · ${run.pagination.pageCounts.join(" + ")}` : "Pagination incomplete";
  return `
    <details class="run ${kind}"${open}>
      <summary>
        <span class="run-title"><strong>${escapeHtml(run.summary)}</strong><span>${escapeHtml(fullDate(run.timestamp))}</span></span>
        <span class="run-meta">${run.count ?? "—"} merchants</span>
        <span class="run-meta">${duration(run.durationMs)}</span>
        ${badge}
      </summary>
      <div class="run-body">
        <div class="run-facts"><span>${escapeHtml(pageText)}</span><span>Confirmation: ${run.confirmed ? "complete" : "not complete"}</span><span>Baseline preserved: ${run.status === "failure" ? "yes" : "updated"}</span><span>Freshness ID: ${escapeHtml(run.cache?.runId ?? "legacy run")}</span></div>
        ${run.error ? `<p class="run-error">${escapeHtml(run.error)}</p>` : diffMarkup(run)}
      </div>
    </details>`;
}

function sourceLink(monitor) {
  return monitor.sourceUrl
    ? `<a href="${escapeHtml(monitor.sourceUrl)}" target="_blank" rel="noreferrer">Open source <span aria-hidden="true">↗</span></a>`
    : `<span>Source not configured</span>`;
}

function sourceLinks(monitor) {
  const urls = monitor.sourceUrls?.length ? monitor.sourceUrls : monitor.sourceUrl ? [monitor.sourceUrl] : [];
  return urls.length
    ? urls.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${index ? `Source ${index + 1}` : "Open source"} <span aria-hidden="true">↗</span></a>`).join("")
    : `<span>No source URL reported</span>`;
}

function metricDelta(current, previous, { inverse = false, suffix = "" } = {}) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "No comparison";
  const change = current - previous;
  const improved = inverse ? change < 0 : change > 0;
  const direction = change === 0 ? "Flat" : improved ? "Improved" : "Declined";
  return `${direction} ${change > 0 ? "+" : ""}${change.toFixed(1)}${suffix}`;
}

function statusBanner(monitor) {
  const { className, label } = statusMeta(monitor.status);
  return `<div class="report-banner ${className}" role="status"><span class="status-pill ${className}">${label}</span><p>${escapeHtml(monitor.summary ?? "No summary reported.")}</p></div>`;
}

function externalRunMarkup(run) {
  const { className, label } = statusMeta(run.status);
  const prominent = run.meaningful || !["healthy"].includes(run.status);
  return `
    <details class="run ${prominent ? "change" : "stable"}"${prominent ? " open" : ""}>
      <summary>
        <span class="run-title"><strong>${escapeHtml(run.summary)}</strong><span>${escapeHtml(fullDate(run.timestamp))}</span></span>
        <span class="run-meta">${escapeHtml(run.eventType ?? "status")}</span>
        <span class="run-meta">${duration(run.durationMs)}</span>
        <span class="badge ${className === "healthy" ? "success" : className === "error" ? "error" : "change"}">${label}</span>
      </summary>
      <div class="run-body">
        <div class="run-facts"><span>${escapeHtml(run.monitorId)}</span><span>${run.meaningful ? "Meaningful event" : "Routine snapshot"}</span></div>
      </div>
    </details>`;
}

function externalHistoryMarkup(monitorId) {
  const runs = currentSnapshot.monitorHistory?.[monitorId]?.runs ?? [];
  return `
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Secure report history</p><h3>Recent checks</h3></div><span class="dialog-note">Routine checks are collapsed</span></div>
      <div class="run-history">${runs.length ? runs.map(externalRunMarkup).join("") : `<p class="empty-state">The first heartbeat report is pending.</p>`}</div>
    </section>`;
}

function queryRows(queries = [], mode = "map") {
  if (!queries.length) return `<p class="empty-state">No query-level rows were reported.</p>`;
  if (mode === "page") {
    return `<div class="report-table" role="table" aria-label="Core query results">
      <div class="report-table-row report-table-head" role="row"><span>Query</span><span>Clicks</span><span>Impressions</span><span>Position</span></div>
      ${queries.map((row) => `<div class="report-table-row" role="row"><strong>${escapeHtml(row.query ?? "—")}</strong><span>${number(row.clicks)}</span><span>${number(row.impressions)}</span><span>${Number.isFinite(row.position) ? row.position.toFixed(2) : "—"}</span></div>`).join("")}
    </div>`;
  }
  return `<div class="report-table" role="table" aria-label="Core query results">
    <div class="report-table-row report-table-head" role="row"><span>Query</span><span>Map share</span><span>First NextCard URL</span><span>Rank</span></div>
    ${queries.map((row) => `<div class="report-table-row" role="row"><strong>${escapeHtml(row.query ?? "—")}</strong><span>${percent(row.mapImpressionShare)}</span><span>${escapeHtml(row.firstNextcardUrl ?? "Not visible")}</span><span>${number(row.rank)}</span></div>`).join("")}
  </div>`;
}

function rankingDialogMarkup(monitor) {
  const metrics = monitor.metrics ?? {};
  const details = monitor.details ?? {};
  const inspection = details.inspection ?? {};
  const live = details.live ?? {};
  const isBilt = monitor.id === "bilt-calculator-ranking";
  const mapFirstCount = metrics.mapFirstCount ?? metrics.serpMapFirstCount;
  const queryCount = metrics.queryCount ?? metrics.serpQueryCount;
  const fourthMetric = isBilt
    ? `<div><span>CTR · finalized 7d</span><strong>${percent(metrics.ctr)}</strong><small>${escapeHtml(metricDelta(metrics.ctr, metrics.previousCtr, { suffix: " pts" }))}</small></div>`
    : `<div><span>Map impression share</span><strong>${percent(metrics.mapImpressionShare)}</strong><small>${escapeHtml(metricDelta(metrics.mapImpressionShare, metrics.previousMapImpressionShare, { suffix: " pts" }))}</small></div>`;
  const queryHeading = isBilt
    ? `<div><p class="eyebrow">Search performance</p><h3>Core Bilt calculator queries</h3></div><span class="count-bubble">${number((details.queries ?? []).length)}</span>`
    : `<div><p class="eyebrow">Cannibalization</p><h3>Core-query ownership</h3></div><span class="count-bubble">${number(mapFirstCount)}/${number(queryCount)}</span>`;
  return `
    <div class="dialog-meta"><p>${escapeHtml(monitor.description)}</p><div><span>${escapeHtml(monitor.cadence)}</span>${sourceLinks(monitor)}</div></div>
    ${statusBanner(monitor)}
    <section class="dialog-metrics" aria-label="Ranking monitor summary">
      <div><span>Clicks · finalized 7d</span><strong>${number(metrics.clicks)}</strong><small>${escapeHtml(metricDelta(metrics.clicks, metrics.previousClicks))}</small></div>
      <div><span>Impressions · finalized 7d</span><strong>${number(metrics.impressions)}</strong><small>${escapeHtml(metricDelta(metrics.impressions, metrics.previousImpressions))}</small></div>
      <div><span>Average position</span><strong>${Number.isFinite(metrics.position) ? metrics.position.toFixed(2) : "—"}</strong><small>${escapeHtml(metricDelta(metrics.position, metrics.previousPosition, { inverse: true }))}</small></div>
      ${fourthMetric}
    </section>
    <section class="dialog-section">
      <div class="dialog-section-heading">${queryHeading}</div>
      ${queryRows(details.queries, isBilt ? "page" : "map")}
    </section>
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Technical health</p><h3>Index and live page</h3></div></div>
      <div class="config-table report-facts">
        <div><span>Index verdict</span><strong>${escapeHtml(inspection.verdict ?? (inspection.indexed ? "Indexed" : "Not reported"))}</strong></div>
        <div><span>Last crawl</span><strong>${escapeHtml(inspection.lastCrawl ? fullDate(inspection.lastCrawl) : "Not reported")}</strong></div>
        <div><span>Fetch / robots</span><strong>${escapeHtml(`${inspection.fetchState ?? "—"} · ${inspection.robots ?? "—"}`)}</strong></div>
        <div><span>Google canonical</span><strong>${escapeHtml(inspection.googleCanonical ?? "Not reported")}</strong></div>
        <div><span>Live HTTP / canonical</span><strong>${escapeHtml(`${live.httpStatus ?? "—"} · ${live.canonical ?? "—"}`)}</strong></div>
      </div>
      ${details.recommendation ? `<p class="report-recommendation"><strong>Recommended action:</strong> ${escapeHtml(details.recommendation)}</p>` : ""}
    </section>
    ${externalHistoryMarkup(monitor.id)}`;
}

function eventRows(events = []) {
  if (!events.length) return `<div class="no-change"><span class="check" aria-hidden="true">✓</span><div><strong>No pending discoveries</strong><p>No new official-source event was reported in the latest check.</p></div></div>`;
  return `<div class="discovery-list">${events.map((event) => `<article><div><strong>${escapeHtml(event.program ?? "Official source")}</strong><span class="badge change">${escapeHtml(event.status ?? "Pending")}</span></div><p>${escapeHtml(event.change ?? event.summary ?? "Change detected")}</p>${event.url ? `<a href="${escapeHtml(event.url)}" target="_blank" rel="noreferrer">Official source ↗</a>` : ""}</article>`).join("")}</div>`;
}

function bonusDialogMarkup(monitor) {
  const metrics = monitor.metrics ?? {};
  const details = monitor.details ?? {};
  return `
    <div class="dialog-meta"><p>${escapeHtml(monitor.description)}</p><div><span>${escapeHtml(monitor.cadence)}</span>${sourceLinks(monitor)}</div></div>
    ${statusBanner(monitor)}
    <section class="dialog-metrics" aria-label="Transfer bonus monitor summary">
      <div><span>Programs checked</span><strong>${number(metrics.programsChecked)}/${number(metrics.totalPrograms)}</strong><small>Official-source registry</small></div>
      <div><span>Pages checked</span><strong>${number(metrics.pagesChecked)}</strong><small>Latest completed sweep</small></div>
      <div><span>Coverage failures</span><strong>${number(metrics.failedPrograms)}</strong><small>Never treated as “no news”</small></div>
      <div><span>Pending events</span><strong>${number(metrics.pendingEvents)}</strong><small>Awaiting delivery or review</small></div>
    </section>
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Discovery queue</p><h3>Latest official changes</h3></div><span class="count-bubble">${number((details.events ?? []).length)}</span></div>
      ${eventRows(details.events)}
    </section>
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Coverage integrity</p><h3>Failed or blocked sources</h3></div><span class="count-bubble">${number((details.failures ?? []).length)}</span></div>
      ${(details.failures ?? []).length ? `<ul class="failure-list">${details.failures.map((failure) => `<li><strong>${escapeHtml(failure.program ?? failure.source ?? "Source")}</strong><span>${escapeHtml(failure.reason ?? "Fetch failed")}</span></li>`).join("")}</ul>` : `<p class="empty-state">No source failures were reported.</p>`}
      ${details.recommendation ? `<p class="report-recommendation"><strong>Recommended action:</strong> ${escapeHtml(details.recommendation)}</p>` : ""}
    </section>
    ${externalHistoryMarkup(monitor.id)}`;
}

function chaseCityMarkup(city) {
  const changed = (city.added?.length ?? 0) + (city.removed?.length ?? 0) > 0;
  return `
    <details class="city-list${changed ? " changed" : ""}"${changed ? " open" : ""}>
      <summary><span><strong>${escapeHtml(city.name)}</strong><small>${escapeHtml(city.url)}</small></span><span>${number(city.count)} restaurants</span></summary>
      <div class="city-list-body">
        ${changed ? `<div class="diff-columns">
          <div class="diff-group added"><h3>Added · ${city.added.length}</h3>${city.added.length ? `<ul>${city.added.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>` : "<p>None</p>"}</div>
          <div class="diff-group removed"><h3>Removed · ${city.removed.length}</h3>${city.removed.length ? `<ul>${city.removed.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>` : "<p>None</p>"}</div>
        </div>` : ""}
        <div class="merchant-roster" aria-label="${escapeHtml(city.name)} restaurants">${(city.restaurants ?? []).map((name) => `<span class="merchant-name">${escapeHtml(name)}</span>`).join("")}</div>
        <a class="city-source" href="${escapeHtml(city.url)}" target="_blank" rel="noreferrer">Open ${escapeHtml(city.name)} source ↗</a>
      </div>
    </details>`;
}

function chaseRunMarkup(run) {
  const failure = run.status === "error" || run.status === "failure";
  const prominent = failure || run.changed;
  const cityChanges = (run.cities ?? []).filter((city) => city.added?.length || city.removed?.length);
  return `
    <details class="run ${failure ? "failure" : run.changed ? "change" : "stable"}"${prominent ? " open" : ""}>
      <summary>
        <span class="run-title"><strong>${escapeHtml(run.summary)}</strong><span>${escapeHtml(fullDate(run.timestamp))}</span></span>
        <span class="run-meta">${number(run.count)} restaurants</span>
        <span class="run-meta">${duration(run.durationMs)}</span>
        <span class="badge ${failure ? "error" : run.changed ? "change" : "success"}">${failure ? "Failed" : run.changed ? "Change" : "Stable"}</span>
      </summary>
      <div class="run-body">
        <div class="run-facts"><span>${number(run.cache?.requestCount)} fresh requests</span><span>Freshness ID: ${escapeHtml(run.cache?.runId ?? "legacy")}</span><span>Confirmation: ${run.confirmed ? "complete" : "not required/incomplete"}</span></div>
        ${run.error ? `<p class="run-error">${escapeHtml(run.error)}</p>` : cityChanges.length ? cityChanges.map((city) => `<p class="run-city-change"><strong>${escapeHtml(city.name)}:</strong> +${city.added.length} / −${city.removed.length}</p>`).join("") : ""}
      </div>
    </details>`;
}

function chaseDialogMarkup(monitor) {
  const metrics = monitor.metrics ?? {};
  const details = monitor.details ?? {};
  const history = currentSnapshot.monitorHistory?.[monitor.id]?.runs ?? [];
  const latestRun = history[0];
  const latestChange = history.find((run) => run.changed);
  return `
    <div class="dialog-meta"><p>${escapeHtml(monitor.description)}</p><div><span>${escapeHtml(monitor.cadence)}</span><span>Six OpenTable markets</span></div></div>
    ${statusBanner(monitor)}
    <section class="dialog-metrics" aria-label="Chase Exclusive Tables monitor summary">
      <div><span>Restaurants</span><strong>${number(metrics.restaurantCount)}</strong><small>Current validated baseline</small></div>
      <div><span>Cities</span><strong>${number(metrics.cityCount)}</strong><small>All required on every crawl</small></div>
      <div><span>Latest additions</span><strong>${number(metrics.addedCount)}</strong><small>Confirmed membership changes</small></div>
      <div><span>Latest removals</span><strong>${number(metrics.removedCount)}</strong><small>Never inferred from partial data</small></div>
    </section>
    <div class="cache-proof"><div><span>Freshness ID</span><code>${escapeHtml(latestRun?.cache?.runId ?? details.cache?.runId ?? "Pending next run")}</code></div><p>${number(latestRun?.cache?.requestCount ?? details.cache?.requestCount)} unique no-store requests · ${escapeHtml((latestRun?.cache?.crawlIds ?? details.cache?.crawlIds ?? []).join(" + ") || "legacy run")}</p></div>
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Six-city baseline</p><h3>Current restaurant lists</h3></div><span class="dialog-note">Last change ${escapeHtml(latestChange ? relativeTime(latestChange.timestamp) : "not recorded")}</span></div>
      <div class="city-lists">${(details.cities ?? []).map(chaseCityMarkup).join("")}</div>
    </section>
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Repository history</p><h3>Recent checks</h3></div><span class="dialog-note">Stable runs are collapsed</span></div>
      <div class="run-history">${history.length ? history.map(chaseRunMarkup).join("") : `<p class="empty-state">The first six-city run is pending.</p>`}</div>
    </section>`;
}

function pazeDialogMarkup(monitor) {
  const { history, baseline } = currentSnapshot;
  const latestRun = history.runs[0];
  const latestChange = history.runs.find((run) => run.changed);
  const confirmationClass = latestRun?.status === "failure" ? "error" : latestChange ? "change" : "success";
  const confirmationText = latestRun?.status === "failure" ? "Baseline preserved" : latestChange ? "Confirmed twice" : "No change";

  return `
    <div class="dialog-meta">
      <p>${escapeHtml(monitor.description)}</p>
      <div><span>${escapeHtml(monitor.cadence ?? "Manual")}</span>${sourceLink(monitor)}</div>
    </div>
    ${monitor.error ? `<div class="alert error-alert dialog-alert" role="alert"><strong>Incomplete run</strong><span>${escapeHtml(monitor.error)}</span></div>` : ""}
    <section class="dialog-metrics" aria-label="Paze monitor summary">
      <div><span>Merchants</span><strong>${monitor.currentCount ?? "—"}</strong></div>
      <div><span>Latest success</span><strong>${escapeHtml(relativeTime(monitor.latestSuccessAt))}</strong><small>${escapeHtml(fullDate(monitor.latestSuccessAt))}</small></div>
      <div><span>Last change</span><strong>${latestChange ? escapeHtml(relativeTime(latestChange.timestamp)) : "None yet"}</strong><small>${latestChange ? escapeHtml(fullDate(latestChange.timestamp)) : "Baseline remains stable"}</small></div>
      <div><span>Retained runs</span><strong>${history.runs.length}</strong><small>14 day cap</small></div>
    </section>
    <div class="cache-proof"><div><span>Freshness ID</span><code>${escapeHtml(latestRun?.cache?.runId ?? monitor.cache?.runId ?? "Pending next run")}</code></div><p>${number(latestRun?.cache?.requestCount ?? monitor.cache?.requestCount)} unique no-store request${(latestRun?.cache?.requestCount ?? monitor.cache?.requestCount) === 1 ? "" : "s"} · ${escapeHtml((latestRun?.cache?.crawlIds ?? monitor.cache?.crawlIds ?? []).join(" + ") || "legacy run")}</p></div>
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Latest comparison</p><h3>Before / after</h3></div><span class="badge ${confirmationClass}">${confirmationText}</span></div>
      ${diffMarkup(latestChange ?? latestRun)}
    </section>
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Successful baseline</p><h3>Current merchants</h3></div><span class="count-bubble">${baseline.merchants.length}</span></div>
      <div class="merchant-roster" aria-label="Current Paze merchants">${baseline.merchants.map((merchant) => `<span class="merchant-name">${escapeHtml(merchant.name)}</span>`).join("")}</div>
    </section>
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Repository history</p><h3>Recent runs</h3></div><span class="dialog-note">Stable runs are collapsed</span></div>
      <div class="run-history">${history.runs.length ? history.runs.map(runMarkup).join("") : `<p class="empty-state">No runs recorded yet.</p>`}</div>
    </section>`;
}

function placeholderDialogMarkup(monitor) {
  const entries = Object.entries(monitor.config ?? {});
  return `
    <div class="dialog-meta">
      <p>${escapeHtml(monitor.description)}</p>
      <div>${sourceLink(monitor)}</div>
    </div>
    <div class="setup-banner"><span aria-hidden="true">◇</span><div><strong>Collector not configured</strong><p>This monitor is isolated from Paze directory data and will populate its own history after setup.</p></div></div>
    <section class="dialog-section">
      <div class="dialog-section-heading"><div><p class="eyebrow">Collector inputs</p><h3>Configuration</h3></div></div>
      <div class="config-table">
        ${entries.map(([key, value]) => `<div><span>${escapeHtml(key)}</span><strong>${value == null || (Array.isArray(value) && !value.length) ? "Not set" : escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</strong></div>`).join("")}
      </div>
    </section>`;
}

function openMonitorDialog(monitorId) {
  const monitor = currentSnapshot?.state.monitors.find((item) => item.id === monitorId);
  if (!monitor) return;
  els.monitorDialogTitle.textContent = monitor.name;
  els.monitorDialogEyebrow.textContent = monitor.configured ? "Active monitor" : "Collector placeholder";
  if (!monitor.configured) els.monitorDialogContent.innerHTML = placeholderDialogMarkup(monitor);
  else if (monitor.id === "paze-directory") els.monitorDialogContent.innerHTML = pazeDialogMarkup(monitor);
  else if (["paze-clover-map-ranking", "bilt-calculator-ranking"].includes(monitor.id)) els.monitorDialogContent.innerHTML = rankingDialogMarkup(monitor);
  else if (monitor.id === "transfer-bonus-discovery") els.monitorDialogContent.innerHTML = bonusDialogMarkup(monitor);
  else if (monitor.id === "chase-sapphire-reserve-tables") els.monitorDialogContent.innerHTML = chaseDialogMarkup(monitor);
  else els.monitorDialogContent.innerHTML = placeholderDialogMarkup(monitor);
  els.monitorDialog.showModal();
}

function renderSnapshot(snapshot) {
    currentSnapshot = snapshot;
    const { state, feed } = snapshot;
    const configured = state.monitors.filter((monitor) => monitor.configured);

    const overall = document.querySelector("#overall-status");
    overall.className = `overall-card is-${state.overallStatus}`;
    overall.querySelector("strong").textContent = state.overallStatus === "healthy"
      ? "All active monitors healthy"
      : state.overallStatus === "watch" ? "An active monitor needs watching" : "A monitor needs attention";
    overall.querySelector(".meta").textContent = `${configured.length} active · ${state.monitors.length - configured.length} ready to configure`;

    document.querySelector("#generated-at").textContent = `Snapshot ${relativeTime(state.generatedAt)} · ${fullDate(state.generatedAt)}`;
    els.monitorList.innerHTML = state.monitors.map(monitorCard).join("");

    const feedCount = document.querySelector("#feed-event-count");
    feedCount.textContent = `${feed.events.length} secure event${feed.events.length === 1 ? "" : "s"}`;
    feedCount.setAttribute("aria-label", `${feed.events.length} retained meaningful events in the authenticated Convex feed`);
}

async function initializeClerk() {
  try {
    if (!window.Clerk) throw new Error("Secure sign-in did not load. Check your connection and try again.");
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });

    if (window.Clerk.isSignedIn) {
      await unlockDashboard();
      return;
    }

    els.authStatus.hidden = true;
    window.Clerk.mountSignIn(els.clerkSignIn, {
      routing: "hash",
      withSignUp: true,
      forceRedirectUrl: window.location.href.split("#")[0],
      signUpForceRedirectUrl: window.location.href.split("#")[0],
      appearance: {
        variables: {
          colorPrimary: "#202124",
          colorBackground: "#fbfcfb",
          colorText: "#202124",
          colorInputBackground: "#ffffff",
          colorInputText: "#202124",
          borderRadius: "8px",
          fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      },
    });
  } catch (error) {
    console.error(error);
    showAuthError(error);
  }
}

async function unlockDashboard() {
  els.authStatus.hidden = false;
  els.authStatus.textContent = "Verifying your account with Convex…";
  try {
    const result = await convexQuery("monitoring:dashboard", {});
    if (!result.snapshot) throw new Error("Secure monitor data has not been synced yet.");
    renderSnapshot(result.snapshot);
    els.gate.hidden = true;
    els.app.hidden = false;
  } catch (error) {
    console.error(error);
    showAuthError(error);
  }
}

async function refreshDashboard({ announce = false } = {}) {
  if (!window.Clerk?.isSignedIn || els.app.hidden) return;
  if (refreshPromise) return refreshPromise;

  els.refreshButton.disabled = true;
  if (announce) els.refreshButton.textContent = "Refreshing…";
  refreshPromise = (async () => {
    const result = await convexQuery("monitoring:dashboard", {});
    if (!result.snapshot) throw new Error("Secure monitor data has not been synced yet.");
    renderSnapshot(result.snapshot);
    if (announce) els.refreshButton.textContent = "Updated";
  })();

  try {
    await refreshPromise;
  } catch (error) {
    console.error(error);
    if (announce) els.refreshButton.textContent = "Retry refresh";
  } finally {
    refreshPromise = null;
    els.refreshButton.disabled = false;
    if (announce && els.refreshButton.textContent === "Updated") {
      window.setTimeout(() => { els.refreshButton.textContent = "Refresh"; }, 1400);
    }
  }
}

async function signOut() {
  els.app.hidden = true;
  if (window.Clerk?.isSignedIn) await window.Clerk.signOut();
  window.location.assign(window.location.href.split("#")[0]);
}

function showAuthError(error) {
  const message = String(error?.message || error || "");
  els.app.hidden = true;
  els.gate.hidden = false;
  els.authStatus.hidden = false;
  els.authSignOut.hidden = !window.Clerk?.isSignedIn;

  if (/not authorized/i.test(message)) {
    els.authStatus.textContent = "This Clerk account is signed in, but it is not approved for this private dashboard.";
  } else if (/has not been synced/i.test(message)) {
    els.authStatus.textContent = "Sign-in succeeded, but the first secure monitor sync is still pending.";
  } else if (/auth provider|token|authenticated|verified email|jwt|invalidauthheader/i.test(message)) {
    els.authStatus.textContent = "Your sign-in could not be verified by Convex. Sign out and try the approved account again.";
  } else {
    els.authStatus.textContent = "Secure sign-in could not finish loading. Refresh the page and try again.";
  }
}

async function convexQuery(path, args) {
  const token = await getConvexToken();
  if (!token) throw new Error("Not authenticated with Clerk.");
  const queryUrl = new URL(`${CONVEX_URL}/api/query`);
  queryUrl.searchParams.set("_monitor_ts", String(Date.now()));
  const response = await fetch(queryUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, args }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") {
    throw new Error(result.errorMessage || result.message || result.code || "Secure data query failed.");
  }
  return result.value;
}

async function getConvexToken() {
  const session = window.Clerk?.session;
  if (!session) return null;
  const sessionToken = await session.getToken();
  const audience = readJwtPayload(sessionToken)?.aud;
  if (audience === "convex" || (Array.isArray(audience) && audience.includes("convex"))) return sessionToken;
  try {
    return await session.getToken({ template: "convex" });
  } catch {
    return sessionToken;
  }
}

function readJwtPayload(token) {
  if (!token) return null;
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

els.lockButton.addEventListener("click", signOut);
els.refreshButton.addEventListener("click", () => refreshDashboard({ announce: true }));
els.authSignOut.addEventListener("click", signOut);
els.monitorList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-monitor-id]");
  if (button) openMonitorDialog(button.dataset.monitorId);
});
els.monitorDialogClose.addEventListener("click", () => els.monitorDialog.close());
els.monitorDialog.addEventListener("click", (event) => {
  if (event.target === els.monitorDialog) els.monitorDialog.close();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshDashboard();
});
window.setInterval(() => {
  if (document.visibilityState === "visible") refreshDashboard();
}, 60_000);
initializeClerk();
