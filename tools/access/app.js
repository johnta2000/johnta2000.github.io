(() => {
  'use strict';
  const API = 'https://rapid-shark-565.convex.cloud';
  const $ = id => document.getElementById(id);
  const scopes = { owner: 'Only you', allowlist: 'Tool guest list', membership: 'Invited members', share: 'Shared by link', password: 'Shared password', device: 'Approved device', public: 'Public / legacy' };
  const accountScopes = new Set(['owner', 'allowlist', 'membership']);
  let session = null, sessionId, epoch = 0, requestId = 0, mounted = false, snapshot = null, scope = 'all', controller;

  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function badge(text, kind) { return node('span', text, 'badge ' + kind); }
  function clearPrivate() {
    ++requestId;
    controller?.abort();
    snapshot = null;
    $('overview').hidden = true;
    $('tools').replaceChildren(); $('findings').replaceChildren();
    for (const id of ['updated', 'limitations', 'result-count', 'connection']) $(id).textContent = '';
    for (const id of ['tool-count', 'private-count', 'shared-count', 'attention-count']) $(id).textContent = '—';
    $('search').value = '';
    $('empty').hidden = true;
    $('refresh').disabled = false;
    scope = 'all';
    document.querySelectorAll('[data-scope]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scope === scope)));
  }
  async function tokenFor(currentSession) {
    const token = await currentSession.getToken();
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.aud === 'convex' || Array.isArray(payload.aud) && payload.aud.includes('convex')) return token;
    } catch { /* Fall back to the existing Convex token template. */ }
    return currentSession.getToken({ template: 'convex' });
  }
  function withTimeout(promise) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Timed out')), 20000); })]).finally(() => clearTimeout(timer));
  }
  function renderTool(tool) {
    const details = node('details', undefined, 'tool');
    details.id = 'tool-' + tool.id;
    const summary = node('summary');
    const title = node('span', undefined, 'tool-title');
    title.append(node('span', '›', 'chevron'), node('span', tool.name));
    const audience = node('span', tool.audience.length ? tool.audience.join(' · ') : 'No approved accounts configured', 'audience');
    const scopeCell = node('span', undefined, 'scope-cell');
    scopeCell.append(badge(scopes[tool.scope] || 'Review scope', tool.scope));
    if (tool.attention || tool.configured === false) scopeCell.append(badge(tool.configured === false ? 'Not configured' : 'Review', 'review'));
    summary.append(title, audience, scopeCell);
    const body = node('div', undefined, 'tool-body');
    const powers = node('dl', undefined, 'powers');
    for (const [label, value] of [['Can read', tool.read], ['Can edit', tool.edit], ['Can manage', tool.manage]]) {
      const part = node('div'); part.append(node('dt', label), node('dd', value)); powers.append(part);
    }
    body.append(powers, node('p', tool.boundary, 'boundary'));
    if (tool.configured === false) body.append(node('p', 'Required access settings are missing. The intended access guard denies access until configured.', 'link-count'));
    if (typeof tool.linkCount === 'number') body.append(node('p', `${tool.linkCountCapped ? 'At least ' : ''}${tool.linkCount} enabled statement review ${tool.linkCount === 1 ? 'link' : 'links'}${tool.linkCountCapped ? ' in the first 501 records' : ''}.`, 'link-count'));
    const footer = node('div', undefined, 'tool-footer');
    footer.append(node('span', tool.evidence + ' · ' + tool.source));
    if (typeof tool.href === 'string' && /^\/(?!\/)/.test(tool.href)) {
      const link = node('a', 'Open ' + tool.name + ' ↗'); link.href = tool.href; footer.append(link);
    }
    body.append(footer); details.append(summary, body);
    return details;
  }
  function renderFiltered() {
    if (!snapshot) return;
    const search = $('search').value.trim().toLowerCase();
    const visible = snapshot.tools.filter(tool => {
      const inScope = scope === 'all' || scope === 'account' && accountScopes.has(tool.scope) || scope === 'shared' && !accountScopes.has(tool.scope) || scope === 'attention' && (tool.attention || tool.configured === false || snapshot.findings.some(f => f.affects.includes(tool.id)));
      const text = [tool.name, ...tool.audience, tool.read, tool.edit, tool.manage, tool.boundary, scopes[tool.scope], tool.source].join(' ').toLowerCase();
      return inScope && (!search || text.includes(search));
    });
    const open = new Set([...$('tools').querySelectorAll('details[open]')].map(detail => detail.id));
    $('tools').replaceChildren(...visible.map(tool => { const detail = renderTool(tool); detail.open = open.has(detail.id); return detail; }));
    $('result-count').textContent = `${visible.length} of ${snapshot.tools.length} areas`;
    $('empty').hidden = visible.length > 0;
  }
  function render(data) {
    snapshot = data;
    $('tool-count').textContent = String(data.tools.length);
    $('private-count').textContent = String(data.tools.filter(tool => accountScopes.has(tool.scope)).length);
    $('shared-count').textContent = String(data.tools.filter(tool => ['public', 'share', 'password'].includes(tool.scope)).length);
    $('attention-count').textContent = String(data.findings.length);
    const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(data.loadedAt));
    $('updated').textContent = 'Settings snapshot ' + date + ' PT · Policies reviewed ' + data.policyReviewedAt;
    $('limitations').textContent = data.limitations;
    $('findings').replaceChildren(...data.findings.map(finding => {
      const card = node('article', undefined, 'finding ' + finding.severity);
      const heading = node('div', undefined, 'finding-heading');
      heading.append(badge(finding.severity === 'high' ? 'Priority' : 'Review', 'review'), node('h3', finding.title));
      card.append(heading, node('p', finding.detail), node('p', 'Next: ' + finding.next, 'next'), node('p', finding.evidence, 'evidence'));
      return card;
    }));
    renderFiltered();
    $('overview').hidden = false;
    $('gate').hidden = true;
    $('retry-auth').hidden = true;
    if (mounted) { window.Clerk.unmountSignIn($('sign-in')); mounted = false; }
  }
  async function loadOverview() {
    if (!session) return;
    const currentEpoch = epoch, currentSession = session;
    clearPrivate();
    const currentRequest = ++requestId;
    controller = new AbortController();
    const signal = controller.signal;
    $('gate').hidden = false;
    $('gate-message').textContent = 'Checking owner access…';
    $('retry-auth').hidden = true;
    $('refresh').disabled = true;
    try {
      const token = await withTimeout(tokenFor(currentSession));
      if (currentEpoch !== epoch || currentRequest !== requestId) return;
      if (!token) throw Error('Missing token');
      const response = await fetch(API + '/api/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ path: 'accessOverview:overview', args: {}, format: 'json' }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), cache: 'no-store',
      });
      const result = await response.json();
      if (currentEpoch !== epoch || currentRequest !== requestId) return;
      if (result.status === 'error' && /not authorized to view site access/.test(result.errorMessage || '')) {
        $('gate-message').textContent = 'This overview is available only to the site owner. Sign in with your approved owner account.';
        return;
      }
      if (!response.ok || result.status !== 'success' || !Array.isArray(result.value?.tools) || !Array.isArray(result.value?.findings)) throw Error('Unavailable');
      render(result.value);
    } catch {
      if (currentEpoch !== epoch || currentRequest !== requestId) return;
      $('gate-message').textContent = 'Couldn’t load the access overview. Check your connection and try again.';
      $('retry-auth').hidden = false;
    } finally { if (currentEpoch === epoch && currentRequest === requestId) $('refresh').disabled = false; }
  }
  function sessionChanged({ session: nextSession }) {
    if (nextSession === undefined) return;
    const nextId = nextSession?.id || null;
    if (nextId === sessionId) return;
    sessionId = nextId;
    session = nextSession || null;
    ++epoch;
    clearPrivate();
    $('gate').hidden = false;
    $('sign-out').hidden = !session;
    $('retry-auth').hidden = true;
    if (session) { void loadOverview(); return; }
    $('gate-message').textContent = 'Sign in to see your private access overview.';
    if (!mounted) {
      const returnUrl = location.origin + location.pathname;
      window.Clerk.mountSignIn($('sign-in'), { routing: 'hash', withSignUp: false, forceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl });
      mounted = true;
    }
  }
  function waitForScripts() {
    return withTimeout(new Promise((resolve, reject) => {
      if (window.Clerk && window.__internal_ClerkUICtor) { resolve(); return; }
      const scripts = [...document.querySelectorAll('[data-clerk-script]')];
      const ready = () => { if (window.Clerk && window.__internal_ClerkUICtor) { cleanup(); resolve(); } };
      const failed = () => { cleanup(); reject(Error('Sign-in unavailable')); };
      function cleanup() { scripts.forEach(script => { script.removeEventListener('load', ready); script.removeEventListener('error', failed); }); }
      scripts.forEach(script => { script.addEventListener('load', ready); script.addEventListener('error', failed); });
      ready();
    }));
  }
  $('search').addEventListener('input', renderFiltered);
  document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => {
    scope = button.dataset.scope;
    document.querySelectorAll('[data-scope]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderFiltered();
  }));
  $('refresh').addEventListener('click', () => void loadOverview());
  $('retry-auth').addEventListener('click', () => session ? void loadOverview() : location.reload());
  $('sign-out').addEventListener('click', async () => {
    ++epoch; clearPrivate(); $('gate').hidden = false; $('gate-message').textContent = 'Signing out…';
    try { await window.Clerk.signOut(); location.replace(location.pathname); }
    catch { $('gate-message').textContent = 'Sign-out failed. Please try again.'; }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { ++epoch; clearPrivate(); location.reload(); } });
  async function start() {
    try {
      await waitForScripts();
      await withTimeout(window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } }));
      sessionChanged({ session: window.Clerk.session });
      window.Clerk.addListener(sessionChanged);
    } catch (error) {
      clearPrivate();
      const local = /Production Keys are only allowed/i.test(error?.message || '');
      $('gate-message').textContent = local ? 'Sign-in is available on john-ta.com. This local preview cannot load private access settings.' : 'Sign-in couldn’t load. Check your connection and try again.';
      $('retry-auth').hidden = local;
    }
  }
  void start();
})();
