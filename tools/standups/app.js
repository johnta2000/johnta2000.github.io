const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const TEAM_ID = "johns-website-default";
const LOCAL_NAME_KEY = "standups:last-person-name";
const ACCESS_KEY = "standups:access";
const ACCESS_PASSWORD = "corgi124";
const ACCESS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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
  entriesList: document.querySelector("#entriesList"),
  entryTemplate: document.querySelector("#entryTemplate"),
};

const editors = [els.yesterday, els.today, els.blockers, els.notes];
let entriesForDate = [];
let activePrevious = null;

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
  els.date.addEventListener("change", handleDateChange);
  els.personName.addEventListener("change", loadPersonContext);
  els.form.addEventListener("submit", saveStandup);
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => runEditorCommand(button));
  });
  editors.forEach((editor) => {
    editor.addEventListener("input", () => {
      editor.classList.remove("is-invalid");
      normalizeChecklists(editor);
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
  clearForm();
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

async function saveStandup(event) {
  event.preventDefault();
  const personName = els.personName.value.trim();
  if (!personName) return;
  if (!validateRequiredEditors()) return;

  els.saveStatus.textContent = "Saving...";
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

    els.saveStatus.textContent = "Saved.";
    await refreshDailyList();
    renderPrevious(activePrevious, personName);
  } catch (error) {
    console.error(error);
    els.saveStatus.textContent = "Save failed. Check Convex and try again.";
  }
}

function fillCurrent(entry) {
  setEditorHtml(els.yesterday, entry?.yesterday || "");
  setEditorHtml(els.today, entry?.today || "");
  setEditorHtml(els.blockers, entry?.blockers || "");
  setEditorHtml(els.notes, entry?.notes || "");
  if (entry) {
    els.saveStatus.textContent = `Loaded ${entry.personName}'s saved update for ${formatDate(entry.standupDate)}.`;
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
    renderSection(`Planned on ${formatDate(entry.standupDate)}`, entry.today),
    renderSection(`Completed before ${formatDate(entry.standupDate)}`, entry.yesterday),
    renderSection("Blockers", entry.blockers),
    renderSection("Notes", entry.notes),
  );
}

function renderSection(title, value) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  const content = document.createElement("div");
  heading.textContent = title;
  content.className = "rendered-rich-text";
  content.innerHTML = value?.trim() ? sanitizeRichText(value) : "Nothing entered.";
  section.append(heading, content);
  return section;
}

function renderEntries(entries) {
  if (!entries.length) {
    setEntriesState("No one has submitted for this date yet.");
    return;
  }

  const sorted = [...entries].sort((a, b) => a.personName.localeCompare(b.personName));
  els.entriesList.replaceChildren(
    ...sorted.map((entry) => {
      const row = els.entryTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector(".entry-name").textContent = entry.personName;
      row.querySelector(".entry-time").textContent = `Updated ${formatTime(entry.updatedAt)}`;
      row.addEventListener("click", () => {
        els.personName.value = entry.personName;
        loadPersonContext();
      });
      return row;
    }),
  );
}

function setEntriesState(message) {
  const p = document.createElement("p");
  p.className = "empty-state";
  p.textContent = message;
  els.entriesList.replaceChildren(p);
}

function clearForm() {
  editors.forEach((editor) => setEditorHtml(editor, ""));
  els.saveStatus.textContent = "";
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

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
