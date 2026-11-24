import {valid} from './model.mjs?v=7';

const endpoint = 'https://secret-gull-839.convex.cloud';
const $ = id => document.getElementById(id);
const gate = $('gate'), status = $('gate-status'), controls = $('account-controls'), banner = $('sync');
let session, owner, revision, key, pending, timer, sending, conflict = false, stopped = false;
let imported = false, ready = false, recovered = null;
export let initial = null;
export function unsaved() { return Boolean(pending); }

function button(parent, label, fn) {
  const el = document.createElement('button');
  el.type = 'button'; el.textContent = label; el.onclick = fn; parent.append(el);
}
function recoveryFile(data) {
  const url = URL.createObjectURL(new Blob([data], {type:'application/json'}));
  const link = document.createElement('a');
  link.href = url; link.download = 'corgi-days-recovery.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
async function request(method, args = {}) {
  if (stopped || window.Clerk.session?.id !== session.id) throw Error('Session changed.');
  let token = await session.getToken();
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  if (![payload.aud].flat().includes('convex')) token = await session.getToken({template:'convex'});
  if (!token || stopped) throw Error('Sign in again.');
  const response = await fetch(endpoint+'/api/'+(method==='load'?'query':'mutation'), {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({path:'game:'+method,args}), signal:AbortSignal.timeout(15000)
  });
  const result = await response.json();
  if (!response.ok || result.status!=='success') throw Error('Account save unavailable.');
  return result.value;
}
function showProblem(message) {
  banner.hidden = false; banner.textContent = message+' ';
  if (!conflict) button(banner,'Retry save',flush);
  if (pending) button(banner,'Download my changes',()=>recoveryFile(pending.data));
  if (conflict) button(banner,'Use account version',()=>{
    if (confirm('Use the version saved to your account? Download your changes first if you want a copy.')) {
      localStorage.removeItem(key); clearRecovered(); pending = null; location.reload();
    }
  });
}
function clearRecovered() {
  if (recovered && localStorage.getItem(recovered.key)===recovered.raw) localStorage.removeItem(recovered.key);
  recovered=null;
}
function cache() {
  try {
    if (pending) localStorage.setItem(key, JSON.stringify(pending));
    else localStorage.removeItem(key);
    return true;
  } catch {return false;}
}
export function queueSave(data) {
  if (stopped) return false;
  pending = {revision:pending?.revision ?? revision, data:JSON.stringify(data)};
  const stored = cache();
  if (!stored) showProblem('Keep this tab open until your changes reach your account.');
  clearTimeout(timer);
  if (!conflict) timer=setTimeout(flush,250);
  return true;
}
export async function flush() {
  clearTimeout(timer);
  if (sending) return sending;
  if (conflict || stopped || !pending) return !pending;
  sending = (async()=>{
    try {
      while (pending && !stopped) {
        const item = pending;
        const result = await request('save',item);
        if (stopped) return false;
        if (result.conflict) {
          conflict = true;
          showProblem('Another device saved a different version. Your changes are available to download.');
          return false;
        }
        revision = result.revision;
        pending = pending === item ? null : {...pending,revision};
        cache();
        clearRecovered();
        if (imported) {
          localStorage.setItem('corgi-days-legacy-claimed',owner);
          imported = false;
        }
      }
      banner.hidden = true;
      return true;
    } catch {
      if (!stopped) showProblem('Your changes haven’t reached your account yet.');
      return false;
    }
  })();
  try { return await sending; } finally { sending=null; }
}
export async function signOut() {
  if (pending && !(await flush())) {
    if (!cache()) {showProblem('Download your changes before leaving this tab.');return;}
    if (!confirm('Sign out with unsynced changes? They will stay in this browser for your next sign-in.')) return;
  }
  try { await window.Clerk.signOut(); } catch { showProblem('Sign-out failed. Please try again.'); }
}
function readBundle(data) {
  const value = JSON.parse(data);
  if (!valid(value?.pet) || !value.drafts || typeof value.drafts!=='object') throw Error('Invalid save.');
  return value;
}
async function legacyChoice() {
  if (localStorage.getItem('corgi-days-legacy-claimed')) return null;
  const raw = localStorage.getItem('corgi-days-v1');
  if (!raw) return null;
  const pet = JSON.parse(raw);
  if (!valid(pet)) throw Error('Unreadable browser save.');
  const drafts = JSON.parse(localStorage.getItem('corgi-days-editors-v1') || '{}');
  const oldDraft = JSON.parse(localStorage.getItem('corgi-days-style-v1') || 'null');
  if (oldDraft && !drafts.wardrobe && !drafts.settings) { drafts.wardrobe=oldDraft; drafts.settings=oldDraft; }
  if (pet.adopted === false && !Object.keys(drafts).length) return null;
  status.textContent='Bring the corgi or unfinished setup from this browser into your signed-in account?';
  return new Promise(resolve=>{
    button(controls,'Bring my corgi',()=>{imported=true;resolve({pet,drafts});});
    button(controls,'Start a new corgi',()=>resolve(null));
  });
}
async function start() {
  try {
    const clerk = window.Clerk;
    await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
    session = clerk.session;
    const id = session?.id ?? null;
    clerk.addListener(state=>{
      if (state.session === undefined || (state.session?.id ?? null)===id || stopped) return;
      stopped=true; clearTimeout(timer);
      window.dispatchEvent(new Event('pagehide'));
      document.body.replaceChildren(); location.reload();
    });
    if (!session) {
      status.textContent = 'Sign in to care for your corgi and keep it across devices.';
      const target = location.href;
      clerk.mountSignIn(controls,{routing:'virtual',forceRedirectUrl:target,signUpForceRedirectUrl:target});
      return;
    }
    owner = clerk.user.id;
    const remote = await request('load');
    if (stopped) return;
    revision = remote.revision;
    initial = remote.data ? readBundle(remote.data) : null;
    const prefix = 'corgi-days-pending:'+owner+':';
    const tabKey = prefix+'tab';
    let tab = sessionStorage.getItem(tabKey);
    key = tab && localStorage.getItem(prefix+tab) ? prefix+tab : null;
    if (!key) {
      // A previous tab may have closed offline. Offer recovery without taking its queue.
      const leftovers = Object.keys(localStorage).filter(k=>k.startsWith(prefix));
      for (const k of leftovers) {
        const item = JSON.parse(localStorage.getItem(k));
        if (item.data===remote.data) {localStorage.removeItem(k);continue;}
        status.textContent='This browser has changes that may not have reached your account.';
        const recover = await new Promise(resolve=>{
          button(controls,'Recover changes',()=>resolve(true));
          button(controls,'Download changes',()=>recoveryFile(item.data));
          button(controls,'Continue with account',()=>resolve(false));
        });
        controls.replaceChildren();
        if (recover) { key=k; tab=k.slice(prefix.length); break; }
      }
    }
    if (!key) {tab=crypto.randomUUID(); key=prefix+tab;}
    sessionStorage.setItem(tabKey,tab);
    const raw = localStorage.getItem(key);
    // A duplicated tab can inherit sessionStorage. Give each document its own queue
    // so that recovering an old draft never overwrites a live tab's newer edits.
    if (raw) {
      recovered={key,raw};
      key=prefix+crypto.randomUUID();
      sessionStorage.setItem(tabKey,key.slice(prefix.length));
      const item=JSON.parse(raw);
      if (item.data===remote.data) clearRecovered();
      else { initial=readBundle(item.data); pending=item; conflict=item.revision!==revision; if(cache())clearRecovered(); }
    }
    if (!initial) {
      try { initial=await legacyChoice(); }
      catch {
        status.textContent='The old browser save could not be read. You can keep a copy and start a new corgi.';
        await new Promise(resolve=>{
          button(controls,'Download old save',()=>recoveryFile(localStorage.getItem('corgi-days-v1')||'{}'));
          button(controls,'Start a new corgi',resolve);
        });
      }
    }
    if (stopped) return;
    gate.hidden=true;
    await import('./app.js?v=9');
    ready=true;
    if (imported && !pending) queueSave(initial);
    if (conflict) showProblem('Another device saved a different version. Review your changes before switching.');
    else if (pending) void flush();
  } catch {
    gate.hidden=false; controls.replaceChildren();
    status.textContent='Couldn’t open your account or saved corgi. Check your connection and try again.';
    button(controls,'Try again',()=>location.reload());
    if (session) {
      const legacy=localStorage.getItem('corgi-days-v1');
      if (legacy && !localStorage.getItem('corgi-days-legacy-claimed')) button(controls,'Download browser save',()=>recoveryFile(legacy));
      button(controls,'Sign out',signOut);
    }
  }
}
document.addEventListener('visibilitychange',async()=>{
  if (document.hidden || !ready || pending || sending || stopped) return;
  try {
    const remote=await request('load');
    if (!pending && !sending && !stopped && remote.revision>revision) location.reload();
  } catch { /* Continue with the open pet. Writes have their own recovery path. */ }
});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
window.addEventListener('online',()=>{if(pending)void flush();});
void start();
