const form = document.querySelector("#signup");
const email = form.elements.email;
const button = form.querySelector("button");
const status = document.querySelector("#status");
const draftKey = "edit-pricing.email-draft";
const doneKey = "edit-pricing.joined";

function restore(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch { /* The form also works when browser storage is unavailable. */ }
}
function confirmSignup() {
  form.hidden = true;
  status.removeAttribute("data-error");
  status.textContent = "You’re on the list. I’ll email you about The Edit pricing tool.";
}
email.value = restore(draftKey) || "";
if (restore(doneKey)) confirmSignup();
button.disabled = false;

email.addEventListener("input", () => {
  store(draftKey, email.value);
  status.textContent = "";
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  const address = email.value.trim();
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(address)) {
    status.dataset.error = "";
    status.textContent = "Enter a complete email address, such as you@example.com.";
    email.focus();
    return;
  }
  store(draftKey, address);
  button.disabled = true;
  email.readOnly = true;
  status.removeAttribute("data-error");
  status.textContent = "Saving…";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://standing-beagle-745.convex.cloud/api/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "signups:join", args: { email: address, website: form.elements.website.value } }),
      signal: controller.signal,
    });
    if (!response.ok || (await response.json()).status !== "success") throw new Error("Signup failed");
    store(doneKey, "yes");
    store(draftKey, "");
    email.value = "";
    confirmSignup();
  } catch {
    status.dataset.error = "";
    status.textContent = "We couldn’t confirm your signup. Please try again.";
  } finally {
    clearTimeout(timer);
    button.disabled = false;
    email.readOnly = false;
  }
});
