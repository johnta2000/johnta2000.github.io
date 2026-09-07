const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const preview = new URLSearchParams(window.location.search).get("preview") === "1";
const PASSWORD_KEY = "john-ta-video-downloader-password";
const VISITOR_KEY = "john-ta-video-downloader-visitor";

const els = {
  gate: document.querySelector("#access-gate"),
  app: document.querySelector("#app"),
  accessForm: document.querySelector("#access-form"),
  accessPassword: document.querySelector("#access-password"),
  authStatus: document.querySelector("#auth-status"),
  lockTool: document.querySelector("#lock-tool"),
  workerStatus: document.querySelector("#worker-status"),
  form: document.querySelector("#download-form"),
  videoUrl: document.querySelector("#video-url"),
  quality: document.querySelector("#quality"),
  permission: document.querySelector("#permission"),
  submit: document.querySelector("#submit-download"),
  formMessage: document.querySelector("#form-message"),
  jobs: document.querySelector("#jobs"),
  refreshJobs: document.querySelector("#refresh-jobs"),
};

let workerOnline = false;
let refreshPromise = null;
let sitePassword = sessionStorage.getItem(PASSWORD_KEY) || "";
let visitorId = localStorage.getItem(VISITOR_KEY) || "";

if (!/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId)) {
  visitorId = window.crypto.randomUUID().replaceAll("-", "");
  localStorage.setItem(VISITOR_KEY, visitorId);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes >= 100_000_000 ? 0 : 1)} MB`;
}

function relativeTime(timestamp) {
  if (!timestamp) return "";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  return formatter.format(Math.round(minutes / 60), "hour");
}

function setFormMessage(text = "", kind = "error") {
  els.formMessage.hidden = !text;
  els.formMessage.textContent = text;
  els.formMessage.dataset.kind = kind;
}

function updateSubmitState() {
  const validUrl = els.videoUrl.validity.valid && els.videoUrl.value.trim();
  els.submit.disabled = !workerOnline || !els.permission.checked || !validUrl;
}

function renderWorker(status) {
  workerOnline = status.online;
  els.workerStatus.className = `worker-pill ${status.online ? "is-online" : "is-offline"}`;
  els.workerStatus.querySelector("b").textContent = status.online
    ? status.busy ? "John’s Mac · busy" : "John’s Mac · online"
    : "John’s Mac · offline";
  updateSubmitState();
}

const STATUS_LABELS = {
  queued: "Queued",
  processing: "Downloading",
  uploading: "Uploading",
  ready: "Ready",
  failed: "Failed",
  expired: "Expired",
};

function renderJobs(jobs) {
  if (!jobs.length) {
    els.jobs.innerHTML = '<div class="empty-state">Your queued and completed videos will appear here.</div>';
    return;
  }

  els.jobs.innerHTML = jobs.map((job) => {
    const label = STATUS_LABELS[job.status] || job.status;
    const name = job.title || job.filename || "YouTube video";
    const progress = Math.max(0, Math.min(100, Math.round(job.progress || 0)));
    const active = job.status === "processing" || job.status === "uploading";
    const detail = job.status === "ready"
      ? [formatBytes(job.fileSize), job.expiresAt ? `expires ${relativeTime(job.expiresAt)}` : ""].filter(Boolean).join(" · ")
      : job.status === "failed"
        ? job.error || "Download could not be completed."
        : job.status === "expired"
          ? "The temporary file has been deleted."
          : [job.speed, job.eta ? `ETA ${job.eta}` : ""].filter(Boolean).join(" · ") || `${job.quality === "best" ? "Best MP4" : `${job.quality}p`} quality`;

    return `
      <article class="job-card is-${escapeHtml(job.status)}">
        <div class="job-icon" aria-hidden="true">${job.status === "ready" ? "✓" : job.status === "failed" ? "!" : job.status === "expired" ? "×" : "↓"}</div>
        <div class="job-body">
          <div class="job-heading">
            <strong>${escapeHtml(name)}</strong>
            <span class="job-status">${escapeHtml(label)}</span>
          </div>
          ${active ? `<div class="job-progress"><span style="width:${progress}%"></span></div>` : ""}
          <p>${escapeHtml(detail)}</p>
        </div>
        ${job.status === "ready" && job.downloadUrl
          ? `<a class="download-link" href="${escapeHtml(job.downloadUrl)}" download="${escapeHtml(job.filename || "video.mp4")}">Download MP4</a>`
          : ""}
      </article>`;
  }).join("");
}

async function convexRequest(kind, path, args = {}) {
  if (!sitePassword) throw new Error("Enter the shared password first.");
  const response = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, max-age=0",
    },
    body: JSON.stringify({ path, args: { ...args, password: sitePassword, visitorId } }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") {
    throw new Error(result.errorMessage || result.message || result.code || "The request failed.");
  }
  return result.value;
}

async function refresh() {
  if (preview || !sitePassword || els.app.hidden || refreshPromise) return refreshPromise;
  refreshPromise = Promise.all([
    convexRequest("query", "videoDownloads:workerStatus"),
    convexRequest("query", "videoDownloads:listMine"),
  ]);
  try {
    const [status, jobs] = await refreshPromise;
    renderWorker(status);
    renderJobs(jobs);
  } finally {
    refreshPromise = null;
  }
}

async function unlock() {
  els.authStatus.hidden = false;
  els.authStatus.textContent = "Checking password…";
  await convexRequest("query", "videoDownloads:workerStatus");
  els.gate.hidden = true;
  els.app.hidden = false;
  sessionStorage.setItem(PASSWORD_KEY, sitePassword);
  await refresh();
}

function showAuthError() {
  els.app.hidden = true;
  els.gate.hidden = false;
  els.authStatus.hidden = false;
  els.authStatus.textContent = "That password didn’t work. Try again.";
  els.accessPassword.select();
}

async function initializeAccess() {
  if (preview) {
    els.gate.hidden = true;
    els.app.hidden = false;
    renderWorker({ online: true, busy: false });
    return;
  }
  if (sitePassword) {
    try {
      await unlock();
      return;
    } catch {
      sitePassword = "";
      sessionStorage.removeItem(PASSWORD_KEY);
    }
  }
  els.authStatus.textContent = "Enter the password to continue.";
  els.accessPassword.focus();
}

function lockTool() {
  sitePassword = "";
  sessionStorage.removeItem(PASSWORD_KEY);
  els.app.hidden = true;
  els.gate.hidden = false;
  els.accessPassword.value = "";
  els.authStatus.textContent = "Enter the password to continue.";
  els.accessPassword.focus();
}

els.accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  sitePassword = els.accessPassword.value;
  els.authStatus.textContent = "Checking password…";
  try {
    await unlock();
    els.accessPassword.value = "";
  } catch (error) {
    console.error(error);
    sitePassword = "";
    sessionStorage.removeItem(PASSWORD_KEY);
    showAuthError();
  }
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage();
  els.submit.disabled = true;
  els.submit.innerHTML = '<span aria-hidden="true">↓</span> Queueing…';
  try {
    await convexRequest("mutation", "videoDownloads:requestDownload", {
      videoUrl: els.videoUrl.value.trim(),
      quality: els.quality.value,
      permissionConfirmed: els.permission.checked,
    });
    els.videoUrl.value = "";
    els.permission.checked = false;
    setFormMessage("Added to the private queue.", "success");
    await refresh();
  } catch (error) {
    setFormMessage(error.message || "The download could not be queued.");
  } finally {
    els.submit.innerHTML = '<span aria-hidden="true">↓</span> Queue MP4';
    updateSubmitState();
  }
});

els.videoUrl.addEventListener("input", updateSubmitState);
els.permission.addEventListener("change", updateSubmitState);
els.refreshJobs.addEventListener("click", () => refresh().catch((error) => setFormMessage(error.message)));
els.lockTool.addEventListener("click", lockTool);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh().catch(() => {});
});
window.setInterval(() => refresh().catch(() => {}), 4_000);

initializeAccess();
