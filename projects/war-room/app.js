const STORAGE_KEY = "john-ta-war-room-progress-v1";
const ACCESS_KEY = "john-ta-war-room-access-v1";
const ACCESS_PASSWORD = "corgi124";

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
        id: "business",
        title: "Business card comparators",
        tasks: ["CSRB vs VXB", "CSRB vs Amex Biz Plat", "CSRB vs Ink Preferred"],
      },
      {
        id: "personal",
        title: "Personal card comparators",
        tasks: [
          "CSP vs Venture",
          "CSP vs Strata Premier",
          "CSP vs Bilt Obsidian",
          "CSP vs Bank of America Premier Rewards",
          "Huge Limited Time CSP Bonus",
        ],
      },
      {
        id: "bonus-articles",
        title: "Bonus articles",
        tasks: ["CSP 100k bonus announcement", "Ink Business Cash and Unlimited 100k bonus", "CSRB 200k bonus"],
      },
      {
        id: "maintouch-refresh",
        title: "Maintouch refresh / update",
        tasks: [
          {
            title: "Is Ink Business Unlimited, Ink Business Cash, or Ink Business Preferred best",
            notes: "https://www.nextcard.com/articles/is-the-ink-business-unlimited-ink-business-cash-or-ink-business-preferred-best",
            stages: ["Updated", "Published", "GSC Indexed"],
          },
          {
            title: "How to get Chase points from Ink Business Unlimited",
            notes: "https://www.nextcard.com/articles/how-to-get-chase-points-from-ink-business-unlimited",
            stages: ["Updated", "Published", "GSC Indexed"],
          },
          {
            title: "Why you should get the Ink Business Cash",
            notes: "https://www.nextcard.com/articles/why-you-should-get-the-ink-business-cash",
            stages: ["Updated", "Published", "GSC Indexed"],
          },
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
        id: "build",
        title: "Business",
        tasks: [
          "Ink card quiz",
          "General business card quiz tool",
          "Privatize and remove the credit card wallet leaderboard and make it more accessible for sharing like how it is for Flighty",
        ],
      },
      {
        id: "personal",
        title: "Personal",
        tasks: [{ title: "Define personal tool candidates", tags: ["TBD"] }],
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
          { title: "r/chase combined post", tags: ["Personal", "Business", "Shared subreddit"] },
          { title: "r/nextcard combined post", tags: ["Personal", "Business", "Shared subreddit"] },
        ],
      },
      {
        id: "personal-reddit",
        title: "Personal-only subreddits",
        tasks: [
          { title: "r/sapphirepreferredcard post", tags: ["Personal", "O&O"] },
          { title: "r/chasesapphire post", tags: ["Personal"] },
          { title: "r/sapphirereserve post", tags: ["Personal"] },
          { title: "r/chasesapphirereserve post", tags: ["Personal"] },
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
          { title: "Notify all subaffiliates about Business LTO", tags: ["Business LTO"] },
          { title: "Notify all subaffiliates about Personal card LTO", tags: ["Personal LTO"] },
        ],
      },
      {
        id: "partner-tracker",
        title: "Partner tracker",
        tasks: ["Launch Stratys Travel CSRB YouTube long form video"],
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

render();
populateAddControls();

function loadState() {
  const fallback = {
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
  };

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
      const seededTasks = group.tasks.map((task) => savedTasks.get(task.id) || task);
      const customTasks = saved.buckets
        .find((savedBucket) => savedBucket.id === bucket.id)
        ?.groups?.find((savedGroup) => savedGroup.id === group.id)
        ?.tasks?.filter((task) => task.custom && !seededTasks.some((seeded) => seeded.id === task.id));
      return { ...group, tasks: [...seededTasks, ...(customTasks || [])] };
    }),
  }));

  return { buckets, completed: saved.completed, linearLinks: saved.linearLinks || {}, docLinks: saved.docLinks || {} };
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
    renderTaskLinks(task).reverse().forEach((link) => node.prepend(link));
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
    renderTaskLinks(task).forEach((link) => checkbox.insertAdjacentElement("afterend", link));
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

  if (task.custom || !seedTaskIds.has(task.id)) {
    const remove = document.createElement("button");
    remove.className = "remove-task";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeTask(bucketId, groupId, task.id));
    node.append(remove);
  }

  return node;
}

function addTask(formData) {
  const title = formData.get("title").trim();
  const bucketId = formData.get("bucket");
  const groupId = formData.get("group");
  const linearUrl = (formData.get("linearUrl") || "").trim();
  const docUrl = (formData.get("docUrl") || "").trim();
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
  saveState();
  render();
}

function removeTask(bucketId, groupId, taskId) {
  const bucket = state.buckets.find((item) => item.id === bucketId);
  const group = bucket.groups.find((item) => item.id === groupId);
  group.tasks = group.tasks.filter((task) => task.id !== taskId);
  delete state.completed[taskId];
  delete state.linearLinks[taskId];
  delete state.docLinks[taskId];
  saveState();
  render();
}

function updateProgress() {
  const progressItems = getProgressItems(state.buckets);
  const done = progressItems.filter((item) => state.completed[item.id]).length;
  const total = progressItems.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  doneCount.textContent = done;
  totalCount.textContent = total;
  percentCount.textContent = `${percent}%`;
  meterFill.style.width = `${percent}%`;

  document.querySelectorAll(".bucket").forEach((bucketNode) => {
    const bucket = state.buckets.find((item) => item.id === bucketNode.dataset.bucket);
    const bucketItems = getProgressItems([bucket]);
    const bucketDone = bucketItems.filter((item) => state.completed[item.id]).length;
    bucketNode.querySelector(".bucket-progress").textContent = `${bucketDone}/${bucketItems.length}`;
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildExport() {
  return {
    warRoom: "June 15, 2026 Prep",
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
  const links = [
    renderSavedLink(task, "linear"),
    renderSavedLink(task, "doc"),
  ].filter(Boolean);

  links.forEach((link, index) => {
    if (index > 0) link.classList.add("is-stacked");
  });
  return links;
}

function renderLinearLink(task) {
  return renderSavedLink(task, "linear");
}

function renderSavedLink(task, type) {
  const isDoc = type === "doc";
  const existingUrl = isDoc ? state.docLinks[task.id] : state.linearLinks[task.id];
  if (!existingUrl) return null;

  const control = document.createElement("a");
  control.className = `task-link ${isDoc ? "doc-link" : "linear-link"}`;
  control.href = existingUrl;
  control.target = "_blank";
  control.rel = "noreferrer";
  control.title = isDoc
    ? "Open Google Doc. Drop a new Google Doc URL here to replace it."
    : "Open Linear ticket. Drop a new Linear URL here to replace it.";
  control.setAttribute("aria-label", isDoc ? "Open Google Doc" : "Open Linear ticket");
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
  if (existingLinearUrl || existingDocUrl) {
    window.open(existingLinearUrl || existingDocUrl, "_blank", "noopener,noreferrer");
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
  if (type === "doc") {
    if (cleanedUrl) {
      state.docLinks[taskId] = cleanedUrl;
    } else {
      delete state.docLinks[taskId];
    }
  } else {
    if (cleanedUrl) {
      state.linearLinks[taskId] = cleanedUrl;
    } else {
      delete state.linearLinks[taskId];
    }
  }
}

function openLinksModal(task) {
  activeLinkTaskId = task.id;
  linkModalTask.textContent = task.title;
  linkForm.elements.linearUrl.value = state.linearLinks[task.id] || "";
  linkForm.elements.docUrl.value = state.docLinks[task.id] || "";
  linkModal.removeAttribute("hidden");
  document.body.classList.add("modal-open");
  linkForm.elements.linearUrl.focus();
}

function closeLinksModal() {
  linkModal.setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
  activeLinkTaskId = "";
}

function saveLinksFromModal(formData) {
  if (!activeLinkTaskId) return;
  setOptionalTaskUrl(activeLinkTaskId, formData.get("linearUrl") || "", "linear");
  setOptionalTaskUrl(activeLinkTaskId, formData.get("docUrl") || "", "doc");
  saveState();
  closeLinksModal();
  render();
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
          return task.stages.map((stage) => ({ id: getStageId(task, stage) }));
        }
        return [{ id: task.id }];
      }),
    ),
  );
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
    sticker.src = "./war-cat-sticker.png";
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
