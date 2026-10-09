(() => {
  const endpoints = {
    rally: 'https://dashing-heron-837.convex.cloud',
    tools: 'https://rapid-shark-565.convex.cloud',
  };
  const el = Object.fromEntries(['title', 'intro', 'status', 'sign-in', 'retry', 'directory', 'apps', 'empty', 'account', 'email', 'sign-out'].map(id => [id, document.getElementById(id)]));
  let activeSession;
  let revision = 0;
  let mounted = false;

  function status(message) {
    el.status.textContent = message;
    el.status.hidden = !message;
  }

  function resetDirectory() {
    el.directory.hidden = true;
    el.apps.replaceChildren();
    el.empty.hidden = true;
    el.account.hidden = true;
    el.email.textContent = '';
    el.retry.hidden = true;
  }

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

  async function query(endpoint, path, token) {
    const response = await fetch(endpoint + '/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ path, args: {} }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (result.status === 'error' && /not authorized|verified email|not been invited/i.test(result.errorMessage || '')) return null;
    if (!response.ok || result.status !== 'success') throw new Error('Access check unavailable.');
    return result.value;
  }

  function addApp(name, href, description) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.textContent = name;
    link.href = href;
    const detail = document.createElement('span');
    detail.textContent = description;
    item.append(link, detail);
    el.apps.append(item);
  }

  async function showApps(session, user, currentRevision) {
    resetDirectory();
    el['sign-in'].hidden = true;
    if (mounted) { window.Clerk.unmountSignIn(el['sign-in']); mounted = false; }
    el.title.textContent = 'Your apps';
    el.intro.textContent = 'Apps and tools linked to your account.';
    el.account.hidden = false;
    el.email.textContent = user?.primaryEmailAddress?.emailAddress || '';
    status('Checking access…');
    try {
      const token = await withTimeout(tokenFor(session));
      if (!token) throw new Error('No session token.');
      // Each app's existing Convex function decides access; no client-side email allowlist.
      const results = await Promise.allSettled([
        query(endpoints.rally, 'rally:listEvents', token),
        query(endpoints.tools, 'standups:verify', token),
        query(endpoints.tools, 'sleep:verify', token),
        query(endpoints.tools, 'monitoring:verify', token),
        query(endpoints.tools, 'cardPayments:verify', token),
        query(endpoints.tools, 'rent:verify', token),
        query(endpoints.tools, 'paymentQuestions:verify', token),
      ]);
      if (currentRevision !== revision) return;
      let incomplete = results.some(result => result.status === 'rejected');
      const values = results.map(result => result.status === 'fulfilled' ? result.value : null);
      if (values[0] !== null && !Array.isArray(values[0])) incomplete = true;
      if (Array.isArray(values[0]) && values[0].length) {
        addApp('Rally', '../tools/rally/?event=' + encodeURIComponent(values[0][0].id), 'Trips and festivals with your crew.');
      }
      if (values[1]) addApp('Standups', '../tools/standups/', 'Team updates.');
      if (values[2]) addApp('Sleep', '../tools/sleep/', 'Your sleep dashboard.');
      if (values[3]) addApp('Monitoring', '../tools/monitoring/', 'Your monitors and updates.');
      if (values[4]) {
        addApp('Card payments', '../tools/payments/', 'Your monthly payment checklist.');
        // The statement library uses the same server authorization as Payments.
        addApp('Statement splits', '../tools/payments/statements/', 'Review and split charges with your parents.');
      }
      if (values[6]) addApp('Payment questions', '../tools/payment/questions/', 'Notes and screenshots for charges and reimbursements.');
      if (values[5]) {
        addApp('Rent', '../tools/rent/', 'Monthly rent splits and shared payment history.');
        addApp('PG&E bills', '../tools/rent/#rent-records', 'Shared utility bills and payment records.');
      }
      el.directory.hidden = false;
      el.empty.hidden = el.apps.children.length > 0 || incomplete;
      status(incomplete ? 'Some apps could not be checked. Try again to load the rest.' : '');
      el.retry.hidden = !incomplete;
    } catch {
      if (currentRevision !== revision) return;
      status('We couldn’t check your apps. Check your connection and try again.');
      el.retry.hidden = false;
    }
  }

  function sessionChanged({ session, user }) {
    if (session === undefined) return;
    const id = session?.id || null;
    if (id === activeSession) return;
    activeSession = id;
    const currentRevision = ++revision;
    resetDirectory();
    if (session) { void showApps(session, user, currentRevision); return; }
    el.title.textContent = 'Log in';
    el.intro.textContent = 'Sign in to access your apps.';
    status('');
    el['sign-in'].hidden = false;
    if (!mounted) {
      const returnUrl = location.origin + location.pathname;
      window.Clerk.mountSignIn(el['sign-in'], {
        routing: 'hash', withSignUp: true,
        forceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl,
        appearance: {
          variables: {
            colorPrimary: '#242424', colorBackground: '#ffffff', colorText: '#242424',
            borderRadius: '4px', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
          },
          elements: {
            cardBox: { boxShadow: 'none', border: '1px solid #ededed' },
            card: { boxShadow: 'none' },
            headerTitle: { fontSize: '18px', fontWeight: '500' },
            formButtonPrimary: { backgroundImage: 'none', boxShadow: 'none', textTransform: 'none' },
            footer: { background: '#ffffff', backgroundImage: 'none' },
          },
        },
      });
      mounted = true;
    }
  }

  el.retry.addEventListener('click', () => {
    if (!window.Clerk?.session) { location.reload(); return; }
    void showApps(window.Clerk.session, window.Clerk.user, ++revision);
  });
  el['sign-out'].addEventListener('click', async () => {
    ++revision;
    resetDirectory();
    status('Signing out…');
    try { await window.Clerk.signOut(); location.replace(location.pathname); }
    catch { status('Sign-out failed. Please try again.'); el.account.hidden = false; }
  });
  // Recheck restored pages instead of leaving an old account's directory on screen.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

  async function start() {
    try {
      await waitForScripts();
      await withTimeout(window.Clerk.load({
        ui: { ClerkUI: window.__internal_ClerkUICtor },
        localization: { signIn: { start: {
          title: 'Continue with email', titleCombined: 'Continue with email',
          subtitle: '', subtitleCombined: '',
        } } },
      }));
      sessionChanged({ session: window.Clerk.session, user: window.Clerk.user });
      window.Clerk.addListener(sessionChanged);
    } catch (error) {
      console.error('Login initialization failed:', error?.message || 'Unknown error');
      resetDirectory();
      const localPreview = /Production Keys are only allowed/i.test(error?.message || '');
      status(localPreview
        ? 'Sign-in needs to run on john-ta.com. It isn’t available in this local preview.'
        : 'Sign-in couldn’t load. Check your connection and try again.');
      el.retry.hidden = localPreview;
    }
  }
  void start();
})();
