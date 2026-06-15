const STORAGE_KEY = "john-ta-war-room-06152026-progress-v1";
const ACCESS_KEY = "john-ta-war-room-06152026-access-v1";
const ACCESS_PASSWORD = "corgi124";
const BOARD_ID = "war-room-06152026";
const CONVEX_URL = "https://rapid-shark-565.convex.cloud";

const seedBuckets = [
  {
    id: "newsletter",
    kicker: "Target area",
    title: "Newsletter",
    groups: [
      {
        id: "checklist",
        title: "Checklist",
        tasks: ["Reminders content", "Promotional content", "Define the email list we're sending", "Quality assurance"],
      },
    ],
  },
  {
    id: "articles",
    kicker: "Target area",
    title: "Articles",
    groups: [
      {
        id: "personal",
        title: "Personal card comparators",
        tasks: [
          { title: "CSP vs Venture", stages: ["Article written", "Article updated with 100k", "Published"] },
          { title: "CSP vs Strata Premier", stages: ["Article written", "Article updated with 100k", "Published"] },
          { title: "CSP vs Bilt Obsidian", stages: ["Article written", "Article updated with 100k", "Published"] },
          { title: "CSP vs Bank of America Premier Rewards", stages: ["Article written", "Article updated with 100k", "Published"] },
        ],
      },
      {
        id: "bonus-articles",
        title: "Personal bonus articles",
        tasks: [
          { title: "CSP 100k bonus announcement", stages: ["Article written", "Post/Publish"] },
          { title: "Huge Limited Time CSP Bonus", stages: ["Article written", "Post/Publish"] },
        ],
      },
    ],
  },
  {
    id: "tools",
    kicker: "Target area",
    title: "Tools",
    groups: [
      {
        id: "personal",
        title: "Personal",
        tasks: [
          { title: "Define personal tool candidates", tags: ["TBD"] },
          "Add sidebar Sapphire Preferred placement as an advertisement for the 100k CSP",
          {
            title: "Dashboard level advertising for Sapphire Preferred",
            notes: "For unpaid users. Pro users can click X and it disappears after.",
          },
          {
            title: "Update calculators to reflect limited time bonus LTO language",
            stages: ["Posted"],
          },
        ],
      },
    ],
  },
  {
    id: "social",
    kicker: "Target area",
    title: "Social Media",
    groups: [
      {
        id: "shared-reddit",
        title: "Shared subreddits",
        tasks: [
          {
            title: "r/chase combined post",
            stages: ["Content prepared", "Content posted"],
          },
          {
            title: "r/nextcard combined post",
            stages: ["Content prepared", "Content posted"],
          },
        ],
      },
      {
        id: "personal-reddit",
        title: "Personal-only subreddits",
        tasks: [
          { title: "r/sapphirepreferredcard post", stages: ["Content prepared", "Content posted"] },
          { title: "r/chasesapphire post", stages: ["Content prepared", "Content posted"] },
          { title: "r/sapphirereserve post", stages: ["Content prepared", "Content posted"] },
          { title: "r/chasesapphirereserve post", stages: ["Content prepared", "Content posted"] },
        ],
      },
      {
        id: "video-posts",
        title: "Videos",
        tasks: [
          { title: "CSP 100k video", stages: ["Content prepared", "Content posted"] },
          { title: "2 more social videos (Olivia)", stages: ["Content prepared", "Content posted"] },
        ],
      },
      {
        id: "linkedin",
        title: "LinkedIn",
        tasks: [
          { title: "LinkedIn (John)", stages: ["Prepared", "Posted"] },
          { title: "LinkedIn (Nextcard)", stages: ["Prepared", "Posted"] },
        ],
      },
      {
        id: "threads",
        title: "Threads",
        tasks: [
          { title: "Threads (John Ta)", stages: ["Content prepared", "Content posted"] },
          { title: "Threads (Nextcard)", stages: ["Content prepared", "Content posted"] },
        ],
      },
    ],
  },
  {
    id: "compliance",
    kicker: "Workstream",
    title: "Compliance",
    groups: [
      {
        id: "prep",
        title: "Prep",
        tasks: [
          "Crawl all subaffiliate content for CSP + CSR mentions",
          "Update the CSP and CSR compliance docs to the best of our ability",
        ],
      },
      {
        id: "post",
        title: "Post",
        tasks: [
          {
            title: "Upload compliance docs to Affil app after CSP Launch",
            stages: ["Posted"],
          },
        ],
      },
    ],
  },
  {
    id: "subaffiliates",
    kicker: "Workstream",
    title: "Subaffiliates",
    groups: [
      {
        id: "all-partner-actions",
        title: "All-partner actions",
        tasks: [
          { title: "Notify all subaffiliates about Personal card LTO", tags: ["Personal LTO"] },
        ],
      },
    ],
  },
];

const seedTaskIds = new Set(
  seedBuckets.flatMap((bucket) =>
    bucket.groups.flatMap((group) =>
      group.tasks.map((task) => getSeedTaskId(bucket.id, group.id, task)),
    ),
  ),
);

let state = loadState();
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
const addModal = document.querySelector("#addModal");
const modalBackdrop = document.querySelector("#modalBackdrop");
const closeAddModal = document.querySelector("#closeAddModal");
const toggleAddPanel = document.querySelector("#toggleAddPanel");
const linkModal = document.querySelector("#linkModal");
const linkModalBackdrop = document.querySelector("#linkModalBackdrop");
const closeLinkModal = document.querySelector("#closeLinkModal");
const linkForm = document.querySelector("#linkForm");
const linkModalTask = document.querySelector("#linkModalTask");
const deleteTicket = document.querySelector("#deleteTicket");
const warCat = document.querySelector("#warCat");
const passwordGate = document.querySelector("#passwordGate");
const passwordForm = document.querySelector("#passwordForm");
const passwordInput = document.querySelector("#passwordInput");
const passwordError = document.querySelector("#passwordError");
const stickerLoader = document.querySelector("#stickerLoader");
const sirenLayer = document.querySelector("#sirenLayer");
let catActionTimeout;
let sirenTimeout;
let activeLinkTaskId = "";

if (sessionStorage.getItem(ACCESS_KEY) === "granted") {
  unlockWarRoom();
} else {
  document.body.classList.add("locked");
  passwordInput.focus();
}

passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (passwordInput.value === ACCESS_PASSWORD) {
    sessionStorage.setItem(ACCESS_KEY, "granted");
    passwordInput.value = "";
    passwordError.setAttribute("hidden", "");
    playStickerLoader();
    return;
  }

  passwordError.removeAttribute("hidden");
  passwordInput.select();
});

warCat.addEventListener("click", () => {
  window.clearTimeout(catActionTimeout);
  window.clearTimeout(sirenTimeout);
  warCat.classList.remove("is-six-sevening");
  sirenLayer.classList.remove("is-active");
  void warCat.offsetWidth;
  warCat.classList.add("is-six-sevening");
  sirenLayer.removeAttribute("hidden");
  sirenLayer.classList.add("is-active");
  catActionTimeout = window.setTimeout(() => {
    warCat.classList.remove("is-six-sevening");
  }, 1500);
  sirenTimeout = window.setTimeout(() => {
    sirenLayer.classList.remove("is-active");
    sirenLayer.setAttribute("hidden", "");
  }, 1600);
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
  populateGroupSelect(bucketSelect.value);
  closeModal();
});
linkForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveLinksFromModal(new FormData(event.currentTarget));
});
deleteTicket.addEventListener("click", deleteActiveTicket);

render();
populateAddControls();
syncFromRemote();

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
  migrateRenamedTaskData(saved);

  const savedTasks = new Map();
  saved.buckets.forEach((bucket) => {
    bucket.groups?.forEach((group) => {
      group.tasks?.forEach((task) => savedTasks.set(task.id, task));
    });
  });

  const buckets = fallback.buckets.map((bucket) => ({
    ...bucket,
    groups: bucket.groups.map((group) => {
      const seededTasks = group.tasks
        .filter((task) => !saved.deletedTasks?.[task.id])
        .map((task) => mergeSavedTask(task, savedTasks.get(task.id)));
      const customTasks = saved.buckets
        .find((savedBucket) => savedBucket.id === bucket.id)
        ?.groups?.find((savedGroup) => savedGroup.id === group.id)
        ?.tasks?.filter((task) => task.custom && !seededTasks.some((seeded) => seeded.id === task.id));
      return { ...group, tasks: [...seededTasks, ...(customTasks || [])] };
    }),
  }));

  migrateArticleStages(buckets, saved);

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
    title: savedTask.title || seedTask.title,
    tags: savedTask.tags || seedTask.tags || [],
    notes: savedTask.notes || seedTask.notes || "",
    stages: seedTask.stages?.length ? seedTask.stages : savedTask.stages || [],
  };
}

function migrateArticleStages(buckets, saved) {
  const articles = buckets.find((bucket) => bucket.id === "articles");
  articles?.groups.forEach((group) => {
    group.tasks.forEach((task) => {
      const isComparator = group.id === "personal" && /\b(vs|vx)\b/i.test(task.title);
      const isBonusArticle = group.id === "bonus-articles";

      if (isComparator && !task.stages?.length) {
        task.stages = ["Article written", "Article updated with 100k", "Published"];
      }

      if (isBonusArticle && !task.stages?.length) {
        task.stages = ["Article written", "Post/Publish"];
      }

      if (saved.completed?.[task.id]) {
        saved.completed[slug(`${task.id}-Article written`)] = true;
        delete saved.completed[task.id];
      }
    });
  });
}

function migrateRenamedTaskData(saved) {
  const renamedTasks = [
    ["articles-personal-csr-vs-venture", "articles-personal-csp-vs-venture"],
    ["articles-personal-csr-vs-strata-premier", "articles-personal-csp-vs-strata-premier"],
    ["articles-personal-csr-vs-bilt-obsidian", "articles-personal-csp-vs-bilt-obsidian"],
    [
      "articles-personal-csr-vs-bank-of-america-premier-rewards",
      "articles-personal-csp-vs-bank-of-america-premier-rewards",
    ],
  ];

  renamedTasks.forEach(([oldId, newId]) => {
    if (saved.completed?.[oldId] && !saved.completed[newId]) saved.completed[newId] = saved.completed[oldId];
    if (saved.linearLinks?.[oldId] && !saved.linearLinks[newId]) saved.linearLinks[newId] = saved.linearLinks[oldId];
    if (saved.docLinks?.[oldId] && !saved.docLinks[newId]) saved.docLinks[newId] = saved.docLinks[oldId];
    if (saved.maintouchLinks?.[oldId] && !saved.maintouchLinks[newId]) {
      saved.maintouchLinks[newId] = saved.maintouchLinks[oldId];
    }
    if (saved.otherLinks?.[oldId] && !saved.otherLinks[newId]) saved.otherLinks[newId] = saved.otherLinks[oldId];
  });

  [
    "social-shared-reddit-r-chase-combined-post-personal-business-shared-subreddit",
    "social-shared-reddit-r-nextcard-combined-post-personal-business-shared-subreddit",
    "social-personal-reddit-r-sapphirepreferredcard-post-personal-oando",
    "social-personal-reddit-r-chasesapphire-post-personal",
    "social-personal-reddit-r-sapphirereserve-post-personal",
    "social-personal-reddit-r-chasesapphirereserve-post-personal",
  ].forEach((taskId) => {
    if (!saved.completed?.[taskId]) return;
    saved.completed[slug(`${taskId}-Content prepared`)] = true;
    saved.completed[slug(`${taskId}-Content posted`)] = true;
  });
}

function render() {
  board.textContent = "";

  state.buckets.forEach((bucket) => {
    const bucketNode = bucketTemplate.content.firstElementChild.cloneNode(true);
    bucketNode.dataset.bucket = bucket.id;
    bucketNode.querySelector(".bucket-kicker").textContent = bucket.kicker;
    bucketNode.querySelector("h2").textContent = bucket.title;

    const groupWrap = bucketNode.querySelector(".groups");

    bucket.groups.forEach((group) => {
      const groupNode = groupTemplate.content.firstElementChild.cloneNode(true);
      groupNode.dataset.group = group.id;
      groupNode.querySelector("h3").textContent = group.title;

      const list = groupNode.querySelector("ul");
      group.tasks.forEach((task) => list.append(renderTask(task, bucket.id, group.id)));
      groupWrap.append(groupNode);
    });

    board.append(bucketNode);
  });

  updateProgress();
}

function renderTask(task, bucketId, groupId) {
  const node = taskTemplate.content.firstElementChild.cloneNode(true);
  const checkbox = node.querySelector("input");
  const titleNode = node.querySelector("span");
  titleNode.textContent = task.title;

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
    custom: true,
  };
  group.tasks.push(task);
  if (linearUrl) state.linearLinks[task.id] = linearUrl;
  if (docUrl) state.docLinks[task.id] = docUrl;
  if (maintouchUrl) state.maintouchLinks[task.id] = maintouchUrl;
  if (otherUrls) state.otherLinks[task.id] = otherUrls;
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
    const bucketItems = getPrepProgressItems([bucket]);
    const bucketDone = bucketItems.filter((item) => state.completed[item.id]).length;
    bucketNode.querySelector(".bucket-progress").textContent = `${bucketDone}/${bucketItems.length}`;
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveRemoteState();
}

async function syncFromRemote() {
  try {
    const response = await fetch(`${CONVEX_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "warRoom:get", args: { boardId: BOARD_ID } }),
    });
    const result = await response.json();
    if (result.status !== "success") throw new Error(result.errorMessage || "Unable to load war room state");

    if (result.value) {
      state = mergeSeedWithSaved(createFallbackState(), result.value);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      populateAddControls();
      return;
    }

    saveRemoteState();
  } catch (error) {
    console.warn("War room shared sync unavailable; using local progress.", error);
  }
}

let remoteSaveTimer;

function saveRemoteState() {
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = window.setTimeout(async () => {
    try {
      const response = await fetch(`${CONVEX_URL}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "warRoom:save",
          args: {
            boardId: BOARD_ID,
            completed: state.completed,
            linearLinks: state.linearLinks,
            docLinks: state.docLinks,
            maintouchLinks: state.maintouchLinks,
            otherLinks: state.otherLinks,
            deletedTasks: state.deletedTasks,
            buckets: state.buckets,
          },
        }),
      });
      const result = await response.json();
      if (result.status !== "success") throw new Error(result.errorMessage || "Unable to save war room state");
    } catch (error) {
      console.warn("War room shared save failed; local progress is still saved.", error);
    }
  }, 250);
}

function buildExport() {
  return {
    warRoom: "June 15, 2026 Personal Cards Prep",
    exportedAt: new Date().toISOString(),
    buckets: state.buckets.map((bucket) => ({
      title: bucket.title,
      groups: bucket.groups.map((group) => ({
        title: group.title,
        tasks: group.tasks.map((task) => ({
          title: task.title,
          tags: task.tags || [],
          notes: task.notes || "",
          done: Boolean(state.completed[task.id]),
          linearUrl: state.linearLinks[task.id] || "",
          docUrl: state.docLinks[task.id] || "",
          maintouchUrl: state.maintouchLinks[task.id] || "",
          otherUrls: state.otherLinks[task.id] || "",
          stages: (task.stages || []).map((stage) => ({
            title: stage,
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
  control.href = getPrimaryUrl(existingUrl);
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
      existingLinearUrl || existingDocUrl || existingMaintouchUrl || getPrimaryUrl(existingOtherUrl),
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
  const cleanedUrl = value.trim();
  if (!cleanedUrl) return;
  setOptionalTaskUrl(taskId, cleanedUrl, type);
  saveState();
  render();
}

function setOptionalTaskUrl(taskId, value, type) {
  const cleanedUrl = value.trim();
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
  activeLinkTaskId = task.id;
  linkModalTask.textContent = "Right-click edits this ticket. Double-click opens the saved link.";
  linkForm.elements.title.value = task.title || "";
  linkForm.elements.notes.value = task.notes || "";
  linkForm.elements.tags.value = (task.tags || []).join(", ");
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
  linkModal.setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
  activeLinkTaskId = "";
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
  const shouldDelete = window.confirm(`Delete "${location.task.title}" from this war room?`);
  if (!shouldDelete) return;
  removeTaskFromGroup(location.group, activeLinkTaskId);
  closeLinksModal();
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
  const title = typeof task === "string" ? task : task.title;
  const tags = typeof task === "string" ? "" : `-${(task.tags || []).join("-")}`;
  return slug(`${bucketId}-${groupId}-${title}${tags}`);
}

function getStageId(task, stage) {
  return slug(`${task.id}-${stage}`);
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
  return /^(content posted|posted|published|post\/publish|gsc indexed)$/i.test(title || "");
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
    stageList.append(item);
  });
  node.append(stageList);
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
  passwordGate.setAttribute("hidden", "");
  stickerLoader.setAttribute("hidden", "");
  stickerLoader.textContent = "";
  warRoomApp.removeAttribute("hidden");
  document.body.classList.remove("locked");
}

function playStickerLoader() {
  passwordGate.setAttribute("hidden", "");
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
}
