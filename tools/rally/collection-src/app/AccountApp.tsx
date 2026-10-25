import {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LoaderCircle, LockKeyhole} from 'lucide-react';
import Projects from './Projects';
import './projects.css';
import Journal, {type CollectionBackend, type RallyEvent} from './Journal';
import './globals.css';
import './spreadsheet.css';
import './theme.css';
import './rally.css';
import './usability.css';
import './timeline.css';
import './navigation.css';

const CONVEX_URL = 'https://dashing-heron-837.convex.cloud';
type Viewer = {name: string; subject: string; sessionId?: string};

// Bind requests to the account that opened the screen. A delayed click or token
// response must never save one person's draft into a newly selected account.
export async function accountCall(viewer: Viewer, kind: string, path: string, args: unknown = {}) {
  const clerk = (window as any).Clerk;
  const session = clerk?.session;
  const assertAccount = () => {
    if (!session || clerk.user?.id !== viewer.subject || clerk.session !== session ||
        (viewer.sessionId && session.id !== viewer.sessionId)) {
      throw new Error('Your account changed. Reopen the collection before saving.');
    }
  };
  assertAccount();
  let token = await session.getToken();
  let audience: unknown;
  try { audience = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aud; } catch {}
  if (audience !== 'convex' && !(Array.isArray(audience) && audience.includes('convex'))) {
    try { token = await session.getToken({template: 'convex'}); } catch {}
  }
  assertAccount();
  if (!token) throw new Error('Your sign-in expired. Sign in again to continue.');
  let res: Response;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    res = await fetch(`${CONVEX_URL}/api/${kind}`, {
      method: 'POST', signal: controller.signal, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
      body: JSON.stringify({path, args}),
    });
  } catch { throw new Error(controller.signal.aborted ? 'Rally took too long to respond. Please try again.' : 'Could not connect to Rally. Check your connection and try again.'); }
  finally { window.clearTimeout(timer); }
  assertAccount();
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.status !== 'success') {
    throw new Error(typeof body?.errorData === 'string' ? body.errorData : 'Rally could not complete that request. Please try again.');
  }
  return body.value;
}

function SignedInCollection({viewer, onSignOut}: {viewer: Viewer; onSignOut: () => Promise<void>}) {
  const [events, setEvents] = useState<RallyEvent[]>([]);
  const [eventsError, setEventsError] = useState('');
  const [eventsLoading, setEventsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const backend = useMemo<CollectionBackend>(() => ({
    list: () => accountCall(viewer, 'query', 'rallyCollection:list'),
    save: rave => accountCall(viewer, 'mutation', 'rallyCollection:save', {rave}),
    remove: id => accountCall(viewer, 'mutation', 'rallyCollection:remove', {id}),
    importEntries: raves => accountCall(viewer, 'mutation', 'rallyCollection:importEntries', {raves}),
    createPlan: (id,timeZone) => accountCall(viewer, 'mutation', 'rallyCollection:createPlan', {id,timeZone}),
    draftFromEvent: eventId => accountCall(viewer, 'query', 'rallyCollection:draftFromEvent', {eventId}),
  }), [viewer.subject, viewer.sessionId]);
  useEffect(() => {
    let active = true;
    setEventsLoading(true); setEventsError('');
    accountCall(viewer, 'query', 'rally:listEvents').then(list => {
      if (active) setEvents(list);
    }).catch(() => {
      if (active) setEventsError('Your plans could not be loaded. You can still add a rave by hand.');
    }).finally(() => { if (active) setEventsLoading(false); });
    return () => { active = false; };
  }, [viewer.subject, viewer.sessionId, attempt]);
  if (new URLSearchParams(location.search).get('view') === 'projects') return <Projects backend={backend} viewer={viewer} events={events} loading={eventsLoading} error={eventsError} onRetry={() => setAttempt(n => n + 1)}/>;
  return <Journal backend={backend} viewer={viewer} events={events} eventsError={eventsError}
    eventsLoading={eventsLoading} onRetryEvents={() => setAttempt(n => n + 1)} onSignOut={onSignOut}/>;
}

function AccountApp() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  useEffect(() => { document.title = (new URLSearchParams(location.search).get('view') === 'projects' ? 'My raves' : 'Rave diary') + ' · Rally'; }, []);
  const [status, setStatus] = useState<'loading' | 'signed-out' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [showSignIn, setShowSignIn] = useState(false);
  const signInRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    setStatus('loading'); setError('');
    (async () => {
      try {
        const clerk = (window as any).Clerk;
        if (!clerk) throw new Error('Rally sign-in did not load. Check your connection and retry.');
        await clerk.load({ui: {ClerkUI: (window as any).__internal_ClerkUICtor}});
        if (!active) return;
        const update = () => {
          if (!active) return;
          const user = clerk.user;
          setViewer(user && clerk.session ? {
            subject: user.id, sessionId: clerk.session.id,
            name: user.firstName || user.fullName || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'You',
          } : null);
          setStatus('signed-out');
          if (user) setShowSignIn(false);
        };
        stop = clerk.addListener(update);
        update();
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : 'Sign-in unavailable.'); setStatus('error'); }
      }
    })();
    return () => { active = false; stop?.(); };
  }, [attempt]);
  useEffect(() => {
    const node = signInRef.current;
    if (!showSignIn || !node || viewer) return;
    const clerk = (window as any).Clerk;
    try {
      clerk.mountSignIn(node, {routing: 'hash', withSignUp: true,
        forceRedirectUrl: location.href.split('#')[0], signUpForceRedirectUrl: location.href.split('#')[0],
        appearance: {variables: {colorPrimary: '#6d28d9'}}});
    } catch { setError('Sign-in could not open. Try again.'); setShowSignIn(false); }
    return () => { clerk?.unmountSignIn?.(node); };
  }, [showSignIn, viewer]);

  if (viewer) return <SignedInCollection key={`${viewer.subject}:${viewer.sessionId || ''}`} viewer={viewer}
    onSignOut={async () => { await (window as any).Clerk.signOut(); setViewer(null); setShowSignIn(false); }}/>;
  return <main className="collection-gate">
    <a href="/tools/rally/collection/?view=projects">Rally <span>/ Rave diary</span></a>
    <div className="gate-icon"><LockKeyhole size={24}/></div>
    <h1>Your nights.<br/>Your rave diary.</h1>
    <p>Keep every rave, artist, friend, and memory together. Use your Rally account, even if you haven’t joined a plan.</p>
    {status === 'loading' ? <p role="status" className="gate-loading"><LoaderCircle size={18} className="spin"/>Opening your Rally account…</p>
      : status === 'error' ? <><p role="alert" className="error">{error}</p><button className="primary" onClick={() => {
        if (!(window as any).Clerk) location.reload(); else setAttempt(n => n + 1);
      }}>Retry sign-in</button></>
      : <>{error && <p role="alert" className="error">{error}</p>}<div ref={signInRef} id="collectionSignIn"/>
        {!showSignIn && <button className="primary" onClick={() => setShowSignIn(true)}>Sign in / create account</button>}</>}
    <small><LockKeyhole size={14}/>Private to your account. Costs, ratings, notes, and album links are yours alone.</small>
  </main>;
}
createRoot(document.getElementById('root')!).render(<AccountApp/>);
