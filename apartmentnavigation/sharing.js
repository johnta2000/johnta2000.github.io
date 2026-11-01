(() => {
  'use strict';
  const API = 'https://rapid-shark-565.convex.site/apartment-share';
  const token = new URLSearchParams(location.hash.slice(1)).get('share');
  const $ = id => document.getElementById(id);
  let expiresAt = 0, deadline = 0, creation, preparing;
  const unavailable = message => {
    document.body.innerHTML = '<main class="share-unavailable"><h1>Shared apartment guide</h1><p role="status"></p><a href="/apartmentnavigation/">Open with guest password</a></main>';
    document.querySelector('[role="status"]').textContent = message || 'This share link has expired. Ask for a new link.';
  };
  const overdue = () => deadline && (performance.now() >= deadline || Date.now() >= expiresAt);
  function mount() {
    if (token) return;
    const trigger = document.createElement('button');
    trigger.id = 'apartment-share'; trigger.type = 'button'; trigger.textContent = 'Share';
    document.body.prepend(trigger);
    const notice = document.createElement('p'); notice.id = 'share-feedback'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
    trigger.after(notice);
    const dialog = document.createElement('dialog'); dialog.id = 'apartment-share-dialog';
    dialog.setAttribute('aria-labelledby', 'apartment-share-title');
    dialog.innerHTML = '<h2 id="apartment-share-title">Share apartment guide</h2><p>Anyone with this link can open the guide without a password for 24 hours.</p><p id="share-status" role="status" aria-live="polite"></p><div id="share-result" hidden><label for="share-url">Your share link</label><input id="share-url" readonly><button id="copy-share" type="button">Copy link</button></div><button id="retry-share" type="button" hidden>Try again</button><button id="close-share" type="button">Close</button>';
    document.body.append(dialog);
    const restoreHash = () => {
      if (new URLSearchParams(location.hash.slice(1)).get('view') === 'share') { if (!dialog.open) dialog.showModal(); }
      else if (dialog.open) dialog.close();
    };
    const openDialog = () => {
      const state = new URLSearchParams(location.hash.slice(1));
      if (state.get('view') !== 'share') { state.set('view', 'share'); history.pushState(null, '', location.pathname + location.search + '#' + state); }
      restoreHash();
    };
    const close = () => {
      const state = new URLSearchParams(location.hash.slice(1)); state.delete('view');
      history.pushState(null, '', location.pathname + location.search + (state.size ? '#' + state : ''));
      dialog.close(); trigger.focus();
    };
    window.addEventListener('popstate', restoreHash); window.addEventListener('hashchange', restoreHash);
    $('close-share').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    let outside = false;
    const isOutside = event => { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
    dialog.addEventListener('pointerdown', event => { outside = event.target === dialog && isOutside(event); });
    dialog.addEventListener('click', event => { if (outside && event.target === dialog && isOutside(event)) close(); outside = false; });
    const renderCreation = () => {
      if (!creation) return;
      $('share-result').hidden = false;
      $('share-url').value = `${location.origin}/apartmentnavigation/#share=${creation.token}`;
      $('share-status').textContent = `Expires ${new Date(creation.expiresAt).toLocaleString()}`;
    };
    const prepare = () => {
      if (creation && creation.expiresAt > Date.now() + 60000) return Promise.resolve(creation);
      if (preparing) return preparing;
      $('retry-share').hidden = true;
      $('share-status').textContent = 'Preparing your 24-hour link…';
      preparing = (async () => {
        const key = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', window.ApartmentOwnerKey))));
        const response = await fetch(API, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key})});
        if (!response.ok) throw Error();
        creation = await response.json(); renderCreation(); return creation;
      })().catch(error => {
        $('share-status').textContent = 'Couldn’t create a link. Please try again.'; $('retry-share').hidden = false; throw error;
      }).finally(() => { preparing = null; });
      return preparing;
    };
    const deliver = async (link, nativeAllowed) => {
      const url = `${location.origin}/apartmentnavigation/#share=${link.token}`;
      // Invoke the native share sheet directly during the click's user activation.
      if (nativeAllowed && navigator.share) {
        try { await navigator.share({title: 'Apartment guide', url}); notice.textContent = `Shared · expires ${new Date(link.expiresAt).toLocaleString()}`; return; }
        catch (error) { if (error.name === 'AbortError') return; }
      }
      try {
        await navigator.clipboard.writeText(url);
        notice.textContent = `Link copied · expires ${new Date(link.expiresAt).toLocaleString()}`;
        $('share-status').textContent = notice.textContent;
      } catch { openDialog(); renderCreation(); $('share-url').focus(); $('share-url').select(); }
    };
    trigger.onclick = () => {
      if (creation && creation.expiresAt > Date.now() + 60000) { void deliver(creation, true); return; }
      // The first click still starts sharing if preparation has not finished.
      openDialog();
      void prepare().then(link => deliver(link, false)).catch(() => {});
    };
    $('retry-share').onclick = () => { void prepare().then(link => deliver(link, false)).catch(() => {}); };
    $('copy-share').onclick = () => { if (creation) void deliver(creation, false); };
    restoreHash();
    // Prepare once after unlock; no database request is needed for the usual Share click.
    void prepare().catch(() => {});
  }
  window.ApartmentSharing = {mount};
  if (!token) return;
  const openShared = async () => {
    unavailable('Opening shared guide…');
    const started = performance.now();
    try {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('expired');
      const response = await fetch(API + '?v=2', {cache: 'no-store', headers: {'X-Apartment-Share-Token': token}});
      if (!response.ok) throw Error(response.status === 404 ? 'expired' : 'network');
      const data = await response.json();
      const end = Number(response.headers.get('X-Apartment-Share-Expires'));
      const now = Number(response.headers.get('X-Apartment-Share-Now'));
      // Subtract the entire request time conservatively; never extend server expiry.
      const remaining = end - now - (performance.now() - started);
      if (!Number.isFinite(remaining) || remaining <= 0) throw Error('expired');
      expiresAt = Date.now() + remaining; deadline = performance.now() + remaining;
      const guide = data.guide;
      const style = document.createElement('style'); style.textContent = guide.style; document.head.append(style);
      document.body.removeAttribute('style'); document.body.innerHTML = guide.main;
      const banner = document.createElement('p'); banner.className = 'share-expiry'; banner.textContent = `Shared guide · expires ${new Date(end).toLocaleString()}`; document.body.prepend(banner);
      setTimeout(() => unavailable(), Math.max(0, deadline - performance.now()));
    } catch (error) { unavailable(error.message === 'expired' ? undefined : 'Couldn’t open this shared guide. Refresh to try again, or ask for a new link.'); }
  };
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && overdue()) unavailable(); });
  void openShared();
})();
