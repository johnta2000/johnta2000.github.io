(() => {
  'use strict';
  const ENDPOINT = 'https://rapid-shark-565.convex.cloud';
  const RECOVERY_KEY = 'andrew-unsaved-v1', CHECK_INTERVAL = 60000;
  const $ = id => document.getElementById(id);
  let session = null, sessionId, epoch = 0, mounted = false, ready = false, saving = false, paused = false, conflict = false;
  let pending = new Map(), versions = new Map(), owner = '', checking = null, lastVerified = 0, mode = 'loading', backup = null;
  const message = (id, text) => { $(id).textContent = text; };
  const active = s => !!s && (!s.status || s.status === 'active');
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  try { backup = JSON.parse(sessionStorage.getItem(RECOVERY_KEY) || 'null'); } catch {}
  if (backup?.format !== 1) backup = null;
  function hasRecovery() { return !!backup && !!(backup.records?.length || backup.cells?.length || backup.form); }
  function forgetRecovery() { backup = null; try { sessionStorage.removeItem(RECOVERY_KEY); } catch {} }
  function checkpoint() {
    if (!ready || !owner) return;
    const data = window.MissionApp.exportData();
    backup = { format: 1, owner, records: [...pending.values()].map(r => ({...r, expectedVersion: versions.get(`record:${r.key}`) || 0})),
      cells: data.unsavedCells.map(c => ({...c, expectedVersion: versions.get(`record:${c.key}`) || 0})), form: data.formDraft ? {...data.formDraft, expectedVersion: versions.get(`record:${data.formDraft.record.key}`) || 0} : null };
    if (!hasRecovery()) { forgetRecovery(); return; }
    try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(backup)); $('recovery-warning').hidden = true; }
    catch { message('recovery-warning', 'This browser cannot keep a recovery copy. Keep this tab open until changes save, or download your unsaved work.'); $('recovery-warning').hidden = false; }
  }
  function status() {
    if (!ready) return;
    message('save-status', paused ? 'Unsaved changes' : saving || pending.size ? 'Saving…' : window.MissionApp.hasDraft() ? 'Editing — not saved yet' : 'All changes saved');
  }
  function banner(text, button = '') {
    message('session-message', text); $('session-notice').hidden = !text;
    $('session-retry').hidden = !button; $('session-retry').textContent = button;
    message('editor-session-message', text); $('editor-session-message').hidden = !text;
  }
  function editingLocked(value) { $('content').inert = value; $('editor-content').inert = value; }
  function clearPrivate() {
    ready = false; saving = false; paused = false; conflict = false; pending = new Map(); versions = new Map(); owner = ''; lastVerified = 0;
    window.MissionApp.lock(); $('app').hidden = true; $('save-actions').hidden = true; $('storage-error').hidden = true;
    $('app').inert = false; $('refresh').disabled = false; editingLocked(true);
    message('storage-error', ''); message('save-status', '');
  }
  function mountSignIn() {
    $('sign-in').hidden = false;
    if (mounted) return;
    const returnUrl = location.origin + location.pathname + location.search;
    window.Clerk.mountSignIn($('sign-in'), {
      routing: 'hash', withSignUp: true, forceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl,
      appearance: { variables: { colorPrimary: '#285b43', colorBackground: '#ffffff', colorText: '#24332e', borderRadius: '9px', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }, elements: { cardBox: { boxShadow: 'none', maxWidth: '100%' } } },
    }); mounted = true;
  }
  function suspend(reason = 'expired') {
    // A missing/rejected token does not prove that Clerk ended the login session.
    if (reason === 'expired' && active(window.Clerk?.session)) reason = 'unverified';
    checkpoint(); ++epoch; checking = null; clearPrivate(); mode = reason; $('sign-out').hidden = true;
    const action = reason === 'denied' ? 'Switch account' : reason === 'unverified' ? 'Retry sign-in check' : 'Sign in again';
    $('gate').hidden = false; $('retry-auth').hidden = false; $('retry-auth').textContent = action;
    const text = reason === 'denied' ? 'This account no longer has access. Editing is locked.' : reason === 'unverified' ? 'We could not verify your sign-in. Editing is locked and changes are not saving.' : 'You are signed out. Editing is locked and changes are not saving.';
    banner(text + (hasRecovery() ? ' Unsaved edits are held for recovery once the same account is verified.' : ''), action);
    message('gate-message', reason === 'unverified' ? 'Your existing login may still be valid. Retry the check to reconnect and recover your edits.' : hasRecovery() ? 'Sign in with the same approved account to recover the unsaved edits from this tab.' : 'Sign in with your approved team email to continue.');
    if (!active(window.Clerk?.session)) mountSignIn(); else $('sign-in').hidden = true;
  }
  function connectionLost() {
    checkpoint(); ++epoch; checking = null; clearPrivate(); mode = 'disconnected';
    $('gate').hidden = false; $('sign-in').hidden = true; $('retry-auth').hidden = false; $('retry-auth').textContent = 'Retry connection';
    banner('Cannot verify your sign-in. Editing is locked and changes are not saving. Reconnect and retry.', 'Retry connection');
    message('gate-message', hasRecovery() ? 'Your unsaved edits are kept in this tab for recovery once your account can be verified.' : 'Connect to the internet to verify your account before editing.');
  }
  function authError(error) { return error.status === 401 || /unauthenticated|sign in again|not authenticated|jwt|token.*(expired|invalid)|session.*(expired|ended|invalid|not active)/i.test(error.message); }
  function denied(error) { return error.status === 403 || /not authorized/i.test(error.message); }
  async function tokenFor(activeSession, fresh = false) {
    if (!active(activeSession)) throw Error('Sign in again to continue.');
    const options = fresh ? {skipCache: true} : undefined;
    const token = await activeSession.getToken(options);
    if (!token) throw Error('Sign in again to continue.');
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.aud === 'convex' || (Array.isArray(payload.aud) && payload.aud.includes('convex'))) return token;
    } catch {}
    const named = await activeSession.getToken({template: 'convex', ...(fresh ? {skipCache: true} : {})});
    if (!named) throw Error('Sign in again to continue.');
    return named;
  }
  async function call(kind, name, args, activeSession, fresh = false) {
    let timer;
    const token = await Promise.race([tokenFor(activeSession, fresh), new Promise((_, reject) => {timer = setTimeout(() => reject(Error('Sign-in verification timed out. Retry when connected.')), 20000);})]).finally(() => clearTimeout(timer));
    const response = await fetch(`${ENDPOINT}/api/${kind}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: `andrew:${name}`, args }), signal: AbortSignal.timeout(20000),
    });
    let result; try { result = await response.json(); } catch {}
    if (!response.ok || result?.status !== 'success') {
      const error = Error(result?.errorMessage || (response.status === 401 ? 'Sign in again to continue.' : 'The project workspace could not be reached.'));
      error.status = response.status; throw error;
    }
    return result.value;
  }
  function showSaveError(error) {
    paused = true; conflict = /changed since you opened/i.test(error.message);
    message('storage-error', conflict
      ? 'A teammate changed this record. Download your unsaved work, then load the latest workspace to review their changes. Your edits have not overwritten theirs.'
      : `Changes are NOT saved to the shared tracker. Retry when connected. ${error.message.replace(/\[Request ID:[^\]]*\]/g, '').slice(0, 350)}`);
    $('storage-error').hidden = false; $('save-actions').hidden = false; $('retry-save').hidden = conflict; status(); checkpoint();
  }
  function enqueue(kind, key, value) {
    if (!ready || !session) throw Error('Sign in before saving.');
    pending.set(`${kind}:${key}`, {kind, key, value}); checkpoint(); status();
    if (!active(window.Clerk?.session)) { suspend(); return; }
    if (!paused && !checking) void flush();
  }
  async function flush() {
    if (saving || !ready || !session || paused || checking || !pending.size) return;
    const generation = epoch, activeSession = session;
    saving = true; status(); $('save-actions').hidden = true; $('storage-error').hidden = true;
    try {
      while (pending.size && generation === epoch) {
        const [id, record] = pending.entries().next().value;
        try {
          const result = await call('mutation', 'save', {key: record.key, value: record.value, expectedVersion: versions.get(id) || 0}, activeSession);
          if (generation !== epoch) return;
          versions.set(id, result.version);
          if (pending.get(id) === record) pending.delete(id);
          checkpoint();
        } catch (error) {
          if (generation !== epoch) return;
          if (authError(error) || denied(error)) { suspend(denied(error) ? 'denied' : 'expired'); return; }
          showSaveError(error); return;
        }
      }
    } finally { if (generation === epoch) { saving = false; status(); checkpoint(); } }
  }
  function applyWorkspace(workspace, recover = true) {
    const saved = recover && backup?.owner === workspace.user.email ? backup : null;
    // A different signed-in account must never receive the previous account's draft.
    if (backup && backup.owner !== workspace.user.email) forgetRecovery();
    versions = new Map(workspace.records.map(record => [`record:${record.key}`, record.version]));
    ready = true; owner = workspace.user.email; paused = false; conflict = false; pending.clear();
    const merged = structuredClone(workspace);
    let recoveryConflict = false; const acknowledged = new Map();
    for (const r of saved?.records || []) {
      const current = merged.records.find(x => x.key === r.key);
      if (current && same(current.value, r.value)) { acknowledged.set(r.key, current.version); continue; } // Acknowledgement may have been lost after a successful save.
      if ((current?.version || 0) !== r.expectedVersion) recoveryConflict = true;
      versions.set(`record:${r.key}`, r.expectedVersion);
      pending.set(`record:${r.key}`, {kind: 'record', key: r.key, value: r.value});
      if (current) current.value = r.value; else merged.records.push({key: r.key, value: r.value, version: 0});
    }
    for (const c of saved?.cells || []) {
      const current = workspace.records.find(x => x.key === c.key);
      const expectedVersion = acknowledged.get(c.key) ?? c.expectedVersion;
      if (!current || current.version !== expectedVersion) recoveryConflict = true;
      versions.set(`record:${c.key}`, expectedVersion);
    }
    if (saved?.form?.record) {
      const key = saved.form.record.key, current = workspace.records.find(x => x.key === key);
      if ((current?.version || 0) !== saved.form.expectedVersion) recoveryConflict = true;
      versions.set(`record:${key}`, saved.form.expectedVersion);
    }
    window.MissionApp.open({workspace: merged, onSave: enqueue});
    if (saved) window.MissionApp.restoreDrafts(saved);
    $('gate').hidden = true; $('app').hidden = false; $('save-actions').hidden = true; $('storage-error').hidden = true;
    mode = 'ready'; lastVerified = Date.now(); editingLocked(false); $('sign-out').hidden = false;
    banner(saved ? 'Your unsaved edits have been recovered. Completed cells will save automatically; unfinished cells are ready to continue editing.' : '');
    if (recoveryConflict) showSaveError(Error('This record changed since you opened it.'));
    checkpoint(); status(); if (!paused) void flush();
  }
  async function checkSession(force = false) {
    if (!ready || !session) return;
    if (checking) return checking;
    if (!force && Date.now() - lastVerified < CHECK_INTERVAL && active(window.Clerk?.session)) return;
    if (!active(window.Clerk?.session)) { suspend(); return; }
    const generation = epoch, activeSession = window.Clerk.session;
    session = activeSession; mode = 'checking'; editingLocked(true); banner('Checking your sign-in before editing…');
    checking = (async () => {
      try {
        const identity = await call('query', 'verify', {}, activeSession, true);
        if (generation !== epoch) return;
        if (identity.email !== owner) { suspend('denied'); return; }
        lastVerified = Date.now(); mode = 'ready'; editingLocked(false); banner('');
      } catch (error) {
        if (generation !== epoch) return;
        if (authError(error) || denied(error)) suspend(denied(error) ? 'denied' : 'expired');
        else connectionLost();
      } finally { if (generation === epoch) { checking = null; status(); if (mode === 'ready' && !paused) void flush(); } }
    })();
    return checking;
  }
  async function refresh() {
    if (!session || saving || checking || !ready) return;
    if ((pending.size || window.MissionApp.hasDraft()) && !window.confirm('Load the latest workspace and discard your unsaved changes? Download unsaved work first if you need to keep it.')) return;
    checkpoint(); const generation = ++epoch, activeSession = session;
    editingLocked(true); $('refresh').disabled = true; message('save-status', 'Refreshing…');
    try {
      const workspace = await call('query', 'workspace', {}, activeSession, true);
      if (generation === epoch) { forgetRecovery(); applyWorkspace(workspace, false); }
    } catch (error) {
      if (generation !== epoch) return;
      if (authError(error) || denied(error)) suspend(denied(error) ? 'denied' : 'expired');
      else connectionLost();
    } finally { if (generation === epoch) { $('refresh').disabled = false; status(); } }
  }
  async function sessionChanged(state) {
    if (state.session === undefined) return;
    const next = active(state.session) ? state.session : null, id = next?.id || null;
    if (id === sessionId) { session = next; return; }
    const hadWorkspace = ready || !!owner;
    checkpoint(); sessionId = id; session = next;
    if (!next && hadWorkspace) { suspend(); return; }
    const generation = ++epoch; checking = null; clearPrivate(); mode = 'loading';
    $('gate').hidden = false; $('sign-out').hidden = !session; $('retry-auth').hidden = true;
    if (!session) {
      mode = 'signedout'; banner('Signed out — sign in to edit or save.' + (hasRecovery() ? ' Unsaved edits from this tab will be recovered for the same account.' : ''));
      message('gate-message', 'Sign in with your approved team email to open the shared project workspace.'); mountSignIn(); return;
    }
    if (mounted) { window.Clerk.unmountSignIn($('sign-in')); mounted = false; }
    $('sign-in').hidden = true; message('gate-message', 'Opening your project workspace…');
    try {
      const workspace = await call('query', 'workspace', {}, session, true);
      if (generation === epoch) applyWorkspace(workspace);
    } catch (error) {
      if (generation !== epoch) return;
      if (authError(error) || denied(error)) { suspend(denied(error) ? 'denied' : 'expired'); return; }
      clearPrivate(); mode = 'disconnected'; message('gate-message', 'The project workspace couldn’t load. Check your connection and try again.'); $('retry-auth').hidden = false; $('retry-auth').textContent = 'Try again';
    }
  }
  async function retryAuth() {
    if (ready && mode === 'disconnected') { await checkSession(true); return; }
    if (mode === 'denied') {
      checkpoint(); // Explicit reauthentication keeps the recovery copy.
      try { await window.Clerk.signOut(); } catch { message('gate-message', 'Sign-in could not restart. Check your connection and try again.'); return; }
    }
    sessionId = undefined; await sessionChanged({session: window.Clerk?.session || null});
  }
  $('session-retry').addEventListener('click', retryAuth);
  $('retry-auth').addEventListener('click', retryAuth);
  $('retry-save').addEventListener('click', async () => { if (conflict) return; await checkSession(true); if (mode !== 'ready') return; paused = false; void flush(); });
  $('download-draft').addEventListener('click', () => {
    if (!ready) return;
    const data = window.MissionApp.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'nextcard-project-unsaved.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('refresh').addEventListener('click', () => { void refresh(); }); $('load-latest').addEventListener('click', () => { void refresh(); });
  $('sign-out').addEventListener('click', async () => {
    if ((saving || pending.size || window.MissionApp.hasDraft() || hasRecovery()) && !window.confirm('Some changes have not been saved. Sign out and discard those changes?')) return;
    ++epoch; checking = null; session = null; sessionId = undefined; clearPrivate(); forgetRecovery(); banner(''); $('gate').hidden = false; message('gate-message', 'Signing out…');
    try { await window.Clerk.signOut(); await sessionChanged({session: null}); }
    catch { message('gate-message', 'Sign-out failed. Try again.'); }
  });
  // Persist after the app handles the event, including changes that have not yet blurred.
  for (const name of ['input', 'change', 'focusout', 'click', 'keydown']) document.addEventListener(name, () => { checkpoint(); status(); });
  function guardEdit(event) {
    if (!event.target.closest?.('#content,#editor-content,.search-select-panel') || !ready) return;
    if (mode !== 'ready' || !active(window.Clerk?.session) || Date.now() - lastVerified >= CHECK_INTERVAL) {
      event.preventDefault(); event.stopImmediatePropagation(); void checkSession(mode !== 'ready');
    }
  }
  for (const name of ['pointerdown', 'keydown', 'beforeinput']) document.addEventListener(name, guardEdit, true);
  window.addEventListener('beforeunload', event => { checkpoint(); if (saving || pending.size || window.MissionApp.hasDraft() || hasRecovery()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('online', () => { if(mode === 'disconnected' && !ready){void retryAuth();return;} void checkSession(true).then(() => { if (mode === 'ready' && paused && !conflict) { paused = false; void flush(); } }); });
  window.addEventListener('focus', () => { void checkSession(true); });
  document.addEventListener('visibilitychange', () => { checkpoint(); if (document.visibilityState === 'visible') void checkSession(true); });
  window.addEventListener('pageshow', event => { if (event.persisted) void checkSession(true); });
  setInterval(() => { if (document.visibilityState === 'visible') void checkSession(); }, CHECK_INTERVAL);
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
      await waitForClerk(); await window.Clerk.load({ui: {ClerkUI: window.__internal_ClerkUICtor}});
      window.Clerk.addListener(state => { void sessionChanged(state); }); await sessionChanged({session: window.Clerk.session || null});
    } catch (error) {
      clearPrivate(); message('gate-message', 'Sign-in couldn’t load. Check your connection and try again.'); $('retry-auth').hidden = false;
    }
  }
  void start();
})();
