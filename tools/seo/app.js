(() => {
  'use strict';
  const ENDPOINT = 'https://rapid-shark-565.convex.cloud/api/query';
  const $ = id => document.getElementById(id);
  let session = null, identity, epoch = 0, request = 0, mounted = false, loading = false;

  function clearPrivate() {
    ++request;
    loading = false;
    $('seo-root').replaceChildren();
    $('seo-root').removeAttribute('aria-busy');
    $('app').hidden = true;
    $('report-status').hidden = true;
    $('access-gate').hidden = false;
    $('refresh-report').disabled = false;
    $('refresh-report').textContent = 'Refresh report';
  }

  async function tokenFor(activeSession) {
    const token = await activeSession.getToken();
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.aud === 'convex' || (Array.isArray(payload.aud) && payload.aud.includes('convex'))) return token;
    } catch { /* Use the site's named Convex token template. */ }
    try { return await activeSession.getToken({template:'convex'}); } catch { return token; }
  }

  async function readReport(activeSession) {
    const token = await tokenFor(activeSession);
    if (!token) throw Error('Not authenticated.');
    const response = await fetch(ENDPOINT, {
      method:'POST', cache:'no-store', signal:AbortSignal.timeout(20000),
      headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store',Authorization:`Bearer ${token}`},
      body:JSON.stringify({path:'monitoring:detail',args:{monitorId:'seo-content-opportunities'}}),
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
      const error = Error(result.errorMessage || 'Report could not load.');
      error.authFailure = response.status === 401 || response.status === 403;
      throw error;
    }
    if (!result.value?.monitor) throw Error('Report response was incomplete.');
    return result.value.monitor;
  }

  async function loadReport() {
    if (!session || loading) return;
    const generation = epoch, activeSession = session, thisRequest = ++request;
    loading = true;
    const hadReport = !$('app').hidden;
    $('refresh-report').disabled = true;
    $('refresh-report').textContent = 'Refreshing…';
    $('seo-root').setAttribute('aria-busy','true');
    $('retry-auth').hidden = true;
    $('auth-status').textContent = 'Opening your SEO workspace…';
    try {
      const monitor = await readReport(activeSession);
      if (generation !== epoch || thisRequest !== request || window.Clerk.session?.id !== activeSession.id) return;
      if (monitor?.details?.opportunities) {
        $('seo-root').innerHTML = window.SeoOpportunities.markup(monitor,{standalone:true});
        window.SeoOpportunities.mount($('seo-root'));
      } else {
        $('seo-root').innerHTML = '<section class="seo-empty-report"><h1>No SEO report yet</h1><p>Your workspace is ready. The first saved report will appear here when it is published.</p></section>';
      }
      $('access-gate').hidden = true;
      $('app').hidden = false;
      $('report-status').hidden = true;
    } catch (error) {
      if (generation !== epoch || thisRequest !== request) return;
      const authFailure = error.authFailure || /not authorized|not authenticated|verified email|jwt|token|auth provider/i.test(error.message);
      if (hadReport && !authFailure) {
        $('report-status').textContent = 'Refresh failed. Showing the previously loaded report. Try Refresh report again.';
        $('report-status').hidden = false;
      } else {
        clearPrivate();
        $('auth-status').textContent = /not authorized/i.test(error.message)
          ? 'This account is not approved for the SEO workspace. Use the account you use for Monitoring.'
          : authFailure ? 'Your access could not be verified. Sign in again or retry.'
          : 'The saved report could not be loaded. Check your connection and try again.';
        $('retry-auth').hidden = false;
      }
    } finally {
      if (generation === epoch && thisRequest === request) {
        loading = false;
        $('seo-root').removeAttribute('aria-busy');
        $('refresh-report').disabled = false;
        $('refresh-report').textContent = 'Refresh report';
      }
    }
  }

  async function sessionChanged(state) {
    if (state.session === undefined) return;
    const activeSession = state.session || null;
    const nextIdentity = activeSession ? activeSession.id + ':' + (state.user?.id ?? window.Clerk.user?.id ?? '') : null;
    if (nextIdentity === identity) return;
    identity = nextIdentity;
    session = activeSession;
    ++epoch;
    clearPrivate();
    $('auth-sign-out').hidden = !session;
    $('retry-auth').hidden = true;
    if (!session) {
      $('auth-status').textContent = 'Use your approved account to continue.';
      $('clerk-sign-in').hidden = false;
      if (!mounted) {
        window.Clerk.mountSignIn($('clerk-sign-in'), {
          routing:'hash',withSignUp:false,forceRedirectUrl:location.origin + location.pathname,
          appearance:{variables:{colorPrimary:'#355adb',borderRadius:'8px',fontFamily:'Inter, ui-sans-serif, system-ui, sans-serif'}},
        });
        mounted = true;
      }
      return;
    }
    if (mounted) { window.Clerk.unmountSignIn($('clerk-sign-in')); mounted = false; }
    $('clerk-sign-in').hidden = true;
    await loadReport();
  }

  async function signOut() {
    ++epoch;
    session = null;
    identity = undefined;
    clearPrivate();
    $('auth-status').textContent = 'Signing out…';
    try { await window.Clerk.signOut(); await sessionChanged({session:null}); }
    catch { $('auth-status').textContent = 'Sign-out failed. Try Use a different account again.'; }
  }

  $('refresh-report').addEventListener('click',loadReport);
  $('sign-out').addEventListener('click',signOut);
  $('auth-sign-out').addEventListener('click',signOut);
  $('retry-auth').addEventListener('click',() => {
    if (!window.Clerk?.session) { location.reload(); return; }
    identity = undefined;
    void sessionChanged({session:window.Clerk.session});
  });
  window.addEventListener('pagehide',() => { ++epoch; clearPrivate(); });
  window.addEventListener('pageshow',event => { if (event.persisted) location.reload(); });

  async function start() {
    try {
      if (!window.Clerk) throw Error('Sign-in unavailable.');
      await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
      window.Clerk.addListener(state => { void sessionChanged(state); });
      await sessionChanged({session:window.Clerk.session || null});
    } catch {
      clearPrivate();
      $('auth-status').textContent = 'Sign-in could not load. Check your connection and try again.';
      $('retry-auth').hidden = false;
    }
  }
  void start();
})();
