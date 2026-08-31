const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const els = {
  gate: document.querySelector("#access-gate"),
  clerkSignIn: document.querySelector("#clerk-sign-in"),
  authStatus: document.querySelector("#auth-status"),
  authSignOut: document.querySelector("#auth-sign-out"),
  app: document.querySelector("#app"),
  lockButton: document.querySelector("#lock-button"),
  monitorList: document.querySelector("#monitor-list"),
  monitorDialog: document.querySelector("#monitor-dialog"),
  monitorDialogTitle: document.querySelector("#monitor-dialog-title"),
  monitorDialogEyebrow: document.querySelector("#monitor-dialog-eyebrow"),
  monitorDialogContent: document.querySelector("#monitor-dialog-content"),
  monitorDialogClose: document.querySelector("#monitor-dialog-close"),
};

let currentSnapshot = null;

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

function monitorCard(monitor, index) {
  const active = monitor.configured;
  const statusClass = monitor.status === "healthy" ? "healthy" : monitor.status === "error" ? "error" : "pending";
  const statusLabel = monitor.status === "healthy" ? "Healthy" : monitor.status === "error" ? "Needs attention" : "Not configured";
  let body;
  if (active) {
    const pagination = monitor.pagination;
    body = `
      ${monitor.error ? `<div class="alert error-alert monitor-alert" role="alert"><strong>Incomplete run</strong><span>${escapeHtml(monitor.error)}</span></div>` : ""}
      <div class="monitor-stats">
        <div class="monitor-stat"><span>Merchants</span><strong>${monitor.currentCount ?? "—"}</strong></div>
        <div class="monitor-stat"><span>Pages</span><strong>${pagination?.pagesFetched ?? "—"}</strong></div>
        <div class="monitor-stat"><span>Duration</span><strong>${duration(monitor.durationMs)}</strong></div>
      </div>
      <div class="monitor-footer">
        <span>${escapeHtml(monitor.cadence ?? "Manual")}</span>
        <span>Latest success ${escapeHtml(relativeTime(monitor.latestSuccessAt))}</span>
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
        <div class="run-facts"><span>${escapeHtml(pageText)}</span><span>Confirmation: ${run.confirmed ? "complete" : "not complete"}</span><span>Baseline preserved: ${run.status === "failure" ? "yes" : "updated"}</span></div>
        ${run.error ? `<p class="run-error">${escapeHtml(run.error)}</p>` : diffMarkup(run)}
      </div>
    </details>`;
}

function sourceLink(monitor) {
  return monitor.sourceUrl
    ? `<a href="${escapeHtml(monitor.sourceUrl)}" target="_blank" rel="noreferrer">Open source <span aria-hidden="true">↗</span></a>`
    : `<span>Source not configured</span>`;
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
  els.monitorDialogContent.innerHTML = monitor.id === "paze-directory"
    ? pazeDialogMarkup(monitor)
    : placeholderDialogMarkup(monitor);
  els.monitorDialog.showModal();
}

function renderSnapshot(snapshot) {
    currentSnapshot = snapshot;
    const { state, feed } = snapshot;
    const configured = state.monitors.filter((monitor) => monitor.configured);

    const overall = document.querySelector("#overall-status");
    overall.className = `overall-card is-${state.overallStatus}`;
    overall.querySelector("strong").textContent = state.overallStatus === "healthy" ? "All active monitors healthy" : "A monitor needs attention";
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
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
els.authSignOut.addEventListener("click", signOut);
els.monitorList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-monitor-id]");
  if (button) openMonitorDialog(button.dataset.monitorId);
});
els.monitorDialogClose.addEventListener("click", () => els.monitorDialog.close());
els.monitorDialog.addEventListener("click", (event) => {
  if (event.target === els.monitorDialog) els.monitorDialog.close();
});
initializeClerk();
