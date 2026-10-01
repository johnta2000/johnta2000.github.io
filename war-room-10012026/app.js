const LEGACY_STORAGE_KEY = "john-ta-war-room-10012026-progress-v1";
let STORAGE_KEY = "";
const BOARD_ID = "war-room-10012026";
const CONVEX_URL = "https://rapid-shark-565.convex.cloud";

let seedBuckets = [];
const ASSIGNEES = { john: "John", vivek: "Vivek", vishal: "Vishal", jenny: "Jenny" };

const legacyAprDefaults = {
  "apr-crawl": {
    "title": "Crawl & prepare BOFA APR updates",
    "notes": "Cover every affected card and partner placement; attach source snapshots and the before/after diff. Exact card list still needs confirmation."
  },
  "apr-feed": {
    "title": "Update the Affil feed",
    "notes": "Check each affected card. Confirm new values and effective timing against the issuer source."
  },
  "apr-mockups": {
    "title": "Submit mockups for launch approval",
    "notes": "Include affected placements and updated terms. Record approval evidence before publishing."
  },
  "apr-docs": {
    "title": "Update card compliance documentation",
    "notes": "Update each card\u2019s corresponding documentation and attach final links."
  },
  "apr-qa": {
    "title": "Verify the live update",
    "notes": "Starts at 8:00 am; all affected BOFA APR updates must be verified by 12:00 pm. Check rates across the feed, placements, mockups, and docs."
  }
};

let seedTaskIds = new Set();
let state = createFallbackState();
let activeProject = "all";
let dirty = false;
let remoteReady = false;
let remoteSaveTimer;
let saving = false;
let savePromise;
let revision = 0;
let authGeneration = 0;
let authorized = false;
let editReturnFocus;
let hideDone = false;

const board = document.querySelector("#board");
const warRoomApp = document.querySelector("#warRoomApp");
const bucketTemplate = document.querySelector("#bucketTemplate");
const groupTemplate = document.querySelector("#groupTemplate");
const taskTemplate = document.querySelector("#taskTemplate");
const doneCount = document.querySelector("#doneCount");
const totalCount = document.querySelector("#totalCount");
const percentCount = document.querySelector("#percentCount");
const meterFill = document.querySelector("#meterFill");
const postDoneCount = document.querySelector("#postDoneCount");
const postTotalCount = document.querySelector("#postTotalCount");
const postPercentCount = document.querySelector("#postPercentCount");
const postMeterFill = document.querySelector("#postMeterFill");
const globalAddForm = document.querySelector("#globalAddForm");
const bucketSelect = document.querySelector("#bucketSelect");
const groupSelect = document.querySelector("#groupSelect");
const bucketPicker = window.SearchableSelect?.enhance(bucketSelect);
const groupPicker = window.SearchableSelect?.enhance(groupSelect);
const addModal = document.querySelector("#addModal");
const modalBackdrop = document.querySelector("#modalBackdrop");
const closeAddModal = document.querySelector("#closeAddModal");
const toggleAddPanel = document.querySelector("#toggleAddPanel");
const linkModal = document.querySelector("#linkModal");
const linkModalBackdrop = document.querySelector("#linkModalBackdrop");
const closeLinkModal = document.querySelector("#closeLinkModal");
const linkForm = document.querySelector("#linkForm");
const newAssigneeSelect = document.querySelector("#newTicketAssignee");
const ticketAssigneeSelect = document.querySelector("#ticketAssignee");
const newAssigneePicker = window.SearchableSelect?.enhance(newAssigneeSelect);
const ticketAssigneePicker = window.SearchableSelect?.enhance(ticketAssigneeSelect);
const stepAssigneeFields = document.querySelector("#stepAssigneeFields");
const stepAssignees = document.querySelector("#stepAssignees");
const stepOwnerControls = [];
const linkModalTask = document.querySelector("#linkModalTask");
const deleteTicket = document.querySelector("#deleteTicket");
const deleteConfirmation = document.querySelector("#deleteConfirmation");
const deleteConfirmationText = document.querySelector("#deleteConfirmationText");
const confirmDeleteTicket = document.querySelector("#confirmDeleteTicket");
const cancelDeleteTicket = document.querySelector("#cancelDeleteTicket");
const warCat = document.querySelector("#warCat");
const accessGate = document.querySelector("#accessGate");
const stickerLoader = document.querySelector("#stickerLoader");
const sirenLayer = document.querySelector("#sirenLayer");
let activeLinkTaskId = "";

// Original GIF supplied by the user: https://tenor.com/view/1897403280453886034
const CORGI_GIF_URL = "https://media1.tenor.com/m/GlTuOw8dYFIAAAAd/cachorro-meme.gif";
const corgiGifLayer = document.querySelector("#corgiGifLayer");
const corgiGifClose = document.querySelector("#corgiGifClose");
let corgiGifTimer;
let corgiGifRequest = 0;
let corgiGifImage;
let corgiChaseUntil = 0;
let corgiChaseTimer;

function dismissCorgiGif() {
  corgiGifRequest += 1;
  window.clearTimeout(corgiGifTimer);
  window.clearTimeout(corgiChaseTimer);
  stopCorgiChase();
  corgiGifLayer.hidden = true;
  corgiGifLayer.style.backgroundImage = "";
  warCat.removeAttribute("aria-busy");
  warCat.querySelector(".cat-caption").textContent = "COMMAND ON DUTY";
  if (document.activeElement === corgiGifClose) warCat.focus();
}

warCat.addEventListener("click", async () => {
  dismissCorgiGif();
  const request = corgiGifRequest;
  warCat.setAttribute("aria-busy", "true");
  warCat.querySelector(".cat-caption").textContent = "LOADING CORGIS…";
  try {
    if (!corgiGifImage?.complete || !corgiGifImage.naturalWidth) {
      const image = new Image();
      image.referrerPolicy = "no-referrer";
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("GIF timed out")), 20000);
        image.onload = () => { window.clearTimeout(timeout); resolve(); };
        image.onerror = () => { window.clearTimeout(timeout); reject(new Error("GIF unavailable")); };
        image.src = CORGI_GIF_URL;
      });
      corgiGifImage = image;
    }
    if (request !== corgiGifRequest) return;
    warCat.removeAttribute("aria-busy");
    warCat.querySelector(".cat-caption").textContent = "COMMAND ON DUTY";
    corgiGifLayer.style.backgroundImage = `url("${CORGI_GIF_URL}")`;
    corgiGifLayer.hidden = false;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      corgiChaseUntil = performance.now() + 2000;
      corgiChaseTimer = window.setTimeout(stopCorgiChase, 2000);
    }
    corgiGifTimer = window.setTimeout(dismissCorgiGif, 12000);
  } catch {
    if (request !== corgiGifRequest) return;
    warCat.removeAttribute("aria-busy");
    warCat.querySelector(".cat-caption").textContent = "GIF UNAVAILABLE · RETRY";
  }
});
function stopCorgiChase() {
  corgiChaseUntil = 0;
  corgiGifClose.style.removeProperty("left");
  corgiGifClose.style.removeProperty("top");
  corgiGifClose.style.removeProperty("right");
}

function dodgeCorgiClose(event) {
  if (corgiGifLayer.hidden || performance.now() >= corgiChaseUntil) return false;
  const rect = corgiGifClose.getBoundingClientRect();
  const maxX = Math.max(18, corgiGifLayer.clientWidth - rect.width - 18);
  const maxY = Math.max(18, corgiGifLayer.clientHeight - rect.height - 18);
  // Pick the farthest corner from the pointer, keeping the entire button on-screen.
  const destinations = [[18, 18], [maxX, 18], [18, maxY], [maxX, maxY]];
  destinations.sort((a, b) =>
    Math.hypot(b[0] + rect.width / 2 - event.clientX, b[1] + rect.height / 2 - event.clientY) -
    Math.hypot(a[0] + rect.width / 2 - event.clientX, a[1] + rect.height / 2 - event.clientY));
  corgiGifClose.style.right = "auto";
  corgiGifClose.style.left = `${destinations[0][0]}px`;
  corgiGifClose.style.top = `${destinations[0][1]}px`;
  return true;
}

corgiGifClose.addEventListener("pointerenter", dodgeCorgiClose);
corgiGifClose.addEventListener("pointerdown", event => {
  if (dodgeCorgiClose(event)) event.preventDefault();
});
corgiGifClose.addEventListener("click", event => {
  // Keyboard activation and Escape always work immediately.
  if (event.detail > 0 && dodgeCorgiClose(event)) return;
  dismissCorgiGif();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") dismissCorgiGif();
});

toggleAddPanel.addEventListener("click", () => {
  openAddModal();
});

closeAddModal.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
addModal.addEventListener("click", (event) => {
  if (event.target === addModal) {
    closeModal();
  }
});
closeLinkModal.addEventListener("click", closeLinksModal);
linkModalBackdrop.addEventListener("click", closeLinksModal);
linkModal.addEventListener("click", (event) => {
  if (event.target === linkModal) {
    closeLinksModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !addModal.hasAttribute("hidden")) {
    closeModal();
  }
  if (event.key === "Escape" && !linkModal.hasAttribute("hidden")) {
    closeLinksModal();
  }
});

document.querySelector("#expandAll").addEventListener("click", () => {
  hideDone = false;
  document.body.classList.remove("hide-done");
  document.querySelector("#collapseDone").textContent = "Hide done";
});

document.querySelector("#collapseDone").addEventListener("click", (event) => {
  hideDone = !hideDone;
  document.body.classList.toggle("hide-done", hideDone);
  event.currentTarget.textContent = hideDone ? "Show done" : "Hide done";
});

document.querySelector("#resetState").addEventListener("click", () => {
  const shouldReset = window.confirm("Reset every completed checkbox for this war room?");
  if (!shouldReset) return;
  state.completed = {};
  saveState();
  render();
});

document.querySelector("#exportState").addEventListener("click", async () => {
  const payload = JSON.stringify(buildExport(), null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    flashButton(document.querySelector("#exportState"), "Copied");
  } catch {
    window.prompt("Copy progress JSON", payload);
  }
});

bucketSelect.addEventListener("change", () => populateGroupSelect(bucketSelect.value));
globalAddForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTask(new FormData(event.currentTarget));
  event.currentTarget.reset();
  bucketSelect.value = state.buckets[0].id;
  bucketPicker?.sync();
  populateGroupSelect(bucketSelect.value);
  closeModal();
});
linkForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveLinksFromModal(new FormData(event.currentTarget));
});
deleteTicket.addEventListener("click", deleteActiveTicket);
confirmDeleteTicket.addEventListener("click", confirmActiveTicketDeletion);
cancelDeleteTicket.addEventListener("click", () => {
  deleteConfirmation.hidden = true;
  deleteTicket.focus();
});

window.WarRoomAuth.start({
  onAuthorized: async (viewer) => {
    const generation = ++authGeneration;
    authorized = true;
    seedBuckets = viewer.seedBuckets;
    seedTaskIds = new Set(seedBuckets.flatMap(bucket => bucket.groups.flatMap(group =>
      group.tasks.map(task => getSeedTaskId(bucket.id, group.id, task)))));
    STORAGE_KEY = `john-ta-war-room-10012026-user-${viewer.subject}-v2`;
    // Recover any unsynced pre-auth edits only after this account has been verified.
    if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(LEGACY_STORAGE_KEY + "-pending") === "true") {
      localStorage.setItem(STORAGE_KEY, localStorage.getItem(LEGACY_STORAGE_KEY) || "{}");
      localStorage.setItem(STORAGE_KEY + "-pending", "true");
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY + "-pending");
    sessionStorage.removeItem("john-ta-war-room-10012026-access-v1");
    dirty = localStorage.getItem(STORAGE_KEY + "-pending") === "true";
    state = loadState();
    await syncFromRemote();
    if (!authorized || generation !== authGeneration) return;
    render();
    populateAddControls();
    document.querySelector("#accountEmail").textContent = viewer.email;
    unlockWarRoom();
    window.WarRoomSchedule?.start();
    window.WarRoomNotes?.start(viewer.subject);
  },
  onLocked: () => {
    window.WarRoomSchedule?.stop();
    window.WarRoomNotes?.stop();
    bucketPicker?.close();
    groupPicker?.close();
    authorized = false;
    remoteReady = false;
    authGeneration += 1;
    clearTimeout(remoteSaveTimer);
    dismissCorgiGif();
    closeLinksModal();
    closeModal();
    warRoomApp.hidden = true;
    accessGate.hidden = false;
    stickerLoader.hidden = true;
    board.replaceChildren();
    globalAddForm.reset();
    linkForm.reset();
    document.querySelector("#accountEmail").textContent = "";
    seedBuckets = [];
    seedTaskIds = new Set();
    state = createFallbackState();
    dirty = false;
    document.body.classList.add("locked");
  },
});

document.querySelector("#signOut").addEventListener("click", async () => {
  if (window.WarRoomNotes && !await window.WarRoomNotes.flushAll()) {
    setSyncStatus("Project notes are saved locally. Retry saving before signing out.", "error");
    return;
  }
  if (dirty) {
    await syncFromRemote();
    if (authorized && remoteReady) await saveRemoteNow();
    if (dirty) {
      setSyncStatus("Changes are saved locally. Retry sync before signing out.", "error");
      return;
    }
  }
  if (STORAGE_KEY) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY + "-pending");
  }
  await window.WarRoomAuth.signOut();
});

function createFallbackState() {
  return {
    buckets: seedBuckets.map((bucket) => ({
      ...bucket,
      groups: bucket.groups.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) => normalizeSeedTask(bucket.id, group.id, task)),
      })),
    })),
    completed: {},
    linearLinks: {},
    docLinks: {},
    maintouchLinks: {},
    otherLinks: {},
    deletedTasks: {},
  };
}

function loadState() {
  const fallback = createFallbackState();

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved?.buckets || !saved?.completed) return fallback;
    return mergeSeedWithSaved(fallback, saved);
  } catch {
    return fallback;
  }
}

function mergeSeedWithSaved(fallback, saved) {


  const savedTasks = new Map();
  saved.buckets.forEach((bucket) => {
    bucket.groups?.forEach((group) => {
      group.tasks?.forEach((task) => {
        const migrated = { ...task };
        const oldDefaults = legacyAprDefaults[task.id];
        const newDefaults = fallback.buckets.flatMap(b => b.groups.flatMap(g => g.tasks)).find(t => t.id === task.id);
        if (oldDefaults && newDefaults) {
          for (const field of ["title", "notes"]) {
            if (migrated[field] === oldDefaults[field]) migrated[field] = newDefaults[field];
          }
        }
        savedTasks.set(task.id, migrated);
      });
    });
  });

  const buckets = fallback.buckets.map((bucket) => ({
    ...bucket,
    groups: bucket.groups.map((group) => {
      const seededTasks = group.tasks
        .filter((task) => !saved.deletedTasks?.[task.id])
        .map((task) => mergeSavedTask(task, savedTasks.get(task.id)));
      const customTasks = saved.buckets
        .flatMap(savedBucket => savedBucket.groups || [])
        .find(savedGroup => savedGroup.id === group.id)
        ?.tasks?.filter((task) => task.custom && !seededTasks.some((seeded) => seeded.id === task.id));
      return { ...group, tasks: [...seededTasks, ...(customTasks || [])] };
    }),
  }));



  return {
    buckets,
    completed: saved.completed,
    linearLinks: saved.linearLinks || {},
    docLinks: saved.docLinks || {},
    maintouchLinks: saved.maintouchLinks || {},
    otherLinks: saved.otherLinks || {},
    deletedTasks: saved.deletedTasks || {},
  };
}

function mergeSavedTask(seedTask, savedTask) {
  if (!savedTask) return seedTask;
  return {
    ...savedTask,
    title: seedTask.id.endsWith("-qa") && ["Verify the live update", "Verify all rates by noon"].includes(savedTask.title)
      ? seedTask.title : savedTask.title || seedTask.title,
    tags: savedTask.tags || seedTask.tags || [],
    notes: savedTask.notes ?? seedTask.notes ?? "",
    stages: seedTask.stages?.length ? seedTask.stages : savedTask.stages || [],
  };
}

function render() {
  board.textContent = "";

  state.buckets.forEach((bucket) => {
    const bucketNode = bucketTemplate.content.firstElementChild.cloneNode(true);
    bucketNode.dataset.bucket = bucket.id;
    bucketNode.id = bucket.id;
    bucketNode.querySelector(".bucket-kicker").textContent = bucket.kicker;
    bucketNode.querySelector("h2").textContent = bucket.title;

    const groupWrap = bucketNode.querySelector(".groups");

    bucket.groups.forEach((group) => {
      const groupNode = groupTemplate.content.firstElementChild.cloneNode(true);
      groupNode.dataset.group = group.id;
      groupNode.querySelector("h3").textContent = group.title;
      if (group.description) {
        const description = document.createElement("p");
        description.className = "group-description";
        description.textContent = group.description;
        groupNode.querySelector("h3").after(description);
      }

      const list = groupNode.querySelector("ul");
      group.tasks.forEach((task) => list.append(renderTask(task, bucket.id, group.id)));
      if (group.collapsed) {
        const details = document.createElement("details");
        details.className = "secondary-docket";
        const summary = document.createElement("summary");
        summary.textContent = `${group.title} · ${group.tasks.length} tickets`;
        details.append(summary, groupNode);
        groupWrap.append(details);
      } else {
        groupWrap.append(groupNode);
      }
    });

    window.WarRoomNotes?.bind(bucketNode, bucket.id, bucket.title);
    board.append(bucketNode);
  });

  updateProgress();
  applyProjectFilter();
}

function renderTask(task, bucketId, groupId) {
  const node = taskTemplate.content.firstElementChild.cloneNode(true);
  const checkbox = node.querySelector("input");
  const titleNode = node.querySelector("span");
  titleNode.textContent = task.title;
  node.dataset.taskId = task.id;
  const editButton = document.createElement("button");
  editButton.className = "edit-ticket";
  editButton.type = "button";
  editButton.textContent = "⋯";
  editButton.setAttribute("aria-label", `Edit ${task.title}`);
  editButton.addEventListener("click", () => openLinksModal(task));
  node.append(editButton);

  if (task.stages?.length) {
    checkbox.remove();
    node.classList.add("staged-ticket");
    renderStages(node, task);
    node.classList.toggle("is-done", areAllStagesDone(task));
  } else {
    checkbox.id = task.id;
    checkbox.checked = Boolean(state.completed[task.id]);
    node.classList.toggle("is-done", checkbox.checked);
    checkbox.addEventListener("change", () => {
      state.completed[task.id] = checkbox.checked;
      if (!checkbox.checked) delete state.completed[task.id];
      saveState();
      node.classList.toggle("is-done", checkbox.checked);
      updateProgress();
    });
  }

  node.addEventListener("dblclick", (event) => {
    if (event.target.closest("a, button, input, select, textarea")) return;
    handleTicketLinkAction(task);
  });
  node.addEventListener("contextmenu", (event) => {
    if (event.target.closest("a, button, select, textarea")) return;
    event.preventDefault();
    editTaskLinks(task);
  }, true);

  const owner = document.createElement("button");
  owner.type = "button";
  owner.className = "ticket-assignee";
  owner.textContent = getAssigneeName(task.assignee) || "＋ Assign";
  owner.dataset.assigned = String(Boolean(getAssigneeName(task.assignee)));
  owner.setAttribute("aria-label", `${task.title} assignee: ${getAssigneeName(task.assignee) || "Unassigned"}`);
  owner.addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation();
    openLinksModal(task);
    document.querySelector("#ticketAssignee-trigger")?.focus();
  });
  titleNode.append(owner);

  if (task.tags?.length) {
    const tags = document.createElement("em");
    tags.className = "task-tags";
    task.tags.forEach((tag) => {
      const tagNode = document.createElement("b");
      tagNode.textContent = tag;
      tags.append(tagNode);
    });
    titleNode.append(tags);
  }

  if (task.notes) {
    const notes = document.createElement("small");
    notes.className = "task-note";
    notes.textContent = task.notes;
    titleNode.append(notes);
  }

  const taskLinks = renderTaskLinks(task);
  if (taskLinks.length) {
    const linkRow = document.createElement("em");
    linkRow.className = "task-link-row";
    linkRow.append(...taskLinks);
    if (task.stages?.length) {
      node.append(linkRow);
    } else {
      titleNode.append(linkRow);
    }
  }

  return node;
}

function addTask(formData) {
  const title = formData.get("title").trim();
  const bucketId = formData.get("bucket");
  const groupId = formData.get("group");
  const linearUrl = (formData.get("linearUrl") || "").trim();
  const docUrl = (formData.get("docUrl") || "").trim();
  const maintouchUrl = (formData.get("maintouchUrl") || "").trim();
  const otherUrls = (formData.get("otherUrls") || "").trim();
  const tags = parseTags(formData.get("tags") || "");
  const notes = (formData.get("notes") || "").trim();
  if (!title) return;

  const bucket = state.buckets.find((item) => item.id === bucketId);
  const group = bucket.groups.find((item) => item.id === groupId);
  const task = {
    id: slug(`${bucketId}-${groupId}-${title}-${Date.now()}`),
    title,
    tags,
    notes,
    assignee: normalizeAssignee(formData.get("assignee")),
    stages: String(formData.get("stages") || "").split("\n").map(s => s.trim()).filter(Boolean),
    custom: true,
  };
  group.tasks.push(task);
  setOptionalTaskUrl(task.id, linearUrl, "linear");
  setOptionalTaskUrl(task.id, docUrl, "doc");
  setOptionalTaskUrl(task.id, maintouchUrl, "maintouch");
  setOptionalTaskUrl(task.id, otherUrls, "other");
  saveState();
  render();
}

function removeTask(bucketId, groupId, taskId) {
  const bucket = state.buckets.find((item) => item.id === bucketId);
  const group = bucket.groups.find((item) => item.id === groupId);
  removeTaskFromGroup(group, taskId);
}

function updateProgress() {
  const prepItems = getPrepProgressItems(state.buckets);
  const postItems = getPostProgressItems(state.buckets);
  const done = prepItems.filter((item) => state.completed[item.id]).length;
  const total = prepItems.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const postDone = postItems.filter((item) => state.completed[item.id]).length;
  const postTotal = postItems.length;
  const postPercent = postTotal ? Math.round((postDone / postTotal) * 100) : 0;

  doneCount.textContent = done;
  totalCount.textContent = total;
  percentCount.textContent = `${percent}%`;
  meterFill.style.width = `${percent}%`;
  postDoneCount.textContent = postDone;
  postTotalCount.textContent = postTotal;
  postPercentCount.textContent = `${postPercent}%`;
  postMeterFill.style.width = `${postPercent}%`;

  document.querySelectorAll(".bucket").forEach((bucketNode) => {
    const bucket = state.buckets.find((item) => item.id === bucketNode.dataset.bucket);
    const bucketItems = getProgressItems([bucket]);
    const bucketDone = bucketItems.filter((item) => state.completed[item.id]).length;
    bucketNode.querySelector(".bucket-progress").textContent = `${bucketDone}/${bucketItems.length}`;
  });
}

function setSyncStatus(message, mode = "") {
  const status = document.querySelector("#syncStatus");
  status.textContent = message;
  status.dataset.mode = mode;
}

function saveState() {
  if (!authorized || !window.WarRoomAuth.isAuthorized()) return;
  revision += 1;
  dirty = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(STORAGE_KEY + "-pending", "true");
    setSyncStatus("Saved locally · syncing", "pending");
  } catch {
    setSyncStatus("Local save unavailable · export a backup", "error");
  }
  if (remoteReady) saveRemoteState();
}

async function syncFromRemote() {
  if (!authorized) return;
  const generation = authGeneration;
  try {
    const value = await window.WarRoomAuth.call("query", "warRoom:get", { boardId: BOARD_ID });
    if (!authorized || generation !== authGeneration) return;
    if (value && !dirty) {
      state = mergeSeedWithSaved(createFallbackState(), value);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      populateAddControls();
    }
    remoteReady = true;
    if (dirty) saveRemoteState();
    else setSyncStatus(value ? "Shared progress loaded" : "Ready · changes save automatically", "saved");
  } catch {
    if (authorized && generation === authGeneration) {
      setSyncStatus("Offline · local progress only · Retry sync", "error");
    }
  }
}

function saveRemoteState() {
  clearTimeout(remoteSaveTimer);
  if (!authorized || saving || !remoteReady) return;
  remoteSaveTimer = window.setTimeout(saveRemoteNow, 250);
}

async function saveRemoteNow() {
  clearTimeout(remoteSaveTimer);
  if (saving) {
    await savePromise;
    if (dirty && authorized && remoteReady) return saveRemoteNow();
    return;
  }
  if (!dirty || !authorized || !remoteReady) return;
  saving = true;
  const generation = authGeneration;
  const savingRevision = revision;
  const snapshot = JSON.parse(JSON.stringify({
    boardId: BOARD_ID, completed: state.completed, linearLinks: state.linearLinks,
    docLinks: state.docLinks, maintouchLinks: state.maintouchLinks,
    otherLinks: state.otherLinks, deletedTasks: state.deletedTasks, buckets: state.buckets,
  }));
  savePromise = (async () => {
    try {
      await window.WarRoomAuth.call("mutation", "warRoom:save", snapshot);
      if (authorized && generation === authGeneration && revision === savingRevision) {
        dirty = false;
        localStorage.removeItem(STORAGE_KEY + "-pending");
        setSyncStatus("All changes saved", "saved");
      }
    } catch {
      if (authorized && generation === authGeneration) {
        remoteReady = false;
        setSyncStatus("Offline · local progress only · Retry sync", "error");
      }
    } finally {
      saving = false;
      if (dirty && authorized && remoteReady && generation === authGeneration) saveRemoteState();
    }
  })();
  await savePromise;
}

function buildExport() {
  return {
    warRoom: "October 1, 2026 Launch War Room",
    exportedAt: new Date().toISOString(),
    buckets: state.buckets.map((bucket) => ({
      title: bucket.title,
      notes: window.WarRoomNotes?.getText(bucket.id) || "",
      groups: bucket.groups.map((group) => ({
        title: group.title,
        tasks: group.tasks.map((task) => ({
          title: task.title,
          tags: task.tags || [],
          notes: task.notes || "",
          assignee: getAssigneeName(task.assignee) || "",
          done: task.stages?.length ? areAllStagesDone(task) : Boolean(state.completed[task.id]),
          linearUrl: state.linearLinks[task.id] || "",
          docUrl: state.docLinks[task.id] || "",
          maintouchUrl: state.maintouchLinks[task.id] || "",
          otherUrls: state.otherLinks[task.id] || "",
          stages: (task.stages || []).map((stage) => ({
            title: stage,
            assignee: getAssigneeName(task.stageAssignees?.[getStageId(task, stage)]) || "",
            done: Boolean(state.completed[getStageId(task, stage)]),
          })),
        })),
      })),
    })),
  };
}

function renderTaskLinks(task) {
  return [
    renderSavedLink(task, "linear"),
    renderSavedLink(task, "doc"),
    renderSavedLink(task, "maintouch"),
    renderSavedLink(task, "other"),
  ].filter(Boolean);
}

function renderLinearLink(task) {
  return renderSavedLink(task, "linear");
}

function renderSavedLink(task, type) {
  const isDoc = type === "doc";
  const isMaintouch = type === "maintouch";
  const isOther = type === "other";
  const existingUrl = getTaskUrl(task.id, type);
  if (!existingUrl) return null;

  const control = document.createElement("a");
  control.className = `task-link ${isOther ? "other-link" : isMaintouch ? "maintouch-link" : isDoc ? "doc-link" : "linear-link"}`;
  control.href = getPrimaryUrl(safeUrls(existingUrl));
  if (!control.href || !safeUrls(existingUrl)) return null;
  control.target = "_blank";
  control.rel = "noreferrer";
  control.title = isOther
    ? "Open first other URL. Right-click ticket to edit all other URLs."
    : isMaintouch
    ? "Open Maintouch link. Drop a new Maintouch URL here to replace it."
    : isDoc
      ? "Open Google Doc. Drop a new Google Doc URL here to replace it."
      : "Open Linear ticket. Drop a new Linear URL here to replace it.";
  control.setAttribute(
    "aria-label",
    isOther ? "Open other URL" : isMaintouch ? "Open Maintouch link" : isDoc ? "Open Google Doc" : "Open Linear ticket",
  );
  control.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  control.addEventListener("drop", (event) => {
    event.preventDefault();
    const droppedUrl = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    saveTaskUrl(task.id, droppedUrl, type);
  });

  return control;
}

function handleTicketLinkAction(task) {
  const existingLinearUrl = state.linearLinks[task.id];
  const existingDocUrl = state.docLinks[task.id];
  const existingMaintouchUrl = state.maintouchLinks[task.id];
  const existingOtherUrl = state.otherLinks[task.id];
  if (existingLinearUrl || existingDocUrl || existingMaintouchUrl || existingOtherUrl) {
    window.open(
      getPrimaryUrl(safeUrls(existingLinearUrl || existingDocUrl || existingMaintouchUrl || existingOtherUrl)),
      "_blank",
      "noopener,noreferrer",
    );
    return;
  }

  openLinksModal(task);
}

function editTaskLinks(task) {
  openLinksModal(task);
}

function saveLinearUrl(taskId, value) {
  saveTaskUrl(taskId, value, "linear");
}

function saveTaskUrl(taskId, value, type) {
  const cleanedUrl = safeUrls(value);
  if (!cleanedUrl) return;
  setOptionalTaskUrl(taskId, cleanedUrl, type);
  saveState();
  render();
}

function setOptionalTaskUrl(taskId, value, type) {
  const cleanedUrl = safeUrls(value);
  const target = getLinkStore(type);
  if (cleanedUrl) {
    target[taskId] = cleanedUrl;
  } else {
    delete target[taskId];
  }
}

function getTaskUrl(taskId, type) {
  return getLinkStore(type)[taskId] || "";
}

function getLinkStore(type) {
  if (type === "doc") return state.docLinks;
  if (type === "maintouch") return state.maintouchLinks;
  if (type === "other") return state.otherLinks;
  return state.linearLinks;
}

function getPrimaryUrl(value) {
  return String(value || "")
    .split(/\s+/)
    .find(Boolean) || "";
}

function openLinksModal(task) {
  deleteConfirmation.hidden = true;
  editReturnFocus = document.activeElement;
  activeLinkTaskId = task.id;
  linkModalTask.textContent = "Keep notes, tags, and source links with this ticket. Double-click the ticket to open its saved link.";
  linkForm.elements.title.value = task.title || "";
  linkForm.elements.notes.value = task.notes || "";
  linkForm.elements.tags.value = (task.tags || []).join(", ");
  ticketAssigneeSelect.value = normalizeAssignee(task.assignee);
  ticketAssigneePicker?.sync();
  populateStepAssignees(task);
  linkForm.elements.linearUrl.value = state.linearLinks[task.id] || "";
  linkForm.elements.docUrl.value = state.docLinks[task.id] || "";
  linkForm.elements.maintouchUrl.value = state.maintouchLinks[task.id] || "";
  linkForm.elements.otherUrls.value = state.otherLinks[task.id] || "";
  linkModal.removeAttribute("hidden");
  document.body.classList.add("modal-open");
  linkForm.elements.title.focus();
  linkForm.elements.title.select();
}

function closeLinksModal() {
  ticketAssigneePicker?.close();
  stepOwnerControls.forEach(control => control.picker?.close());
  deleteConfirmation.hidden = true;
  linkModal.setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
  activeLinkTaskId = "";
  if (editReturnFocus?.isConnected) editReturnFocus.focus();
}

function saveLinksFromModal(formData) {
  if (!activeLinkTaskId) return;
  const task = findTask(activeLinkTaskId)?.task;
  if (!task) return;
  const title = (formData.get("title") || "").trim();
  if (!title) return;

  task.title = title;
  task.notes = (formData.get("notes") || "").trim();
  task.tags = parseTags(formData.get("tags") || "");
  task.assignee = normalizeAssignee(formData.get("assignee"));
  task.stageAssignees = Object.fromEntries((task.stages || []).map(stage => {
    const id = getStageId(task, stage);
    return [id, normalizeAssignee(formData.get(`stageAssignee:${id}`))];
  }).filter(([, value]) => value));
  task.custom = task.custom || !seedTaskIds.has(task.id);
  setOptionalTaskUrl(activeLinkTaskId, formData.get("linearUrl") || "", "linear");
  setOptionalTaskUrl(activeLinkTaskId, formData.get("docUrl") || "", "doc");
  setOptionalTaskUrl(activeLinkTaskId, formData.get("maintouchUrl") || "", "maintouch");
  setOptionalTaskUrl(activeLinkTaskId, formData.get("otherUrls") || "", "other");
  saveState();
  closeLinksModal();
  render();
}

function deleteActiveTicket() {
  if (!activeLinkTaskId) return;
  const location = findTask(activeLinkTaskId);
  if (!location) return;
  deleteConfirmationText.textContent = `Delete “${location.task.title}” and its checks and links from this war room?`;
  deleteConfirmation.hidden = false;
  cancelDeleteTicket.focus();
}

function confirmActiveTicketDeletion() {
  if (!activeLinkTaskId || deleteConfirmation.hidden) return;
  const location = findTask(activeLinkTaskId);
  if (!location) return;
  removeTaskFromGroup(location.group, activeLinkTaskId);
  closeLinksModal();
  toggleAddPanel.focus();
}

function removeTaskFromGroup(group, taskId) {
  const task = group.tasks.find((item) => item.id === taskId);
  group.tasks = group.tasks.filter((item) => item.id !== taskId);
  if (seedTaskIds.has(taskId)) state.deletedTasks[taskId] = true;
  delete state.completed[taskId];
  delete state.linearLinks[taskId];
  delete state.docLinks[taskId];
  delete state.maintouchLinks[taskId];
  delete state.otherLinks[taskId];
  task?.stages?.forEach((stage) => delete state.completed[getStageId(task, stage)]);
  saveState();
  render();
}

function findTask(taskId) {
  for (const bucket of state.buckets) {
    for (const group of bucket.groups) {
      const task = group.tasks.find((item) => item.id === taskId);
      if (task) return { bucket, group, task };
    }
  }
  return null;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSeedTask(bucketId, groupId, task) {
  const title = typeof task === "string" ? task : task.title;
  return {
    id: getSeedTaskId(bucketId, groupId, task),
    title,
    tags: typeof task === "string" ? [] : task.tags || [],
    notes: typeof task === "string" ? "" : task.notes || "",
    stages: typeof task === "string" ? [] : task.stages || [],
  };
}

function getSeedTaskId(bucketId, groupId, task) {
  if (typeof task === "object" && task.id) return task.id;
  const title = typeof task === "string" ? task : task.title;
  const tags = typeof task === "string" ? "" : `-${(task.tags || []).join("-")}`;
  return slug(`${bucketId}-${groupId}-${title}${tags}`);
}

function getStageId(task, stage) {
  // APR previously had only the updated-docs checkbox; preserve its saved value.
  if (task.id === "apr-docs" && stage === "Compliance changes drafted") {
    return slug(`${task.id}-Compliance docs updated`);
  }
  // Keep the saved checkbox identity when a stage's display label changes.
  const savedLabel = {
    "Crawls started": "Baseline crawl captured",
    "Approval received & affiliate links deployed": "Approval received",
  }[stage] || stage;
  return slug(`${task.id}-${savedLabel}`);
}

function areAllStagesDone(task) {
  return task.stages.every((stage) => state.completed[getStageId(task, stage)]);
}

function getProgressItems(buckets) {
  return buckets.flatMap((bucket) =>
    bucket.groups.flatMap((group) =>
      group.tasks.flatMap((task) => {
        if (task.stages?.length) {
          return task.stages.map((stage) => ({ id: getStageId(task, stage), title: stage }));
        }
        return [{ id: task.id, title: task.title }];
      }),
    ),
  );
}

function getPrepProgressItems(buckets) {
  return getProgressItems(buckets).filter((item) => !isPostStage(item.title));
}

function getPostProgressItems(buckets) {
  return getProgressItems(buckets).filter((item) => isPostStage(item.title));
}

function isPostStage(title) {
  return /^(content posted|posted|published|post\/publish|gsc indexed|live feed updated|changelog verified|compliance docs updated|live qa complete|embargo lift confirmed|email sent|approval received & affiliate links deployed)$/i.test(title || "");
}

function renderStages(node, task) {
  const stageList = document.createElement("ul");
  stageList.className = "stage-list";
  task.stages.forEach((stage) => {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const text = document.createElement("span");
    const stageId = getStageId(task, stage);

    checkbox.type = "checkbox";
    checkbox.id = stageId;
    checkbox.checked = Boolean(state.completed[stageId]);
    text.textContent = stage;
    item.classList.toggle("is-post-stage", isPostStage(stage));
    item.classList.toggle("is-done", checkbox.checked);

    checkbox.addEventListener("change", () => {
      state.completed[stageId] = checkbox.checked;
      if (!checkbox.checked) delete state.completed[stageId];
      saveState();
      item.classList.toggle("is-done", checkbox.checked);
      node.classList.toggle("is-done", areAllStagesDone(task));
      updateProgress();
    });

    label.append(checkbox, text);
    item.append(label);
    const owner = document.createElement("button");
    owner.type = "button";
    owner.className = "stage-assignee";
    owner.textContent = getAssigneeName(task.stageAssignees?.[stageId]) || "＋";
    owner.dataset.assigned = String(Boolean(getAssigneeName(task.stageAssignees?.[stageId])));
    owner.setAttribute("aria-label", `${task.title} — ${stage} assignee: ${getAssigneeName(task.stageAssignees?.[stageId]) || "Unassigned"}`);
    owner.title = "Assign this checklist step";
    owner.addEventListener("click", () => {
      openLinksModal(task);
      const control = stepOwnerControls[task.stages.indexOf(stage)];
      document.getElementById(`${control.select.id}-trigger`)?.focus();
    });
    item.append(owner);
    stageList.append(item);
  });
  node.append(stageList);
}

function normalizeAssignee(value) {
  return Object.hasOwn(ASSIGNEES, value) ? value : "";
}

function getAssigneeName(value) {
  return ASSIGNEES[normalizeAssignee(value)] || "";
}

function populateStepAssignees(task) {
  const stages = task.stages || [];
  stepAssignees.hidden = stages.length === 0;
  stages.forEach((stage, index) => {
    if (!stepOwnerControls[index]) {
      const label = document.createElement("label");
      label.className = "field-label";
      const text = document.createElement("span");
      const select = document.createElement("select");
      select.id = `step-assignee-${index}`;
      select.setAttribute("aria-label", `Checklist step ${index + 1} assignee`);
      for (const [value, name] of [["", "Unassigned"], ...Object.entries(ASSIGNEES)]) {
        const option = document.createElement("option");
        option.value = value; option.textContent = name; select.append(option);
      }
      label.append(text, select); stepAssigneeFields.append(label);
      stepOwnerControls.push({ label, text, select, picker: window.SearchableSelect?.enhance(select) });
    }
    const control = stepOwnerControls[index];
    control.label.hidden = false;
    control.text.textContent = stage;
    control.select.disabled = false;
    control.select.name = `stageAssignee:${getStageId(task, stage)}`;
    control.select.value = normalizeAssignee(task.stageAssignees?.[getStageId(task, stage)]);
    control.picker?.sync();
  });
  stepOwnerControls.slice(stages.length).forEach(control => {
    control.picker?.close(); control.label.hidden = true;
    control.select.disabled = true; control.picker?.sync();
  });
}

function parseTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function flashButton(button, label) {
  const original = button.textContent;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1100);
}

function unlockWarRoom() {
  accessGate.setAttribute("hidden", "");
  stickerLoader.setAttribute("hidden", "");
  stickerLoader.textContent = "";
  warRoomApp.removeAttribute("hidden");
  document.body.classList.remove("locked");
}

function playStickerLoader() {
  accessGate.setAttribute("hidden", "");
  stickerLoader.textContent = "";
  stickerLoader.removeAttribute("hidden");
  document.body.classList.add("locked");

  const columns = 9;
  const rows = 6;
  const stickerCount = columns * rows;
  for (let index = 0; index < stickerCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const sticker = document.createElement("img");
    sticker.src = "./war-corgi.png";
    sticker.alt = "";
    sticker.className = "sticker-rain";
    sticker.style.setProperty("--x", `${(column + 0.5) * (100 / columns)}vw`);
    sticker.style.setProperty("--y", `${row * 18 + 4}vh`);
    sticker.style.setProperty("--r", `${(column % 2 === 0 ? -1 : 1) * (8 + Math.random() * 12)}deg`);
    sticker.style.setProperty("--s", `${0.62 + Math.random() * 0.32}`);
    sticker.style.animationDelay = `${row * 105 + column * 22}ms`;
    stickerLoader.append(sticker);
  }

  window.setTimeout(unlockWarRoom, 1450);
}

function openAddModal() {
  addModal.removeAttribute("hidden");
  document.body.classList.add("modal-open");
  globalAddForm.querySelector('input[name="title"]').focus();
}

function closeModal() {
  newAssigneePicker?.close();
  bucketPicker?.close();
  groupPicker?.close();
  addModal.setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
  toggleAddPanel.focus();
}

function populateAddControls() {
  bucketSelect.textContent = "";
  state.buckets.forEach((bucket) => {
    const option = document.createElement("option");
    option.value = bucket.id;
    option.textContent = bucket.title;
    bucketSelect.append(option);
  });
  bucketSelect.value = state.buckets[0].id;
  bucketPicker?.sync();
  populateGroupSelect(bucketSelect.value);
}

function populateGroupSelect(bucketId) {
  const bucket = state.buckets.find((item) => item.id === bucketId);
  groupSelect.textContent = "";
  bucket.groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.title;
    groupSelect.append(option);
  });
  groupPicker?.sync();
}

function safeUrls(value) {
  return String(value || "").split(/\s+/).filter(part => {
    try { return ["https:", "http:"].includes(new URL(part).protocol); } catch { return false; }
  }).join("\n");
}

function applyProjectFilter() {
  document.querySelectorAll(".bucket").forEach(node => {
    node.hidden = activeProject !== "all" && node.dataset.bucket !== activeProject;
  });
  board.classList.toggle("is-focused", activeProject !== "all");
  document.querySelectorAll("[data-project]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.project === activeProject));
  });
}

document.querySelectorAll("[data-project]").forEach(button => button.addEventListener("click", () => {
  activeProject = button.dataset.project;
  applyProjectFilter();
}));
document.querySelector("#syncStatus").addEventListener("click", () => { if (!saving) syncFromRemote(); });
window.addEventListener("online", () => syncFromRemote());
window.addEventListener("beforeunload", (event) => {
  if (dirty || window.WarRoomNotes?.hasPending()) { event.preventDefault(); event.returnValue = ""; }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const modal = [addModal, linkModal, accessGate].find(node => !node.hidden);
  if (!modal) return;
  const controls = [...modal.querySelectorAll("button, input, select, textarea, a[href]")].filter(node => !node.disabled && node.offsetParent !== null);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

document.querySelectorAll('.milestone-link').forEach(link => link.addEventListener('click', () => {
  activeProject = link.getAttribute('href').slice(1);
  applyProjectFilter();
}));
