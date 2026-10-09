(() => {
  'use strict';
  const ENDPOINT = 'https://rapid-shark-565.convex.cloud';
  const $ = id => document.getElementById(id);
  let session, sessionId, mounted = false;
  let epoch = 0, version = 0, ready = false;
  let queued = null, saving = false, paused = false, lastDraft = null;

  function message(id, text) { $(id).textContent = text; }
  function clearPrivate() {
    ready = false; queued = null; saving = false; paused = false; lastDraft = null;
    window.PackingApp.lock();
    $('app').hidden = true; $('add-trip').hidden = true;
    $('save-actions').hidden = true;
    message('save-status', '');
  }

  async function tokenFor(activeSession) {
    const token = await activeSession.getToken();
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.aud === 'convex' || (Array.isArray(payload.aud) && payload.aud.includes('convex'))) return token;
    } catch { /* Fall back to the site's named token template. */ }
    try { return await activeSession.getToken({ template: 'convex' }); } catch { return token; }
  }

  async function call(kind, name, args, activeSession) {
    const token = await tokenFor(activeSession);
    if (!token) throw Error('Sign in again to continue.');
    const response = await fetch(`${ENDPOINT}/api/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: `packing:${name}`, args }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') throw Error(result.errorMessage || 'The checklist service could not be reached.');
    return result.value;
  }

  function enqueue(state) {
    if (!ready || !session) throw Error('Sign in before saving.');
    queued = state; lastDraft = state;
    message('save-status', paused ? 'Changes have not been saved.' : 'Saving…');
    if (!paused) void flush();
  }

  async function flush() {
    if (saving || !ready || !session || !queued) return;
    const generation = epoch, activeSession = session;
    saving = true; paused = false;
    $('save-actions').hidden = true; $('storage-error').hidden = true;
    try {
      while (queued && generation === epoch) {
        const state = queued; queued = null;
        try {
          const result = await call('mutation', 'save', { state, expectedVersion: version }, activeSession);
          if (generation !== epoch) return;
          version = result.version;
        } catch (error) {
          if (generation !== epoch) return;
          queued ||= state;
          lastDraft = queued;
          paused = true;
          message('storage-error', /changed on another device/i.test(error.message)
            ? 'Your checklist changed on another device. Download your unsaved list, then reload to review the saved version.'
            : 'Your changes could not be saved. Keep this page open and retry when your connection is back.');
          $('storage-error').hidden = false; $('save-actions').hidden = false;
          $('retry-save').hidden = /changed on another device/i.test(error.message);
          message('save-status', 'Changes have not been saved.');
          return;
        }
      }
      if (generation === epoch) {
        lastDraft = null;
        message('save-status', 'All changes saved. Available on your other devices.');
      }
    } finally { if (generation === epoch) saving = false; }
  }

  async function sessionChanged(state) {
    if (state.session === undefined) return;
    const id = state.session?.id || null;
    if (id === sessionId) return;
    sessionId = id; session = state.session || null;
    const generation = ++epoch;
    clearPrivate();
    $('gate').hidden = false; $('sign-out').hidden = !session; $('retry-auth').hidden = true;
    if (!session) {
      message('gate-message', 'Sign in with your John Ta account to open your packing lists.');
      $('sign-in').hidden = false;
      if (!mounted) {
        const returnUrl = location.origin + location.pathname;
        window.Clerk.mountSignIn($('sign-in'), {
          routing: 'hash', withSignUp: false, forceRedirectUrl: returnUrl,
          appearance: {
            variables: { colorPrimary: '#365d48', colorBackground: '#ffffff', colorText: '#29372e', borderRadius: '9px', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' },
            elements: { cardBox: { boxShadow: 'none', maxWidth: '100%' } },
          },
        });
        mounted = true;
      }
      return;
    }
    if (mounted) { window.Clerk.unmountSignIn($('sign-in')); mounted = false; }
    $('sign-in').hidden = true;
    message('gate-message', 'Opening your packing lists…');
    try {
      const result = await call('query', 'read', {}, session);
      if (generation !== epoch) return;
      version = result.version; ready = true;
      message('save-status', 'All changes saved. Available on your other devices.');
      window.PackingApp.open({ state: result.state, saveState: enqueue });
      $('gate').hidden = true; $('app').hidden = false; $('add-trip').hidden = false;
    } catch (error) {
      if (generation !== epoch) return;
      clearPrivate();
      message('gate-message', /not authorized/i.test(error.message)
        ? 'This account doesn’t have access. Only John Ta can open Packing for now.'
        : 'Your packing lists couldn’t load. Check your connection and try again.');
      $('retry-auth').hidden = false;
    }
  }

  $('retry-save').addEventListener('click', () => { paused = false; message('save-status', 'Saving…'); void flush(); });
  $('download-draft').addEventListener('click', () => {
    if (!ready || !lastDraft) return;
    const blob = new Blob([JSON.stringify(lastDraft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'packing-unsaved.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('retry-auth').addEventListener('click', () => {
    if (!window.Clerk?.session) { location.reload(); return; }
    sessionId = undefined;
    void sessionChanged({ session: window.Clerk.session });
  });
  $('sign-out').addEventListener('click', async () => {
    if ((saving || queued) && !window.confirm('Some changes have not been saved. Sign out and discard those unsaved changes?')) return;
    ++epoch; session = null; sessionId = undefined;
    clearPrivate(); $('gate').hidden = false;
    message('gate-message', 'Signing out…');
    try { await window.Clerk.signOut(); await sessionChanged({ session: null }); }
    catch { message('gate-message', 'Sign-out failed. Try again.'); }
  });
  window.addEventListener('beforeunload', event => { if (saving || queued) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('online', () => { if (paused && queued && !$('retry-save').hidden) { paused = false; void flush(); } });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

  function waitForClerk() {
    return new Promise((resolve, reject) => {
      const scripts = [...document.querySelectorAll('[data-clerk-script]')];
      const timer = setTimeout(failed, 20000);
      function cleanup() { clearTimeout(timer); scripts.forEach(script => { script.removeEventListener('load', check); script.removeEventListener('error', failed); }); }
      function check() { if (window.Clerk && window.__internal_ClerkUICtor) { cleanup(); resolve(); } }
      function failed() { cleanup(); reject(Error('Sign-in scripts could not load.')); }
      scripts.forEach(script => { script.addEventListener('load', check); script.addEventListener('error', failed); });
      check();
    });
  }
  async function start() {
    clearPrivate();
    try {
      await waitForClerk();
      await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      window.Clerk.addListener(state => { void sessionChanged(state); });
      await sessionChanged({ session: window.Clerk.session || null });
    } catch (error) {
      clearPrivate();
      message('gate-message', /Production Keys are only allowed/i.test(error.message)
        ? 'Open Packing on john-ta.com to sign in. Production sign-in is unavailable in this local preview.'
        : 'Sign-in couldn’t load. Check your connection and try again.');
      $('retry-auth').hidden = false;
    }
  }
  void start();
})();
