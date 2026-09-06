const CONVEX_URL = "https://rapid-shark-565.convex.cloud";
const preview = new URLSearchParams(window.location.search).get("preview") === "1";

const els = {
  gate: document.querySelector("#access-gate"),
  app: document.querySelector("#app"),
  clerkSignIn: document.querySelector("#clerk-sign-in"),
  authStatus: document.querySelector("#auth-status"),
  authSignOut: document.querySelector("#auth-sign-out"),
  signOut: document.querySelector("#sign-out"),
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
  const token = await getConvexToken();
  if (!token) throw new Error("Not authenticated with Clerk.");
  const response = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, args }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") {
    throw new Error(result.errorMessage || result.message || result.code || "The secure request failed.");
  }
  return result.value;
}

async function getConvexToken() {
  const session = window.Clerk?.session;
  if (!session) return null;
  const sessionToken = await session.getToken();
  const audience = readJwtPayload(sessionToken)?.aud;
  if (audience === "convex" || (Array.isArray(audience) && audience.includes("convex"))) return sessionToken;
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

async function refresh() {
  if (preview || !window.Clerk?.isSignedIn || els.app.hidden || refreshPromise) return refreshPromise;
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
  els.authStatus.textContent = "Verifying your team access…";
  await convexRequest("query", "videoDownloads:workerStatus");
  els.gate.hidden = true;
  els.app.hidden = false;
  await refresh();
}

function showAuthError(error) {
  const message = String(error?.message || error || "");
  els.app.hidden = true;
  els.gate.hidden = false;
  els.authStatus.hidden = false;
  els.authSignOut.hidden = !window.Clerk?.isSignedIn;
  els.authStatus.textContent = /not authorized/i.test(message)
    ? "This account is signed in, but it is not approved for this private tool."
    : "Secure sign-in could not finish. Refresh and try again.";
}

async function initializeClerk() {
  if (preview) {
    els.gate.hidden = true;
    els.app.hidden = false;
    renderWorker({ online: true, busy: false });
    return;
  }
  try {
    if (!window.Clerk) throw new Error("Secure sign-in did not load.");
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    if (window.Clerk.isSignedIn) return await unlock();
    els.authStatus.hidden = true;
    window.Clerk.mountSignIn(els.clerkSignIn, {
      routing: "hash",
      withSignUp: true,
      forceRedirectUrl: window.location.href.split("#")[0],
      signUpForceRedirectUrl: window.location.href.split("#")[0],
      appearance: {
        variables: {
          colorPrimary: "#ff3f64",
          colorBackground: "#11141b",
          colorText: "#f6f7fb",
          colorInputBackground: "#0c0f15",
          colorInputText: "#f6f7fb",
          borderRadius: "10px",
          fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      },
    });
  } catch (error) {
    console.error(error);
    showAuthError(error);
  }
}

async function signOut() {
  els.app.hidden = true;
  if (window.Clerk?.isSignedIn) await window.Clerk.signOut();
  window.location.assign(window.location.href.split("#")[0]);
}

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
els.signOut.addEventListener("click", signOut);
els.authSignOut.addEventListener("click", signOut);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh().catch(() => {});
});
window.setInterval(() => refresh().catch(() => {}), 4_000);

initializeClerk();
