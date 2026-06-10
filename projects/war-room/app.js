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
          "CSR vs Venture",
          "CSR vs Strata Premier",
          "CSR vs Bilt Obsidian",
          "CSR vs Bank of America Premier Rewards",
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
        tasks: ["Ink card quiz"],
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
          { title: "Confirm global partner links and rules", tags: ["Links", "Compliance"] },
        ],
      },
      {
        id: "partner-tracker",
        title: "Partner tracker",
        tasks: [
          {
            title: "Build partner contact roster",
            tags: ["Roster"],
            notes: "Add individual partners here as rows, then tag by campaign, status, or owner.",
          },
          { title: "Track partner-specific requests", tags: ["Notes"] },
          { title: "Log requested copy or link changes", tags: ["Follow-up"] },
        ],
      },
    ],
  },
];

const seedTaskIds = new Set(
  seedBuckets.flatMap((bucket) =>
    bucket.groups.flatMap((group) =>
      group.tasks.map((task) => slug(`${bucket.id}-${group.id}-${typeof task === "string" ? task : task.title}`)),
    ),
  ),
);

let state = loadState();
let hideDone = false;

const board = document.querySelector("#board");
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
const warCat = document.querySelector("#warCat");
const passwordGate = document.querySelector("#passwordGate");
const passwordForm = document.querySelector("#passwordForm");
const passwordInput = document.querySelector("#passwordInput");
const passwordError = document.querySelector("#passwordError");
let catActionTimeout;

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
    unlockWarRoom();
    return;
  }

  passwordError.removeAttribute("hidden");
  passwordInput.select();
});

warCat.addEventListener("click", () => {
  window.clearTimeout(catActionTimeout);
  warCat.classList.remove("is-six-sevening");
  void warCat.offsetWidth;
  warCat.classList.add("is-six-sevening");
  catActionTimeout = window.setTimeout(() => {
    warCat.classList.remove("is-six-sevening");
  }, 1500);
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
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !addModal.hasAttribute("hidden")) {
    closeModal();
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

  return { buckets, completed: saved.completed };
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
  checkbox.id = task.id;
  checkbox.checked = Boolean(state.completed[task.id]);
  node.classList.toggle("is-done", checkbox.checked);
  const titleNode = node.querySelector("span");
  titleNode.textContent = task.title;

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
  checkbox.addEventListener("change", () => {
    state.completed[task.id] = checkbox.checked;
    if (!checkbox.checked) delete state.completed[task.id];
    saveState();
    node.classList.toggle("is-done", checkbox.checked);
    updateProgress();
  });

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
  const tags = parseTags(formData.get("tags") || "");
  const notes = (formData.get("notes") || "").trim();
  if (!title) return;

  const bucket = state.buckets.find((item) => item.id === bucketId);
  const group = bucket.groups.find((item) => item.id === groupId);
  group.tasks.push({
    id: slug(`${bucketId}-${groupId}-${title}-${Date.now()}`),
    title,
    tags,
    notes,
    custom: true,
  });
  saveState();
  render();
}

function removeTask(bucketId, groupId, taskId) {
  const bucket = state.buckets.find((item) => item.id === bucketId);
  const group = bucket.groups.find((item) => item.id === groupId);
  group.tasks = group.tasks.filter((task) => task.id !== taskId);
  delete state.completed[taskId];
  saveState();
  render();
}

function updateProgress() {
  const tasks = state.buckets.flatMap((bucket) => bucket.groups.flatMap((group) => group.tasks));
  const done = tasks.filter((task) => state.completed[task.id]).length;
  const total = tasks.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  doneCount.textContent = done;
  totalCount.textContent = total;
  percentCount.textContent = `${percent}%`;
  meterFill.style.width = `${percent}%`;

  document.querySelectorAll(".bucket").forEach((bucketNode) => {
    const bucket = state.buckets.find((item) => item.id === bucketNode.dataset.bucket);
    const bucketTasks = bucket.groups.flatMap((group) => group.tasks);
    const bucketDone = bucketTasks.filter((task) => state.completed[task.id]).length;
    bucketNode.querySelector(".bucket-progress").textContent = `${bucketDone}/${bucketTasks.length}`;
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
        })),
      })),
    })),
  };
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
    id: slug(`${bucketId}-${groupId}-${title}`),
    title,
    tags: typeof task === "string" ? [] : task.tags || [],
    notes: typeof task === "string" ? "" : task.notes || "",
  };
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
  document.body.classList.remove("locked");
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
