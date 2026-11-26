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
    $('count').textContent = '';
    $('updated').textContent = $('empty').textContent = $('search').value = '';
    $('gate').hidden = false;
    $('message').textContent = message;
    $('retry').hidden = true;
  }

  function route() {
    const url = new URL(location.href);
    const sort = /^(name|status|frequency|time)-(asc|desc)$/.exec(url.searchParams.get('sort'));
    const status = url.searchParams.get('status');
    return {
      // Explicit status links from the former two-tab layout remain usable.
      status: ['paused', 'active'].includes(status) ? status : '',
      column: sort?.[1] || 'status', direction: sort?.[2] || 'asc',
      search: new URLSearchParams(url.hash.slice(1)).get('q') || ''
    };
  }
  function urlFor({ status, column, direction, search }) {
    const url = new URL(location.pathname, location.origin);
    if (status) url.searchParams.set('status', status);
    if (column !== 'status' || direction !== 'asc') url.searchParams.set('sort', column + '-' + direction);
    if (search) url.hash = new URLSearchParams({ q: search }).toString();
    return url;
  }
  function element(tag, value, className) {
    const el = document.createElement(tag);
    if (value) el.textContent = value;
    if (className) el.className = className;
    return el;
  }
  const collator = new Intl.Collator('en', { numeric:true, sensitivity:'base' });
  function tableJob(job) {
    const [cadence, ...details] = job.schedule.split(' · ');
    const clock = details.find(part => /^\d{1,2}:\d{2} [AP]M.* PT$/.test(part));
    const times = Array.from((clock || '').matchAll(/(\d+):(\d+) (AM|PM)/g),
      ([,hour,minute,period]) => (+hour % 12 + (period === 'PM' ? 12 : 0)) * 60 + Number(minute));
    return { ...job, statusText:job.status === 'ACTIVE' ? 'Active' : 'Inactive',
      cadence, details:details.filter(part => part !== clock), timeText:clock?.slice(0, -3) || '—',
      firstTime:times.length ? Math.min(...times) : null };
  }
  function compareJobs(a, b, {column, direction}) {
    let order;
    if (column === 'time') {
      // Interval-only jobs have no clock time and belong at the end in either direction.
      if ((a.firstTime === null) !== (b.firstTime === null)) return a.firstTime === null ? 1 : -1;
      order = (a.firstTime ?? 0) - (b.firstTime ?? 0);
    } else {
      const field = { status:'statusText', name:'name', frequency:'cadence' }[column];
      order = collator.compare(a[field], b[field]);
    }
    return (direction === 'desc' ? -order : order) || collator.compare(a.name, b.name) || collator.compare(a.id, b.id);
  }
  function jobRow(job) {
    const row = element('tr');
    const name = element('th', job.name, 'job-name');
    name.scope = 'row';
    const status = element('td', '', 'status');
    status.append(element('span', job.statusText, job.status === 'ACTIVE' ? 'active' : 'inactive'));
    const frequency = element('td', '', 'frequency');
    frequency.append(element('span', job.cadence));
    for (const detail of job.details) frequency.append(element('small', detail));
    const time = element('td', job.timeText, 'time');
    if (job.firstTime === null) time.setAttribute('aria-label', 'No fixed time listed');
    const links = element('td', '', 'link-cell');
    const actions = element('div', '', 'actions');
    const manage = element('a', 'Manage ↗');
    manage.href = 'codex://automations/' + encodeURIComponent(job.id) + '?automationSource=local&edit=true';
    manage.setAttribute('aria-label', 'Manage ' + job.name + ' in Codex');
    actions.append(manage);
    if (job.thread) {
      const chat = element('a', 'Open chat ↗');
      chat.href = 'codex://threads/' + encodeURIComponent(job.thread);
      chat.setAttribute('aria-label', 'Open chat for ' + job.name);
      actions.append(chat);
    }
    links.append(actions);
    row.append(name, status, frequency, time, links);
    return row;
  }
  function render() {
    if (!snapshot) return;
    const state = route();
    const { status, search, column, direction } = state;
    for (const link of document.querySelectorAll('[data-sort]')) {
      const current = link.dataset.sort === column;
      const next = current && direction === 'asc' ? 'desc' : 'asc';
      link.href = urlFor({ ...state, column:link.dataset.sort, direction:next });
      if (current) link.parentElement.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
      else link.parentElement.removeAttribute('aria-sort');
      link.querySelector('span').textContent = current ? (direction === 'asc' ? '↑' : '↓') : '↕';
    }
    $('show-all').hidden = !status;
    $('show-all').href = urlFor({ ...state, status:'' });
    if ($('search').value !== search) $('search').value = search;
    const query = search.trim().toLowerCase();
    const matches = snapshot.jobs.map(tableJob).filter(job => {
      if (status && job.status.toLowerCase() !== status) return false;
      if (query === 'active' || query === 'inactive') return job.statusText.toLowerCase() === query;
      return [job.name, job.schedule, job.statusText, job.status].join(' ').toLowerCase().includes(query);
    });
    matches.sort((a, b) => compareJobs(a, b, state));
    $('rows').replaceChildren(...matches.map(jobRow));
    const total = snapshot.jobs.length;
    $('count').textContent = (status || query ? matches.length + ' of ' + total : total) + (total === 1 ? ' job' : ' jobs');
    $('empty').hidden = matches.length > 0;
    $('empty').textContent = query || status ? 'No matching jobs.' : 'No recurring jobs.';
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
  for (const link of document.querySelectorAll('[data-sort], #show-all')) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState(null, '', link.href);
      searchStarted = false;
      render();
    });
  }
  $('search').addEventListener('input', () => {
    const url = urlFor({ ...route(), search:$('search').value });
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
