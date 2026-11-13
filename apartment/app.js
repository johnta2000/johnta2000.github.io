(() => {
  const form = document.getElementById("gate");
  const password = document.getElementById("password");
  const toggle = document.getElementById("show-password");
  const button = document.getElementById("unlock");
  const error = document.getElementById("error");
  const copyIcon =
    '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M12 7V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3"/></svg>';
  const escape = (value = "") =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const text = (node) => node?.textContent.trim() || "";
  const decode = (value) =>
    Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  let toastTimer, sharingKey;
  const shareToken = new URLSearchParams(location.hash.slice(1)).get('share');
  const shareApi = 'https://rapid-shark-565.convex.site/apartment-share';
  const payloadRequest = () => fetch('/apartment/guide.json', {cache: 'no-store'}).then(r => { if (!r.ok) throw Error('load'); return r.json(); });


  toggle.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    toggle.textContent = show ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", String(show));
  });

  async function decrypt(payload, secret) {
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: decode(payload.salt),
        iterations: 250000,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      true,
      ["decrypt"],
    );
    sharingKey = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key))));
    return decryptKey(payload, key);
  }

  async function decryptKey(payload, key) {
    const ciphertext = decode(payload.ciphertext);
    const tag = decode(payload.tag);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(payload.iv) },
      key,
      combined,
    );
    return JSON.parse(new TextDecoder().decode(clear));
  }

  // All visitor information, including the original inline photos, stays in the
  // encrypted payload. Only build the guide after successful decryption.
  function renderGuide(guide) {
    const source = new DOMParser().parseFromString(guide.main, "text/html");
    const address = text(source.querySelector(".address"));
    const unit = text(source.querySelector(".unit-badge strong"));
    const image = (selector, className = "") => {
      const original = source.querySelector(selector);
      if (!original) return "";
      const src = original.getAttribute("src") || "";
      // Legacy images were embedded before encryption. Do not request third-party images.
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(src)) return "";
      return `<img class="${className}" src="${escape(src)}" alt="${escape(original.alt)}">`;
    };
    const copyButton = (value, label, showCode = false) =>
      `<button class="copy${showCode ? " code-copy" : ""}" type="button" data-copy="${escape(value)}" data-label="${escape(label)}" aria-label="Copy ${escape(label)}" title="Copy ${escape(label)}">${showCode ? `<code>${escape(value)}</code>` : ""}${copyIcon}<span class="sr-only">Copy</span></button>`;
    const steps = [...source.querySelectorAll(".steps .step")]
      .map((step, index) => {
        const code = text(step.querySelector(".code"));
        return `<li class="step${code ? " has-code" : ""}"><span class="step-number" aria-hidden="true">${index + 2}</span><div class="step-content"><h3>${escape(text(step.querySelector("h2")))}</h3>${code ? "" : `<p>${escape(text(step.querySelector("p")))}</p>`}</div>${code ? copyButton(code, "lockbox code", true) : ""}</li>`;
      })
      .join("");
    const parking = source.querySelector(".parking-content");
    const parkingItems = [...parking.querySelectorAll("li")]
      .map((item) => `<li>${escape(text(item))}</li>`)
      .join("");
    const wifi = guide.wifi;
    const mapAddress = encodeURIComponent(address);
    const addressBreak = address.lastIndexOf(" ");
    const addressStart = addressBreak < 0 ? "" : address.slice(0, addressBreak + 1);
    const addressEnd = address.slice(addressBreak + 1);
    document.body.innerHTML = `<main class="page"><header class="address-header"><div class="address-details"><h1 id="address-title" tabindex="-1"><span class="address-start">${escape(addressStart)}</span><span class="address-end"><span>${escape(addressEnd)}</span><span class="address-icons"><button class="copy address-copy" type="button" data-copy="${escape(address + "\n" + unit)}" data-label="address" aria-label="Copy address and unit" title="Copy address and unit">${copyIcon}<span class="sr-only">Copy address</span></button><a class="map-icon" href="https://www.google.com/maps/search/?api=1&amp;query=${mapAddress}" target="_blank" rel="noopener noreferrer" aria-label="Open address in Google Maps" title="Google Maps"><img src="/apartment/icons/google-maps.svg" alt="" width="22" height="22"></a><a class="map-icon" href="https://maps.apple.com/?address=${mapAddress}" target="_blank" rel="noopener noreferrer" aria-label="Open address in Apple Maps" title="Apple Maps"><img src="/apartment/icons/apple-maps.svg" alt="" width="22" height="22"></a></span></span></h1><p class="unit">${escape(unit)}</p></div></header><nav class="jump-links" aria-label="Guest guide sections"><a href="#arrival"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 21h16M7 21V4l10-2v19M13 12h.01" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Getting inside</span></a><a href="#parking" id="parking-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Parking</span></a>${wifi ? '<a href="#wifi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0" stroke-linecap="round"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/></svg><span>Wi-Fi</span></a>' : ""}</nav><section class="card arrival-card" id="arrival" aria-labelledby="arrival-title"><div class="card-header"><h2 class="section-title" id="arrival-title"><span class="section-icon" aria-hidden="true">↳</span>Getting inside</h2></div><ol class="steps arrival-steps"><li class="step entrance-step"><div class="entrance-heading"><span class="step-number" aria-hidden="true">1</span><div><h3>Find the entrance</h3><p>${escape(text(source.querySelector(".entrance-panel p")))}</p></div></div><div class="arrival-visuals"><figure>${image(".entrance-panel img", "arrival-map")}<figcaption>King St entrance</figcaption></figure><figure>${image(".photo-frame img", "arrival-photo")}<figcaption>${escape(text(source.querySelector(".photo-caption")))}</figcaption></figure></div></li>${steps}</ol></section><details class="card parking-card" id="parking"><summary><div><h2 class="section-title"><span class="section-icon" aria-hidden="true">P</span>Parking</h2><p class="section-description">Street parking and a garage option nearby.</p></div><span class="chevron" aria-hidden="true">⌄</span></summary><div class="parking-body">${image(".parking-content img", "map-image")}<div><h3>${escape(text(parking.querySelector("h2")))}</h3><p>${escape(text(parking.querySelector("p")))}</p><ul>${parkingItems}</ul></div></div></details></main><div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>`;
    window.ApartmentWifi.mount(guide);
    document.title = "Apartment · Guest guide";
    if (!shareToken) installShare();
    document.getElementById("address-title").focus({ preventScroll: true });
    document.getElementById("parking-link").addEventListener("click", () => {
      document.getElementById("parking").open = true;
    });
    if (shareToken) {
      document.querySelectorAll('.jump-links a').forEach(link => {
        link.href = `#share=${encodeURIComponent(shareToken)}&section=${link.hash.slice(1)}`;
      });
    }
    const currentSection = () => shareToken ? '#' + (new URLSearchParams(location.hash.slice(1)).get('section') || '') : location.hash;
    const restoreSection = () => {
      const hash = currentSection();
      document.querySelectorAll('.jump-links a').forEach(link => {
        const target = shareToken ? '#' + new URLSearchParams(link.hash.slice(1)).get('section') : link.hash;
        if (target === (hash || '#arrival')) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      if (hash === '#parking') document.getElementById('parking').open = true;
      if (['#wifi', '#arrival', '#parking'].includes(hash)) document.querySelector(hash)?.scrollIntoView();
    };
    window.addEventListener('hashchange', restoreSection);
    restoreSection();
    if (currentSection() === "#parking")
      document.getElementById("parking").open = true;
    const section = ["#wifi", "#arrival", "#parking"].includes(currentSection())
      ? document.querySelector(currentSection())
      : null;
    section?.scrollIntoView();
    document
      .querySelectorAll("[data-copy]")
      .forEach((control) =>
        control.addEventListener("click", () => copy(control)),
      );
  }

  function installShare() {
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'guide-action share-trigger';
    trigger.setAttribute('aria-label', 'Share guide for 24 hours'); trigger.title = 'Share a link that lasts 24 hours';
    trigger.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg><span>Share guide</span>';
    const footer = document.createElement('footer'); footer.className = 'guest-footer';
    footer.append(trigger); document.querySelector('main.page').append(footer);
    const dialog = document.createElement('dialog');
    dialog.className = 'share-dialog';
    dialog.innerHTML = `<h2>Share apartment guide</h2><p>Anyone with this link can open the arrival details and Wi-Fi without a password for 24 hours.</p><button type="button" class="button primary" id="create-share">Create 24-hour link</button><p role="status" id="share-status"></p><label for="share-url">Your share link</label><input id="share-url" readonly hidden><button type="button" class="button" id="copy-share" hidden>Copy link</button><button type="button" class="button" id="close-share">Close</button>`;
    document.body.append(dialog);
    trigger.onclick = () => dialog.showModal();
    const close = () => { dialog.close(); trigger.focus(); };
    dialog.querySelector('#close-share').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    let backdrop = false;
    dialog.addEventListener('pointerdown', event => { backdrop = event.target === dialog; });
    dialog.addEventListener('click', event => { if (backdrop && event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } backdrop = false; });
    const create = dialog.querySelector('#create-share'), status = dialog.querySelector('#share-status'), field = dialog.querySelector('#share-url'), copyButton = dialog.querySelector('#copy-share');
    create.onclick = async () => {
      create.disabled = true; status.textContent = 'Creating link…';
      try {
        const response = await fetch(shareApi, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key: sharingKey})});
        if (!response.ok) throw Error();
        const data = await response.json();
        field.value = `${location.origin}/apartment/#share=${data.token}`;
        field.hidden = copyButton.hidden = false;
        status.textContent = `Expires ${new Date(data.expiresAt).toLocaleString()}`;
      } catch { status.textContent = 'Couldn’t create a link. Please try again.'; }
      finally { create.disabled = false; }
    };
    copyButton.onclick = async () => {
      try { await navigator.clipboard.writeText(field.value); status.textContent = 'Link copied. It expires 24 hours after creation.'; }
      catch { field.focus(); field.select(); status.textContent = 'Select and copy the link above.'; }
    };
  }

  async function openShared() {
    button.disabled = true; error.textContent = 'Opening shared guide…';
    try {
      const started = performance.now();
      const response = await fetch(shareApi, {cache: 'no-store', headers: {'X-Apartment-Share-Token': shareToken}});
      if (!response.ok) throw Error();
      const data = await response.json();
      const remaining = data.expiresAt - data.serverNow;
      if (!Number.isFinite(remaining) || remaining <= 0) throw Error();
      if (!data.guide?.main || performance.now() - started >= remaining) throw Error();
      renderGuide(data.guide);
      setTimeout(() => location.reload(), remaining - (performance.now() - started));
    } catch {
      error.textContent = 'This share link has expired or couldn’t load. Ask for a new link, or enter the guest password.';
      button.disabled = false;
    }
  }
  if (shareToken) {
    void openShared();
    window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  }

  async function copy(control) {
    const value = control.dataset.copy;
    const label = control.dataset.label;
    const normalLabel = control.querySelector("span").textContent;
    const toast = document.querySelector(".toast");
    try {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const field = document.createElement("textarea");
        field.value = value;
        field.setAttribute("aria-label", `Copy ${label}`);
        field.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.append(field);
        let copied;
        try {
          field.select();
          copied = document.execCommand("copy");
        } finally {
          field.remove();
          control.focus({ preventScroll: true });
        }
        if (!copied) throw new Error("Clipboard unavailable");
      }
      control.querySelector("span").textContent = "Copied";
      toast.textContent = `${label} copied`;
      setTimeout(() => {
        control.querySelector("span").textContent = normalLabel;
      }, 2000);
    } catch {
      toast.textContent =
        "Copy isn’t available. Select and copy the text above.";
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.textContent = "";
    }, 4000);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "Opening…";
    error.textContent = "";
    password.removeAttribute("aria-invalid");
    try {
      if (!globalThis.crypto?.subtle) throw new Error("secure-context");
      let payload;
      try {
        const response = await fetch("/apartment/guide.json", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("unavailable");
        payload = await response.json();
      } catch {
        throw new Error("load");
      }
      let guide;
      try {
        guide = await decrypt(payload, password.value);
      } catch {
        throw new Error("password");
      }
      renderGuide(guide);
      password.value = "";
    } catch (cause) {
      error.textContent =
        cause.message === "load"
          ? "The guide couldn’t load. Check your connection and try again."
          : cause.message === "secure-context"
            ? "Open this page using HTTPS to unlock the guide."
            : cause.message === "password"
              ? "That password didn’t work. Please try again."
              : "The guide couldn’t open. Please try again.";
      button.disabled = false;
      button.innerHTML = 'Open guest guide <span aria-hidden="true">↗</span>';
      if (cause.message === "password") {
        password.setAttribute("aria-invalid", "true");
        password.focus();
        password.select();
      }
    }
  });
})();
