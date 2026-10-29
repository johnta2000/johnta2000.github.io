(() => {
  'use strict';
  const ENDPOINT = 'https://rapid-shark-565.convex.cloud';
  const $ = id => document.getElementById(id);
  let session = null, sessionId, epoch = 0, mounted = false, ready = false, saving = false, paused = false, conflict = false;
  let pending = new Map(), versions = new Map();
  const message = (id, text) => { $(id).textContent = text; };
  function clearPrivate() {
    ready = false; saving = false; paused = false; conflict = false; pending = new Map(); versions = new Map();
    window.MissionApp.lock(); $('app').hidden = true; $('save-actions').hidden = true; $('storage-error').hidden = true;
    $('app').inert = false; $('refresh').disabled = false;
    message('storage-error', ''); message('save-status', '');
  }
  async function tokenFor(activeSession) {
    const token = await activeSession.getToken();
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.aud === 'convex' || (Array.isArray(payload.aud) && payload.aud.includes('convex'))) return token;
    } catch { /* The site's named token template is supported too. */ }
    try { return await activeSession.getToken({ template: 'convex' }); } catch { return token; }
  }
  async function call(kind, name, args, activeSession) {
    const token = await tokenFor(activeSession);
    if (!token) throw Error('Sign in again to continue.');
    const response = await fetch(`${ENDPOINT}/api/${kind}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: `andrew:${name}`, args }), signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') throw Error(result.errorMessage || 'The project workspace could not be reached.');
    return result.value;
  }
  function denied(error) { return /not authorized|unauthenticated|sign in again|not authenticated/i.test(error.message); }
  function showDenied() {
    clearPrivate(); $('gate').hidden = false; $('sign-in').hidden = true; $('retry-auth').hidden = true;
    message('gate-message', 'This account doesn’t have access to Andrew Mission Control. Switch to an approved team account.');
  }
  function enqueue(kind, key, value) {
    if (!ready || !session) throw Error('Sign in before saving.');
    const id = `${kind}:${key}`; pending.set(id, { kind, key, value });
    message('save-status', paused ? 'Unsaved changes' : 'Saving…');
    if (!paused) void flush();
  }
  async function flush() {
    if (saving || !ready || !session || paused || !pending.size) return;
    const generation = epoch, activeSession = session;
    saving = true; $('save-actions').hidden = true; $('storage-error').hidden = true;
    try {
      while (pending.size && generation === epoch) {
        const [id, record] = pending.entries().next().value;
        pending.delete(id);
        try {
          const result = await call('mutation', 'save', { key: record.key, value: record.value, expectedVersion: versions.get(id) || 0 }, activeSession);
          if (generation !== epoch) return;
          versions.set(id, result.version);
        } catch (error) {
          if (generation !== epoch) return;
          if (denied(error)) { ++epoch; showDenied(); return; }
          if (!pending.has(id)) pending.set(id, record);
          paused = true; conflict = /changed since you opened/i.test(error.message);
          message('storage-error', conflict
            ? 'A teammate changed this record. Download your unsaved work, then load the latest workspace to review their changes. Your edits have not overwritten theirs.'
            : `Your changes could not be saved. Keep this page open and retry. ${error.message.replace(/\[Request ID:[^\]]*\]/g, '').slice(0, 350)}`);
          $('storage-error').hidden = false; $('save-actions').hidden = false; $('retry-save').hidden = conflict;
          message('save-status', 'Unsaved changes'); return;
        }
      }
      if (generation === epoch) message('save-status', 'All changes saved');
    } finally { if (generation === epoch) saving = false; }
  }
  function applyWorkspace(workspace) {
    versions = new Map(workspace.records.map(record => [`record:${record.key}`, record.version]));
    ready = true; paused = false; conflict = false; pending.clear();
    window.MissionApp.open({ workspace, onSave: enqueue });
    $('gate').hidden = true; $('app').hidden = false; $('save-actions').hidden = true; $('storage-error').hidden = true;
    message('save-status', 'All changes saved');
  }
  async function refresh() {
    if (!session || saving) return;
    if ((pending.size || window.MissionApp.hasDraft()) && !window.confirm('Load the latest workspace and discard your unsaved changes? Download unsaved work first if you need to keep it.')) return;
    const generation = ++epoch, activeSession = session;
    ready = false; $('app').inert = true; $('refresh').disabled = true; message('save-status', 'Refreshing…');
    try {
      const workspace = await call('query', 'workspace', {}, activeSession);
      if (generation === epoch) applyWorkspace(workspace);
    } catch (error) {
      if (generation !== epoch) return;
      if (denied(error)) showDenied();
      else { ready = true; message('save-status', pending.size ? 'Unsaved changes' : 'Refresh failed'); message('storage-error', 'The latest workspace couldn’t load. Check your connection and try again.'); $('storage-error').hidden = false; }
    } finally { if (generation === epoch) { $('refresh').disabled = false; $('app').inert = false; } }
  }
  async function sessionChanged(state) {
    if (state.session === undefined) return;
    const id = state.session?.id || null;
    if (id === sessionId) return;
    sessionId = id; session = state.session || null;
    const generation = ++epoch; clearPrivate(); $('gate').hidden = false; $('sign-out').hidden = !session; $('retry-auth').hidden = true;
    if (!session) {
      message('gate-message', 'Sign in with your approved team email to open the shared project workspace.'); $('sign-in').hidden = false;
      if (!mounted) {
        const returnUrl = location.origin + location.pathname + location.search;
        window.Clerk.mountSignIn($('sign-in'), {
          routing: 'hash', withSignUp: true, forceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl,
          appearance: { variables: { colorPrimary: '#285b43', colorBackground: '#ffffff', colorText: '#24332e', borderRadius: '9px', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }, elements: { cardBox: { boxShadow: 'none', maxWidth: '100%' } } },
        }); mounted = true;
      }
      return;
    }
    if (mounted) { window.Clerk.unmountSignIn($('sign-in')); mounted = false; }
    $('sign-in').hidden = true; message('gate-message', 'Opening your project workspace…');
    try {
      const workspace = await call('query', 'workspace', {}, session);
      if (generation !== epoch) return;
      applyWorkspace(workspace);
    } catch (error) {
      if (generation !== epoch) return;
      if (denied(error)) { showDenied(); return; }
      clearPrivate(); message('gate-message', 'The project workspace couldn’t load. Check your connection and try again.'); $('retry-auth').hidden = false;
    }
  }
  $('retry-save').addEventListener('click', () => { if (conflict) return; paused = false; message('save-status', 'Saving…'); void flush(); });
  $('download-draft').addEventListener('click', () => {
    const data = window.MissionApp.exportData(); if (!ready || !data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'nextcard-project-unsaved.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('refresh').addEventListener('click', () => { void refresh(); }); $('load-latest').addEventListener('click', () => { void refresh(); });
  $('retry-auth').addEventListener('click', () => { if (!window.Clerk?.session) { location.reload(); return; } sessionId = undefined; void sessionChanged({ session: window.Clerk.session }); });
  $('sign-out').addEventListener('click', async () => {
    if ((saving || pending.size || window.MissionApp.hasDraft()) && !window.confirm('Some changes have not been saved. Sign out and discard those changes?')) return;
    ++epoch; session = null; sessionId = undefined; clearPrivate(); $('gate').hidden = false; message('gate-message', 'Signing out…');
    try { await window.Clerk.signOut(); await sessionChanged({ session: null }); }
    catch { message('gate-message', 'Sign-out failed. Try again.'); }
  });
  window.addEventListener('beforeunload', event => { if (saving || pending.size || window.MissionApp.hasDraft()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('online', () => { if (paused && pending.size && !conflict) { paused = false; void flush(); } });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  function waitForClerk() {
    return new Promise((resolve, reject) => {
      const scripts = [...document.querySelectorAll('[data-clerk-script]')]; const timer = setTimeout(failed, 20000);
      function cleanup() { clearTimeout(timer); scripts.forEach(script => { script.removeEventListener('load', check); script.removeEventListener('error', failed); }); }
      function check() { if (window.Clerk && window.__internal_ClerkUICtor) { cleanup(); resolve(); } }
      function failed() { cleanup(); reject(Error('Sign-in scripts could not load.')); }
      scripts.forEach(script => { script.addEventListener('load', check); script.addEventListener('error', failed); }); check();
    });
  }
  async function start() {
    clearPrivate();
    try {
      await waitForClerk(); await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      window.Clerk.addListener(state => { void sessionChanged(state); }); await sessionChanged({ session: window.Clerk.session || null });
    } catch (error) {
      clearPrivate(); message('gate-message', /Production Keys are only allowed/i.test(error.message) ? 'Open Mission Control on john-ta.com to sign in. Production sign-in is unavailable in this local preview.' : 'Sign-in couldn’t load. Check your connection and try again.'); $('retry-auth').hidden = false;
    }
  }
  void start();
})();
