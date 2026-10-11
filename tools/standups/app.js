const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const TEAM_ID = "johns-website-default";
const LOCAL_NAME_KEY = "standups:last-person-name";
const CALL_SHORTCUTS_KEY = "standups:call-shortcuts:v1";
const DEFAULT_CALL_LETTERS = { spotlight: "S", discussions: "D", next: "N", previous: "P" };
const DEFAULT_MEMBER_KEYS = { John: "1", Vivek: "2", Vishal: "3", Jenny: "4" };
// These combinations have system/browser actions even with all three modifiers.
const RESERVED_CALL_LETTERS = new Set(["Q", "I", "A", "V"]);
const isMacKeyboard = /Mac|iPhone|iPad/.test(navigator.platform);
let callShortcuts = readCallShortcuts();
const TEAM_MEMBERS = ["John", "Vivek", "Vishal", "Jenny"];
const COMMENT_FIELDS = ["yesterday", "today", "blockers", "notes"];
const COMMENT_FIELD_LABELS = {
  yesterday: "Yesterday / things I did",
  today: "Today / things to do",
  blockers: "Blockers",
  notes: "Notes",
};

const els = {
  app: document.querySelector("#standupsApp"),
  accessGate: document.querySelector("#accessGate"),
  clerkSignIn: document.querySelector("#clerkSignIn"),
  authStatus: document.querySelector("#authStatus"),
  authBody: document.querySelector("#authBody"),
  authLoading: document.querySelector("#authLoading"),
  authRetry: document.querySelector("#authRetry"),
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
  commentsDate: document.querySelector("#commentsDate"),
  commentsCount: document.querySelector("#commentsCount"),
  commentsSummary: document.querySelector("#commentsSummary"),
  commentsOverview: document.querySelector("#commentsOverview"),
  commentThreadTemplate: document.querySelector("#commentThreadTemplate"),
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
  dateJumpButtons: document.querySelectorAll("[data-date-jump]"),
  entriesList: document.querySelector("#entriesList"),
  unsubmittedList: document.querySelector("#unsubmittedList"),
  entryTemplate: document.querySelector("#entryTemplate"),
};

const personEditors = [els.yesterday, els.today, els.blockers, els.notes];
const allEditors = [...personEditors, els.dailyNotes];
const savedEditorSelections = new WeakMap();
const commentHitTargets = new Map();
let entriesForDate = [];
let activePrevious = null;
let standupComments = [];
let commentsForDate = [];
const openCommentThreads = new Map();
let activeCommentKey = null;
let commentLayoutFrame;
let fathomNotesForDate = [];
let fathomNotesLoadVersion = 0;
let fathomNotesError = "";
let autosaveTimer;
let dailyNotesAutosaveTimer;
let midnightResetTimer;
let activeDailyNotesDate = "";
let isHydrating = false;
let shouldResetNewChecklistItem = false;
let activePersonEditor = els.today;
let personPicker;
let linkEditor;
let activeEntryContext;
let personLoadVersion = 0;
let standupDirty = false;
let standupRevision = 0;
let pendingStandupSave = Promise.resolve(true);
let dailyNotesDirty = false;
let dailyNotesRevision = 0;
let pendingDailyNotesSave = Promise.resolve(true);
let dateLoadVersion = 0;
let spotlightMode = false;
let spotlightCommentsVisible = false;
let personEditingAvailable = false;
const spotlightReservedHeights = new Map();

init();

function init() {
  els.authRetry.addEventListener("click", () => window.location.reload());
  els.authSignOut.addEventListener("click", signOut);
  initializeClerk();
}

function initStandups() {
  els.date.value = toDateInputValue(new Date());
  els.personName.value = localStorage.getItem(LOCAL_NAME_KEY) || "";
  personPicker = window.SearchableSelect.enhance(els.personName);
  document.querySelector("#saveRetry").addEventListener("click", () => flushAutosave());
  configureRichTextCommands();
  configureEditorTools();
  configureMeetingControls();
  setPersonEditingEnabled(false);
  updateDateShortcuts();
  els.date.addEventListener("click", openDatePicker);
  els.date.addEventListener("focus", openDatePicker);
  els.date.addEventListener("change", handleDateChange);
  els.personName.addEventListener("change", () => loadPersonContext({ scrollToUpdate: true }));
  els.notetakerViewButton.addEventListener("click", openNotetakerModal);
  els.notetakerCloseButton.addEventListener("click", closeNotetakerModal);
  window.addEventListener("resize", scheduleCommentLayout);
  window.visualViewport?.addEventListener("resize", scheduleCommentLayout);
  window.visualViewport?.addEventListener("scroll", scheduleCommentLayout);
  new ResizeObserver(scheduleCommentLayout).observe(els.form);
  els.notetakerModal.addEventListener("click", (event) => {
    if (event.target === els.notetakerModal) closeNotetakerModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.repeat) return;
    // Native dialogs and the searchable picker handle their own Escape first.
    if (document.querySelector("dialog[open]")) return;
    if (!els.notetakerModal.hidden) {
      event.preventDefault();
      closeNotetakerModal();
      return;
    }
    if (activeCommentKey) {
      event.preventDefault();
      if (spotlightMode) activateCommentThread(null);
      else closeCommentThread(activeCommentKey);
      return;
    }
    if (callShortcutContextBlocked(event) || !spotlightMode) return;
    event.preventDefault();
    if (spotlightCommentsVisible) setSpotlightCommentsVisible(false);
    else if (!document.querySelector("#spotlightToggle").disabled) toggleSpotlight();
  });
  els.lockButton.addEventListener("click", signOut);
  els.form.addEventListener("submit", (event) => event.preventDefault());
  document.querySelectorAll("[data-date-jump]").forEach((button) => {
    button.addEventListener("click", () => jumpToRelativeDate(Number(button.dataset.dateJump)));
  });
  document.querySelectorAll("[data-date-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedDate = new Date(`${els.date.value}T12:00:00`);
      if (Number.isNaN(selectedDate.getTime())) return;
      els.date.value = toDateInputValue(addDays(selectedDate, Number(button.dataset.dateStep)));
      handleDateChange();
    });
  });
  document.addEventListener("selectionchange", rememberEditorSelection);
  document.querySelectorAll(".editor-toolbar button").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      rememberEditorSelection();
      // Cancelling touch pointerdown suppresses Safari's synthesized click.
      if (event.pointerType === "mouse") event.preventDefault();
    });
  });
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => runEditorCommand(button));
  });
  document.querySelectorAll("[data-copy-editor]").forEach((button) => {
    button.addEventListener("click", () => copyEditorContents(button));
  });
  document.querySelectorAll("[data-comment-editor]").forEach((button) => {
    button.addEventListener("click", () => addCommentForEditor(button));
  });
  allEditors.forEach((editor) => {
    editor.addEventListener("input", () => {
      editor.classList.remove("is-invalid");
      normalizeChecklists(editor);
      queueEditorAutosave(editor);
      updateToolbarState();
      scheduleCommentLayout();
    });
    editor.addEventListener("focus", () => {
      if (personEditors.includes(editor)) activePersonEditor = editor;
      updateToolbarState();
    });
    editor.addEventListener("paste", handleEditorPaste);
    editor.addEventListener("click", handleChecklistClick);
    editor.addEventListener("click", handleCommentHighlightClick);
    editor.addEventListener("keydown", handleEditorKeydown);
    editor.addEventListener("keyup", handleEditorKeyup);
  });

  loadDailyNotes();
  loadFathomNotes();
  scheduleMidnightDateReset();
  Promise.all([refreshDailyList(), loadCommentsForDate()]).then(() => {
    if (els.personName.value.trim()) loadPersonContext();
    updateTodayHeading();
  });
}

function configureMeetingControls() {
  const controls = document.querySelector("#meetingControls");
  const updateHeight = () => {
    document.documentElement.style.setProperty("--meeting-controls-height", `${Math.ceil(controls.getBoundingClientRect().height)}px`);
  };
  new ResizeObserver(updateHeight).observe(controls);
  updateHeight();
  document.querySelector("#spotlightToggle").addEventListener("click", toggleSpotlight);
  document.querySelector("#spotlightCommentsToggle").addEventListener("click", () => {
    setSpotlightCommentsVisible(!spotlightCommentsVisible);
  });
  document.querySelectorAll("[data-person-jump]").forEach((button) => {
    button.addEventListener("click", () => selectMeetingPerson(button.dataset.personJump));
  });
  document.querySelector("#previousPerson").addEventListener("click", () => stepMeetingPerson(-1));
  document.querySelector("#nextPerson").addEventListener("click", () => stepMeetingPerson(1));
  document.querySelectorAll("[data-section-jump]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      scrollToSubmission(els[link.dataset.sectionJump]);
    });
  });
  configureCallShortcuts();
}

function validCallLetters(letters) {
  const values = Object.keys(DEFAULT_CALL_LETTERS).map((action) => letters?.[action]);
  return values.every((letter) => typeof letter === "string" && /^[A-Z]$/.test(letter) && !RESERVED_CALL_LETTERS.has(letter))
    && new Set(values).size === values.length;
}

function readCallShortcuts() {
  try {
    const saved = JSON.parse(localStorage.getItem(CALL_SHORTCUTS_KEY));
    if (typeof saved?.enabled === "boolean" && validCallLetters(saved.letters)) {
      return { ...saved, members: validMemberKeys(saved.members) ? saved.members : { ...DEFAULT_MEMBER_KEYS } };
    }
  } catch { /* Use defaults if preferences are unavailable or outdated. */ }
  return { enabled: true, letters: { ...DEFAULT_CALL_LETTERS }, members: { ...DEFAULT_MEMBER_KEYS } };
}

function validMemberKeys(members) {
  const values = Object.keys(DEFAULT_MEMBER_KEYS).map(person => members?.[person]);
  return values.every(key => typeof key === "string" && /^[1-9]$/.test(key)) && new Set(values).size === values.length;
}

function callShortcutContextBlocked(event) {
  return els.app.hidden || event.defaultPrevented || event.isComposing || event.repeat
    || event.keyCode === 229
    || Boolean(event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]:not([aria-readonly="true"]), [role="combobox"]'))
    || Boolean(document.querySelector('dialog[open], .search-select-trigger[aria-expanded="true"]'))
    || !els.notetakerModal.hidden || Boolean(activeCommentKey);
}

function updateCallShortcutHints() {
  const prefix = isMacKeyboard ? "⌘⌥⇧" : "Ctrl+Alt+Shift+";
  const buttons = { spotlight: "#spotlightToggle", discussions: "#spotlightCommentsToggle", next: "#nextPerson", previous: "#previousPerson" };
  for (const [action, selector] of Object.entries(buttons)) {
    const button = document.querySelector(selector);
    const shortcut = `${prefix}${callShortcuts.letters[action]}`;
    const hint = button.querySelector("[data-shortcut-hint]");
    if (hint) { hint.textContent = shortcut; hint.hidden = !callShortcuts.enabled; }
    button.title = `${button.getAttribute("aria-label")}${callShortcuts.enabled ? ` (${shortcut})` : ""}`;
    if (callShortcuts.enabled) {
      button.setAttribute("aria-keyshortcuts", `${isMacKeyboard ? "Meta" : "Control"}+Alt+Shift+${callShortcuts.letters[action]}`);
    } else button.removeAttribute("aria-keyshortcuts");
  }
  updateMemberShortcutHints();
}

function updateMemberShortcutHints() {
  document.querySelectorAll("[data-person-jump]").forEach(button => {
    const digit = callShortcuts.members[button.dataset.personJump];
    const hint = button.querySelector(".member-shortcut-hint");
    hint.textContent = digit;
    hint.hidden = !callShortcuts.enabled;
    button.title = button.getAttribute("aria-label") + (callShortcuts.enabled ? ` (${isMacKeyboard ? "⌘⌥" : "Ctrl+Alt+"}${digit})` : "");
    if (callShortcuts.enabled) button.setAttribute("aria-keyshortcuts", `${isMacKeyboard ? "Meta" : "Control"}+Alt+${digit}`);
    else button.removeAttribute("aria-keyshortcuts");
  });
}

function configureCallShortcuts() {
  const dialog = document.querySelector("#shortcutDialog");
  const fields = [...dialog.querySelectorAll("[data-shortcut-letter]")];
  const memberFields = [...dialog.querySelectorAll("[data-shortcut-member]")];
  const error = document.querySelector("#shortcutError");
  const populate = (settings) => {
    document.querySelector("#shortcutsEnabled").checked = settings.enabled;
    fields.forEach((input) => { input.value = settings.letters[input.dataset.shortcutLetter]; });
    memberFields.forEach(input => { input.value = settings.members[input.dataset.shortcutMember]; });
    error.textContent = "";
  };
  document.querySelector("#shortcutModifiers").textContent = isMacKeyboard ? "Command + Option + Shift" : "Control + Alt + Shift";
  document.querySelector("#memberShortcutModifiers").textContent = isMacKeyboard ? "Command + Option" : "Control + Alt";
  document.querySelector("#shortcutSettingsButton").addEventListener("click", () => { populate(callShortcuts); dialog.showModal(); });
  document.querySelector("#shortcutClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => document.querySelector("#shortcutSettingsButton").focus({ preventScroll: true }));
  document.querySelector("#shortcutReset").addEventListener("click", () => populate({ enabled: true, letters: DEFAULT_CALL_LETTERS, members: DEFAULT_MEMBER_KEYS }));
  document.querySelector("#shortcutForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const letters = Object.fromEntries(fields.map((input) => [input.dataset.shortcutLetter, input.value.trim().toUpperCase()]));
    if (!validCallLetters(letters)) {
      error.textContent = "Use a different letter A–Z for each action. A, I, Q and V are reserved for browser or system commands.";
      return;
    }
    const members = Object.fromEntries(memberFields.map(input => [input.dataset.shortcutMember, input.value.trim()]));
    if (!validMemberKeys(members)) {
      error.textContent = "Use a different number 1–9 for each teammate.";
      return;
    }
    const settings = { enabled: document.querySelector("#shortcutsEnabled").checked, letters, members };
    try { localStorage.setItem(CALL_SHORTCUTS_KEY, JSON.stringify(settings)); }
    catch { error.textContent = "Couldn’t save these preferences. Your current shortcuts are still active."; return; }
    callShortcuts = settings;
    updateCallShortcutHints();
    dialog.close();
  });
  document.addEventListener("keydown", (event) => {
    if (!callShortcuts.enabled || callShortcutContextBlocked(event)) return;
    const primaryModifier = isMacKeyboard ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!primaryModifier || !event.altKey) return;
    if (!event.shiftKey) {
      const person = TEAM_MEMBERS.find(name => event.code === `Digit${callShortcuts.members[name]}`);
      if (!person || document.querySelector("#spotlightToggle").disabled || !personEditingAvailable) return;
      event.preventDefault();
      selectMeetingPerson(person);
      return;
    }
    const action = Object.keys(DEFAULT_CALL_LETTERS).find((key) => event.code === `Key${callShortcuts.letters[key]}`);
    if (!action || (action === "discussions" && !spotlightMode)) return;
    if (document.querySelector("#spotlightToggle").disabled || !personEditingAvailable) return;
    event.preventDefault();
    if (action === "spotlight") toggleSpotlight();
    else if (action === "discussions") setSpotlightCommentsVisible(!spotlightCommentsVisible);
    else stepMeetingPerson(action === "next" ? 1 : -1);
  });
  updateCallShortcutHints();
}

async function toggleSpotlight() {
  const button = document.querySelector("#spotlightToggle");
  button.disabled = true;
  try {
    if (!spotlightMode && (!await flushAutosave() || !await flushDailyNotesAutosave())) return;
    rememberEditorSelection();
    const scrollPosition = { top: window.scrollY, left: window.scrollX, behavior: "instant" };
    // Keep filtered comments from shortening the page or moving nearby sidebar cards.
    if (!spotlightMode) {
      document.querySelectorAll(".daily-list, .comments-card").forEach((element) => {
        spotlightReservedHeights.set(element, element.style.minHeight);
        element.style.minHeight = `${element.getBoundingClientRect().height}px`;
      });
    }
    spotlightMode = !spotlightMode;
    document.body.classList.toggle("is-spotlight", spotlightMode);
    const label = spotlightMode ? "Exit spotlight" : "Spotlight";
    button.querySelector(".meeting-button-label").textContent = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(spotlightMode));
    setPersonEditingEnabled(personEditingAvailable);
    setSpotlightCommentsVisible(false);
    updateSpotlightSections();
    document.querySelectorAll(".topbar, .previous-panel, #documentToolbar, #editorContext, .form-actions, .daily-list > :not(.comments-card)").forEach((element) => {
      element.inert = spotlightMode;
    });
    if (!spotlightMode) {
      spotlightReservedHeights.forEach((minHeight, element) => { element.style.minHeight = minHeight; });
      spotlightReservedHeights.clear();
    }
    if (spotlightMode) {
      window.getSelection()?.removeAllRanges();
      if (!els.notetakerModal.hidden) closeNotetakerModal();
    }
    button.disabled = false;
    button.focus({ preventScroll: true });
    window.scrollTo(scrollPosition);
    scheduleCommentLayout();
  } finally {
    button.disabled = false;
  }
}

function setSpotlightCommentsVisible(visible) {
  spotlightCommentsVisible = spotlightMode && visible;
  document.body.classList.toggle("spotlight-comments-visible", spotlightCommentsVisible);
  const button = document.querySelector("#spotlightCommentsToggle");
  button.inert = !spotlightMode;
  button.setAttribute("aria-hidden", String(!spotlightMode));
  document.querySelector(".daily-list").inert = spotlightMode && !spotlightCommentsVisible;
  const label = spotlightCommentsVisible ? "Hide comments" : "Show comments";
  button.querySelector(".meeting-button-label").textContent = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(spotlightCommentsVisible));
  updateCallShortcutHints();
  // Hide open panels without destroying comment drafts when toggling views.
  if (!spotlightCommentsVisible) activateCommentThread(null);
  renderItemComments();
  renderGlobalComments();
  scheduleCommentLayout();
}

function updateSpotlightSections() {
  for (const id of ["blockers", "notes"]) {
    const empty = !els[id].textContent.trim();
    els[id].closest(".rich-field").classList.toggle("spotlight-empty", empty);
    const link = document.querySelector(`[data-section-jump="${id}"]`);
    link.classList.toggle("spotlight-empty", empty);
    link.inert = spotlightMode && empty;
  }
}

function updateMeetingNavigation() {
  const selected = els.personName.value;
  const index = TEAM_MEMBERS.indexOf(selected);
  document.querySelector("#memberPosition").textContent = index >= 0 ? `${index + 1} of ${TEAM_MEMBERS.length}` : "Choose a person";
  const submitted = new Set(entriesForDate.map((entry) => entry.personName));
  document.querySelectorAll("[data-person-jump]").forEach((button) => {
    const person = button.dataset.personJump;
    button.setAttribute("aria-pressed", String(person === selected));
    button.classList.toggle("has-submission", submitted.has(person));
    button.title = `${person} · ${submitted.has(person) ? "Update submitted" : "No update yet"}`;
    button.setAttribute("aria-label", button.title);
  });
  updateMemberShortcutHints();
}

async function selectMeetingPerson(personName) {
  if (els.personName.value === personName && activeEntryContext?.personName === personName && personEditingAvailable) {
    scrollToSubmission();
    return;
  }
  els.personName.value = personName;
  personPicker.sync();
  await loadPersonContext({ scrollToUpdate: true });
}

function stepMeetingPerson(direction) {
  const index = TEAM_MEMBERS.indexOf(els.personName.value);
  const next = index < 0 ? (direction > 0 ? 0 : TEAM_MEMBERS.length - 1)
    : (index + direction + TEAM_MEMBERS.length) % TEAM_MEMBERS.length;
  selectMeetingPerson(TEAM_MEMBERS[next]);
}

function scrollToSubmission(target = document.querySelector(".today-panel")) {
  const bar = document.querySelector("#meetingControls");
  const height = bar.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--meeting-controls-height", `${Math.ceil(height)}px`);
  const isSection = target.classList.contains("rich-editor");
  const scrollTarget = isSection ? target.closest(".rich-field") : target;
  const toolbarOffset = isSection && !spotlightMode ? document.querySelector("#documentToolbar").getBoundingClientRect().height + 28 : 16;
  window.scrollTo({ top: Math.max(0, window.scrollY + scrollTarget.getBoundingClientRect().top - height - toolbarOffset), behavior: "instant" });
}

function getToolbarEditor(button) {
  return button.closest(".rich-field")?.querySelector(".rich-editor") || activePersonEditor;
}

function setPersonEditingEnabled(enabled) {
  personEditingAvailable = enabled;
  document.querySelector(".today-panel").setAttribute("aria-busy", String(!enabled));
  personEditors.forEach((editor) => {
    editor.contentEditable = String(enabled && !spotlightMode);
    editor.setAttribute("aria-readonly", String(spotlightMode));
    editor.setAttribute("aria-disabled", String(!enabled));
  });
  document.querySelectorAll("#documentToolbar button").forEach((button) => { button.disabled = !enabled; });
  document.querySelector("#editorContext").textContent = enabled
    ? `Editing ${COMMENT_FIELD_LABELS[activePersonEditor.id].split(" /")[0]} · select text to format or comment`
    : els.personName.value ? "Loading update…" : "Choose a team member to start writing";
}

function updateToolbarState() {
  const selection = window.getSelection();
  document.querySelectorAll(".editor-toolbar").forEach((toolbar) => {
    const editor = getToolbarEditor(toolbar);
    const hasSelection = editorContainsSelection(editor, selection);
    toolbar.querySelectorAll("[data-command][aria-pressed]").forEach((button) => {
      const command = button.dataset.command;
      let pressed = false;
      if (hasSelection) {
        const checklist = Boolean(getCurrentListItem()?.closest("ul.check-list"));
        pressed = command === "toggleChecklist" ? checklist
          : command === "insertUnorderedList" ? !checklist && document.queryCommandState(command)
          : document.queryCommandState(command);
      }
      button.setAttribute("aria-pressed", String(pressed));
    });
  });
  if (activePersonEditor.isContentEditable) {
    document.querySelector("#editorContext").textContent = `Editing ${COMMENT_FIELD_LABELS[activePersonEditor.id].split(" /")[0]} · select text to format or comment`;
  }
}

function configureEditorTools() {
  document.querySelectorAll(".editor-toolbar button").forEach((button) => {
    if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", button.textContent.trim() === "Comment" || button.hasAttribute("data-copy-editor") ? button.textContent.trim() : button.title || button.textContent);
  });
  document.querySelectorAll("[data-link-editor]").forEach((button) => {
    button.addEventListener("click", () => openLinkDialog(getToolbarEditor(button)));
  });
  document.querySelectorAll(".editor-toolbar").forEach((toolbar) => {
    toolbar.setAttribute("role", "toolbar");
    toolbar.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const buttons = [...toolbar.querySelectorAll("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    });
  });
  const dialog = document.querySelector("#linkDialog");
  document.querySelector("#linkCancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { if (linkEditor) restoreEditorSelection(linkEditor); });
  document.querySelector("#linkForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const url = document.querySelector("#linkUrl").value.trim();
    if (!/^https?:\/\//i.test(url)) {
      document.querySelector("#linkError").textContent = "Use a web address starting with https:// or http://.";
      return;
    }
    dialog.close();
    restoreEditorSelection(linkEditor);
    if (window.getSelection()?.isCollapsed) {
      document.execCommand("insertHTML", false, `<a href="${escapeHtml(url).replace(/"/g, "&quot;")}">${escapeHtml(url)}</a>`);
    } else {
      document.execCommand("createLink", false, url);
    }
    rememberEditorSelection();
    queueEditorAutosave(linkEditor);
  });
}

function openLinkDialog(editor) {
  if (!editor.isContentEditable) return;
  rememberEditorSelection();
  linkEditor = editor;
  const node = window.getSelection()?.anchorNode;
  const anchor = (node?.nodeType === Node.TEXT_NODE ? node.parentElement : node)?.closest?.("a");
  document.querySelector("#linkUrl").value = anchor?.getAttribute("href") || "";
  document.querySelector("#linkError").textContent = "";
  document.querySelector("#linkDialog").showModal();
  document.querySelector("#linkUrl").focus();
}

function handleEditorPaste(event) {
  const data = event.clipboardData;
  if (!data) return;
  event.preventDefault();
  const html = data.getData("text/html");
  const text = data.getData("text/plain");
  if (html) document.execCommand("insertHTML", false, sanitizeRichText(html));
  else document.execCommand("insertText", false, text);
  normalizeChecklists(event.currentTarget);
  rememberEditorSelection();
  queueEditorAutosave(event.currentTarget);
  scheduleCommentLayout();
}

function configureRichTextCommands() {
  try {
    document.execCommand("styleWithCSS", false, false);
    document.execCommand("defaultParagraphSeparator", false, "div");
  } catch (error) {
    // Browser support varies; the editor still works without these hints.
  }
}

function setAuthState(state, message = "") {
  els.accessGate.dataset.state = state;
  els.authBody.hidden = state === "error";
  els.authBody.setAttribute("aria-busy", String(state === "loading" || state === "verifying"));
  els.authLoading.hidden = state !== "loading" && state !== "verifying";
  els.authStatus.hidden = false;
  els.authStatus.textContent = message;
  els.authRetry.hidden = state !== "error" || Boolean(window.Clerk?.isSignedIn);
}

function waitForClerkScripts() {
  return new Promise((resolve, reject) => {
    const scripts = [...document.querySelectorAll("script[data-clerk-script]")];
    const finish = (error) => {
      clearTimeout(timer);
      scripts.forEach((script) => {
        script.removeEventListener("load", check);
        script.removeEventListener("error", failed);
      });
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (window.Clerk && window.__internal_ClerkUICtor) finish();
    };
    const failed = () => finish(new Error("Sign-in could not load."));
    const timer = window.setTimeout(failed, 20000);
    scripts.forEach((script) => {
      script.addEventListener("load", check);
      script.addEventListener("error", failed);
    });
    check();
  });
}

async function initializeClerk() {
  let observer;
  let mountTimeout;
  try {
    await waitForClerkScripts();
    await window.Clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      localization: { signIn: { start: { title: "Sign in", titleCombined: "Sign in" } } },
    });

    if (window.Clerk.isSignedIn) {
      await unlockApp();
      return;
    }

    const revealSignIn = () => {
      if (!els.clerkSignIn.querySelector("input, button, [role='alert']")) return;
      observer.disconnect();
      clearTimeout(mountTimeout);
      setAuthState("ready");
    };
    observer = new MutationObserver(revealSignIn);
    observer.observe(els.clerkSignIn, { childList: true, subtree: true });
    mountTimeout = window.setTimeout(() => {
      observer.disconnect();
      showAuthError(new Error("Sign-in did not become ready."));
    }, 20000);
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
    revealSignIn();
  } catch (error) {
    observer?.disconnect();
    clearTimeout(mountTimeout);
    console.error(error);
    showAuthError(error);
  }
}

async function unlockApp() {
  setAuthState("verifying", "Opening your workspace…");
  try {
    const viewer = await convexQuery("standups:verify", {});
    els.accessGate.setAttribute("hidden", "");
    els.app.removeAttribute("hidden");
    els.lockButton.textContent = "Sign out";
    els.lockButton.title = viewer.email ? `Signed in as ${viewer.email}` : "Sign out";
    els.lockButton.setAttribute("aria-label", viewer.email ? `Sign out ${viewer.email}` : "Sign out");
    initStandups();
  } catch (error) {
    console.error(error);
    showAuthError(error);
  }
}

async function signOut() {
  closeAllCommentThreads();
  await flushAutosave();
  await flushDailyNotesAutosave();
  if (window.Clerk?.isSignedIn) await window.Clerk.signOut();
  window.location.assign(window.location.href.split("#")[0]);
}

function showAuthError(error) {
  const message = String(error?.message || error || "");
  els.app.setAttribute("hidden", "");
  els.accessGate.removeAttribute("hidden");
  setAuthState("error", /not authorized/i.test(message)
    ? "This email doesn't have access to standups. Try a different email."
    : "We couldn't open secure sign-in. Check your connection and try again.");
  els.authSignOut.hidden = !window.Clerk?.isSignedIn;
}

async function handleDateChange() {
  const version = ++dateLoadVersion;
  ++personLoadVersion;
  setPersonEditingEnabled(false);
  const saved = await flushAutosave();
  const dailySaved = await flushDailyNotesAutosave();
  if (version !== dateLoadVersion) return;
  if (!saved || !dailySaved) { restoreDocumentContext(); return; }
  closeAllCommentThreads();
  clearForm();
  clearItemComments();
  updateDateShortcuts();
  await Promise.all([refreshDailyList(), loadDailyNotes(), loadFathomNotes(), loadCommentsForDate()]);
  if (version !== dateLoadVersion) return;
  updateTodayHeading();
  if (els.personName.value.trim()) loadPersonContext({ scrollToUpdate: true });
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

async function loadPersonContext({ scrollToUpdate = false } = {}) {
  if (spotlightMode) setSpotlightCommentsVisible(false);
  const version = ++personLoadVersion;
  const personName = els.personName.value.trim();
  const standupDate = els.date.value;
  setPersonEditingEnabled(false);
  const saved = await flushAutosave();
  if (version !== personLoadVersion) return;
  if (!saved) { restoreDocumentContext(); return; }
  closeAllCommentThreads();
  personPicker.sync();
  updateTodayHeading();
  if (!personName) {
    clearForm();
    activeEntryContext = null;
    els.previousTitle.textContent = "No person selected";
    els.previousContent.className = "previous-content empty-state";
    els.previousContent.textContent = "Choose a team member to view their previous update.";
    return;
  }

  clearTimeout(autosaveTimer);
  localStorage.setItem(LOCAL_NAME_KEY, personName);
  els.previousTitle.textContent = "Loading previous update";
  els.previousContent.className = "previous-content empty-state";
  els.previousContent.textContent = "Looking for the most recent prior submission...";
  els.saveStatus.textContent = "";
  clearItemComments();

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

    if (version !== personLoadVersion || personName !== els.personName.value || standupDate !== els.date.value) return;
    activeEntryContext = { personName, standupDate };
    activePrevious = previous;
    setPersonEditingEnabled(true);
    standupComments = commentsForDate.filter((comment) => comment.personName === personName);
    fillCurrent(current);
    renderPrevious(previous, personName);
    renderItemComments();
    renderGlobalComments();
    updateMeetingNavigation();
    if (scrollToUpdate) scrollToSubmission();
  } catch (error) {
    if (version !== personLoadVersion || personName !== els.personName.value || standupDate !== els.date.value) return;
    console.error(error);
    els.previousTitle.textContent = "Convex unavailable";
    els.previousContent.className = "previous-content empty-state";
    els.previousContent.textContent = "I could not load the comparison yet.";
    clearItemComments();
  }
}

async function saveStandup({ silent = false } = {}) {
  if (!activeEntryContext) return true;
  const context = { ...activeEntryContext };
  const revision = standupRevision;
  const payload = {
    teamId: TEAM_ID, ...context,
    yesterday: getEditorHtml(els.yesterday), today: getEditorHtml(els.today),
    blockers: getEditorHtml(els.blockers), notes: getEditorHtml(els.notes),
  };
  if (!silent) els.saveStatus.textContent = "Saving…";
  pendingStandupSave = pendingStandupSave.then(async () => {
    try {
      await convexMutation("standups:save", payload);
      if (revision === standupRevision) {
        standupDirty = false;
        els.saveStatus.textContent = `Last saved ${formatTime(Date.now())}`;
        document.querySelector("#saveRetry").hidden = true;
      }
      await refreshDailyList();
      if (activeEntryContext?.personName === context.personName && activeEntryContext?.standupDate === context.standupDate) {
        renderPrevious(activePrevious, context.personName);
      }
      return true;
    } catch (error) {
      console.error(error);
      els.saveStatus.textContent = "Couldn't save. Your edits are still here.";
      document.querySelector("#saveRetry").hidden = false;
      return false;
    }
  });
  return pendingStandupSave;
}

async function loadDailyNotes() {
  const standupDate = els.date.value;
  activeDailyNotesDate = standupDate;
  els.dailyNotes.contentEditable = "false";
  els.dailyNotesDate.textContent = formatDate(els.date.value);
  els.dailyNotesStatus.textContent = "Loading daily notes...";

  try {
    const entry = await convexQuery("standups:getDayNotes", {
      teamId: TEAM_ID,
      standupDate: els.date.value,
    });

    if (standupDate !== els.date.value) return;
    dailyNotesDirty = false;
    dailyNotesRevision++;
    els.dailyNotes.contentEditable = "true";
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
  const version = ++fathomNotesLoadVersion;
  const standupDate = els.date.value;
  fathomNotesForDate = [];
  fathomNotesError = "";
  closeNotetakerModal();
  els.notetakerDate.textContent = formatDate(standupDate);
  els.notetakerModalDate.textContent = formatDate(standupDate);
  els.notetakerSummary.textContent = "Loading Fathom notes...";
  els.notetakerStatus.textContent = "Loading notetaker notes...";
  els.notetakerViewButton.disabled = true;
  els.notetakerViewButton.setAttribute("aria-busy", "true");

  try {
    const notes = await convexQuery("standups:listFathomNotesForDate", {
      teamId: TEAM_ID,
      standupDate,
    });
    if (version !== fathomNotesLoadVersion || standupDate !== els.date.value) return;
    fathomNotesForDate = notes || [];
    renderFathomNotesSummary();
  } catch (error) {
    if (version !== fathomNotesLoadVersion || standupDate !== els.date.value) return;
    console.error(error);
    fathomNotesForDate = [];
    fathomNotesError = "Couldn't load meeting notes. Choose this date again to retry.";
    els.notetakerSummary.textContent = "Could not load Fathom notes.";
    els.notetakerStatus.textContent = getConvexMissingFunctionMessage(error) || "Notetaker notes unavailable.";
  } finally {
    if (version === fathomNotesLoadVersion) {
      els.notetakerViewButton.disabled = false;
      els.notetakerViewButton.setAttribute("aria-busy", "false");
    }
  }
}

function renderFathomNotesSummary() {
  const count = fathomNotesForDate.length;
  els.notetakerSummary.textContent = count
    ? `${count} Affilignment meeting${count === 1 ? "" : "s"} imported for this date.`
    : "No Affilignment meeting notes imported for this date.";
  els.notetakerStatus.textContent = count ? "Notetaker notes ready" : "";
}

async function saveDailyNotes({ silent = false } = {}) {
  const standupDate = activeDailyNotesDate || els.date.value;
  if (!standupDate) return true;
  const revision = dailyNotesRevision;
  const payload = { teamId: TEAM_ID, standupDate, notes: getEditorHtml(els.dailyNotes) };
  if (!silent) els.dailyNotesStatus.textContent = "Saving team notes…";
  pendingDailyNotesSave = pendingDailyNotesSave.then(async () => {
    try {
      await convexMutation("standups:saveDayNotes", payload);
      if (revision === dailyNotesRevision) {
        dailyNotesDirty = false;
        els.dailyNotesStatus.textContent = `Last saved ${formatTime(Date.now())}`;
      }
      return true;
    } catch (error) {
      console.error(error);
      els.dailyNotesStatus.textContent = "Couldn't save team notes. Edit again to retry.";
      return false;
    }
  });
  return pendingDailyNotesSave;
}

function openNotetakerModal() {
  renderFathomNotesModal();
  els.notetakerModal.removeAttribute("hidden");
  els.notetakerCloseButton.focus();
}

function closeNotetakerModal() {
  const wasOpen = !els.notetakerModal.hidden;
  els.notetakerModal.setAttribute("hidden", "");
  if (wasOpen) els.notetakerViewButton.focus({ preventScroll: true });
}

function renderFathomNotesModal() {
  if (!fathomNotesForDate.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = fathomNotesError || "No meeting notes imported for this date yet.";
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

  const actionItems = normalizeFathomActionItems(note.actionItems);
  if (actionItems.length) content.append(renderFathomActionItems(actionItems));

  const template = document.createElement("template");
  template.innerHTML = sanitizeRichText(note.html);
  removeGeneratedFathomHeader(template.content);
  removeActionItemsSection(template.content);
  const sections = sectionizeNotetakerBlocks(extractNotetakerBlocks(template.content));
  if (!sections.length) {
    if (!actionItems.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No readable notetaker notes were found for this meeting.";
      content.append(empty);
    }
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

function removeActionItemsSection(fragment) {
  const children = [...fragment.childNodes];
  const actionHeadingIndex = children.findIndex((node) => /^Action items$/i.test(node.textContent?.trim() || ""));
  if (actionHeadingIndex === -1) return;

  children.slice(actionHeadingIndex).forEach((node) => node.remove());
}

function normalizeFathomActionItems(value) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          description: cleanNotetakerTextValue(item?.description || ""),
          completed: Boolean(item?.completed),
          playbackUrl: item?.playbackUrl || "",
          assigneeName: item?.assigneeName || "",
          assigneeEmail: item?.assigneeEmail || "",
        }))
        .filter((item) => item.description)
    : [];
}

function renderFathomActionItems(items) {
  const section = document.createElement("section");
  const header = document.createElement("div");
  const title = document.createElement("h3");
  const count = document.createElement("span");
  const list = document.createElement("div");

  section.className = "notetaker-action-panel";
  header.className = "notetaker-action-header";
  title.textContent = "Action Items";
  count.textContent = `${items.length} to confirm`;
  list.className = "notetaker-action-list";
  list.append(...items.map(renderFathomActionItem));
  header.append(title, count);
  section.append(header, list);
  return section;
}

function renderFathomActionItem(item) {
  const row = document.createElement("article");
  const check = document.createElement("span");
  const body = document.createElement("div");
  const text = document.createElement("p");
  const meta = document.createElement("div");

  row.className = `notetaker-action-item${item.completed ? " is-complete" : ""}`;
  check.className = "notetaker-action-check";
  check.textContent = item.completed ? "✓" : "";
  body.className = "notetaker-action-body";
  appendInlineNotetakerText(text, item.description);
  meta.className = "notetaker-action-meta";

  if (item.assigneeName || item.assigneeEmail) {
    const assignee = document.createElement("span");
    assignee.textContent = item.assigneeName || item.assigneeEmail;
    meta.append(assignee);
  }
  if (item.playbackUrl) {
    const link = document.createElement("a");
    link.href = item.playbackUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Jump to moment";
    meta.append(link);
  }

  body.append(text);
  if (meta.childElementCount) body.append(meta);
  row.append(check, body);
  return row;
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
  standupDirty = false;
  standupRevision++;
  document.querySelector("#saveRetry").hidden = true;
  isHydrating = true;
  setEditorHtml(els.yesterday, entry?.yesterday || "");
  setEditorHtml(els.today, entry?.today || "");
  setEditorHtml(els.blockers, entry?.blockers || "");
  setEditorHtml(els.notes, entry?.notes || "");
  isHydrating = false;
  updateSpotlightSections();
  if (entry) {
    els.saveStatus.textContent = `Last saved ${formatTime(entry.updatedAt)}`;
  } else {
    els.saveStatus.textContent = "Autosave ready";
  }
}

async function reloadItemComments() {
  await loadCommentsForDate();
}

function renderItemComments() {
  clearEditorCommentMarkers();
  COMMENT_FIELDS.forEach((fieldName) => {
    const editor = els[fieldName];
    const groups = groupComments(standupComments.filter((comment) => comment.fieldName === fieldName));
    groups.forEach((group) => addCommentMarker(editor, group));
  });
  renderCommentHighlights();
}

function clearItemComments() {
  standupComments = [];
  clearEditorCommentMarkers();
}

async function loadCommentsForDate() {
  const requestedDate = els.date.value;
  els.commentsDate.textContent = formatDate(els.date.value);
  els.commentsSummary.textContent = "Loading comments...";
  els.commentsOverview.replaceChildren();

  try {
    const results = await Promise.all(
      TEAM_MEMBERS.map((personName) =>
        convexQuery("standups:listItemComments", {
          teamId: TEAM_ID,
          standupDate: requestedDate,
          personName,
        }),
      ),
    );
    if (els.date.value !== requestedDate) return;
    commentsForDate = results.flat().sort((a, b) => a.createdAt - b.createdAt);
    const selectedPerson = els.personName.value.trim();
    standupComments = selectedPerson
      ? commentsForDate.filter((comment) => comment.personName === selectedPerson)
      : [];
    renderGlobalComments();
    renderItemComments();
  } catch (error) {
    if (els.date.value !== requestedDate) return;
    console.error(error);
    commentsForDate = [];
    standupComments = [];
    els.commentsCount.textContent = "0";
    els.commentsSummary.textContent = "Could not load comments.";
    clearEditorCommentMarkers();
  }
}

function renderGlobalComments() {
  const visibleComments = spotlightMode ? commentsForDate.filter((comment) => comment.personName === els.personName.value) : commentsForDate;
  const groups = groupComments(visibleComments);
  const drafts = [...openCommentThreads.values()]
    .filter((thread) => !spotlightMode || thread.target.personName === els.personName.value)
    .filter((thread) => !groups.some((group) => group.key === thread.target.key))
    .map((thread) => thread.target);
  els.commentsCount.textContent = String(groups.length);
  els.commentsCount.setAttribute("aria-label", `${groups.length} comment thread${groups.length === 1 ? "" : "s"}`);
  els.commentsSummary.textContent = spotlightMode
    ? groups.length ? `${groups.length} thread${groups.length === 1 ? "" : "s"} for ${els.personName.value}.` : "No comments on this update."
    : groups.length ? `${groups.length} comment thread${groups.length === 1 ? "" : "s"} across this date's standups.` : "No comments for this date yet.";
  els.commentsOverview.replaceChildren(...[...drafts, ...groups].map(renderGlobalCommentButton));
}

function renderGlobalCommentButton(group) {
  const button = document.createElement("button");
  const marker = document.createElement("span");
  const copy = document.createElement("span");
  const meta = document.createElement("span");
  const excerpt = document.createElement("span");

  button.type = "button";
  button.className = "comment-overview-item";
  marker.className = "comment-overview-marker";
  marker.textContent = group.comments.length ? String(group.comments.length) : "＋";
  copy.className = "comment-overview-copy";
  meta.className = "comment-overview-meta";
  meta.textContent = `${group.personName} · ${COMMENT_FIELD_LABELS[group.fieldName] || group.fieldName}`;
  excerpt.className = "comment-overview-excerpt";
  excerpt.textContent = group.comments[0]?.comment || "New comment";
  copy.append(meta, excerpt);
  button.append(marker, copy);
  if (activeCommentKey === group.key) {
    button.classList.add("is-active");
    button.setAttribute("aria-current", "true");
  }
  button.addEventListener("click", () => openCommentThread(group, { opener: button }));
  return button;
}

function groupComments(comments) {
  const grouped = new Map();
  comments.forEach((comment) => {
    const key = `${comment.personKey}:${comment.fieldName}:${comment.itemKey}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        personKey: comment.personKey,
        personName: comment.personName,
        fieldName: comment.fieldName,
        itemKey: comment.itemKey,
        itemText: comment.itemText,
        comments: [],
      });
    }
    grouped.get(key).comments.push(comment);
  });
  return [...grouped.values()].sort((a, b) => {
    const latestA = a.comments.at(-1)?.createdAt || 0;
    const latestB = b.comments.at(-1)?.createdAt || 0;
    return latestB - latestA;
  });
}

function addCommentMarker(editor, group) {
  const block = findCommentTargetBlock(editor, group);
  if (!block) return;

  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = "comment-marker";
  marker.contentEditable = "false";
  marker.dataset.count = String(group.comments.length);
  marker.setAttribute(
    "aria-label",
    `View ${group.comments.length} comment${group.comments.length === 1 ? "" : "s"} on this item`,
  );
  marker.setAttribute("title", "View comments");
  marker.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCommentThread(group, { opener: marker });
  });
  block.classList.add("has-comment-marker");
  block.append(marker);
}

// Build a text-to-DOM map without inserting wrappers into the editable content.
// Spaces between blocks and <br>s let selections span formatting and list items.
function commentTextIndex(editor) {
  const chars = [];
  const append = (value, start, end) => {
    const char = /\s/.test(value) ? " " : value;
    if (char === " " && !chars.length) return;
    if (char === " " && chars.at(-1)?.char === " ") chars.at(-1).end = end;
    else chars.push({ char, start, end });
  };
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      for (let offset = 0; offset < node.length; offset++) {
        append(node.data[offset], { node, offset }, { node, offset: offset + 1 });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches(".comment-marker")) return;
    [...node.childNodes].forEach((child, offset) => {
      const isBlock = child.nodeType === Node.ELEMENT_NODE && /^(LI|P|DIV|BR)$/.test(child.tagName);
      if (isBlock) append(" ", { node, offset }, { node, offset });
      visit(child);
      if (isBlock) append(" ", { node, offset: offset + 1 }, { node, offset: offset + 1 });
    });
  };
  visit(editor);
  if (chars.at(-1)?.char === " ") chars.pop();
  return { text: chars.map((entry) => entry.char).join(""), chars };
}

function indexedCommentRange(index, start, end) {
  if (start < 0 || end <= start || !index.chars[start] || !index.chars[end - 1]) return null;
  const range = document.createRange();
  const first = index.chars[start].start;
  const last = index.chars[end - 1].end;
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset);
  return range;
}

function resolveCommentRange(editor, target) {
  const index = commentTextIndex(editor);
  const quote = normalizeItemText(target.itemText);
  if (!quote) return null;
  let anchor;
  // Keep existing threads compatible; new keys carry selection context alongside
  // their unique thread ID using the backend's existing opaque itemKey field.
  const encoded = target.itemKey.split(":range-v1:")[1];
  if (encoded) {
    try { anchor = JSON.parse(decodeURIComponent(encoded)); } catch { return null; }
    if (!Number.isInteger(anchor?.start) || !Number.isInteger(anchor?.end) ||
        typeof anchor.prefix !== "string" || typeof anchor.suffix !== "string") return null;
  }
  const matches = [];
  for (let start = index.text.indexOf(quote); start !== -1; start = index.text.indexOf(quote, start + 1)) {
    matches.push(start);
  }
  let start;
  if (anchor) {
    const scores = matches.map((offset) => ({ offset, score:
      Number(anchor.prefix ? index.text.slice(0, offset).endsWith(anchor.prefix) : offset === 0) +
      Number(anchor.suffix ? index.text.slice(offset + quote.length).startsWith(anchor.suffix) : offset + quote.length === index.text.length),
    }));
    const best = Math.max(0, ...scores.map((entry) => entry.score));
    const contextual = scores.filter((entry) => best > 0 && entry.score === best).map((entry) => entry.offset);
    start = contextual.includes(anchor.start) ? anchor.start : contextual.length === 1 ? contextual[0] : undefined;
  }
  if (start === undefined && !anchor && matches.length === 1) start = matches[0];
  // An old or edited ambiguous quote has no trustworthy location. It remains
  // available in the overview instead of highlighting unrelated text.
  return start === undefined ? null : indexedCommentRange(index, start, start + quote.length);
}

function findCommentTargetBlock(editor, group) {
  const range = resolveCommentRange(editor, group);
  if (!range) return null;
  const node = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  const block = node.closest("li, p, div");
  return block && editor.contains(block) ? block : editor;
}

function renderCommentHighlights() {
  commentHitTargets.clear();
  if (spotlightMode && !spotlightCommentsVisible) {
    window.CSS?.highlights?.delete("standup-comments");
    window.CSS?.highlights?.delete("standup-active-comment");
    return;
  }
  const targets = new Map(groupComments(standupComments).map((group) => [group.key, group]));
  const active = openCommentThreads.get(activeCommentKey);
  if (active?.target.personName === els.personName.value) targets.set(activeCommentKey, active.target);
  const ranges = [];
  const activeRanges = [];
  targets.forEach((target, key) => {
    const editor = els[target.fieldName];
    if (!editor || target.personName !== els.personName.value) return;
    const range = resolveCommentRange(editor, target);
    if (!range) return;
    ranges.push(range);
    if (key === activeCommentKey) activeRanges.push(range);
    commentHitTargets.set(key, { target, range, editor });
  });
  if (window.CSS?.highlights && window.Highlight) {
    CSS.highlights.set("standup-comments", new Highlight(...ranges));
    const focused = new Highlight(...activeRanges);
    focused.priority = 1;
    CSS.highlights.set("standup-active-comment", focused);
  }
}

function handleCommentHighlightClick(event) {
  if (event.defaultPrevented || event.target.closest("button") || !window.getSelection()?.isCollapsed) return;
  const hits = [...commentHitTargets.values()].filter(({ editor, range }) =>
    editor === event.currentTarget && [...range.getClientRects()].some((rect) =>
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom));
  // For overlapping selections, prefer the most specific (shortest) quote.
  hits.sort((a, b) => a.target.itemText.length - b.target.itemText.length);
  if (hits[0]) openCommentThread(hits[0].target, { opener: hits[0].editor });
}

function clearEditorCommentMarkers() {
  commentHitTargets.clear();
  window.CSS?.highlights?.delete("standup-comments");
  window.CSS?.highlights?.delete("standup-active-comment");
  personEditors.forEach((editor) => {
    editor.querySelectorAll(".comment-marker").forEach((marker) => marker.remove());
    editor.classList.remove("has-comment-marker");
    editor.querySelectorAll(".has-comment-marker").forEach((block) => block.classList.remove("has-comment-marker"));
  });
}

function addCommentForEditor(source) {
  if (spotlightMode) return;
  const editor = source.classList.contains("rich-editor") ? source : getToolbarEditor(source);
  if (!personEditors.includes(editor)) return;
  const personName = els.personName.value.trim();
  if (!personName) {
    els.saveStatus.textContent = "Select a person before commenting.";
    return;
  }

  if (source !== editor) restoreEditorSelection(editor);
  const target = getCommentTarget(editor);
  if (!target.itemText) {
    els.saveStatus.textContent = "Put your cursor in an item before commenting.";
    editor.focus();
    return;
  }

  // Each new comment gets its own thread; replies reuse that thread's item key.
  const itemKey = `${target.itemKey}:${crypto.randomUUID()}:range-v1:${encodeURIComponent(JSON.stringify(target.anchor))}`;
  openCommentThread({
    key: `${normalizePersonKey(personName)}:${editor.id}:${itemKey}`,
    personKey: normalizePersonKey(personName),
    personName,
    fieldName: editor.id,
    itemKey,
    itemText: target.itemText,
    comments: [],
  }, { opener: editor, focusReply: true, anchor: getCurrentTextBlock() });
}

async function deleteItemComment(commentId) {
  try {
    await convexMutation("standups:deleteItemComment", { commentId });
    els.saveStatus.textContent = `Comment removed ${formatTime(Date.now())}`;
    await reloadItemComments();
    refreshOpenCommentThreads();
  } catch (error) {
    console.error(error);
    els.saveStatus.textContent = "Comment remove failed.";
  }
}

function openCommentThread(target, { opener, focusReply = false, anchor } = {}) {
  if (spotlightMode && !spotlightCommentsVisible) return;
  let thread = openCommentThreads.get(target.key);
  if (!thread) {
    const panel = els.commentThreadTemplate.content.firstElementChild.cloneNode(true);
    const refs = {};
    const suffix = crypto.randomUUID();
    [panel, ...panel.querySelectorAll("[id]")].forEach((element) => {
      refs[element.id] = element;
      element.id += `-${suffix}`;
    });
    panel.setAttribute("aria-labelledby", refs.commentPanelTitle.id);
    refs.commentReplyLabel.htmlFor = refs.commentReply.id;
    thread = { target: { ...target }, panel, refs, opener, anchor,
      date: els.date.value, saving: false };
    openCommentThreads.set(target.key, thread);
    refs.commentPanelContext.textContent = `${target.personName} · ${COMMENT_FIELD_LABELS[target.fieldName] || target.fieldName}`;
    refs.commentHighlight.textContent = target.itemText;
    refs.commentCloseButton.addEventListener("click", () => closeCommentThread(target.key));
    refs.commentReplyForm.addEventListener("submit", (event) => saveCommentReply(event, thread));
    refs.commentReply.addEventListener("input", () => {
      refs.commentReplyButton.disabled = thread.saving || !refs.commentReply.value.trim();
    });
    refs.commentReply.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        refs.commentReplyForm.requestSubmit();
      }
    });
    panel.addEventListener("focusin", () => activateCommentThread(target.key));
    panel.addEventListener("pointerdown", () => activateCommentThread(target.key));
    els.app.append(panel);
    thread.observer = new ResizeObserver(scheduleCommentLayout);
    thread.observer.observe(panel);
    renderCommentThread(thread);
  }
  activateCommentThread(target.key);
  positionCommentThreads();
  if (window.innerWidth > 760) {
    thread.panel.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  if (focusReply || !thread.panel.contains(document.activeElement)) {
    thread.refs.commentReply.focus({ preventScroll: true });
  }
}

function activateCommentThread(key) {
  activeCommentKey = key;
  openCommentThreads.forEach((thread, threadKey) => {
    thread.panel.hidden = key !== threadKey;
    thread.panel.classList.toggle("is-active", key === threadKey);
  });
  renderGlobalComments();
  scheduleCommentLayout();
}

function closeCommentThread(key, { restoreFocus = true } = {}) {
  const thread = openCommentThreads.get(key);
  if (!thread) return;
  thread.observer.disconnect();
  thread.panel.remove();
  openCommentThreads.delete(key);
  if (activeCommentKey === key) {
    activeCommentKey = null;
  }
  activateCommentThread(activeCommentKey);
  if (restoreFocus) {
    const next = openCommentThreads.get(activeCommentKey);
    (next?.refs.commentReply || (thread.opener?.isConnected && thread.opener) || els[thread.target.fieldName])?.focus({ preventScroll: true });
  }
  scheduleCommentLayout();
}

function closeAllCommentThreads() {
  [...openCommentThreads.keys()].forEach((key) => closeCommentThread(key, { restoreFocus: false }));
}

function scheduleCommentLayout() {
  cancelAnimationFrame(commentLayoutFrame);
  commentLayoutFrame = requestAnimationFrame(positionCommentThreads);
}

function positionCommentThreads() {
  const viewport = window.visualViewport;
  document.body.classList.toggle("is-keyboard-open", window.innerWidth <= 760 &&
    Boolean(viewport && window.innerHeight - viewport.height > 120));
  renderCommentHighlights();
  openCommentThreads.forEach((thread) => {
    if (thread.panel.hidden) return;
    const editor = thread.target.personName === els.personName.value ? els[thread.target.fieldName] : null;
    const anchor = thread.anchor?.isConnected ? thread.anchor
      : editor && findCommentTargetBlock(editor, thread.target);

    if (window.innerWidth <= 760) {
      thread.panel.style.removeProperty("left");
      const visibleHeight = viewport?.height || window.innerHeight;
      thread.panel.style.maxHeight = `${Math.max(120, visibleHeight - 24)}px`;
      thread.panel.style.bottom = "auto";
      thread.panel.style.top = `${(viewport?.offsetTop || 0) + Math.max(12, visibleHeight - thread.panel.offsetHeight - 12)}px`;
      return;
    }
    thread.panel.style.removeProperty("max-height");
    thread.panel.style.removeProperty("bottom");
    const range = commentHitTargets.get(thread.target.key)?.range;
    const rect = range?.getClientRects()[0] || (anchor || thread.opener?.isConnected && thread.opener || els.commentsOverview).getBoundingClientRect();
    const edge = editor?.getBoundingClientRect() || rect;
    const width = thread.panel.offsetWidth;
    let left = edge.right + 16;
    const sidebar = document.querySelector(".daily-list").getBoundingClientRect();
    const coversSidebar = sidebar.width > 0 && sidebar.left >= edge.right && left < sidebar.right && left + width > sidebar.left;
    if (left + width > window.innerWidth - 16 || coversSidebar) {
      left = edge.left - width - 16;
    }
    left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
    const controlsBottom = document.querySelector("#meetingControls").getBoundingClientRect().bottom;
    const top = Math.max(window.scrollY + controlsBottom + 12, window.scrollY + rect.top - 12);
    thread.panel.style.left = `${left + window.scrollX}px`;
    thread.panel.style.top = `${top}px`;
  });
}

function renderCommentThread(thread) {
  const { refs, target } = thread;
  const isNew = !target.comments.length;
  refs.commentPanelTitle.textContent = isNew ? "New comment" : "Comment thread";
  refs.commentReplyLabel.textContent = isNew ? "Comment" : "Reply";
  refs.commentReply.placeholder = isNew ? "Add a comment…" : "Reply to this thread…";
  refs.commentReplyButton.textContent = thread.saving ? "Saving…" : isNew ? "Comment" : "Reply";
  refs.commentReplyButton.disabled = thread.saving || !refs.commentReply.value.trim();
  refs.commentThread.hidden = isNew;
  refs.commentThread.replaceChildren(...target.comments.map(renderCommentMessage));
  scheduleCommentLayout();
}

function renderCommentMessage(comment) {
  const message = document.createElement("article");
  const header = document.createElement("div");
  const author = document.createElement("strong");
  const time = document.createElement("span");
  const body = document.createElement("p");
  const remove = document.createElement("button");

  message.className = "comment-message";
  header.className = "comment-message-header";
  author.textContent = comment.authorEmail || "Standup comment";
  time.textContent = formatTime(comment.createdAt);
  body.textContent = comment.comment;
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => deleteItemComment(comment._id));
  header.append(author, time, remove);
  message.append(header, body);
  return message;
}

async function saveCommentReply(event, thread) {
  event.preventDefault();
  const { refs, target, date } = thread;
  const comment = refs.commentReply.value.trim();
  if (!comment || thread.saving) return;

  thread.saving = true;
  refs.commentReply.readOnly = true;
  refs.commentReplyStatus.textContent = "Saving comment…";
  renderCommentThread(thread);
  try {
    await flushAutosave();
    await convexMutation("standups:saveItemComment", {
      teamId: TEAM_ID,
      standupDate: date,
      personName: target.personName,
      fieldName: target.fieldName,
      itemKey: target.itemKey,
      itemText: target.itemText,
      comment,
    });
    refs.commentReply.value = "";
    if (els.date.value === date) {
      els.saveStatus.textContent = `Comment saved ${formatTime(Date.now())}`;
      await reloadItemComments();
      refreshOpenCommentThreads();
    }
    refs.commentReplyStatus.textContent = "Comment added";
  } catch (error) {
    console.error(error);
    refs.commentReplyStatus.textContent = "Comment could not be saved. Try again.";
  } finally {
    thread.saving = false;
    refs.commentReply.readOnly = false;
    renderCommentThread(thread);
  }
}

function refreshOpenCommentThreads() {
  const groups = groupComments(commentsForDate);
  openCommentThreads.forEach((thread) => {
    const refreshed = groups.find((group) => group.key === thread.target.key);
    thread.target = refreshed || { ...thread.target, comments: [] };
    renderCommentThread(thread);
  });
  renderGlobalComments();
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
  updateMeetingNavigation();
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
  row.classList.toggle("is-selected", name === els.personName.value);
  row.setAttribute("aria-pressed", String(name === els.personName.value));
  row.querySelector(".entry-name").textContent = name;
  row.querySelector(".entry-time").textContent = meta;
  row.addEventListener("click", () => {
    els.personName.value = name;
    personPicker.sync();
    loadPersonContext({ scrollToUpdate: true });
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
  clearItemComments();
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
  const personName = activeEntryContext?.personName;
  if (!personName) {
    els.saveStatus.textContent = "Select a person to autosave";
    return;
  }
  standupDirty = true;
  standupRevision++;
  document.querySelector("#saveRetry").hidden = true;
  els.saveStatus.textContent = "Saving soon...";
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    saveStandup({ silent: true });
  }, 800);
}

async function flushAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  await pendingStandupSave;
  if (activeEntryContext && standupDirty) return saveStandup();
  return true;
}

function queueDailyNotesAutosave() {
  if (isHydrating) return;
  clearTimeout(dailyNotesAutosaveTimer);
  dailyNotesDirty = true;
  dailyNotesRevision++;
  els.dailyNotesStatus.textContent = "Saving daily notes soon...";
  dailyNotesAutosaveTimer = window.setTimeout(() => {
    dailyNotesAutosaveTimer = null;
    saveDailyNotes({ silent: true });
  }, 800);
}

async function flushDailyNotesAutosave() {
  clearTimeout(dailyNotesAutosaveTimer);
  dailyNotesAutosaveTimer = null;
  await pendingDailyNotesSave;
  if (dailyNotesDirty) return saveDailyNotes();
  return true;
}

function restoreDocumentContext() {
  if (activeEntryContext) {
    els.personName.value = activeEntryContext.personName;
    els.date.value = activeEntryContext.standupDate;
    personPicker.sync();
    updateTodayHeading();
    updateDateShortcuts();
    setPersonEditingEnabled(true);
  }
}

async function jumpToRelativeDate(offsetDays) {
  if (!await flushAutosave() || !await flushDailyNotesAutosave()) return;
  const date = new Date(`${toDateInputValue(new Date())}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  els.date.value = toDateInputValue(date);
  handleDateChange();
}

function scheduleMidnightDateReset() {
  clearTimeout(midnightResetTimer);
  const scheduledToday = toDateInputValue(new Date());
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 2, 0);
  midnightResetTimer = window.setTimeout(() => {
    resetDateAfterMidnight(scheduledToday);
  }, nextMidnight.getTime() - now.getTime());
}

async function resetDateAfterMidnight(previousToday) {
  const currentToday = toDateInputValue(new Date());
  if (currentToday !== previousToday && els.date.value === previousToday) {
    await flushAutosave();
    await flushDailyNotesAutosave();
    els.date.value = currentToday;
    await handleDateChange();
  } else {
    updateDateShortcuts();
  }
  scheduleMidnightDateReset();
}

function updateDateShortcuts() {
  const today = new Date();
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
  updateMeetingNavigation();
  document.querySelectorAll(".entry-row").forEach((row) => {
    const selected = row.querySelector(".entry-name").textContent === personName;
    row.classList.toggle("is-selected", selected);
    row.setAttribute("aria-pressed", String(selected));
  });
}

function rememberEditorSelection() {
  const selection = window.getSelection();
  const editor = allEditors.find((candidate) => editorContainsSelection(candidate, selection));
  if (editor) {
    savedEditorSelections.set(editor, selection.getRangeAt(0).cloneRange());
    if (personEditors.includes(editor)) activePersonEditor = editor;
    updateToolbarState();
  }
}

function restoreEditorSelection(editor) {
  const range = savedEditorSelections.get(editor)?.cloneRange();
  editor.focus({ preventScroll: true });
  if (!range || !editor.contains(range.commonAncestorContainer)) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function runEditorCommand(button) {
  const editor = getToolbarEditor(button);
  restoreEditorSelection(editor);
  applyEditorCommand(button.dataset.command);
  normalizeChecklists(editor);
  rememberEditorSelection();
  updateToolbarState();
  queueEditorAutosave(editor);
  scheduleCommentLayout();
}

async function copyEditorContents(button) {
  const editor = getToolbarEditor(button);
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
  if (spotlightMode && personEditors.includes(event.currentTarget)) return;
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === "KeyK") {
    event.preventDefault();
    openLinkDialog(event.currentTarget);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === "KeyS") {
    event.preventDefault();
    queueEditorAutosave(event.currentTarget);
    event.currentTarget === els.dailyNotes ? flushDailyNotesAutosave() : flushAutosave();
    return;
  }
  if (event.key === "Enter") {
    const item = getCurrentListItem();
    shouldResetNewChecklistItem = item?.closest("ul.check-list") && item.dataset.checked === "true";
  }

  if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === "KeyM") {
    event.preventDefault();
    addCommentForEditor(event.currentTarget);
    return;
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
  updateToolbarState();
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
  if (spotlightMode && personEditors.includes(event.currentTarget)) return;
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

function getCommentTarget(editor) {
  const selection = window.getSelection();
  if (!editorContainsSelection(editor, selection)) return { itemText: "" };
  const range = selection.getRangeAt(0).cloneRange();
  if (range.collapsed) {
    const block = getCurrentTextBlock();
    if (!block || !editor.contains(block)) return { itemText: "" };
    range.selectNodeContents(block);
  }
  const index = commentTextIndex(editor);
  const selected = index.chars.map((entry, offset) => ({ ...entry, offset })).filter((entry) =>
    range.comparePoint(entry.start.node, entry.start.offset) === 0 &&
    range.comparePoint(entry.end.node, entry.end.offset) === 0);
  while (selected[0]?.char === " ") selected.shift();
  while (selected.at(-1)?.char === " ") selected.pop();
  if (!selected.length) return { itemText: "" };
  const start = selected[0].offset;
  const end = selected.at(-1).offset + 1;
  const itemText = index.text.slice(start, end);
  return {
    itemText,
    itemKey: hashCommentTarget(itemText),
    anchor: { start, end, prefix: index.text.slice(Math.max(0, start - 32), start), suffix: index.text.slice(end, end + 32) },
  };
}

function editorContainsSelection(editor, selection) {
  if (!selection?.rangeCount) return false;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return Boolean(anchor && focus && editor.contains(anchor) && editor.contains(focus));
}

function normalizeItemText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePersonKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function hashCommentTarget(value) {
  let hash = 2166136261;
  const normalized = normalizeItemText(value).toLowerCase();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `item-${(hash >>> 0).toString(36)}`;
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
  savedEditorSelections.delete(editor);
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
  template.content.querySelectorAll("script, style, iframe, object, embed, svg, img, input, button").forEach((node) => node.remove());
  template.content.querySelectorAll("b[style], strong[style]").forEach((node) => {
    if (node.style.fontWeight === "normal" || node.style.fontWeight === "400") node.replaceWith(...node.childNodes);
  });
  template.content.querySelectorAll("span").forEach((node) => {
    const weight = node.style.fontWeight;
    const tags = [];
    if (weight === "bold" || Number(weight) >= 600) tags.push("strong");
    if (node.style.fontStyle === "italic") tags.push("em");
    if (node.style.textDecoration.includes("underline")) tags.push("u");
    if (node.style.textDecoration.includes("line-through")) tags.push("s");
    for (const tag of tags) {
      const wrapper = document.createElement(tag);
      wrapper.append(...node.childNodes);
      node.append(wrapper);
    }
    node.replaceWith(...node.childNodes);
  });
  template.content.querySelectorAll("*").forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
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
