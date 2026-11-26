'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const endpoint = 'https://brilliant-ibex-653.convex.cloud/api/query';
  let sessionId, generation = 0, mounted = false, snapshot = null, searchStarted = false;

  function waitForScripts() {
    return new Promise((resolve, reject) => {
      const scripts = [...document.querySelectorAll('[data-clerk-script]')];
      const ready = () => {
        if (!window.Clerk || !window.__internal_ClerkUICtor) return;
        cleanup();
        resolve();
      };
      const failed = () => { cleanup(); reject(new Error('Sign-in could not load.')); };
      const timeout = setTimeout(failed, 20000);
      function cleanup() {
        clearTimeout(timeout);
        scripts.forEach(script => { script.removeEventListener('load', ready); script.removeEventListener('error', failed); });
      }
      scripts.forEach(script => { script.addEventListener('load', ready); script.addEventListener('error', failed); });
      ready();
    });
  }

  async function withTimeout(promise) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Request timed out.')), 20000); })]);
    } finally { clearTimeout(timer); }
  }

  async function tokenFor(session) {
    const token = await session.getToken();
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.aud === 'convex' || (Array.isArray(payload.aud) && payload.aud.includes('convex'))) return token;
    } catch { /* Existing apps also support a named Convex token template. */ }
    try { return await session.getToken({ template: 'convex' }); } catch { return token; }
  }

  function reset(message) {
    ++generation;
    snapshot = null;
    $('inventory').hidden = true;
    $('rows').replaceChildren();
    $('active').textContent = 'Active';
    $('paused').textContent = 'Paused';
    $('updated').textContent = $('empty').textContent = $('search').value = '';
    $('gate').hidden = false;
    $('message').textContent = message;
    $('retry').hidden = true;
  }

  function route() {
    const url = new URL(location.href);
    return { status: url.searchParams.get('status') === 'paused' ? 'paused' : 'active',
      search: new URLSearchParams(url.hash.slice(1)).get('q') || '' };
  }
  function urlFor(status, search) {
    const url = new URL(location.pathname, location.origin);
    if (status === 'paused') url.searchParams.set('status', status);
    if (search) url.hash = new URLSearchParams({ q: search }).toString();
    return url;
  }
  function element(tag, value, className) {
    const el = document.createElement(tag);
    if (value) el.textContent = value;
    if (className) el.className = className;
    return el;
  }
  function jobRow(job) {
    const row = element('li'), details = element('div'), actions = element('div', '', 'actions');
    details.append(element('h2', job.name), element('p', job.schedule, 'schedule'));
    const manage = element('a', 'Manage in Codex ↗');
    manage.href = 'codex://automations/' + encodeURIComponent(job.id) + '?automationSource=local&edit=true';
    actions.append(manage);
    if (job.thread) {
      const chat = element('a', 'Open chat ↗');
      chat.href = 'codex://threads/' + encodeURIComponent(job.thread);
      actions.append(chat);
    }
    row.append(details, actions);
    return row;
  }
  function render() {
    if (!snapshot) return;
    const { status, search } = route();
    if ($('search').value !== search) $('search').value = search;
    for (const key of ['active', 'paused']) {
      const tab = $(key), count = snapshot.jobs.filter(job => job.status.toLowerCase() === key).length;
      tab.textContent = (key === 'active' ? 'Active' : 'Paused') + ' · ' + count;
      tab.href = urlFor(key, search);
      if (key === status) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    const matches = snapshot.jobs.filter(job => job.status.toLowerCase() === status &&
      (job.name + ' ' + job.schedule).toLowerCase().includes(search.trim().toLowerCase()));
    $('rows').replaceChildren(...matches.sort((a,b) => a.name.localeCompare(b.name)).map(jobRow));
    $('empty').hidden = matches.length > 0;
    $('empty').textContent = search ? 'No matching jobs.' : 'No ' + status + ' jobs.';
    const when = new Intl.DateTimeFormat('en-US', { timeZone:'America/Los_Angeles', month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
    $('updated').textContent = snapshot.checkedAt ? 'Mac last synced ' + when.format(snapshot.checkedAt) + ' PT' : 'Waiting for the first Mac sync.';
    $('gate').hidden = true;
    $('inventory').hidden = false;
  }

  async function load() {
    const session = window.Clerk.session;
    if (!session || session.id !== sessionId) return;
    reset('Checking owner access…');
    const current = generation;
    const valid = () => current === generation && window.Clerk.session?.id === session.id;
    try {
      const token = await withTimeout(tokenFor(session));
      if (!valid()) return;
      if (!token) throw Error();
      const response = await fetch(endpoint, { method:'POST', cache:'no-store', referrerPolicy:'no-referrer',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token },
        body:JSON.stringify({ path:'jobs:list', args:{}, format:'json' }), signal:AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!valid()) return;
      if (result.errorData === 'Owner access required') {
        $('message').textContent = 'This account does not have access. Sign in with your owner account.';
        return;
      }
      if (!response.ok || result.status !== 'success') throw Error();
      snapshot = result.value ?? { jobs:[], checkedAt:0 };
      render();
    } catch {
      if (!valid()) return;
      reset('Couldn’t load your jobs. Check your connection and try again.');
      $('retry').hidden = false;
    }
  }
  function sessionChanged({ session }) {
    if (session === undefined || sessionId === (session?.id ?? null)) return;
    sessionId = session?.id ?? null;
    reset('Sign in with your owner account to view recurring jobs.');
    $('signout').hidden = !session;
    if (session) {
      if (mounted) { window.Clerk.unmountSignIn($('signin')); mounted = false; }
      void load();
    } else if (!mounted) {
      window.Clerk.mountSignIn($('signin'), { routing:'virtual', withSignUp:false, forceRedirectUrl:location.href, signUpForceRedirectUrl:location.href });
      mounted = true;
    }
  }
  for (const id of ['active','paused']) $(id).addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (route().status !== id) history.pushState(null,'',$(id).href);
    searchStarted = false;
    render();
  });
  $('search').addEventListener('input', () => {
    const url = urlFor(route().status, $('search').value);
    history[searchStarted ? 'replaceState' : 'pushState'](null, '', url);
    searchStarted = true;
    render();
  });
  $('search').addEventListener('blur', () => { searchStarted = false; });
  window.addEventListener('popstate', () => { searchStarted = false; render(); });
  window.addEventListener('hashchange', render);
  $('refresh').addEventListener('click', load);
  $('retry').addEventListener('click', () => sessionId ? load() : location.reload());
  $('signout').addEventListener('click', async () => {
    reset('Signing out…');
    try { await window.Clerk.signOut({ redirectUrl:location.href }); }
    catch { $('message').textContent = 'Sign-out failed. Try signing out again.'; }
  });
  window.addEventListener('pagehide', () => reset('Checking access…'));
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  async function start() {
    try {
      await waitForScripts();
      await withTimeout(window.Clerk.load({ ui:{ ClerkUI:window.__internal_ClerkUICtor } }));
      sessionChanged({ session:window.Clerk.session });
      window.Clerk.addListener(sessionChanged);
    } catch {
      reset('Sign-in could not load. Please try again.');
      $('retry').hidden = false;
    }
  }
  void start();
})();
