const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const TEAM_ID = "johns-website-default";
const LOCAL_NAME_KEY = "standups:last-person-name";
const TEAM_MEMBERS = ["John", "Vivek", "Vishal", "Jenny"];

const els = {
  app: document.querySelector("#standupsApp"),
  accessGate: document.querySelector("#accessGate"),
  clerkSignIn: document.querySelector("#clerkSignIn"),
  authStatus: document.querySelector("#authStatus"),
  authSignOut: document.querySelector("#authSignOut"),
  lockButton: document.querySelector("#lockButton"),
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
  dailyNotes: document.querySelector("#dailyNotes"),
  dailyNotesDate: document.querySelector("#dailyNotesDate"),
  dailyNotesStatus: document.querySelector("#dailyNotesStatus"),
  notetakerDate: document.querySelector("#notetakerDate"),
  notetakerSummary: document.querySelector("#notetakerSummary"),
  notetakerStatus: document.querySelector("#notetakerStatus"),
  notetakerViewButton: document.querySelector("#notetakerViewButton"),
  notetakerModal: document.querySelector("#notetakerModal"),
  notetakerModalDate: document.querySelector("#notetakerModalDate"),
  notetakerModalContent: document.querySelector("#notetakerModalContent"),
  notetakerCloseButton: document.querySelector("#notetakerCloseButton"),
  saveStatus: document.querySelector("#saveStatus"),
  olderTwoShortcutDate: document.querySelector("#olderTwoShortcutDate"),
  olderOneShortcutDate: document.querySelector("#olderOneShortcutDate"),
  yesterdayShortcutDate: document.querySelector("#yesterdayShortcutDate"),
  todayShortcutDate: document.querySelector("#todayShortcutDate"),
  tomorrowShortcutDate: document.querySelector("#tomorrowShortcutDate"),
  dateJumpButtons: document.querySelectorAll("[data-date-jump]"),
  entriesList: document.querySelector("#entriesList"),
  unsubmittedList: document.querySelector("#unsubmittedList"),
  entryTemplate: document.querySelector("#entryTemplate"),
};

const personEditors = [els.yesterday, els.today, els.blockers, els.notes];
const allEditors = [...personEditors, els.dailyNotes];
let entriesForDate = [];
let activePrevious = null;
let fathomNotesForDate = [];
let autosaveTimer;
let dailyNotesAutosaveTimer;
let activeDailyNotesDate = "";
let isHydrating = false;
let shouldResetNewChecklistItem = false;

init();

function init() {
  initializeClerk();
}

function initStandups() {
  els.date.value = toDateInputValue(new Date());
  els.personName.value = localStorage.getItem(LOCAL_NAME_KEY) || "";
  configureRichTextCommands();
  updateDateShortcuts();
  els.date.addEventListener("click", openDatePicker);
  els.date.addEventListener("focus", openDatePicker);
  els.date.addEventListener("change", handleDateChange);
  els.personName.addEventListener("change", loadPersonContext);
  els.notetakerViewButton.addEventListener("click", openNotetakerModal);
  els.notetakerCloseButton.addEventListener("click", closeNotetakerModal);
  els.notetakerModal.addEventListener("click", (event) => {
    if (event.target === els.notetakerModal) closeNotetakerModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.notetakerModal.hasAttribute("hidden")) closeNotetakerModal();
  });
  els.lockButton.addEventListener("click", signOut);
  els.authSignOut.addEventListener("click", signOut);
  els.form.addEventListener("submit", (event) => event.preventDefault());
  document.querySelectorAll("[data-date-jump]").forEach((button) => {
    button.addEventListener("click", () => jumpToRelativeDate(Number(button.dataset.dateJump)));
  });
  document.querySelectorAll(".editor-toolbar button").forEach((button) => {
    button.addEventListener("pointerdown", (event) => event.preventDefault());
  });
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => runEditorCommand(button));
  });
  document.querySelectorAll("[data-copy-editor]").forEach((button) => {
    button.addEventListener("click", () => copyEditorContents(button));
  });
  allEditors.forEach((editor) => {
    editor.addEventListener("input", () => {
      editor.classList.remove("is-invalid");
      normalizeChecklists(editor);
      queueEditorAutosave(editor);
    });
    editor.addEventListener("click", handleChecklistClick);
    editor.addEventListener("keydown", handleEditorKeydown);
    editor.addEventListener("keyup", handleEditorKeyup);
  });

  loadDailyNotes();
  loadFathomNotes();
  refreshDailyList().then(() => {
    if (els.personName.value.trim()) loadPersonContext();
    updateTodayHeading();
  });
}

function configureRichTextCommands() {
  try {
    document.execCommand("styleWithCSS", false, false);
    document.execCommand("defaultParagraphSeparator", false, "div");
  } catch (error) {
    // Browser support varies; the editor still works without these hints.
  }
}

async function initializeClerk() {
  try {
    if (!window.Clerk) throw new Error("Secure sign-in did not load. Refresh the page and try again.");
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });

    if (window.Clerk.isSignedIn) {
      await unlockApp();
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
          colorPrimary: "#126a5c",
          colorBackground: "#ffffff",
          colorText: "#202124",
          colorInputBackground: "#ffffff",
          colorInputText: "#202124",
          borderRadius: "8px",
          fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      },
    });
  } catch (error) {
    console.error(error);
    showAuthError(error);
  }
}

async function unlockApp() {
  els.authStatus.hidden = false;
  els.authStatus.textContent = "Verifying your account...";
  try {
    const viewer = await convexQuery("standups:verify", {});
    els.accessGate.setAttribute("hidden", "");
    els.app.removeAttribute("hidden");
    els.lockButton.textContent = viewer.email ? `Sign out ${viewer.email}` : "Sign out";
    initStandups();
  } catch (error) {
    console.error(error);
    showAuthError(error);
  }
}

async function signOut() {
  clearTimeout(autosaveTimer);
  clearTimeout(dailyNotesAutosaveTimer);
  if (window.Clerk?.isSignedIn) await window.Clerk.signOut();
  window.location.assign(window.location.href.split("#")[0]);
}

function showAuthError(error) {
  const message = String(error?.message || error || "");
  els.app.setAttribute("hidden", "");
  els.accessGate.removeAttribute("hidden");
  els.authStatus.hidden = false;
  els.authSignOut.hidden = !window.Clerk?.isSignedIn;
  if (/not authorized/i.test(message)) {
    els.authStatus.textContent = "This Clerk account is signed in, but it is not approved for standups.";
  } else if (/auth provider|token|authenticated|verified email|jwt|invalidauthheader/i.test(message)) {
    els.authStatus.textContent = "Clerk sign-in loaded, but the Convex auth integration needs attention.";
  } else {
    els.authStatus.textContent = "Secure sign-in could not finish loading. Refresh the page and try again.";
  }
}

async function handleDateChange() {
  clearTimeout(autosaveTimer);
  await flushDailyNotesAutosave();
  clearForm();
  updateDateShortcuts();
  await Promise.all([refreshDailyList(), loadDailyNotes(), loadFathomNotes()]);
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

async function loadDailyNotes() {
  activeDailyNotesDate = els.date.value;
  els.dailyNotesDate.textContent = formatDate(els.date.value);
  els.dailyNotesStatus.textContent = "Loading daily notes...";

  try {
    const entry = await convexQuery("standups:getDayNotes", {
      teamId: TEAM_ID,
      standupDate: els.date.value,
    });

    isHydrating = true;
    setEditorHtml(els.dailyNotes, entry?.notes || "");
    isHydrating = false;
    els.dailyNotesStatus.textContent = entry ? `Last saved ${formatTime(entry.updatedAt)}` : "Daily notes ready";
  } catch (error) {
    console.error(error);
    isHydrating = false;
    els.dailyNotesStatus.textContent = getConvexMissingFunctionMessage(error) || "Could not load daily notes.";
  }
}

async function loadFathomNotes() {
  els.notetakerDate.textContent = formatDate(els.date.value);
  els.notetakerModalDate.textContent = formatDate(els.date.value);
  els.notetakerSummary.textContent = "Loading Fathom notes...";
  els.notetakerStatus.textContent = "Loading notetaker notes...";
  els.notetakerViewButton.disabled = true;

  try {
    fathomNotesForDate = await convexQuery("standups:listFathomNotesForDate", {
      teamId: TEAM_ID,
      standupDate: els.date.value,
    });
    renderFathomNotesSummary();
  } catch (error) {
    console.error(error);
    fathomNotesForDate = [];
    els.notetakerSummary.textContent = "Could not load Fathom notes.";
    els.notetakerStatus.textContent = getConvexMissingFunctionMessage(error) || "Notetaker notes unavailable.";
  }
}

function renderFathomNotesSummary() {
  const count = fathomNotesForDate.length;
  els.notetakerViewButton.disabled = count === 0;
  els.notetakerSummary.textContent = count
    ? `${count} Affilignment meeting${count === 1 ? "" : "s"} imported for this date.`
    : "No Affilignment meeting notes imported for this date.";
  els.notetakerStatus.textContent = count ? "Notetaker notes ready" : "Fathom notes sync daily at 10:30 AM and 11:00 AM PT.";
}

async function saveDailyNotes({ silent = false } = {}) {
  const standupDate = activeDailyNotesDate || els.date.value;
  if (!standupDate) return;
  if (!silent) els.dailyNotesStatus.textContent = "Saving daily notes...";

  try {
    await convexMutation("standups:saveDayNotes", {
      teamId: TEAM_ID,
      standupDate,
      notes: getEditorHtml(els.dailyNotes),
    });

    els.dailyNotesStatus.textContent = `Last saved ${formatTime(Date.now())}`;
  } catch (error) {
    console.error(error);
    els.dailyNotesStatus.textContent = getConvexMissingFunctionMessage(error) || "Daily notes save failed.";
  }
}

function openNotetakerModal() {
  renderFathomNotesModal();
  els.notetakerModal.removeAttribute("hidden");
  els.notetakerCloseButton.focus();
}

function closeNotetakerModal() {
  els.notetakerModal.setAttribute("hidden", "");
}

function renderFathomNotesModal() {
  if (!fathomNotesForDate.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No notetaker notes imported for this date yet.";
    els.notetakerModalContent.replaceChildren(empty);
    return;
  }

  els.notetakerModalContent.replaceChildren(...fathomNotesForDate.map(renderFathomNoteCard));
}

function renderFathomNoteCard(note) {
  const card = document.createElement("article");
  const header = document.createElement("div");
  const headerText = document.createElement("div");
  const headerActions = document.createElement("div");
  const title = document.createElement("h3");
  const meta = document.createElement("p");

  card.className = "notetaker-note-card";
  header.className = "notetaker-note-header";
  headerText.className = "notetaker-note-header-text";
  headerActions.className = "notetaker-note-actions";
  title.textContent = note.title || note.meetingTitle || "Affilignment";
  meta.textContent = [note.startedAt ? formatMeetingTimestamp(note.startedAt) : "", "Imported from Fathom"]
    .filter(Boolean)
    .join(" · ");

  headerText.append(title, meta);
  if (note.shareUrl || note.meetingUrl) {
    const link = document.createElement("a");
    link.href = note.shareUrl || note.meetingUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open recording";
    headerActions.append(link);
  }

  header.append(headerText, headerActions);
  card.append(header, buildNotetakerContent(note));
  return card;
}

function buildNotetakerContent(note) {
  const content = document.createElement("div");
  content.className = "notetaker-note-body";

  if (!note.html?.trim()) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Imported before note content was stored. Future scheduled syncs will store the full summary here.";
    content.append(empty);
    return content;
  }

  const template = document.createElement("template");
  template.innerHTML = sanitizeRichText(note.html);
  removeGeneratedFathomHeader(template.content);
  const sections = sectionizeNotetakerBlocks(extractNotetakerBlocks(template.content));
  if (!sections.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No readable notetaker notes were found for this meeting.";
    content.append(empty);
    return content;
  }

  content.append(...sections.map(renderNotetakerSection));
  return content;
}

function removeGeneratedFathomHeader(fragment) {
  const firstElement = [...fragment.childNodes].find((node) => node.nodeType === Node.ELEMENT_NODE);
  if (!firstElement) return;
  if (/^Fathom:/i.test(firstElement.textContent.trim())) firstElement.remove();
}

function extractNotetakerBlocks(root) {
  const blocks = [];
  root.childNodes.forEach((node) => {
    if (!node.textContent?.trim()) return;

    if (node.nodeType !== Node.ELEMENT_NODE) {
      pushNotetakerTextBlock(blocks, node.textContent || "");
      return;
    }

    const element = node;
    const tagName = element.tagName;
    if (tagName === "UL" || tagName === "OL") {
      element.querySelectorAll("li").forEach((item) => {
        pushNotetakerTextBlock(blocks, item.textContent || "", { preferListItem: true });
      });
      return;
    }

    const heading = getNotetakerHeading(element);
    if (heading) {
      blocks.push({ type: "heading", text: heading });
      return;
    }

    pushNotetakerTextBlock(blocks, element.textContent || "");
  });
  return blocks;
}

function pushNotetakerTextBlock(blocks, value, options = {}) {
  const lines = String(value)
    .split(/\n+/)
    .map(cleanNotetakerTextValue)
    .filter(Boolean);

  lines.forEach((line) => {
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (options.preferListItem || bullet || numbered) {
      blocks.push({ type: "listItem", text: bullet?.[1] || numbered?.[1] || line });
    } else {
      blocks.push({ type: "paragraph", text: line });
    }
  });
}

function cleanNotetakerTextValue(value) {
  return value
    .replace(/\[\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]/g, "")
    .replace(/(^|\s)\d{1,2}:\d{2}(?::\d{2})?\s*[-–—]\s*/g, "$1")
    .replace(/\((?:https?:\/\/)?fathom\.video\/[^)]*(?:timestamp|tab=summary)[^)]*\)/gi, "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?fathom\.video\/[^)]*\)/gi, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "**$1**")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sectionizeNotetakerBlocks(blocks) {
  const sections = [];
  let current = null;

  blocks.forEach((block) => {
    if (block.type === "heading") {
      current = { title: block.text, blocks: [] };
      sections.push(current);
      return;
    }

    if (!current) {
      current = { title: "Summary", blocks: [] };
      sections.push(current);
    }
    current.blocks.push(block);
  });

  return sections.filter((section) => section.blocks.length);
}

function getNotetakerHeading(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node;
  const text = element.textContent.trim();
  if (!text || text.length > 80) return "";
  const strong = element.querySelector("strong, b");
  const onlyStrongText = strong?.textContent?.trim() === text;
  return onlyStrongText ? text.replace(/:$/, "") : "";
}

function renderNotetakerSection(section) {
  const wrapper = document.createElement("section");
  const title = document.createElement("h3");
  const body = document.createElement("div");
  const isActionSection = /action|follow.?up|next step/i.test(section.title);

  wrapper.className = `notetaker-section${isActionSection ? " notetaker-section-actions" : ""}`;
  title.className = "notetaker-section-title";
  title.textContent = section.title;
  body.className = "notetaker-section-body";
  appendNotetakerBlocks(body, section.blocks);
  wrapper.append(title, body);
  return wrapper;
}

function appendNotetakerBlocks(container, blocks) {
  let list = null;
  const closeList = () => {
    if (!list) return;
    container.append(list);
    list = null;
  };

  blocks.forEach((block) => {
    if (block.type === "listItem") {
      if (!list) list = document.createElement("ul");
      const item = document.createElement("li");
      appendInlineNotetakerText(item, block.text);
      list.append(item);
      return;
    }

    closeList();
    const paragraph = document.createElement("p");
    appendInlineNotetakerText(paragraph, block.text);
    container.append(paragraph);
  });
  closeList();
}

function appendInlineNotetakerText(parent, value) {
  const tokens = parseInlineNotetakerTokens(value);
  if (!tokens.length) {
    parent.textContent = value;
    return;
  }

  tokens.forEach((token) => {
    if (token.type === "text") {
      parent.append(document.createTextNode(token.value));
      return;
    }
    if (token.type === "strong") {
      const strong = document.createElement("strong");
      strong.textContent = token.value;
      parent.append(strong);
      return;
    }
    if (token.type === "link") {
      const link = document.createElement("a");
      link.href = token.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = token.value;
      parent.append(link);
    }
  });
}

function parseInlineNotetakerTokens(value) {
  const tokens = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(value))) {
    if (match.index > cursor) tokens.push({ type: "text", value: value.slice(cursor, match.index) });
    if (match[1]) {
      tokens.push({ type: "link", value: match[1], href: match[2] });
    } else {
      tokens.push({ type: "strong", value: match[3] });
    }
    cursor = pattern.lastIndex;
  }

  if (cursor < value.length) tokens.push({ type: "text", value: value.slice(cursor) });
  return tokens;
}

function getConvexMissingFunctionMessage(error) {
  if (!String(error?.message || "").includes("Could not find public function")) return "";
  return "Daily notes need Convex deploy.";
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
  personEditors.forEach((editor) => setEditorHtml(editor, ""));
  els.saveStatus.textContent = "";
}

function queueEditorAutosave(editor) {
  if (editor === els.dailyNotes) {
    queueDailyNotesAutosave();
    return;
  }

  queueAutosave();
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

function queueDailyNotesAutosave() {
  if (isHydrating) return;
  clearTimeout(dailyNotesAutosaveTimer);
  els.dailyNotesStatus.textContent = "Saving daily notes soon...";
  dailyNotesAutosaveTimer = window.setTimeout(() => {
    dailyNotesAutosaveTimer = null;
    saveDailyNotes({ silent: true });
  }, 800);
}

async function flushDailyNotesAutosave() {
  if (!dailyNotesAutosaveTimer) return;
  clearTimeout(dailyNotesAutosaveTimer);
  dailyNotesAutosaveTimer = null;
  await saveDailyNotes();
}

function hasSavableContent() {
  return personEditors.some((editor) => editor.textContent.trim());
}

async function jumpToRelativeDate(offsetDays) {
  await flushAutosave();
  await flushDailyNotesAutosave();
  const date = new Date(`${toDateInputValue(new Date())}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  els.date.value = toDateInputValue(date);
  handleDateChange();
}

function updateDateShortcuts() {
  const today = new Date();
  const olderTwo = addDays(today, -3);
  const olderOne = addDays(today, -2);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  els.olderTwoShortcutDate.textContent = formatShortDate(toDateInputValue(olderTwo));
  els.olderOneShortcutDate.textContent = formatShortDate(toDateInputValue(olderOne));
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

function openDatePicker(event) {
  if (event?.type === "focus" && els.date.dataset.pickerOpening === "true") return;
  if (typeof els.date.showPicker !== "function") return;

  try {
    els.date.dataset.pickerOpening = "true";
    els.date.showPicker();
  } catch (error) {
    // Some browsers only allow showPicker from direct user gestures.
  } finally {
    window.setTimeout(() => {
      delete els.date.dataset.pickerOpening;
    }, 0);
  }
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
  queueEditorAutosave(editor);
}

async function copyEditorContents(button) {
  const editor = button.closest(".rich-field").querySelector(".rich-editor");
  const html = getEditorHtml(editor);
  const text = getEditorText(editor);

  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      copyTextFallback(text);
    }

    flashCopyButton(button, "Copied");
  } catch (error) {
    try {
      copyTextFallback(text);
      flashCopyButton(button, "Copied");
    } catch (fallbackError) {
      flashCopyButton(button, "Failed");
    }
  }
}

function flashCopyButton(button, label) {
  const originalLabel = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = originalLabel;
  button.textContent = label;
  button.classList.toggle("is-copied", label === "Copied");
  window.clearTimeout(button.copyResetTimer);
  button.copyResetTimer = window.setTimeout(() => {
    button.textContent = originalLabel;
    button.classList.remove("is-copied");
  }, 1300);
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function handleEditorKeydown(event) {
  if (event.key === "Enter") {
    const item = getCurrentListItem();
    shouldResetNewChecklistItem = item?.closest("ul.check-list") && item.dataset.checked === "true";
  }

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
  if (event.key === "Enter" && shouldResetNewChecklistItem) {
    setCurrentChecklistItemChecked(false);
    shouldResetNewChecklistItem = false;
    queueEditorAutosave(event.currentTarget);
    return;
  }
  if (event.key !== "Enter") shouldResetNewChecklistItem = false;
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
  const editor = item.closest(".rich-editor");
  if (editor) queueEditorAutosave(editor);
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

function getEditorText(editor) {
  return editor.innerText.trim();
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
  const allowedTags = new Set(["A", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "UL", "OL", "LI", "DIV", "P", "BR"]);
  template.content.querySelectorAll("*").forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent || ""));
      return;
    }

    const isChecklist = node.tagName === "UL" && (node.classList.contains("check-list") || node.dataset.list === "checklist");
    const isChecklistItem = node.tagName === "LI" && node.closest("ul.check-list, ul[data-list='checklist']");
    const wasChecked = node.dataset.checked === "true";
    const href = node.tagName === "A" ? node.getAttribute("href") || "" : "";
    [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
    if (node.tagName === "A" && /^https?:\/\//i.test(href)) {
      node.setAttribute("href", href);
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
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

async function convexAction(path, args) {
  return convexCall("action", path, args);
}

async function convexCall(kind, path, args) {
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
    throw new Error(result.errorMessage || `Convex ${kind} failed`);
  }
  return result.value;
}

async function getConvexToken() {
  const session = window.Clerk?.session;
  if (!session) return null;

  const sessionToken = await session.getToken();
  const audience = readJwtPayload(sessionToken)?.aud;
  if (audience === "convex" || (Array.isArray(audience) && audience.includes("convex"))) {
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

function formatMeetingTimestamp(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
