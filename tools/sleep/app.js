const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const SOURCE_LABELS = {
  whoop: "WHOOP",
  apple_health: "Apple Health",
  eightsleep: "Eight Sleep",
  manual: "Other",
};
const SOURCE_COLORS = {
  whoop: "#5578ec",
  apple_health: "#ed8f5b",
  eightsleep: "#22aea3",
  manual: "#8b978f",
};

const els = {
  gate: document.querySelector("#accessGate"),
  clerkSignIn: document.querySelector("#clerkSignIn"),
  authStatus: document.querySelector("#authStatus"),
  authSignOut: document.querySelector("#authSignOut"),
  app: document.querySelector("#app"),
  lockButton: document.querySelector("#lockButton"),
  lastUpdated: document.querySelector("#lastUpdated"),
  heroDate: document.querySelector("#heroDate"),
  heroSummary: document.querySelector("#heroSummary"),
  latestScore: document.querySelector("#latestScore"),
  latestScoreLabel: document.querySelector("#latestScoreLabel"),
  orbitNote: document.querySelector("#orbitNote"),
  whoopScore: document.querySelector("#whoopScore"),
  appleScore: document.querySelector("#appleScore"),
  eightScore: document.querySelector("#eightScore"),
  whoopStatus: document.querySelector("#whoopStatus"),
  whoopAction: document.querySelector("#whoopAction"),
  whoopDisconnect: document.querySelector("#whoopDisconnect"),
  whoopMessage: document.querySelector("#whoopMessage"),
  appleStatus: document.querySelector("#appleStatus"),
  eightStatus: document.querySelector("#eightStatus"),
  trendEmpty: document.querySelector("#trendEmpty"),
  scatterChart: document.querySelector("#scatterChart"),
  scatterEmpty: document.querySelector("#scatterEmpty"),
  correlationBadge: document.querySelector("#correlationBadge"),
  pairedDays: document.querySelector("#pairedDays"),
  sweetSpot: document.querySelector("#sweetSpot"),
  signalLabel: document.querySelector("#signalLabel"),
  ratingScale: document.querySelector("#ratingScale"),
  alertnessNote: document.querySelector("#alertnessNote"),
  saveAlertness: document.querySelector("#saveAlertness"),
  checkinState: document.querySelector("#checkinState"),
  checkinMessage: document.querySelector("#checkinMessage"),
  reminderButton: document.querySelector("#reminderButton"),
  historyRows: document.querySelector("#historyRows"),
  historyEmpty: document.querySelector("#historyEmpty"),
  importDialog: document.querySelector("#importDialog"),
  fileInput: document.querySelector("#fileInput"),
  importPreview: document.querySelector("#importPreview"),
  previewCount: document.querySelector("#previewCount"),
  previewSources: document.querySelector("#previewSources"),
  confirmImport: document.querySelector("#confirmImport"),
  importMessage: document.querySelector("#importMessage"),
  manualSource: document.querySelector("#manualSource"),
  manualDate: document.querySelector("#manualDate"),
  manualScore: document.querySelector("#manualScore"),
  manualDuration: document.querySelector("#manualDuration"),
  addManual: document.querySelector("#addManual"),
};

let sleepNights = [];
let alertnessRatings = [];
let stagedNights = [];
let selectedRating = null;
let chartResizeTimer;
let groupSample;
let groupHistory;
let groupGeometry;
let groupSelectedDate;
const visibleGroupMembers = new Set(["you", "alex", "morgan"]);
let selectedDays = 7;
let activeView = "overview";
let isDemo = ["1", "empty"].includes(
  new URLSearchParams(location.search).get("demo"),
);
let demoData;
const $ = (selector) => document.querySelector(selector);

init().catch((error) => showAuthError(error));

async function init() {
  captureSleepInvite();
  buildRatingScale();
  els.manualDate.value = todayPacific();
  els.heroDate.textContent = formatLongDate(todayPacific());
  bindEvents();
  const requestedView = new URLSearchParams(location.search).get("view");
  switchView(requestedView === "groups" ? "friends" : "overview");
  document
    .querySelectorAll("select")
    .forEach((select) => SearchableSelect.enhance(select));
  if (isDemo) return startPreview();
  await initializeClerk();
}

function bindEvents() {
  bindGroupEvents();
  $("#previewButton").addEventListener("click", startPreview);
  $("#retryLoad").addEventListener("click", loadDashboard);
  document
    .querySelectorAll("[data-view], [data-go]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        switchView(button.dataset.view || button.dataset.go),
      ),
    );
  document.querySelectorAll("[data-range]").forEach((button) =>
    button.addEventListener("click", () => {
      selectedDays = Number(button.dataset.range);
      document
        .querySelectorAll("[data-range]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
      renderDashboard();
    }),
  );
  $("#chartMetric").addEventListener("change", renderCharts);
  $("#groupMetric").addEventListener("change", drawGroupChart);

  els.lockButton.addEventListener("click", signOut);
  els.authSignOut.addEventListener("click", signOut);
  document.querySelectorAll("[data-open-import]").forEach((button) => {
    button.addEventListener("click", openImportDialog);
  });
  els.fileInput.addEventListener("change", handleFiles);
  els.addManual.addEventListener("click", stageManualNight);
  els.confirmImport.addEventListener("click", importStagedNights);
  els.saveAlertness.addEventListener("click", saveTodayAlertness);
  els.alertnessNote.addEventListener("input", updateSaveButton);
  els.reminderButton.addEventListener("click", downloadNoonReminder);
  els.whoopAction.addEventListener("click", handleWhoopAction);
  els.whoopDisconnect.addEventListener("click", disconnectWhoop);
  window.addEventListener("resize", () => {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(renderCharts, 100);
  });
}

async function initializeClerk() {
  try {
    if (!window.Clerk)
      throw new Error(
        "Secure sign-in did not load. Check your connection and try again.",
      );
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });

    if (isDemo) return;
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
          colorPrimary: "#17231e",
          colorBackground: "#f8faf5",
          colorText: "#17231e",
          colorInputBackground: "#ffffff",
          colorInputText: "#17231e",
          borderRadius: "4px",
          fontFamily:
            "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
  els.authStatus.textContent = "Verifying your account…";
  try {
    if (pendingSleepInvite) { await reviewSleepInvite(); return; }
    await convexQuery("sleep:verify", {});
    if (isDemo) return;
    els.lastUpdated.textContent = "Private workspace";
    els.gate.hidden = true;
    els.app.hidden = false;
    await loadDashboard();
    await initializeWhoop();
    await initializeGroups();
  } catch (error) {
    console.error(error);
    showAuthError(error);
  }
}

async function signOut() {
  if (isDemo) {
    window.location.assign(location.pathname);
    return;
  }
  sleepNights = [];
  alertnessRatings = [];
  if (window.Clerk?.isSignedIn) await window.Clerk.signOut();
  window.location.assign(window.location.href.split("#")[0]);
}

function showAuthError(error) {
  if (isDemo) return;
  const message = String(error?.message || error || "");
  els.app.hidden = true;
  els.gate.hidden = false;
  els.authStatus.hidden = false;
  els.authSignOut.hidden = !window.Clerk?.isSignedIn;
  if (/invitation is required/i.test(message)) {
    els.authStatus.textContent = "Ask a group owner for a Daylight invitation, then open their link to join.";
  } else if (/not authorized/i.test(message)) {
    els.authStatus.textContent =
      "This Clerk account is signed in, but it is not approved for this private dashboard.";
  } else if (
    /auth provider|token|authenticated|verified email|jwt|invalidauthheader/i.test(
      message,
    )
  ) {
    els.authStatus.textContent =
      "Clerk sign-in is ready, but its Convex integration still needs to be activated in the Clerk dashboard.";
  } else {
    els.authStatus.textContent =
      "Secure sign-in could not finish loading. Refresh the page and try again.";
  }
}

async function loadDashboard() {
  const startedInDemo = isDemo;
  els.lastUpdated.textContent = "Refreshing…";
  $("#loadError").hidden = true;
  const endDate = todayPacific();
  const startDate = addDays(endDate, -365);

  try {
    const data = await convexQuery("sleep:dashboard", { startDate, endDate });
    if (startedInDemo !== isDemo) return;
    sleepNights = data.nights || [];
    alertnessRatings = data.alertness || [];
    renderDashboard();
    els.lastUpdated.textContent = isDemo
      ? "Sample data"
      : `Updated ${formatTime(new Date())}`;
  } catch (error) {
    console.error(error);
    if (/authorized|authenticated|token|verified email/i.test(error.message)) {
      showAuthError(error);
      return;
    }
    els.lastUpdated.textContent = "Could not refresh";
    $("#loadError").hidden = false;
  }
}

async function initializeWhoop() {
  const params = new URLSearchParams(window.location.search);
  const callbackStatus = params.get("whoop");
  if (callbackStatus === "error") {
    els.whoopMessage.textContent =
      "WHOOP authorization did not finish. Try connecting again.";
  }

  try {
    const status = await convexQuery("whoopData:status", {});
    setWhoopConnectionState(status);
    if (callbackStatus === "connected") {
      els.whoopMessage.textContent =
        "Connected. Importing your WHOOP sleep history…";
      await syncWhoop();
    }
  } catch (error) {
    console.error(error);
    els.whoopMessage.textContent = readableWhoopError(error);
  } finally {
    if (callbackStatus) {
      params.delete("whoop");
      params.delete("reason");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    }
  }
}

function setWhoopConnectionState(status) {
  if (isDemo) {
    els.whoopAction.disabled = true;
    els.whoopAction.textContent = "Sample connection";
    els.whoopDisconnect.hidden = true;
    els.whoopMessage.textContent = "Sign in to connect your own WHOOP account.";
    return;
  }
  els.whoopAction.dataset.connected = status.connected && !status.needsUpgrade ? "true" : "false";
  els.whoopAction.textContent = status.needsUpgrade ? "Enable recovery & activity" : status.connected
    ? "Sync WHOOP"
    : "Connect WHOOP";
  els.whoopDisconnect.hidden = !status.connected;
  if (status.needsUpgrade) {
    els.whoopMessage.textContent = "Reconnect WHOOP to add recovery, strain, and workouts. Your existing sleep history and sharing choices stay in place.";
  } else if (status.connected && status.lastSyncedAt) {
    els.whoopMessage.textContent = `Last synced ${formatTime(new Date(status.lastSyncedAt))}`;
  }
}

async function disconnectWhoop() {
  els.whoopAction.disabled = true;
  els.whoopDisconnect.disabled = true;
  els.whoopMessage.textContent = "Disconnecting…";
  try {
    await convexAction("whoop:disconnect", {});
    setWhoopConnectionState({ connected: false });
    els.whoopMessage.textContent =
      "WHOOP disconnected. Imported history remains in your dashboard.";
  } catch (error) {
    console.error(error);
    els.whoopMessage.textContent = readableWhoopError(error);
  } finally {
    els.whoopAction.disabled = false;
    els.whoopDisconnect.disabled = false;
  }
}

async function handleWhoopAction() {
  if (els.whoopAction.dataset.connected === "true") {
    await syncWhoop();
    return;
  }
  els.whoopAction.disabled = true;
  els.whoopAction.textContent = "Opening Whoop…";
  els.whoopMessage.textContent = "";
  try {
    const result = await convexAction("whoop:beginConnect", {});
    window.location.assign(result.url);
  } catch (error) {
    console.error(error);
    els.whoopMessage.textContent = readableWhoopError(error);
    els.whoopAction.disabled = false;
    els.whoopAction.textContent = "Connect WHOOP";
  }
}

async function syncWhoop() {
  els.whoopAction.disabled = true;
  els.whoopAction.textContent = "Syncing…";
  try {
    const result = await convexAction("whoop:sync", {});
    els.whoopMessage.textContent = `Synced ${result.inserted + result.updated} nights from Whoop.`;
    await loadDashboard();
    setWhoopConnectionState(await convexQuery("whoopData:status", {}));
  } catch (error) {
    console.error(error);
    els.whoopMessage.textContent = readableWhoopError(error);
  } finally {
    els.whoopAction.disabled = false;
    if (els.whoopAction.textContent === "Syncing…") els.whoopAction.textContent = "Sync WHOOP";
  }
}

function readableWhoopError(error) {
  const message = String(error?.message || error || "");
  if (/WHOOP_CLIENT/i.test(message))
    return "WHOOP developer credentials still need to be configured.";
  if (/connect WHOOP/i.test(message)) return "Connect WHOOP before syncing.";
  return "WHOOP could not finish that request. Try again.";
}

function startPreview() {
  resetGroupsPreview();
  isDemo = true;
  demoData =
    new URLSearchParams(location.search).get("demo") === "empty"
      ? { nights: [], alertness: [] }
      : Daylight.sample(todayPacific());
  sleepNights = demoData.nights;
  alertnessRatings = demoData.alertness;
  els.gate.hidden = true;
  els.app.hidden = false;
  $("#demoBanner").hidden = false;
  els.lastUpdated.textContent = "Sample data";
  els.lockButton.textContent = "Exit preview ↗";
  setWhoopConnectionState({ connected: false });
  $("#groupToolbar").hidden = true;
  $(".group-preview-label").hidden = false;
  renderDashboard();
}

function switchView(view) {
  const views = {
    overview: [
      "Overview",
      "Your day, in perspective.",
      "A clearer picture of your sleep. A little more understanding of you.",
    ],
    trends: [
      "Sleep trends",
      "Step back. See the pattern.",
      "Your WHOOP sleep over time, and how it lines up with your day.",
    ],
    friends: [
      "Groups",
      "Your group",
      "Compare your trends. See who’s ahead this week.",
    ],
    connections: [
      "Connections",
      "Your data, all together.",
      "Connect WHOOP. Bring in Apple Health. Keep each source in perspective.",
    ],
  };
  if (!views[view]) return;
  activeView = view;
  $("#pageLabel").textContent = views[view][0];
  $("#pageTitle").textContent = views[view][1];
  $("#pageSubtitle").textContent = views[view][2];
  document
    .querySelectorAll("[data-panels]")
    .forEach(
      (panel) =>
        (panel.hidden = !panel.dataset.panels.split(" ").includes(view)),
    );
  document.querySelectorAll("[data-view]").forEach((button) => {
    if (button.dataset.view === view)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#rangeControl").hidden = !["overview", "trends", "friends"].includes(view);
  renderCharts();
}

function currentRows() {
  return Daylight.range(sleepNights, selectedDays, todayPacific());
}
function whoopGrouped() {
  return groupNightsByDate(
    currentRows().filter(
      (row) => row.source === "whoop" && row.scoreKind === "native",
    ),
  );
}

function renderDashboard() {
  const records = sleepNights
    .filter((row) => row.source === "whoop" && row.sleepDate <= todayPacific())
    .sort((a, b) => a.sleepDate.localeCompare(b.sleepDate));
  const latest = records.at(-1);
  const nativeScore = latest && Daylight.value(latest, "score");
  els.latestScore.textContent = Number.isFinite(nativeScore)
    ? Math.round(nativeScore)
    : "—";
  $("#scoreRing").style.setProperty(
    "--progress",
    `${Number.isFinite(nativeScore) ? clamp(nativeScore, 0, 100) : 0}%`,
  );
  els.latestScoreLabel.textContent = "Sleep performance";
  els.orbitNote.textContent = latest
    ? `WHOOP · ${formatShortDate(latest.sleepDate)}`
    : "WHOOP · waiting for data";
  if (latest) {
    const duration = Number.isFinite(latest.durationMinutes)
      ? `${formatDuration(latest.durationMinutes)} asleep`
      : "Sleep duration not available";
    els.heroSummary.textContent = `${formatTableDate(latest.sleepDate)}: ${duration}${Number.isFinite(nativeScore) ? ` and ${Math.round(nativeScore)}% sleep performance` : ""}. Explore your recent nights below.`;
  } else {
    els.heroSummary.textContent =
      "Connect WHOOP to start seeing your sleep clearly. Already have an export? Import your history to get started.";
  }
  renderMetrics();
  renderNight(latest);
  renderDeviceComparison();
  renderSourceCard("whoop", els.whoopScore, els.whoopStatus);
  renderSourceCard("apple_health", els.appleScore, els.appleStatus);
  renderSourceCard("eightsleep", els.eightScore, els.eightStatus);
  renderCheckin();
  renderCharts();
  renderHistory(groupNightsByDate(currentRows()));
}

function renderMetrics() {
  const definitions = [
    ["score", "Sleep performance", "◷", "WHOOP sleep need met"],
    ["durationMinutes", "Time asleep", "☾", "WHOOP · sleep duration"],
    ["efficiency", "Sleep efficiency", "✧", "WHOOP · time asleep / in bed"],
    ["restorativeMinutes", "Deep + REM sleep", "≈", "WHOOP · estimated stages"],
  ];
  $("#metricCards").innerHTML = definitions
    .map(([metric, label, icon, note]) => {
      const stats = Daylight.stats(
        sleepNights,
        metric,
        selectedDays,
        todayPacific(),
      );
      const percent = ["score", "efficiency"].includes(metric);
      const display =
        stats.average === null
          ? "—"
          : percent
            ? `${Math.round(stats.average)}<small>%</small>`
            : formatDuration(stats.average);
      const roundedDelta = Math.round(stats.delta || 0);
      const difference =
        stats.delta === null
          ? "No previous period to compare"
          : `${roundedDelta === 0 ? "" : roundedDelta > 0 ? "+" : "−"}${Math.abs(roundedDelta)} ${percent ? "pts" : "min"} vs previous ${selectedDays} days`;
      return `<article class="metric-card"><div><h3>${label}</h3><span class="metric-icon" aria-hidden="true">${icon}</span></div><strong>${display}</strong><p>${difference}</p><p class="metric-footnote">${stats.count}/${selectedDays} nights · ${note}</p></article>`;
    })
    .join("");
}

function renderNight(latest) {
  $("#stageDate").textContent = latest
    ? `WHOOP · ${formatShortDate(latest.sleepDate)}`
    : "LATEST WHOOP NIGHT";
  $("#nightDuration").textContent = formatDuration(latest?.durationMinutes);
  const stages = Daylight.stages(latest);
  $("#stageBar").innerHTML = stages
    ? stages
        .map(
          (stage) =>
            `<span style="width:${(stage.minutes / latest.durationMinutes) * 100}%;background:${stage.color}"></span>`,
        )
        .join("")
    : "";
  $("#stageBar").setAttribute(
    "aria-label",
    stages
      ? stages
          .map((stage) => `${stage.label}: ${formatDuration(stage.minutes)}`)
          .join(", ")
      : "Sleep stages unavailable",
  );
  $("#stageLegend").innerHTML = stages
    ? stages
        .map(
          (stage) =>
            `<div><i style="background:${stage.color}"></i>${stage.label}<strong>${formatDuration(stage.minutes)}</strong></div>`,
        )
        .join("")
    : '<p class="small-note">Stage details will appear when available from WHOOP.</p>';
  const time = (value) =>
    value && !Number.isNaN(new Date(value).getTime())
      ? formatTime(new Date(value))
      : "—";
  $("#bedtime").textContent = time(latest?.asleepAt);
  $("#waketime").textContent = time(latest?.wokeAt);
}

function renderDeviceComparison() {
  const pair = Daylight.matchedDevices(
    sleepNights,
    selectedDays,
    todayPacific(),
  );
  const max = Math.max(pair.whoop || 0, pair.apple || 0, 1);
  $("#deviceComparison").innerHTML =
    [
      ["WHOOP", pair.whoop, "#7a9b85"],
      ["Apple Health", pair.apple, "#dca886"],
    ]
      .map(
        ([label, value, color]) =>
          `<div class="device-row"><span>${label}</span><div class="device-track"><i style="width:${value === null ? 0 : (value / max) * 100}%;background:${color}"></i></div><strong>${formatDuration(value)}</strong></div>`,
      )
      .join("") +
    `<p class="comparison-note">${pair.count ? `Apple Health recorded ${Math.round(Math.abs(pair.difference))} min ${pair.difference >= 0 ? "more" : "less"} on average · ${pair.count} matched night${pair.count === 1 ? "" : "s"} in the last ${selectedDays} days.` : `No overlapping nights in the last ${selectedDays} days. Import Apple Health sleep records to compare.`}</p>`;
}

function renderSourceCard(source, scoreElement, statusElement) {
  const latest = sleepNights
    .filter((row) => row.source === source && row.sleepDate <= todayPacific())
    .sort((a, b) => a.sleepDate.localeCompare(b.sleepDate))
    .at(-1);
  scoreElement.textContent = latest
    ? source === "whoop" && latest.scoreKind === "native"
      ? `${Math.round(latest.score)}%`
      : formatDuration(latest.durationMinutes)
    : "—";
  statusElement.textContent = latest
    ? `${formatShortDate(latest.sleepDate)} · ${source === "whoop" && latest.scoreKind === "native" ? "Sleep performance" : "Time asleep"}`
    : "No nights imported";
}

function buildRatingScale() {
  for (let score = 1; score <= 10; score += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rating-button";
    button.textContent = score;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.setAttribute("aria-label", `${score} out of 10 alertness`);
    button.addEventListener("click", () => selectRating(score));
    button.addEventListener("keydown", (event) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 1
          : event.key === "End"
            ? 10
            : ((score -
                1 +
                (["ArrowLeft", "ArrowUp"].includes(event.key) ? 9 : 1)) %
                10) +
              1;
      selectRating(next);
      els.ratingScale.children[next - 1].focus();
    });
    els.ratingScale.append(button);
  }
}

function selectRating(score) {
  selectedRating = score;
  els.ratingScale
    .querySelectorAll(".rating-button")
    .forEach((button, index) => {
      const selected = index + 1 === score;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected || (!selectedRating && index === 0) ? 0 : -1;
    });
  updateSaveButton();
}

function renderCheckin() {
  const today = todayPacific();
  const existing = alertnessRatings.find((row) => row.ratingDate === today);
  selectedRating = existing?.score ?? null;
  els.alertnessNote.value = existing?.note || "";
  els.ratingScale
    .querySelectorAll(".rating-button")
    .forEach((button, index) => {
      const selected = index + 1 === selectedRating;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected || (!selectedRating && index === 0) ? 0 : -1;
    });

  const hour = currentPacificHour();
  if (existing) {
    els.checkinState.textContent = "Logged today";
    els.checkinState.classList.add("complete");
    els.checkinMessage.textContent = `Saved at ${formatTime(new Date(existing.updatedAt))}`;
  } else if (hour < 12) {
    els.checkinState.textContent = "Due at 12:00";
    els.checkinState.classList.remove("complete");
    els.checkinMessage.textContent = "You can log early if you want.";
  } else {
    els.checkinState.textContent = "Ready now";
    els.checkinState.classList.remove("complete");
    els.checkinMessage.textContent = "";
  }
  updateSaveButton();
}

function updateSaveButton() {
  const existing = alertnessRatings.find(
    (row) => row.ratingDate === todayPacific(),
  );
  const changed =
    selectedRating &&
    (selectedRating !== existing?.score ||
      els.alertnessNote.value.trim() !== (existing?.note || ""));
  els.saveAlertness.disabled = !selectedRating || !changed;
  els.saveAlertness.textContent = existing
    ? "Update today’s check-in"
    : "Save today’s check-in";
}

async function saveTodayAlertness() {
  if (!selectedRating) return;
  els.saveAlertness.disabled = true;
  els.checkinMessage.textContent = "Saving…";
  try {
    await convexMutation("sleep:saveAlertness", {
      ratingDate: todayPacific(),
      score: selectedRating,
      note: els.alertnessNote.value.trim() || undefined,
      timezone: "America/Los_Angeles",
    });
    await loadDashboard();
    els.checkinMessage.textContent = isDemo
      ? "Sample check-in updated. This is not saved."
      : "Saved. One more useful data point.";
  } catch (error) {
    console.error(error);
    els.checkinMessage.textContent = "Could not save. Try again.";
    els.saveAlertness.disabled = false;
  }
}

function renderCharts() {
  if (els.app.hidden) return;
  if (activeView === "friends") return drawGroupChart();
  drawTrendChart();
  if (activeView === "trends") drawScatterChart(whoopGrouped());
}

function drawTrendChart() {
  const metric = $("#chartMetric").value;
  const percent = metric !== "durationMinutes";
  const stats = Daylight.stats(
    sleepNights,
    metric,
    selectedDays,
    todayPacific(),
  );
  $("#trendPeriod").textContent = `THE LAST ${selectedDays} DAYS`;
  $("#trendAverage").textContent =
    stats.average === null
      ? "—"
      : percent
        ? `${Math.round(stats.average)}%`
        : formatDuration(stats.average);
  $("#trendComparison").textContent =
    `${stats.count} of ${selectedDays} nights · WHOOP average`;
  const byDate = new Map(
    currentRows()
      .filter((row) => row.source === "whoop")
      .map((row) => [row.sleepDate, row]),
  );
  const dates = Array.from({ length: selectedDays }, (_, index) =>
    addDays(todayPacific(), index - selectedDays + 1),
  );
  const points = dates.map((date, index) => ({
    date,
    index,
    value: byDate.has(date)
      ? Daylight.value(byDate.get(date), metric)
      : undefined,
  }));
  els.trendEmpty.hidden = stats.count > 0;
  const w = 640,
    h = 196,
    left = 34,
    right = 12,
    top = 20,
    bottom = 30;
  const upper = percent
    ? 100
    : Math.max(600, ...points.map((point) => point.value || 0));
  const x = (index) =>
    left + (index / Math.max(1, selectedDays - 1)) * (w - left - right);
  const y = (value) => top + (1 - value / upper) * (h - top - bottom);
  const pieces = [];
  let segment = [];
  points.forEach((point) => {
    if (Number.isFinite(point.value)) segment.push(point);
    else if (segment.length) {
      pieces.push(segment);
      segment = [];
    }
  });
  if (segment.length) pieces.push(segment);
  const grid = [0, 1, 2, 3, 4]
    .map((i) => {
      const value = (upper * i) / 4;
      return `<line x1="${left}" x2="${w - right}" y1="${y(value)}" y2="${y(value)}" stroke="#e8ede7" stroke-dasharray="3 5"/><text x="0" y="${y(value) + 3}" fill="#8b978e" font-size="9">${percent ? Math.round(value) : `${Math.round(value / 60)}h`}</text>`;
    })
    .join("");
  const indices =
    selectedDays === 7
      ? [0, 1, 2, 3, 4, 5, 6]
      : [
          0,
          Math.round(selectedDays / 4),
          Math.round(selectedDays / 2),
          Math.round((selectedDays * 3) / 4),
          selectedDays - 1,
        ];
  const labels = indices
    .map(
      (i) =>
        `<text x="${x(i)}" y="${h - 7}" text-anchor="${i === 0 ? "start" : i === selectedDays - 1 ? "end" : "middle"}" fill="#8b978e" font-size="9">${formatShortDate(dates[i])}</text>`,
    )
    .join("");
  const lines = pieces
    .map((piece) => {
      const path = piece
        .map(
          (point, i) => `${i ? "L" : "M"}${x(point.index)},${y(point.value)}`,
        )
        .join(" ");
      return `<path d="${path} L${x(piece.at(-1).index)},${y(0)} L${x(piece[0].index)},${y(0)} Z" fill="url(#trendFill)"/><path d="${path}" fill="none" stroke="#72987e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  const dots = points
    .filter((point) => Number.isFinite(point.value))
    .map((point) => {
      const label = `${formatTableDate(point.date)}: ${percent ? `${Math.round(point.value)}%` : formatDuration(point.value)}`;
      return `<g tabindex="0" role="button" class="chart-point" aria-label="${escapeHtml(label)}" data-label="${escapeHtml(label)}"><circle class="point-halo" cx="${x(point.index)}" cy="${y(point.value)}" r="10" fill="transparent"/><circle cx="${x(point.index)}" cy="${y(point.value)}" r="${selectedDays > 28 ? 2 : 3.5}" fill="#72987e" stroke="white" stroke-width="2"/><title>${escapeHtml(label)}</title></g>`;
    })
    .join("");
  $("#trendPlot").innerHTML =
    `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="WHOOP ${percent ? "percentage" : "duration"} history. Missing days are gaps."><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dce8d9" stop-opacity=".65"/><stop offset="1" stop-color="#f9fcf6" stop-opacity=".1"/></linearGradient></defs>${grid}${labels}${lines}${dots}</svg>`;
  $("#chartDetail").textContent = stats.count
    ? "Select a point to explore a night."
    : "No WHOOP data in this period.";
  $("#trendPlot")
    .querySelectorAll(".chart-point")
    .forEach((point) => {
      const reveal = () =>
        ($("#chartDetail").textContent = point.dataset.label);
      point.addEventListener("mouseenter", reveal);
      point.addEventListener("focus", reveal);
      point.addEventListener("click", reveal);
      point.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          reveal();
        }
      });
    });
}

function drawScatterChart(grouped) {
  const context = prepareCanvas(els.scatterChart);
  if (!context) return;
  const { ctx, width, height } = context;
  const ratingByDate = new Map(
    alertnessRatings.map((row) => [row.ratingDate, row]),
  );
  const pairs = [...grouped.entries()]
    .filter(([date]) => ratingByDate.has(date))
    .map(([date, night]) => ({
      x: night.aggregate,
      y: ratingByDate.get(date).score,
      date,
    }));
  els.scatterChart.setAttribute(
    "aria-label",
    `WHOOP sleep performance versus noon alertness for ${pairs.length} paired days in the last ${selectedDays} days.`,
  );

  els.pairedDays.textContent = pairs.length;
  els.scatterEmpty.hidden = pairs.length >= 3;
  if (pairs.length < 3) {
    els.correlationBadge.textContent = "Not enough data";
    els.correlationBadge.className = "correlation-badge";
    els.sweetSpot.textContent = "—";
    els.signalLabel.textContent = "Learning";
    return;
  }

  const pad = { top: 16, right: 18, bottom: 34, left: 38 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (value) => pad.left + (value / 100) * plotWidth;
  const y = (value) => pad.top + (1 - (value - 1) / 9) * plotHeight;

  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.fillStyle = "#7a857e";
  ctx.strokeStyle = "#e1e5de";
  ctx.lineWidth = 1;
  [1, 4, 7, 10].forEach((tick) => {
    ctx.beginPath();
    ctx.moveTo(pad.left, y(tick));
    ctx.lineTo(width - pad.right, y(tick));
    ctx.stroke();
    ctx.fillText(String(tick), 15, y(tick) + 3);
  });
  [0, 25, 50, 75, 100].forEach((tick) =>
    ctx.fillText(String(tick), x(tick) - 7, height - 8),
  );

  const regression = linearRegression(pairs);
  ctx.strokeStyle = "#a9b2aa";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x(0), y(clamp(regression.intercept, 1, 10)));
  ctx.lineTo(
    x(100),
    y(clamp(regression.intercept + regression.slope * 100, 1, 10)),
  );
  ctx.stroke();
  ctx.setLineDash([]);

  pairs.forEach((pair) => {
    ctx.beginPath();
    ctx.fillStyle = "rgba(34, 174, 163, 0.72)";
    ctx.arc(x(pair.x), y(pair.y), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fafbf6";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  const correlation = pearson(
    pairs.map((pair) => pair.x),
    pairs.map((pair) => pair.y),
  );
  const strength =
    Math.abs(correlation) < 0.2
      ? "Very weak"
      : Math.abs(correlation) < 0.4
        ? "Weak"
        : Math.abs(correlation) < 0.65
          ? "Moderate"
          : "Strong";
  els.correlationBadge.textContent = `${correlation >= 0 ? "+" : ""}${correlation.toFixed(2)} correlation`;
  els.correlationBadge.className = `correlation-badge ${correlation >= 0.15 ? "positive" : correlation <= -0.15 ? "negative" : ""}`;
  els.signalLabel.textContent = `${strength} ${correlation >= 0 ? "positive" : "negative"}`;
  const best = [...pairs]
    .sort((a, b) => b.y - a.y)
    .slice(0, Math.max(1, Math.ceil(pairs.length / 3)));
  els.sweetSpot.textContent = `${Math.round(average(best.map((pair) => pair.x)))}%`;
}

function renderHistory(grouped) {
  const ratingByDate = new Map(
    alertnessRatings.map((row) => [row.ratingDate, row]),
  );
  const rows = [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  els.historyEmpty.hidden = rows.length > 0;
  const hasOther = rows.some(([, night]) =>
    night.records.some(
      (record) => !["whoop", "apple_health"].includes(record.source),
    ),
  );
  $("#otherSourceHeading").hidden = !hasOther;
  $("#historyCount").textContent =
    `${rows.length} night${rows.length === 1 ? "" : "s"}`;
  els.historyRows.replaceChildren();
  rows.forEach(([date, night]) => {
    const whoop = night.records.find((record) => record.source === "whoop");
    const apple = night.records.find(
      (record) => record.source === "apple_health",
    );
    const row = document.createElement("tr");
    const score = whoop && Daylight.value(whoop, "score");
    const rating = ratingByDate.get(date);
    const other = night.records
      .filter((record) => !["whoop", "apple_health"].includes(record.source))
      .map(
        (record) =>
          `${escapeHtml(SOURCE_LABELS[record.source])}: ${formatDuration(record.durationMinutes)}${record.scoreKind === "native" ? ` · ${Math.round(record.score)} score` : ""}`,
      )
      .join("<br>");
    row.innerHTML = `<td>${escapeHtml(formatTableDate(date))}</td><td>${Number.isFinite(score) ? `<span class="score-pill">${Math.round(score)}%</span>` : "—"}</td><td>${formatDuration(whoop?.durationMinutes)}</td><td>${formatDuration(apple?.durationMinutes)}</td><td>${rating ? `${rating.score} <span class="muted">/ 10</span>` : "—"}</td>${hasOther ? `<td>${other || "—"}</td>` : ""}`;
    els.historyRows.append(row);
  });
}

function openImportDialog() {
  stagedNights = [];
  els.fileInput.value = "";
  els.importPreview.hidden = true;
  els.importMessage.textContent = "";
  els.manualDate.value = todayPacific();
  els.confirmImport.disabled = isDemo;
  if (isDemo)
    els.importMessage.textContent =
      "Preview only. You can inspect files here, but importing requires sign-in.";
  els.importDialog.showModal();
}

async function handleFiles(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  els.importMessage.textContent = `Reading ${files.length} file${files.length === 1 ? "" : "s"}…`;

  try {
    const parsed = [];
    for (const file of files) {
      const text = await file.text();
      parsed.push(...parseSleepExport(text, file.name));
    }
    stagedNights = dedupeNights(parsed);
    if (!stagedNights.length)
      throw new Error("No recognizable sleep rows were found.");
    renderImportPreview();
    els.importMessage.textContent = "Review the count, then import when ready.";
  } catch (error) {
    console.error(error);
    stagedNights = [];
    els.importPreview.hidden = true;
    els.importMessage.textContent =
      error.message || "That export could not be read.";
  }
}

function stageManualNight() {
  const score = Number(els.manualScore.value);
  const hours = Number(els.manualDuration.value);
  if (
    !els.manualScore.value.trim() ||
    !els.manualDate.value ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    els.importMessage.textContent =
      "Add a wake date and a score between 0 and 100.";
    return;
  }

  stagedNights = dedupeNights([
    ...stagedNights,
    cleanNight({
      sleepDate: els.manualDate.value,
      source: els.manualSource.value,
      score,
      scoreKind: "native",
      durationMinutes:
        Number.isFinite(hours) && hours > 0 ? hours * 60 : undefined,
    }),
  ]);
  renderImportPreview();
  els.importMessage.textContent = "Manual night added to this import.";
  els.manualScore.value = "";
  els.manualDuration.value = "";
}

function renderImportPreview() {
  const sources = [
    ...new Set(stagedNights.map((night) => SOURCE_LABELS[night.source])),
  ];
  els.previewCount.textContent = `${stagedNights.length} night${stagedNights.length === 1 ? "" : "s"} ready`;
  els.previewSources.textContent = sources.join(" · ");
  els.importPreview.hidden = false;
}

async function importStagedNights() {
  if (!stagedNights.length || isDemo) return;
  els.confirmImport.disabled = true;
  els.confirmImport.textContent = "Importing…";
  els.importMessage.textContent = "Saving your sleep history…";

  try {
    let inserted = 0;
    let updated = 0;
    const batchId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    for (let index = 0; index < stagedNights.length; index += 500) {
      const result = await convexMutation("sleep:importNights", {
        importBatchId: batchId,
        nights: stagedNights.slice(index, index + 500),
      });
      inserted += result.inserted;
      updated += result.updated;
    }
    els.importMessage.textContent = `${inserted} added · ${updated} updated.`;
    await loadDashboard();
    setTimeout(() => els.importDialog.close(), 700);
  } catch (error) {
    console.error(error);
    els.importMessage.textContent =
      error.message || "Import failed. Try again.";
  } finally {
    els.confirmImport.disabled = false;
    els.confirmImport.textContent = "Import to Daylight";
  }
}

function parseSleepExport(text, filename) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (
    trimmed.startsWith("<") &&
    /HealthData|HKCategoryTypeIdentifierSleepAnalysis/.test(trimmed)
  ) {
    return parseAppleHealthXml(trimmed);
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonExport(JSON.parse(trimmed), filename);
  }
  return parseCsvExport(trimmed, filename);
}

function parseJsonExport(data, filename) {
  const rows = Array.isArray(data)
    ? data
    : data.records || data.sleeps || data.data || [];
  if (!Array.isArray(rows)) return [];
  return normalizeRows(rows, filename);
}

function parseCsvExport(text, filename) {
  const matrix = parseCsv(text);
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(normalizeHeader);
  const rows = matrix
    .slice(1)
    .map((cells) =>
      Object.fromEntries(
        headers.map((header, index) => [header, cells[index] || ""]),
      ),
    );
  return normalizeRows(rows, filename);
}

function normalizeRows(rows, filename) {
  const fallbackSource = inferSource(filename);
  return rows
    .map((row) => {
      const normalized = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          normalizeHeader(key),
          value,
        ]),
      );
      const source =
        inferSource(
          String(
            firstValue(normalized, [
              "source",
              "provider",
              "device",
              "source_name",
            ]) || filename,
          ),
        ) || fallbackSource;
      const dateValue = firstValue(normalized, [
        "wake_onset",
        "woke_at",
        "end",
        "end_time",
        "sleep_end",
        "date",
        "sleep_date",
        "cycle_start_time",
        "start",
      ]);
      const scoreValue = firstValue(normalized, [
        "sleep_performance_percentage",
        "sleep_performance",
        "sleep_score",
        "quality_score",
        "overall_score",
        "score",
      ]);
      const durationValue = firstValue(normalized, [
        "asleep_duration_min",
        "asleep_duration",
        "sleep_duration_minutes",
        "total_sleep_minutes",
        "total_sleep_time",
        "duration_minutes",
        "duration",
      ]);
      const durationMinutes = parseDurationMinutes(durationValue, normalized);
      const scoreNumber = parseMetric(scoreValue);
      const sleepDate = normalizeDate(dateValue);
      if (
        !sleepDate ||
        (!Number.isFinite(scoreNumber) && !Number.isFinite(durationMinutes))
      )
        return null;
      const nativeScore = Number.isFinite(scoreNumber);

      return cleanNight({
        sleepDate,
        source: source || "manual",
        score: nativeScore ? scoreNumber : durationScore(durationMinutes),
        scoreKind: nativeScore ? "native" : "derived",
        durationMinutes,
        efficiency: parseMetric(
          firstValue(normalized, [
            "sleep_efficiency_percentage",
            "sleep_efficiency",
            "efficiency",
          ]),
        ),
        hrv: parseMetric(
          firstValue(normalized, ["hrv_rmssd_milli", "hrv", "average_hrv"]),
        ),
        restingHeartRate: parseMetric(
          firstValue(normalized, [
            "resting_heart_rate",
            "rhr",
            "average_heart_rate",
          ]),
        ),
        deepMinutes: parseDurationMinutes(
          firstValue(normalized, [
            "deep_sleep_minutes",
            "slow_wave_sleep_minutes",
            "deep_minutes",
          ]),
          normalized,
        ),
        remMinutes: parseDurationMinutes(
          firstValue(normalized, ["rem_sleep_minutes", "rem_minutes"]),
          normalized,
        ),
        asleepAt: normalizeTimestamp(
          firstValue(normalized, [
            "sleep_onset",
            "asleep_at",
            "start",
            "start_time",
          ]),
        ),
        wokeAt: normalizeTimestamp(
          firstValue(normalized, ["wake_onset", "woke_at", "end", "end_time"]),
        ),
      });
    })
    .filter(Boolean);
}

function parseAppleHealthXml(text) {
  const documentNode = new DOMParser().parseFromString(text, "application/xml");
  if (documentNode.querySelector("parsererror"))
    throw new Error("Apple Health XML is not valid.");
  const groups = new Map();
  const records = [
    ...documentNode.querySelectorAll(
      "Record[type='HKCategoryTypeIdentifierSleepAnalysis']",
    ),
  ];

  records.forEach((record) => {
    const value = record.getAttribute("value") || "";
    if (!/(Asleep|Core|Deep|REM)/i.test(value) || /Awake|InBed/i.test(value))
      return;
    const start = parseAppleDate(record.getAttribute("startDate"));
    const end = parseAppleDate(record.getAttribute("endDate"));
    if (!start || !end || end <= start) return;
    const sourceName = record.getAttribute("sourceName") || "Apple Health";
    if (/whoop/i.test(sourceName)) return; // Do not compare WHOOP with its own Health export.
    const source = /eight/i.test(sourceName) ? "eightsleep" : "apple_health";
    if (!groups.has(source)) groups.set(source, []);
    groups
      .get(source)
      .push({ start: start.getTime(), end: end.getTime(), value });
  });

  // Keep an overnight session together across midnight. Separate naps after a
  // three-hour gap; choose the longest session for each Pacific wake date.
  const byWakeDate = new Map();
  groups.forEach((records, source) => {
    const sessions = [];
    records
      .sort((a, b) => a.start - b.start)
      .forEach((record) => {
        let session = sessions.at(-1);
        if (!session || record.start - session.end > 3 * 60 * 60 * 1000) {
          session = {
            start: record.start,
            end: record.end,
            intervals: [],
            deep: [],
            rem: [],
          };
          sessions.push(session);
        }
        session.end = Math.max(session.end, record.end);
        const interval = [record.start, record.end];
        session.intervals.push(interval);
        if (/Deep/i.test(record.value)) session.deep.push(interval);
        if (/REM/i.test(record.value)) session.rem.push(interval);
      });
    sessions.forEach((session) => {
      const durationMinutes = mergedIntervalMinutes(session.intervals);
      if (durationMinutes < 60) return;
      const sleepDate = dateInTimeZone(
        new Date(session.end),
        "America/Los_Angeles",
      );
      const key = `${source}:${sleepDate}`;
      if ((byWakeDate.get(key)?.durationMinutes || 0) >= durationMinutes)
        return;
      byWakeDate.set(
        key,
        cleanNight({
          sleepDate,
          source,
          score: durationScore(durationMinutes),
          scoreKind: "derived",
          durationMinutes,
          deepMinutes: session.deep.length
            ? mergedIntervalMinutes(session.deep)
            : undefined,
          remMinutes: session.rem.length
            ? mergedIntervalMinutes(session.rem)
            : undefined,
          asleepAt: new Date(session.start).toISOString(),
          wokeAt: new Date(session.end).toISOString(),
        }),
      );
    });
  });
  return [...byWakeDate.values()];
}

function cleanNight(night) {
  const cleaned = {
    sleepDate: night.sleepDate,
    source: SOURCE_LABELS[night.source] ? night.source : "manual",
    score: clamp(Math.round(Number(night.score) * 10) / 10, 0, 100),
    scoreKind: night.scoreKind === "derived" ? "derived" : "native",
  };
  [
    "durationMinutes",
    "efficiency",
    "hrv",
    "restingHeartRate",
    "deepMinutes",
    "remMinutes",
  ].forEach((key) => {
    if (Number.isFinite(night[key]))
      cleaned[key] = Math.round(Number(night[key]) * 10) / 10;
  });
  if (night.asleepAt) cleaned.asleepAt = night.asleepAt;
  if (night.wokeAt) cleaned.wokeAt = night.wokeAt;
  return cleaned;
}

function dedupeNights(nights) {
  const map = new Map();
  nights
    .filter(Boolean)
    .forEach((night) => map.set(`${night.source}:${night.sleepDate}`, night));
  return [...map.values()].sort((a, b) =>
    a.sleepDate.localeCompare(b.sleepDate),
  );
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/%/g, " percentage ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function firstValue(object, keys) {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== "")
      return object[key];
  }
  return undefined;
}

function inferSource(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("whoop")) return "whoop";
  if (text.includes("eight") || text.includes("8sleep")) return "eightsleep";
  if (text.includes("apple") || text.includes("health")) return "apple_health";
  return "manual";
}

function parseMetric(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(String(value).replace(/[%,$]/g, "").trim());
  return Number.isFinite(number) ? number : undefined;
}

function parseDurationMinutes(value, row = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
    const parts = text.split(":").map(Number);
    return parts.length === 3
      ? parts[0] * 60 + parts[1] + parts[2] / 60
      : parts[0] * 60 + parts[1];
  }
  const number = parseMetric(text);
  if (!Number.isFinite(number)) return undefined;
  const headerText = Object.entries(row)
    .filter(([, candidate]) => candidate === value)
    .map(([key]) => key)
    .join(" ");
  if (number > 100000 || /milli/.test(headerText)) return number / 60000;
  if (number <= 24 && /hour/.test(headerText)) return number * 60;
  if (number > 1440 && number < 100000) return number / 60;
  return number;
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const date = new Date(text);
  return Number.isNaN(date.getTime())
    ? null
    : dateInTimeZone(date, "America/Los_Angeles");
}

function normalizeTimestamp(value) {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseAppleDate(value) {
  if (!value) return null;
  const normalized = value
    .replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2")
    .replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mergedIntervalMinutes(intervals) {
  if (!intervals.length) return 0;
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [start, end] = sorted[0];
  sorted.slice(1).forEach(([nextStart, nextEnd]) => {
    if (nextStart <= end) end = Math.max(end, nextEnd);
    else {
      total += end - start;
      start = nextStart;
      end = nextEnd;
    }
  });
  total += end - start;
  return Math.round(total / 6000) / 10;
}

function durationScore(minutes) {
  if (!Number.isFinite(minutes)) return 0;
  if (minutes <= 480) return clamp((minutes / 480) * 100, 0, 100);
  return clamp(100 - ((minutes - 480) / 240) * 15, 70, 100);
}

function groupNightsByDate(rows) {
  const grouped = new Map();
  rows.forEach((record) => {
    if (!grouped.has(record.sleepDate))
      grouped.set(record.sleepDate, { records: [], aggregate: 0 });
    grouped.get(record.sleepDate).records.push(record);
  });
  grouped.forEach((night) => {
    night.aggregate = average(night.records.map((record) => record.score));
  });
  return grouped;
}

function linearRegression(points) {
  const xMean = average(points.map((point) => point.x));
  const yMean = average(points.map((point) => point.y));
  const numerator = points.reduce(
    (sum, point) => sum + (point.x - xMean) * (point.y - yMean),
    0,
  );
  const denominator = points.reduce(
    (sum, point) => sum + (point.x - xMean) ** 2,
    0,
  );
  const slope = denominator ? numerator / denominator : 0;
  return { slope, intercept: yMean - slope * xMean };
}

function pearson(xs, ys) {
  const xMean = average(xs);
  const yMean = average(ys);
  const numerator = xs.reduce(
    (sum, xValue, index) => sum + (xValue - xMean) * (ys[index] - yMean),
    0,
  );
  const xSpread = Math.sqrt(
    xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0),
  );
  const ySpread = Math.sqrt(
    ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0),
  );
  return xSpread && ySpread ? numerator / (xSpread * ySpread) : 0;
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return { ctx, width: rect.width, height: rect.height };
}

function downloadNoonReminder() {
  const date = todayPacific().replaceAll("-", "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Daylight Sleep Lab//Noon Alertness//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:daylight-noon-${date}@johnta.com`,
    `DTSTART;TZID=America/Los_Angeles:${date}T120000`,
    "DURATION:PT5M",
    "RRULE:FREQ=DAILY",
    "SUMMARY:Rate noon alertness in Daylight",
    "DESCRIPTION:Log a 1–10 alertness rating in your personal sleep dashboard.",
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    "DESCRIPTION:How alert do you feel right now?",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "daylight-noon-alertness.ics";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function convexQuery(path, args) {
  return convexCall("query", path, args);
}
async function convexMutation(path, args) {
  return convexCall("mutation", path, args);
}
async function convexAction(path, args) {
  return convexCall("action", path, args);
}

async function convexCall(kind, path, args) {
  if (isDemo) {
    if (kind === "query" && path === "sleep:dashboard") return demoData;
    if (kind === "mutation" && path === "sleep:saveAlertness") {
      demoData.alertness = demoData.alertness.filter(
        (row) => row.ratingDate !== args.ratingDate,
      );
      demoData.alertness.push({ ...args, updatedAt: Date.now() });
      return;
    }
    throw new Error("Sample workspace: sign in to connect or save data.");
  }
  const token = await getConvexToken();
  if (!token) throw new Error("Not authenticated with Clerk.");
  const response = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, args }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") {
    const detail = result.errorMessage || result.message || result.code;
    throw new Error(detail || `Data ${kind} failed.`);
  }
  return result.value;
}

async function getConvexToken() {
  const session = window.Clerk?.session;
  if (!session) return null;

  const sessionToken = await session.getToken();
  const audience = readJwtPayload(sessionToken)?.aud;
  if (
    audience === "convex" ||
    (Array.isArray(audience) && audience.includes("convex"))
  ) {
    return sessionToken;
  }

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

function todayPacific() {
  return dateInTimeZone(new Date(), "America/Los_Angeles");
}

function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function currentPacificHour() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
}

function addDays(isoDate, amount) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatTinyDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatTableDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  }).format(date);
}

function formatDuration(minutes) {
  return Daylight.duration(minutes);
}

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = String(value);
  return span.innerHTML;
}

function drawGroupChart() {
  $("#friendSample").hidden = !isDemo && !liveGroup;
  if (!isDemo && !liveGroup) return;
  if (!groupSample) groupSample = Daylight.sampleGroup(todayPacific());
  const metric = $("#groupMetric").value;
  const metricName = $("#groupMetric").selectedOptions[0].textContent;
  groupHistory = Daylight.groupHistory(groupSample.filter(member => visibleGroupMembers.has(member.id)), metric, selectedDays, todayPacific());
  $("#groupPeriod").textContent = `${formatShortDate(groupHistory.dates[0])} – ${formatShortDate(groupHistory.dates.at(-1))} · WHOOP`;
  $("#groupMetricHeading").textContent = metricName;
  $("#groupBaselineNote").textContent = `Compared with each person’s previous ${selectedDays} days. Only tracked days count. HRV and resting heart rate are personal measures.`;
  if (!$("#groupMembers").children.length) {
    $("#groupMembers").innerHTML = groupSample.map(member => `<button type="button" data-member="${member.id}" aria-pressed="${visibleGroupMembers.has(member.id)}" style="--member-color:${member.color}"><span class="group-member-name"><svg width="22" height="12" aria-hidden="true"><line x1="0" x2="22" y1="6" y2="6" stroke="currentColor" stroke-width="3" stroke-dasharray="${member.dash}"/></svg>${escapeHtml(member.name.replace(' (sample)', ''))}</span><strong class="group-member-value"></strong></button>`).join("");
    $("#groupMembers").querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
      const id = button.dataset.member;
      if (visibleGroupMembers.has(id)) visibleGroupMembers.delete(id); else visibleGroupMembers.add(id);
      button.setAttribute("aria-pressed", String(visibleGroupMembers.has(id)));
      drawGroupChart();
    }));
  }
  const unit = Daylight.metrics[metric].unit;
  const percent = unit === "%";
  const w = Math.max(240, $("#groupPlot").clientWidth || 900);
  const h = w < 500 ? 240 : 280, left = 44, right = 22, top = 24, bottom = 34;
  const values = groupHistory.members.flatMap(member => member.points.map(point => point.value)).filter(Number.isFinite);
  const maximum = Math.max(...values, percent ? 100 : metric === "strain" ? 21 : 1);
  const span = maximum - Math.min(...values, 0);
  const rawStep = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep || 1));
  const step = percent ? 25 : metric === "strain" ? 7 : unit === "min" ? (rawStep <= 30 ? 30 : rawStep <= 60 ? 60 : Math.ceil(rawStep / 120) * 120) : Math.max(metric === "workoutCount" ? 1 : .1, [1,2,5,10].find(n => n * magnitude >= rawStep) * magnitude);
  const lower = 0;
  const upper = percent ? Math.max(100, Math.ceil(maximum / step) * step) : Math.ceil(maximum / step) * step;
  const x = index => left + index / (selectedDays - 1) * (w - left - right);
  const y = value => top + (1 - (value - lower) / (upper - lower)) * (h - top - bottom);
  groupGeometry = { w, h, x, y, left, right };
  const ticks = Array.from({length: Math.round((upper - lower) / step) + 1}, (_, i) => lower + i * step);
  const grid = ticks.map(value => `<line x1="${left}" x2="${w - right}" y1="${y(value)}" y2="${y(value)}" stroke="#e4eae5" stroke-dasharray="3 5"/><text x="0" y="${y(value) + 4}" fill="#6d7c75" font-size="12">${percent ? `${value}%` : unit === "min" ? (metric === "durationMinutes" ? `${Number((value / 60).toFixed(1))}h` : `${value}m`) : Number(value.toFixed(1))}</text>`).join("");
  const labelCount = selectedDays === 7 && w > 500 ? 7 : w < 400 ? 3 : 5;
  const labels = Array.from({length: labelCount}, (_, i) => Math.round(i * (selectedDays - 1) / (labelCount - 1))).map(i => `<text x="${x(i)}" y="${h - 5}" text-anchor="${i === 0 ? "start" : i === selectedDays - 1 ? "end" : "middle"}" fill="#6d7c75" font-size="12">${formatShortDate(groupHistory.dates[i])}</text>`).join("");
  const series = groupHistory.members.map(member => member.segments.map(segment => `<path d="${segment.map((point, i) => `${i ? "L" : "M"}${x(point.index)},${y(point.value)}`).join(" ")}" fill="none" stroke="${member.color}" stroke-width="2.5" stroke-dasharray="${member.dash}" stroke-linecap="round" stroke-linejoin="round"/>${segment.map(point => `<circle cx="${x(point.index)}" cy="${y(point.value)}" r="${selectedDays > 28 ? 1.8 : 3.5}" fill="${member.color}"/>`).join("")}`).join("")).join("");
  $("#groupPlot").innerHTML = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">${grid}${labels}${series}<line id="groupCursor" y1="${top}" y2="${h - bottom}" stroke="#82958a" stroke-dasharray="3 3"/><g id="groupActivePoints"></g></svg>`;
  const plot = $("#groupPlot");
  const explore = event => {
    if (!groupHistory.members.length) return;
    const rect = plot.getBoundingClientRect();
    const px = (event.clientX - rect.left) * w / rect.width;
    showGroupDay(Math.round((px - left) / (w - left - right) * (selectedDays - 1)), true);
  };
  plot.onpointermove = event => { if (event.pointerType !== "touch") explore(event); };
  plot.onclick = explore;
  plot.onpointerleave = () => { $("#groupTooltip").hidden = true; };
  plot.onblur = () => { $("#groupTooltip").hidden = true; };
  plot.onkeydown = event => {
    const current = groupHistory.dates.indexOf(groupSelectedDate);
    const moves = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: selectedDays - 1 };
    if (event.key in moves) { event.preventDefault(); showGroupDay(moves[event.key], true); }
    if (event.key === "Escape") $("#groupTooltip").hidden = true;
  };
  $("#groupEmpty").hidden = values.length > 0;
  $("#groupEmpty").textContent = !groupHistory.members.length
    ? "Select a person above to show their history."
    : !isDemo && !liveGroup.members.some(member => member.metrics.includes(metric))
      ? "This metric isn’t shared yet. Open Your sharing to choose what to share."
      : "No shared data in this period. Enable recovery & activity in Connections, or choose a longer sharing window.";
  $("#groupSummaryRows").innerHTML = groupHistory.members.map(member => {
    const deltaUnit = unit === '%' ? 'pts' : unit === '/21' ? 'strain' : unit;
    const delta = member.delta === null ? "Not enough history" : `${member.delta > 0 ? "+" : member.delta < 0 ? "−" : ""}${Math.abs(member.delta).toFixed(1)} ${deltaUnit}`;
    return `<tr><th scope="row"><span class="group-person-marker" style="background:${member.color}"></span>${escapeHtml(member.name.replace(' (sample)', ''))}</th><td>${formatMemberValue(member, member.average)}</td><td>${delta}<small class="group-coverage">${member.previousCount} / ${selectedDays} previous days</small></td><td>${member.count} / ${selectedDays}</td></tr>`;
  }).join("") || '<tr><td colspan="4">Select a person above to compare.</td></tr>';
  const selected = groupHistory.dates.indexOf(groupSelectedDate);
  showGroupDay(selected >= 0 ? selected : selectedDays - 1);
  renderStandings();
}

function formatGroupValue(value) {
  if (!Number.isFinite(value)) return "No data";
  return formatMetricValue(value, $("#groupMetric").value);
}

function showGroupDay(index, tooltip = false) {
  if (!groupHistory || !groupGeometry) return;
  index = clamp(index, 0, groupHistory.dates.length - 1);
  groupSelectedDate = groupHistory.dates[index];
  const {x, y, w} = groupGeometry;
  $("#groupSelectedDate").textContent = formatTableDate(groupSelectedDate);
  $("#groupCursor").setAttribute("x1", x(index));
  $("#groupCursor").setAttribute("x2", x(index));
  $("#groupCursor").setAttribute("visibility", groupHistory.members.length ? "visible" : "hidden");
  $("#groupActivePoints").innerHTML = groupHistory.members.filter(member => Number.isFinite(member.points[index].value)).map(member => `<circle cx="${x(index)}" cy="${y(member.points[index].value)}" r="6" fill="${member.color}" stroke="white" stroke-width="2.5"/>`).join("");
  $("#groupMembers").querySelectorAll("button").forEach(button => {
    const member = groupHistory.members.find(member => member.id === button.dataset.member);
    button.querySelector(".group-member-value").textContent = member ? formatMemberValue(member, member.points[index].value) : "Hidden";
  });
  const rows = groupHistory.members.map(member => `<div><span><i class="group-person-marker" style="background:${member.color}"></i>${escapeHtml(member.name.replace(' (sample)', ''))}</span><strong>${formatMemberValue(member, member.points[index].value)}</strong></div>`).join("");
  const tip = $("#groupTooltip");
  tip.innerHTML = `<p>${formatTableDate(groupSelectedDate)}</p>${rows}`;
  tip.hidden = !tooltip || !groupHistory.members.length;
  const tipWidth = Math.min(210, w - 16);
  tip.style.width = `${tipWidth}px`;
  tip.style.left = `${clamp(x(index) + (x(index) < w / 2 ? 18 : -tipWidth - 18), 8, w - tipWidth - 8)}px`;
  $("#groupChartStatus").textContent = `${formatTableDate(groupSelectedDate)}. ${groupHistory.members.map(member => `${member.name}: ${formatMemberValue(member, member.points[index].value)}`).join('. ')}`;
}

function formatMemberValue(member, value) {
  const sharing = !isDemo && liveGroup?.members.find(item => item.id === member.id);
  if (sharing && !sharing.metrics.includes($("#groupMetric").value)) return "Not shared";
  return formatGroupValue(value);
}
