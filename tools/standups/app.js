const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const TEAM_ID = "johns-website-default";
const LOCAL_NAME_KEY = "standups:last-person-name";
const ACCESS_KEY = "standups:access";
const ACCESS_PASSWORD = "corgi124";
const ACCESS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TEAM_MEMBERS = ["John", "Vivek", "Vishal", "Jenny"];

const els = {
  app: document.querySelector("#standupsApp"),
  passwordGate: document.querySelector("#passwordGate"),
  passwordForm: document.querySelector("#passwordForm"),
  passwordInput: document.querySelector("#passwordInput"),
  passwordError: document.querySelector("#passwordError"),
  date: document.querySelector("#standupDate"),
  form: document.querySelector("#standupForm"),
  personName: document.querySelector("#personName"),
  rosterDate: document.querySelector("#rosterDate"),
  previousTitle: document.querySelector("#previousTitle"),
  previousContent: document.querySelector("#previousContent"),
  todayEyebrow: document.querySelector("#todayEyebrow"),
  todayTitle: document.querySelector("#todayTitle"),
  yesterday: document.querySelector("#yesterday"),
  today: document.querySelector("#today"),
  blockers: document.querySelector("#blockers"),
  notes: document.querySelector("#notes"),
  saveStatus: document.querySelector("#saveStatus"),
  yesterdayShortcutDate: document.querySelector("#yesterdayShortcutDate"),
  todayShortcutDate: document.querySelector("#todayShortcutDate"),
  tomorrowShortcutDate: document.querySelector("#tomorrowShortcutDate"),
  dateJumpButtons: document.querySelectorAll("[data-date-jump]"),
  entriesList: document.querySelector("#entriesList"),
  unsubmittedList: document.querySelector("#unsubmittedList"),
  entryTemplate: document.querySelector("#entryTemplate"),
};

const editors = [els.yesterday, els.today, els.blockers, els.notes];
let entriesForDate = [];
let activePrevious = null;
let autosaveTimer;
let isHydrating = false;

init();

function init() {
  els.passwordForm.addEventListener("submit", handlePasswordSubmit);
  if (!hasStoredAccess()) {
    els.passwordInput.focus();
    return;
  }

  unlockApp();
}

function initStandups() {
  els.date.value = toDateInputValue(new Date());
  els.personName.value = localStorage.getItem(LOCAL_NAME_KEY) || "";
  updateDateShortcuts();
  els.date.addEventListener("change", handleDateChange);
  els.personName.addEventListener("change", loadPersonContext);
  els.form.addEventListener("submit", (event) => event.preventDefault());
  document.querySelectorAll("[data-date-jump]").forEach((button) => {
    button.addEventListener("click", () => jumpToRelativeDate(Number(button.dataset.dateJump)));
  });
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => runEditorCommand(button));
  });
  editors.forEach((editor) => {
    editor.addEventListener("input", () => {
      editor.classList.remove("is-invalid");
      normalizeChecklists(editor);
      queueAutosave();
    });
    editor.addEventListener("click", handleChecklistClick);
    editor.addEventListener("keydown", handleEditorKeydown);
    editor.addEventListener("keyup", handleEditorKeyup);
  });

  refreshDailyList().then(() => {
    if (els.personName.value.trim()) loadPersonContext();
    updateTodayHeading();
  });
}

function handlePasswordSubmit(event) {
  event.preventDefault();
  if (els.passwordInput.value !== ACCESS_PASSWORD) {
    els.passwordError.removeAttribute("hidden");
    els.passwordInput.select();
    return;
  }

  localStorage.setItem(ACCESS_KEY, String(Date.now() + ACCESS_DURATION_MS));
  els.passwordInput.value = "";
  els.passwordError.setAttribute("hidden", "");
  unlockApp();
}

function hasStoredAccess() {
  const expiresAt = Number(localStorage.getItem(ACCESS_KEY) || 0);
  if (expiresAt > Date.now()) return true;
  localStorage.removeItem(ACCESS_KEY);
  return false;
}

function unlockApp() {
  els.passwordGate.setAttribute("hidden", "");
  els.app.removeAttribute("hidden");
  initStandups();
}

async function handleDateChange() {
  clearTimeout(autosaveTimer);
  clearForm();
  updateDateShortcuts();
  await refreshDailyList();
  updateTodayHeading();
  if (els.personName.value.trim()) loadPersonContext();
}

async function refreshDailyList() {
  els.rosterDate.textContent = formatDate(els.date.value);
  setEntriesState("Loading submitted updates...");
  try {
    entriesForDate = await convexQuery("standups:listForDate", {
      teamId: TEAM_ID,
      standupDate: els.date.value,
    });
    renderEntries(entriesForDate);
  } catch (error) {
    console.error(error);
    setEntriesState("Could not load Convex data. Check that the standup functions are deployed.");
  }
}

async function loadPersonContext() {
  const personName = els.personName.value.trim();
  updateTodayHeading();
  if (!personName) return;

  clearTimeout(autosaveTimer);
  localStorage.setItem(LOCAL_NAME_KEY, personName);
  els.previousTitle.textContent = "Loading previous update";
  els.previousContent.className = "previous-content empty-state";
  els.previousContent.textContent = "Looking for the most recent prior submission...";
  els.saveStatus.textContent = "";

  try {
    const [current, previous] = await Promise.all([
      convexQuery("standups:getForPersonAndDate", {
        teamId: TEAM_ID,
        standupDate: els.date.value,
        personName,
      }),
      convexQuery("standups:getPreviousForPerson", {
        teamId: TEAM_ID,
        beforeDate: els.date.value,
        personName,
      }),
    ]);

    activePrevious = previous;
    fillCurrent(current);
    renderPrevious(previous, personName);
  } catch (error) {
    console.error(error);
    els.previousTitle.textContent = "Convex unavailable";
    els.previousContent.className = "previous-content empty-state";
    els.previousContent.textContent = "I could not load the comparison yet.";
  }
}

async function saveStandup({ silent = false } = {}) {
  const personName = els.personName.value.trim();
  if (!personName) return;
  if (!hasSavableContent()) {
    els.saveStatus.textContent = "Autosave ready";
    return;
  }

  if (!silent) els.saveStatus.textContent = "Saving...";
  localStorage.setItem(LOCAL_NAME_KEY, personName);

  try {
    await convexMutation("standups:save", {
      teamId: TEAM_ID,
      standupDate: els.date.value,
      personName,
      yesterday: getEditorHtml(els.yesterday),
      today: getEditorHtml(els.today),
      blockers: getEditorHtml(els.blockers),
      notes: getEditorHtml(els.notes),
    });

    els.saveStatus.textContent = `Last saved ${formatTime(Date.now())}`;
    await refreshDailyList();
    renderPrevious(activePrevious, personName);
  } catch (error) {
    console.error(error);
    els.saveStatus.textContent = "Save failed. Check Convex and try again.";
  }
}

function fillCurrent(entry) {
  isHydrating = true;
  setEditorHtml(els.yesterday, entry?.yesterday || "");
  setEditorHtml(els.today, entry?.today || "");
  setEditorHtml(els.blockers, entry?.blockers || "");
  setEditorHtml(els.notes, entry?.notes || "");
  isHydrating = false;
  if (entry) {
    els.saveStatus.textContent = `Last saved ${formatTime(entry.updatedAt)}`;
  } else {
    els.saveStatus.textContent = "Autosave ready";
  }
}

function renderPrevious(entry, personName) {
  if (!entry) {
    els.previousTitle.textContent = `${personName}'s prior standup`;
    els.previousContent.className = "previous-content empty-state";
    els.previousContent.textContent = "No earlier submission found yet.";
    return;
  }

  els.previousTitle.textContent = `${entry.personName} on ${formatDate(entry.standupDate)}`;
  els.previousContent.className = "previous-content";
  els.previousContent.innerHTML = "";
  els.previousContent.append(
    renderSection(`Planned on ${formatDate(entry.standupDate)}`, entry.today, {
      className: "progression-card",
      note: "Compare this against today's Things I did",
    }),
    renderProgressionBridge(),
    renderPreviousDetails(entry),
  );
}

function renderSection(title, value, options = {}) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  const content = document.createElement("div");
  if (options.className) section.className = options.className;
  heading.textContent = title;
  content.className = "rendered-rich-text";
  content.innerHTML = value?.trim() ? sanitizeRichText(value) : "Nothing entered.";
  section.append(heading);
  if (options.note) {
    const note = document.createElement("p");
    note.className = "section-note";
    note.textContent = options.note;
    section.append(note);
  }
  section.append(content);
  return section;
}

function renderProgressionBridge() {
  const bridge = document.createElement("div");
  bridge.className = "progression-bridge";
  bridge.innerHTML = "<span></span><strong>Becomes today's completed work</strong>";
  return bridge;
}

function renderPreviousDetails(entry) {
  const details = document.createElement("details");
  details.className = "previous-details";
  const summary = document.createElement("summary");
  summary.textContent = "View previous completion, blockers, and notes";
  details.append(
    summary,
    renderSection(`Previous day completion`, entry.yesterday, {
      className: "completion-card",
      note: `Already completed before ${formatDate(entry.standupDate)}`,
    }),
    renderSection("Blockers", entry.blockers, { className: "support-card" }),
    renderSection("Notes", entry.notes, { className: "support-card" }),
  );
  return details;
}

function renderEntries(entries) {
  const sorted = [...entries].sort((a, b) => a.personName.localeCompare(b.personName));
  const submittedNames = new Set(sorted.map((entry) => entry.personName));
  const unsubmitted = TEAM_MEMBERS.filter((name) => !submittedNames.has(name));

  if (sorted.length) {
    els.entriesList.replaceChildren(
      ...sorted.map((entry) => renderRosterButton(entry.personName, `Updated ${formatTime(entry.updatedAt)}`, "submitted")),
    );
  } else {
    els.entriesList.replaceChildren(renderRosterEmpty("No one has submitted for this date yet."));
  }

  if (unsubmitted.length) {
    els.unsubmittedList.replaceChildren(
      ...unsubmitted.map((name) => renderRosterButton(name, "No update yet", "unsubmitted")),
    );
  } else {
    els.unsubmittedList.replaceChildren(renderRosterEmpty("Everyone has submitted."));
  }
}

function renderRosterButton(name, meta, status) {
  const row = els.entryTemplate.content.firstElementChild.cloneNode(true);
  row.classList.add(`entry-row-${status}`);
  row.querySelector(".entry-name").textContent = name;
  row.querySelector(".entry-time").textContent = meta;
  row.addEventListener("click", () => {
    els.personName.value = name;
    loadPersonContext();
  });
  return row;
}

function renderRosterEmpty(message) {
  const p = document.createElement("p");
  p.className = "empty-state";
  p.textContent = message;
  return p;
}

function setEntriesState(message) {
  els.entriesList.replaceChildren(renderRosterEmpty(message));
  els.unsubmittedList.replaceChildren(renderRosterEmpty("Loading roster..."));
}

function clearForm() {
  editors.forEach((editor) => setEditorHtml(editor, ""));
  els.saveStatus.textContent = "";
}

function queueAutosave() {
  if (isHydrating) return;
  clearTimeout(autosaveTimer);
  const personName = els.personName.value.trim();
  if (!personName) {
    els.saveStatus.textContent = "Select a person to autosave";
    return;
  }
  if (!hasSavableContent()) {
    els.saveStatus.textContent = "Autosave ready";
    return;
  }

  els.saveStatus.textContent = "Saving soon...";
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    saveStandup({ silent: true });
  }, 800);
}

async function flushAutosave() {
  if (!autosaveTimer) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  if (els.personName.value.trim() && hasSavableContent()) {
    await saveStandup();
  }
}

function hasSavableContent() {
  return editors.some((editor) => editor.textContent.trim());
}

async function jumpToRelativeDate(offsetDays) {
  await flushAutosave();
  const date = new Date(`${toDateInputValue(new Date())}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  els.date.value = toDateInputValue(date);
  handleDateChange();
}

function updateDateShortcuts() {
  const today = new Date();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  els.yesterdayShortcutDate.textContent = formatShortDate(toDateInputValue(yesterday));
  els.todayShortcutDate.textContent = formatShortDate(toDateInputValue(today));
  els.tomorrowShortcutDate.textContent = formatShortDate(toDateInputValue(tomorrow));
  els.dateJumpButtons.forEach((button) => {
    const shortcutDate = toDateInputValue(addDays(today, Number(button.dataset.dateJump)));
    const isActive = shortcutDate === els.date.value;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "date");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function updateTodayHeading() {
  const personName = els.personName.value.trim();
  els.todayEyebrow.textContent = `Today ${formatDate(els.date.value)}`;
  els.todayTitle.textContent = personName ? `${personName}'s updates` : "Select a person";
}

function runEditorCommand(button) {
  const editor = button.closest(".rich-field").querySelector(".rich-editor");
  editor.focus();
  applyEditorCommand(button.dataset.command);
  queueAutosave();
}

function handleEditorKeydown(event) {
  const commandKey = event.metaKey || event.ctrlKey;
  if (!commandKey || !event.shiftKey) return;

  if (event.code === "Digit8") {
    event.preventDefault();
    applyEditorCommand("insertUnorderedList");
  }

  if (event.code === "Digit7") {
    event.preventDefault();
    applyEditorCommand("insertOrderedList");
  }
}

function handleEditorKeyup(event) {
  normalizeChecklists(event.currentTarget);
  if (event.key !== " ") return;

  const block = getCurrentTextBlock();
  if (!block) return;

  const text = block.textContent || "";
  if (/^\[( |x)\]\s$/i.test(text)) {
    const checked = /^\[x\]\s$/i.test(text);
    block.textContent = "";
    applyEditorCommand("toggleChecklist");
    setCurrentChecklistItemChecked(checked);
    return;
  }

  if (/^[-*]\s$/.test(text)) {
    block.textContent = "";
    applyEditorCommand("insertUnorderedList");
  }

  if (/^1[.)]\s$/.test(text)) {
    block.textContent = "";
    applyEditorCommand("insertOrderedList");
  }
}

function applyEditorCommand(command) {
  if (command === "toggleChecklist") {
    document.execCommand("insertUnorderedList", false, null);
    convertCurrentListToChecklist();
    return;
  }

  document.execCommand(command, false, null);
}

function handleChecklistClick(event) {
  const item = event.target.closest("li");
  if (!item?.closest("ul.check-list")) return;

  const rect = item.getBoundingClientRect();
  if (event.clientX > rect.left + 28) return;

  event.preventDefault();
  toggleChecklistItem(item);
}

function convertCurrentListToChecklist() {
  const item = getCurrentListItem();
  const list = item?.closest("ul");
  if (!item || !list) return;

  list.classList.add("check-list");
  list.dataset.list = "checklist";
  list.querySelectorAll("li").forEach((listItem) => {
    if (!listItem.dataset.checked) listItem.dataset.checked = "false";
  });
}

function normalizeChecklists(editor) {
  editor.querySelectorAll("ul.check-list, ul[data-list='checklist']").forEach((list) => {
    list.classList.add("check-list");
    list.dataset.list = "checklist";
    list.querySelectorAll("li").forEach((item) => {
      if (item.dataset.checked !== "true") item.dataset.checked = "false";
    });
  });
}

function setCurrentChecklistItemChecked(checked) {
  const item = getCurrentListItem();
  if (item?.closest("ul.check-list")) {
    item.dataset.checked = checked ? "true" : "false";
  }
}

function toggleChecklistItem(item) {
  item.dataset.checked = item.dataset.checked === "true" ? "false" : "true";
  queueAutosave();
}

function getCurrentListItem() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;

  let node = selection.anchorNode;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;

  while (node && node.nodeType === Node.ELEMENT_NODE && !node.classList?.contains("rich-editor")) {
    if (node.nodeName === "LI") return node;
    node = node.parentElement;
  }

  return null;
}

function getCurrentTextBlock() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;

  let node = selection.anchorNode;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;

  while (node && node.nodeType === Node.ELEMENT_NODE && !node.classList?.contains("rich-editor")) {
    if (["DIV", "P", "LI"].includes(node.nodeName)) return node;
    node = node.parentElement;
  }

  return node?.classList?.contains("rich-editor") ? node : null;
}

function validateRequiredEditors() {
  const requiredEditors = [els.yesterday, els.today];
  const missing = requiredEditors.filter((editor) => !editor.textContent.trim());
  requiredEditors.forEach((editor) => editor.classList.toggle("is-invalid", missing.includes(editor)));
  if (missing.length) {
    els.saveStatus.textContent = "Add yesterday and today updates before saving.";
    missing[0].focus();
    return false;
  }
  return true;
}

function getEditorHtml(editor) {
  return sanitizeRichText(editor.innerHTML);
}

function setEditorHtml(editor, html) {
  editor.innerHTML = sanitizeRichText(html);
  normalizeChecklists(editor);
  editor.classList.remove("is-invalid");
}

function sanitizeRichText(html) {
  if (!html?.trim()) return "";
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html
      .split(/\n+/)
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join("");
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "DIV", "P", "BR"]);
  template.content.querySelectorAll("*").forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent || ""));
      return;
    }

    const isChecklist = node.tagName === "UL" && (node.classList.contains("check-list") || node.dataset.list === "checklist");
    const isChecklistItem = node.tagName === "LI" && node.closest("ul.check-list, ul[data-list='checklist']");
    const wasChecked = node.dataset.checked === "true";
    [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
    if (isChecklist) {
      node.classList.add("check-list");
      node.dataset.list = "checklist";
    }
    if (isChecklistItem) {
      node.dataset.checked = wasChecked ? "true" : "false";
    }
  });
  return template.innerHTML;
}

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

async function convexQuery(path, args) {
  return convexCall("query", path, args);
}

async function convexMutation(path, args) {
  return convexCall("mutation", path, args);
}

async function convexCall(kind, path, args) {
  const response = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });
  const result = await response.json();
  if (result.status !== "success") {
    throw new Error(result.errorMessage || `Convex ${kind} failed`);
  }
  return result.value;
}

function toDateInputValue(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
