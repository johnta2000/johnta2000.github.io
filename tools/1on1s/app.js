const $ = id => document.getElementById(id);
const prompts = ["How do you feel about Affil so far? How is growth?", "Biggest personal wins?", "Biggest personal Ls?", "Any feedback for each other?", "Any general questions/curiosities?"];
let token = "", setup = false, revision = 0, dirty = false, generation = 0, saving = null, timer, expiry, activeMonth = "", authId, recovery = null;
for (const [i, prompt] of prompts.entries()) {
  const section = document.createElement("div"); section.className = "question";
  const label = document.createElement("label"); label.htmlFor = `answer${i}`; label.textContent = `${i + 1}. ${prompt}`;
  const input = document.createElement("textarea"); input.id = `answer${i}`; input.rows = 4; input.maxLength = 50000;
  section.append(label, input); $("questions").append(section);
}
const fields = [...prompts.map((_, i) => $(`answer${i}`)), $("notes"), $("followups")];
const now = new Date(); $("month").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

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

async function call(kind, name, args = {}) {
  const jwt = await getConvexToken();
  if (!jwt) throw new Error("Please sign in again.");
  const response = await fetch(`https://rapid-shark-565.convex.cloud/api/${kind}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ path: name, args }), cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || result.status !== "success") throw new Error(result.errorMessage || "Connection failed. Your edits have not been saved.");
  return result.value;
}

function clearJournal(message = "Journal locked.", preserveDraft = false) {
  recovery = preserveDraft && dirty ? { values: fields.map(field => field.value), month: activeMonth, revision } : null;
  token = ""; generation++; clearTimeout(timer); clearTimeout(expiry); dirty = false;
  fields.forEach(field => { field.value = ""; }); $("previous").replaceChildren();
  $("journal").hidden = true; $("gate").hidden = false; $("authStatus").textContent = message;
}

async function authenticate() {
  try {
    const status = await call("query", "monthlyJournal:status");
    setup = !status.configured;
    $("unlock").hidden = false; $("confirmation").hidden = !setup;
    $("confirmPassword").required = setup;
    $("password").autocomplete = setup ? "new-password" : "current-password";
    $("passwordLabel").textContent = setup ? "Choose your journal password" : "Journal password";
    $("unlockButton").textContent = setup ? "Set password & open journal" : "Unlock journal";
    $("authStatus").textContent = setup ? "Choose a separate password for this private journal." : "One last check before opening your notes.";
  } catch (error) { $("unlock").hidden = true; $("authStatus").textContent = error.message; }
}

$("unlock").onsubmit = async event => {
  event.preventDefault(); $("unlockButton").disabled = true;
  try {
    if (setup && $("password").value !== $("confirmPassword").value) throw new Error("Passwords do not match.");
    const result = await call("action", "monthlyJournalPassword:unlock", { password: $("password").value, setup });
    token = result.token; setup = false; $("confirmation").hidden = true; $("confirmPassword").required = false;
    $("passwordLabel").textContent = "Journal password"; $("unlockButton").textContent = "Unlock journal";
    $("password").value = ""; $("confirmPassword").value = "";
    expiry = setTimeout(() => clearJournal("Your hour is up. Unlock again to continue. Unsaved edits are held in this tab until you unlock.", true), Math.max(0, result.expiresAt - Date.now()));
    const draft = recovery;
    await loadMonth(draft?.month || $("month").value);
    if (draft) {
      fields.forEach((field, i) => { field.value = draft.values[i]; });
      $("month").value = draft.month; revision = draft.revision; dirty = true; recovery = null;
      $("saveStatus").textContent = "Restored unsaved edits. Save when ready.";
    }
    $("gate").hidden = true; $("journal").hidden = false;
  } catch (error) { $("authStatus").textContent = error.message; }
  finally { $("unlockButton").disabled = false; }
};

async function loadMonth(month) {
  const currentGeneration = generation;
  const data = await call("query", "monthlyJournal:read", { token, month });
  if (currentGeneration !== generation || !token) throw new Error("Journal locked.");
  activeMonth = month; revision = data.current?.revision ?? 0; dirty = false;
  fields.forEach((field, i) => { field.value = i < 5 ? data.current?.answers[i] ?? "" : data.current?.[i === 5 ? "notes" : "followups"] ?? ""; });
  $("previous").replaceChildren();
  $("previousTitle").textContent = data.previous ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(`${data.previous.month}-15T12:00:00`)) : "A fresh start";
  if (data.previous) {
    const values = [data.previous.followups, data.previous.notes, ...data.previous.answers];
    ["Bring forward", "Scratchpad", ...prompts].forEach((label, i) => {
      const heading = document.createElement("h3"); heading.textContent = label;
      const text = document.createElement("div"); text.className = "entry-text"; text.textContent = values[i] || "Nothing noted.";
      $("previous").append(heading, text);
    });
  } else $("previous").textContent = "Your earlier reflections will appear here once you’ve saved an entry in a previous month.";
  $("saveStatus").textContent = "All changes saved";
}

async function save() {
  clearTimeout(timer);
  if (saving) { await saving; if (dirty) return save(); return; }
  if (!dirty || !token) return;
  const values = fields.map(field => field.value), currentGeneration = generation;
  $("saveStatus").textContent = "Saving…";
  saving = (async () => {
    const nextRevision = await call("mutation", "monthlyJournal:save", { token, month: activeMonth, revision, answers: values.slice(0, 5), notes: values[5], followups: values[6] });
    if (currentGeneration !== generation) return;
    revision = nextRevision;
    dirty = fields.some((field, i) => field.value !== values[i]);
    $("saveStatus").textContent = dirty ? "Unsaved changes" : "All changes saved";
  })();
  try { await saving; }
  catch (error) { $("saveStatus").textContent = `Not saved: ${error.message}`; throw error; }
  finally { saving = null; }
  if (dirty) return save();
}
fields.forEach(field => field.addEventListener("input", () => {
  dirty = true; $("saveStatus").textContent = "Unsaved changes";
  clearTimeout(timer); timer = setTimeout(() => save().catch(() => {}), 800);
}));
$("save").onclick = () => save().catch(() => {});
let navigating = false;
async function navigate(month) {
  if (navigating || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { $("month").value = activeMonth; return; }
  navigating = true;
  const controls = [$("prev"), $("next"), $("month"), ...fields]; controls.forEach(el => { el.disabled = true; });
  try { await save(); await loadMonth(month); $("month").value = month; }
  catch (error) { $("month").value = activeMonth; $("saveStatus").textContent = error.message; }
  finally { navigating = false; controls.forEach(el => { el.disabled = false; }); }
}
$("month").onchange = () => navigate($("month").value);
for (const [id, delta] of [["prev", -1], ["next", 1]]) $(id).onclick = () => {
  const date = new Date(`${activeMonth}-15T12:00:00`); date.setMonth(date.getMonth() + delta);
  navigate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
};
$("lock").onclick = async () => {
  try { await save(); await call("mutation", "monthlyJournal:lock", { token }); clearJournal(); }
  catch (error) { $("saveStatus").textContent = `Could not lock: ${error.message}`; }
};
$("signout").onclick = () => window.Clerk.signOut();
window.addEventListener("beforeunload", event => { if (dirty || recovery) { event.preventDefault(); event.returnValue = ""; } });

(async () => {
  try {
    await new Promise((resolve, reject) => {
      const start = Date.now(); const poll = setInterval(() => {
        if (window.Clerk && window.__internal_ClerkUICtor) { clearInterval(poll); resolve(); }
        else if (Date.now() - start > 20000) { clearInterval(poll); reject(new Error("Sign-in could not load. Reload to try again.")); }
      }, 100);
    });
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    window.Clerk.addListener(({ session }) => {
      if (session?.id === authId) return;
      authId = session?.id;
      clearJournal("Checking access…"); $("unlock").hidden = true; $("signout").hidden = !session;
      if (session) { $("signin").hidden = true; authenticate(); }
      else { $("signin").hidden = false; $("authStatus").textContent = "Sign in with your private account."; }
    });
    if (window.Clerk.session) { authId = window.Clerk.session.id; $("signout").hidden = false; await authenticate(); }
    else { $("authStatus").textContent = "Sign in to continue."; }
    if (!window.Clerk.session) window.Clerk.mountSignIn($("signin"), { routing: "hash", forceRedirectUrl: location.href.split("#")[0] });
  } catch (error) { $("authStatus").textContent = error.message; }
})();
