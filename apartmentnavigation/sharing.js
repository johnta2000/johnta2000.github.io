(() => {
  'use strict';
  const API = 'https://rapid-shark-565.convex.site/apartment-share';
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('share');
  const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const $ = id => document.getElementById(id);
  let expiresAt = 0, deadline = 0, creation;
  const unavailable = message => {
    document.body.innerHTML = '<main class="share-unavailable"><h1>Shared apartment guide</h1><p role="status"></p><a href="/apartmentnavigation/">Open with guest password</a></main>';
    document.querySelector('[role="status"]').textContent = message || 'This share link has expired. Ask for a new link.';
  };
  const overdue = () => deadline && (performance.now() >= deadline || Date.now() >= expiresAt);
  function mount() {
    if (token) return;
    const trigger = document.createElement('button');
    trigger.id = 'apartment-share'; trigger.type = 'button'; trigger.textContent = 'Share · 24 hours';
    document.body.prepend(trigger);
    const dialog = document.createElement('dialog'); dialog.id = 'apartment-share-dialog';
    dialog.setAttribute('aria-labelledby', 'apartment-share-title');
    dialog.innerHTML = '<h2 id="apartment-share-title">Share apartment guide</h2><p>Anyone with this link can open the guide without a password for 24 hours.</p><button id="create-share" type="button">Create 24-hour link</button><p id="share-status" role="status" aria-live="polite"></p><div id="share-result" hidden><label for="share-url">Your share link</label><input id="share-url" readonly><button id="copy-share" type="button">Copy link</button></div><button id="close-share" type="button">Close</button>';
    document.body.append(dialog);
    const restoreHash = () => { const state = new URLSearchParams(location.hash.slice(1)); if (state.get('view') === 'share') { if (!dialog.open) dialog.showModal(); } else if (dialog.open) dialog.close(); };
    const close = () => { const state = new URLSearchParams(location.hash.slice(1)); state.delete('view'); history.pushState(null, '', location.pathname + location.search + (state.size ? '#' + state : '')); dialog.close(); trigger.focus(); };
    trigger.onclick = () => { const state = new URLSearchParams(location.hash.slice(1)); state.set('view', 'share'); history.pushState(null, '', location.pathname + location.search + '#' + state); restoreHash(); };
    window.addEventListener('popstate', restoreHash); window.addEventListener('hashchange', restoreHash);
    restoreHash();
    $('close-share').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    let outside = false;
    const isOutside = event => { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
    dialog.addEventListener('pointerdown', event => { outside = event.target === dialog && isOutside(event); });
    dialog.addEventListener('click', event => { if (outside && event.target === dialog && isOutside(event)) close(); outside = false; });
    const renderCreation = () => { if (!creation) return; $('share-result').hidden = false; $('share-url').value = `${location.origin}/apartmentnavigation/#share=${creation.token}`; $('share-status').textContent = `Expires ${new Date(creation.expiresAt).toLocaleString()}`; };
    renderCreation();
    $('create-share').onclick = async () => {
      const button = $('create-share'); button.disabled = true; $('share-status').textContent = 'Creating link…';
      try {
        const key = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', window.ApartmentOwnerKey))));
        const response = await fetch(API, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key})});
        if (!response.ok) throw Error();
        creation = await response.json(); renderCreation();
      } catch { $('share-status').textContent = 'Couldn’t create a link. Please try again.'; }
      finally { button.disabled = false; }
    };
    $('copy-share').onclick = async () => {
      try { await navigator.clipboard.writeText($('share-url').value); $('share-status').textContent = `Link copied. Expires ${new Date(creation.expiresAt).toLocaleString()}`; }
      catch { $('share-url').focus(); $('share-url').select(); $('share-status').textContent = 'Select and copy the link above.'; }
    };
  }
  window.ApartmentSharing = {mount};
  if (!token) return;
  const openShared = async () => {
    unavailable('Opening shared guide…');
    try {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('expired');
      const response = await fetch(API, {cache: 'no-store', headers: {'X-Apartment-Share-Token': token}});
      if (!response.ok) throw Error(response.status === 404 ? 'expired' : 'network');
      const data = await response.json();
      const remaining = data.expiresAt - data.serverNow;
      if (!Number.isFinite(remaining) || remaining <= 0) throw Error('expired');
      expiresAt = Date.now() + remaining; deadline = performance.now() + remaining;
      const guide = data.guide;
      if (overdue()) throw Error('expired');
      const style = document.createElement('style'); style.textContent = guide.style; document.head.append(style);
      document.body.removeAttribute('style'); document.body.innerHTML = guide.main;
      const banner = document.createElement('p'); banner.className = 'share-expiry'; banner.textContent = `Shared guide · expires ${new Date(data.expiresAt).toLocaleString()}`; document.body.prepend(banner);
      setTimeout(() => unavailable(), Math.max(0, deadline - performance.now()));
    } catch (error) { unavailable(error.message === 'expired' ? undefined : 'Couldn’t open this shared guide. Refresh to try again, or ask for a new link.'); }
  };
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && overdue()) unavailable(); });
  void openShared();
})();
