const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const TOKEN_KEY = "daylight:access-token";
const SOURCE_LABELS = {
  whoop: "Whoop",
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
  accessForm: document.querySelector("#accessForm"),
  accessInput: document.querySelector("#accessInput"),
  accessError: document.querySelector("#accessError"),
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
  appleStatus: document.querySelector("#appleStatus"),
  eightStatus: document.querySelector("#eightStatus"),
  trendChart: document.querySelector("#trendChart"),
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

let accessToken = sessionStorage.getItem(TOKEN_KEY) || "";
let sleepNights = [];
let alertnessRatings = [];
let stagedNights = [];
let selectedRating = null;
let chartResizeTimer;

init();

function init() {
  buildRatingScale();
  els.manualDate.value = todayPacific();
  els.heroDate.textContent = formatLongDate(todayPacific());
  bindEvents();

  if (accessToken) {
    verifyAndUnlock().catch(() => lockDashboard(false));
  } else {
    els.accessInput.focus();
  }
}

function bindEvents() {
  els.accessForm.addEventListener("submit", handleAccessSubmit);
  els.lockButton.addEventListener("click", () => lockDashboard(true));
  document.querySelectorAll("[data-open-import]").forEach((button) => {
    button.addEventListener("click", openImportDialog);
  });
  els.fileInput.addEventListener("change", handleFiles);
  els.addManual.addEventListener("click", stageManualNight);
  els.confirmImport.addEventListener("click", importStagedNights);
  els.saveAlertness.addEventListener("click", saveTodayAlertness);
  els.alertnessNote.addEventListener("input", updateSaveButton);
  els.reminderButton.addEventListener("click", downloadNoonReminder);
  window.addEventListener("resize", () => {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(renderCharts, 100);
  });
}

async function handleAccessSubmit(event) {
  event.preventDefault();
  els.accessError.hidden = true;
  const button = els.accessForm.querySelector("button[type='submit']");
  button.disabled = true;
  button.querySelector("span:first-child").textContent = "Checking…";

  try {
    accessToken = await sha256(els.accessInput.value);
    await convexQuery("sleep:verify", { accessToken });
    sessionStorage.setItem(TOKEN_KEY, accessToken);
    els.accessInput.value = "";
    await unlockDashboard();
  } catch (error) {
    console.error(error);
    accessToken = "";
    sessionStorage.removeItem(TOKEN_KEY);
    els.accessError.hidden = false;
    els.accessInput.select();
  } finally {
    button.disabled = false;
    button.querySelector("span:first-child").textContent = "Open my dashboard";
  }
}

async function verifyAndUnlock() {
  await convexQuery("sleep:verify", { accessToken });
  await unlockDashboard();
}

async function unlockDashboard() {
  els.gate.hidden = true;
  els.app.hidden = false;
  await loadDashboard();
}

function lockDashboard(focusInput) {
  accessToken = "";
  sleepNights = [];
  alertnessRatings = [];
  sessionStorage.removeItem(TOKEN_KEY);
  els.app.hidden = true;
  els.gate.hidden = false;
  if (focusInput) els.accessInput.focus();
}

async function loadDashboard() {
  els.lastUpdated.textContent = "Refreshing…";
  const endDate = todayPacific();
  const startDate = addDays(endDate, -365);

  try {
    const data = await convexQuery("sleep:dashboard", { accessToken, startDate, endDate });
    sleepNights = data.nights || [];
    alertnessRatings = data.alertness || [];
    renderDashboard();
    els.lastUpdated.textContent = `Updated ${formatTime(new Date())}`;
  } catch (error) {
    console.error(error);
    if (/access code|Invalid sleep/i.test(error.message)) {
      lockDashboard(true);
      return;
    }
    els.lastUpdated.textContent = "Could not refresh";
  }
}

function renderDashboard() {
  const grouped = groupNightsByDate(sleepNights);
  const dates = [...grouped.keys()].sort();
  const latestDate = dates.at(-1);
  const latest = latestDate ? grouped.get(latestDate) : null;

  if (latest) {
    els.latestScore.textContent = Math.round(latest.aggregate);
    els.latestScoreLabel.textContent = describeScore(latest.aggregate);
    els.orbitNote.textContent = `${formatShortDate(latestDate)} · ${latest.records.length} source${latest.records.length === 1 ? "" : "s"}`;
    const recentDates = dates.slice(-7);
    const recentAverage = average(recentDates.map((date) => grouped.get(date).aggregate));
    els.heroSummary.textContent = `Your latest aggregate is ${Math.round(latest.aggregate)}. Over the last ${recentDates.length} tracked night${recentDates.length === 1 ? "" : "s"}, you averaged ${Math.round(recentAverage)} across ${new Set(sleepNights.map((row) => row.source)).size} source${new Set(sleepNights.map((row) => row.source)).size === 1 ? "" : "s"}.`;
  } else {
    els.latestScore.textContent = "—";
    els.latestScoreLabel.textContent = "No data yet";
    els.orbitNote.textContent = "Your latest night";
    els.heroSummary.textContent = "Import your first sleep history to start finding the pattern between sleep and how you feel.";
  }

  renderSourceCard("whoop", els.whoopScore, els.whoopStatus);
  renderSourceCard("apple_health", els.appleScore, els.appleStatus);
  renderSourceCard("eightsleep", els.eightScore, els.eightStatus);
  renderCheckin();
  renderCharts();
  renderHistory(grouped);
}

function renderSourceCard(source, scoreElement, statusElement) {
  const records = sleepNights.filter((row) => row.source === source).sort((a, b) => a.sleepDate.localeCompare(b.sleepDate));
  const latest = records.at(-1);
  scoreElement.textContent = latest ? Math.round(latest.score) : "—";
  statusElement.textContent = latest
    ? `${formatShortDate(latest.sleepDate)} · ${latest.scoreKind === "derived" ? "derived" : "native"} score`
    : "Awaiting import";
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
    els.ratingScale.append(button);
  }
}

function selectRating(score) {
  selectedRating = score;
  els.ratingScale.querySelectorAll(".rating-button").forEach((button, index) => {
    const selected = index + 1 === score;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  updateSaveButton();
}

function renderCheckin() {
  const today = todayPacific();
  const existing = alertnessRatings.find((row) => row.ratingDate === today);
  selectedRating = existing?.score ?? null;
  els.alertnessNote.value = existing?.note || "";
  els.ratingScale.querySelectorAll(".rating-button").forEach((button, index) => {
    const selected = index + 1 === selectedRating;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
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
  const existing = alertnessRatings.find((row) => row.ratingDate === todayPacific());
  const changed = selectedRating && (selectedRating !== existing?.score || els.alertnessNote.value.trim() !== (existing?.note || ""));
  els.saveAlertness.disabled = !selectedRating || !changed;
  els.saveAlertness.textContent = existing ? "Update today’s check-in" : "Save today’s check-in";
}

async function saveTodayAlertness() {
  if (!selectedRating) return;
  els.saveAlertness.disabled = true;
  els.checkinMessage.textContent = "Saving…";
  try {
    await convexMutation("sleep:saveAlertness", {
      accessToken,
      ratingDate: todayPacific(),
      score: selectedRating,
      note: els.alertnessNote.value.trim() || undefined,
      timezone: "America/Los_Angeles",
    });
    await loadDashboard();
    els.checkinMessage.textContent = "Saved. One more useful data point.";
  } catch (error) {
    console.error(error);
    els.checkinMessage.textContent = "Could not save. Try again.";
    els.saveAlertness.disabled = false;
  }
}

function renderCharts() {
  if (els.app.hidden) return;
  const grouped = groupNightsByDate(sleepNights);
  drawTrendChart(grouped);
  drawScatterChart(grouped);
}

function drawTrendChart(grouped) {
  const context = prepareCanvas(els.trendChart);
  if (!context) return;
  const { ctx, width, height } = context;
  const allDates = [...grouped.keys()].sort();
  els.trendEmpty.hidden = allDates.length > 0;
  if (!allDates.length) return;

  const endDate = allDates.at(-1);
  const dates = Array.from({ length: 28 }, (_, index) => addDays(endDate, index - 27));
  const pad = { top: 18, right: 18, bottom: 34, left: 38 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (index / Math.max(1, dates.length - 1)) * plotWidth;
  const y = (value) => pad.top + (1 - value / 100) * plotHeight;

  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillStyle = "#7a857e";
  ctx.strokeStyle = "#dfe3dc";
  ctx.lineWidth = 1;
  [25, 50, 75, 100].forEach((tick) => {
    ctx.beginPath();
    ctx.moveTo(pad.left, y(tick));
    ctx.lineTo(width - pad.right, y(tick));
    ctx.stroke();
    ctx.fillText(String(tick), 6, y(tick) + 4);
  });

  [0, 7, 14, 21, 27].forEach((index) => {
    ctx.fillText(formatTinyDate(dates[index]), x(index) - (index === 27 ? 28 : 12), height - 8);
  });

  ["whoop", "apple_health", "eightsleep", "manual"].forEach((source) => {
    const points = dates.map((date, index) => {
      const row = grouped.get(date)?.records.find((record) => record.source === source);
      return row ? { x: x(index), y: y(row.score) } : null;
    });
    drawSeries(ctx, points, SOURCE_COLORS[source], 1.2, [4, 5], 2.2);
  });

  const aggregatePoints = dates.map((date, index) => {
    const night = grouped.get(date);
    return night ? { x: x(index), y: y(night.aggregate) } : null;
  });
  drawSeries(ctx, aggregatePoints, "#17231e", 2.5, [], 3.2);
}

function drawSeries(ctx, points, color, lineWidth, dash, pointRadius) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  let open = false;
  ctx.beginPath();
  points.forEach((point) => {
    if (!point) {
      open = false;
      return;
    }
    if (!open) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
    open = true;
  });
  ctx.stroke();
  ctx.setLineDash([]);
  points.filter(Boolean).forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawScatterChart(grouped) {
  const context = prepareCanvas(els.scatterChart);
  if (!context) return;
  const { ctx, width, height } = context;
  const ratingByDate = new Map(alertnessRatings.map((row) => [row.ratingDate, row]));
  const pairs = [...grouped.entries()]
    .filter(([date]) => ratingByDate.has(date))
    .map(([date, night]) => ({ x: night.aggregate, y: ratingByDate.get(date).score, date }));

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
    ctx.beginPath(); ctx.moveTo(pad.left, y(tick)); ctx.lineTo(width - pad.right, y(tick)); ctx.stroke();
    ctx.fillText(String(tick), 15, y(tick) + 3);
  });
  [0, 25, 50, 75, 100].forEach((tick) => ctx.fillText(String(tick), x(tick) - 7, height - 8));

  const regression = linearRegression(pairs);
  ctx.strokeStyle = "#a9b2aa";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x(0), y(clamp(regression.intercept, 1, 10)));
  ctx.lineTo(x(100), y(clamp(regression.intercept + regression.slope * 100, 1, 10)));
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

  const correlation = pearson(pairs.map((pair) => pair.x), pairs.map((pair) => pair.y));
  const strength = Math.abs(correlation) < 0.2 ? "Very weak" : Math.abs(correlation) < 0.4 ? "Weak" : Math.abs(correlation) < 0.65 ? "Moderate" : "Strong";
  els.correlationBadge.textContent = `${correlation >= 0 ? "+" : ""}${correlation.toFixed(2)} correlation`;
  els.correlationBadge.className = `correlation-badge ${correlation >= 0.15 ? "positive" : correlation <= -0.15 ? "negative" : ""}`;
  els.signalLabel.textContent = `${strength} ${correlation >= 0 ? "positive" : "negative"}`;
  const best = [...pairs].sort((a, b) => b.y - a.y).slice(0, Math.max(1, Math.ceil(pairs.length / 3)));
  els.sweetSpot.textContent = `${Math.round(average(best.map((pair) => pair.x)))}+ sleep`;
}

function renderHistory(grouped) {
  const ratingByDate = new Map(alertnessRatings.map((row) => [row.ratingDate, row]));
  const rows = [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  els.historyEmpty.hidden = rows.length > 0;
  els.historyRows.replaceChildren();

  rows.forEach(([date, night]) => {
    const row = document.createElement("tr");
    const durations = night.records.map((record) => record.durationMinutes).filter(Number.isFinite);
    const duration = durations.length ? average(durations) : null;
    const rating = ratingByDate.get(date);
    row.innerHTML = `
      <td>${escapeHtml(formatTableDate(date))}</td>
      <td><strong>${Math.round(night.aggregate)}</strong></td>
      <td><div class="source-chips">${night.records.map((record) => `<span class="source-chip">${escapeHtml(SOURCE_LABELS[record.source])}</span>`).join("")}</div></td>
      <td>${duration ? formatDuration(duration) : "—"}</td>
      <td>${rating ? `<span class="alertness-cell"><strong>${rating.score}</strong><i style="--rating-width:${rating.score * 10}%"></i></span>` : "—"}</td>
    `;
    els.historyRows.append(row);
  });
}

function openImportDialog() {
  stagedNights = [];
  els.fileInput.value = "";
  els.importPreview.hidden = true;
  els.importMessage.textContent = "";
  els.manualDate.value = todayPacific();
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
    if (!stagedNights.length) throw new Error("No recognizable sleep rows were found.");
    renderImportPreview();
    els.importMessage.textContent = "Review the count, then import when ready.";
  } catch (error) {
    console.error(error);
    stagedNights = [];
    els.importPreview.hidden = true;
    els.importMessage.textContent = error.message || "That export could not be read.";
  }
}

function stageManualNight() {
  const score = Number(els.manualScore.value);
  const hours = Number(els.manualDuration.value);
  if (!els.manualDate.value || !Number.isFinite(score) || score < 0 || score > 100) {
    els.importMessage.textContent = "Add a wake date and a score between 0 and 100.";
    return;
  }

  stagedNights = dedupeNights([
    ...stagedNights,
    cleanNight({
      sleepDate: els.manualDate.value,
      source: els.manualSource.value,
      score,
      scoreKind: "native",
      durationMinutes: Number.isFinite(hours) && hours > 0 ? hours * 60 : undefined,
    }),
  ]);
  renderImportPreview();
  els.importMessage.textContent = "Manual night added to this import.";
  els.manualScore.value = "";
  els.manualDuration.value = "";
}

function renderImportPreview() {
  const sources = [...new Set(stagedNights.map((night) => SOURCE_LABELS[night.source]))];
  els.previewCount.textContent = `${stagedNights.length} night${stagedNights.length === 1 ? "" : "s"} ready`;
  els.previewSources.textContent = sources.join(" · ");
  els.importPreview.hidden = false;
}

async function importStagedNights() {
  if (!stagedNights.length) return;
  els.confirmImport.disabled = true;
  els.confirmImport.textContent = "Importing…";
  els.importMessage.textContent = "Saving your sleep history…";

  try {
    let inserted = 0;
    let updated = 0;
    const batchId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    for (let index = 0; index < stagedNights.length; index += 500) {
      const result = await convexMutation("sleep:importNights", {
        accessToken,
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
    els.importMessage.textContent = error.message || "Import failed. Try again.";
  } finally {
    els.confirmImport.disabled = false;
    els.confirmImport.textContent = "Import to Daylight";
  }
}

function parseSleepExport(text, filename) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("<") && /HealthData|HKCategoryTypeIdentifierSleepAnalysis/.test(trimmed)) {
    return parseAppleHealthXml(trimmed);
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonExport(JSON.parse(trimmed), filename);
  }
  return parseCsvExport(trimmed, filename);
}

function parseJsonExport(data, filename) {
  const rows = Array.isArray(data) ? data : data.records || data.sleeps || data.data || [];
  if (!Array.isArray(rows)) return [];
  return normalizeRows(rows, filename);
}

function parseCsvExport(text, filename) {
  const matrix = parseCsv(text);
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(normalizeHeader);
  const rows = matrix.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
  return normalizeRows(rows, filename);
}

function normalizeRows(rows, filename) {
  const fallbackSource = inferSource(filename);
  return rows.map((row) => {
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
    const source = inferSource(String(firstValue(normalized, ["source", "provider", "device", "source_name"]) || filename)) || fallbackSource;
    const dateValue = firstValue(normalized, ["wake_onset", "woke_at", "end", "end_time", "sleep_end", "date", "sleep_date", "cycle_start_time", "start"]);
    const scoreValue = firstValue(normalized, ["sleep_performance_percentage", "sleep_performance", "sleep_score", "quality_score", "overall_score", "score"]);
    const durationValue = firstValue(normalized, ["asleep_duration_min", "asleep_duration", "sleep_duration_minutes", "total_sleep_minutes", "total_sleep_time", "duration_minutes", "duration"]);
    const durationMinutes = parseDurationMinutes(durationValue, normalized);
    const scoreNumber = parseMetric(scoreValue);
    const sleepDate = normalizeDate(dateValue);
    if (!sleepDate || (!Number.isFinite(scoreNumber) && !Number.isFinite(durationMinutes))) return null;
    const nativeScore = Number.isFinite(scoreNumber);

    return cleanNight({
      sleepDate,
      source: source || "manual",
      score: nativeScore ? scoreNumber : durationScore(durationMinutes),
      scoreKind: nativeScore ? "native" : "derived",
      durationMinutes,
      efficiency: parseMetric(firstValue(normalized, ["sleep_efficiency_percentage", "sleep_efficiency", "efficiency"])),
      hrv: parseMetric(firstValue(normalized, ["hrv_rmssd_milli", "hrv", "average_hrv"])),
      restingHeartRate: parseMetric(firstValue(normalized, ["resting_heart_rate", "rhr", "average_heart_rate"])),
      deepMinutes: parseDurationMinutes(firstValue(normalized, ["deep_sleep_minutes", "slow_wave_sleep_minutes", "deep_minutes"]), normalized),
      remMinutes: parseDurationMinutes(firstValue(normalized, ["rem_sleep_minutes", "rem_minutes"]), normalized),
      asleepAt: normalizeTimestamp(firstValue(normalized, ["sleep_onset", "asleep_at", "start", "start_time"])),
      wokeAt: normalizeTimestamp(firstValue(normalized, ["wake_onset", "woke_at", "end", "end_time"])),
    });
  }).filter(Boolean);
}

function parseAppleHealthXml(text) {
  const documentNode = new DOMParser().parseFromString(text, "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("Apple Health XML is not valid.");
  const groups = new Map();
  const records = [...documentNode.querySelectorAll("Record[type='HKCategoryTypeIdentifierSleepAnalysis']")];

  records.forEach((record) => {
    const value = record.getAttribute("value") || "";
    if (!/(Asleep|Core|Deep|REM)/i.test(value) || /Awake|InBed/i.test(value)) return;
    const start = parseAppleDate(record.getAttribute("startDate"));
    const end = parseAppleDate(record.getAttribute("endDate"));
    if (!start || !end || end <= start) return;
    const sourceName = record.getAttribute("sourceName") || "Apple Health";
    const source = /eight/i.test(sourceName) ? "eightsleep" : "apple_health";
    const date = dateInTimeZone(end, "America/Los_Angeles");
    const key = `${source}:${date}`;
    if (!groups.has(key)) groups.set(key, { source, date, intervals: [], deep: [], rem: [] });
    const group = groups.get(key);
    const interval = [start.getTime(), end.getTime()];
    group.intervals.push(interval);
    if (/Deep/i.test(value)) group.deep.push(interval);
    if (/REM/i.test(value)) group.rem.push(interval);
  });

  return [...groups.values()].map((group) => {
    const durationMinutes = mergedIntervalMinutes(group.intervals);
    return cleanNight({
      sleepDate: group.date,
      source: group.source,
      score: durationScore(durationMinutes),
      scoreKind: "derived",
      durationMinutes,
      deepMinutes: mergedIntervalMinutes(group.deep) || undefined,
      remMinutes: mergedIntervalMinutes(group.rem) || undefined,
    });
  }).filter((night) => night.durationMinutes >= 60);
}

function cleanNight(night) {
  const cleaned = {
    sleepDate: night.sleepDate,
    source: SOURCE_LABELS[night.source] ? night.source : "manual",
    score: clamp(Math.round(Number(night.score) * 10) / 10, 0, 100),
    scoreKind: night.scoreKind === "derived" ? "derived" : "native",
  };
  ["durationMinutes", "efficiency", "hrv", "restingHeartRate", "deepMinutes", "remMinutes"].forEach((key) => {
    if (Number.isFinite(night[key])) cleaned[key] = Math.round(Number(night[key]) * 10) / 10;
  });
  if (night.asleepAt) cleaned.asleepAt = night.asleepAt;
  if (night.wokeAt) cleaned.wokeAt = night.wokeAt;
  return cleaned;
}

function dedupeNights(nights) {
  const map = new Map();
  nights.filter(Boolean).forEach((night) => map.set(`${night.source}:${night.sleepDate}`, night));
  return [...map.values()].sort((a, b) => a.sleepDate.localeCompare(b.sleepDate));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value).trim().toLowerCase().replace(/%/g, " percentage ").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function firstValue(object, keys) {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== "") return object[key];
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
    return parts.length === 3 ? parts[0] * 60 + parts[1] + parts[2] / 60 : parts[0] * 60 + parts[1];
  }
  const number = parseMetric(text);
  if (!Number.isFinite(number)) return undefined;
  const headerText = Object.keys(row).join(" ");
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
  return Number.isNaN(date.getTime()) ? null : dateInTimeZone(date, "America/Los_Angeles");
}

function normalizeTimestamp(value) {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseAppleDate(value) {
  if (!value) return null;
  const normalized = value.replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2").replace(" ", "T");
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
    else { total += end - start; start = nextStart; end = nextEnd; }
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
    if (!grouped.has(record.sleepDate)) grouped.set(record.sleepDate, { records: [], aggregate: 0 });
    grouped.get(record.sleepDate).records.push(record);
  });
  grouped.forEach((night) => { night.aggregate = average(night.records.map((record) => record.score)); });
  return grouped;
}

function linearRegression(points) {
  const xMean = average(points.map((point) => point.x));
  const yMean = average(points.map((point) => point.y));
  const numerator = points.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  const slope = denominator ? numerator / denominator : 0;
  return { slope, intercept: yMean - slope * xMean };
}

function pearson(xs, ys) {
  const xMean = average(xs);
  const yMean = average(ys);
  const numerator = xs.reduce((sum, xValue, index) => sum + (xValue - xMean) * (ys[index] - yMean), 0);
  const xSpread = Math.sqrt(xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0));
  const ySpread = Math.sqrt(ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0));
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

async function convexQuery(path, args) { return convexCall("query", path, args); }
async function convexMutation(path, args) { return convexCall("mutation", path, args); }

async function convexCall(kind, path, args) {
  const response = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });
  const result = await response.json();
  if (result.status !== "success") throw new Error(result.errorMessage || `Data ${kind} failed.`);
  return result.value;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function todayPacific() { return dateInTimeZone(new Date(), "America/Los_Angeles"); }

function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function currentPacificHour() {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

function addDays(isoDate, amount) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function formatTinyDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function formatTableDate(value) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(date);
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return `${hours}h ${String(remaining).padStart(2, "0")}m`;
}

function describeScore(score) {
  if (score >= 90) return "Exceptional sleep";
  if (score >= 80) return "Strong sleep";
  if (score >= 70) return "Solid sleep";
  if (score >= 60) return "Room to recover";
  return "Recovery needed";
}

function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = String(value);
  return span.innerHTML;
}
