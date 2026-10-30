const CONVEX_URL = "https://dashing-heron-837.convex.cloud";
const BASE_PATH = "/tools/rally/";
const DEFAULT_EVENT = "lost-lands-2026";
const views = [
  ["home", "Home", "⌂"], ["stay", "Stay", "▣"], ["crew", "Crew", "●"],
  ["travel", "Travel", "✈"], ["passes", "Passes", "◇"], ["tasks", "Tasks", "✓"], ["lineup", "Lineup", "♫"],
  ["meetups", "Meetups", "⌖"], ["notes", "Notes", "≡"],
];
const noteSections = {general:'General',stay:'Stay',crew:'Crew',travel:'Travel',passes:'Passes'};
const optionalSections = ['stay','travel','passes','tasks','meetups'];
function sectionEnabled(view) { return !optionalSections.includes(view) || !(data.hiddenSections || []).includes(view); }
function applyProjectTheme() {
  if(themePreview&&(themePreview.eventId!==activeEvent||themePreview.owner!==window.Clerk?.user?.id))themePreview=null;
  const theme=themePreview?.theme||data?.projectTheme||'warm';
  window.RallyProjectThemes?.apply(theme);
  window.RallyLineup?.setTheme(theme);
  if(!themePreview&&data?.id===activeEvent)window.RallyProjectThemes?.remember?.(activeEvent,theme);
}
function openProjectTheme() {
  if(!data?.isAdmin)return;
  if(offlineMode)return showToast('Reconnect to change the project theme.');
  const eventId=activeEvent, owner=window.Clerk?.user?.id;
  const themes=window.RallyProjectThemes.presets;
  openDialog('Project theme','Choose a palette for everyone in this project. Preview it here, then save to apply it across all tabs.',
    selectField('Color palette','projectTheme',themes.map(theme=>[theme.id,theme.name+' · '+theme.description]),data.projectTheme||'warm')+'<div class="theme-preview" id="themePreview" aria-live="polite"></div>',
    async values=>{
      const result=await convexMutation('rallyThemes:save',{eventId,theme:values.projectTheme});
      if(owner!==window.Clerk?.user?.id)return;
      if(activeEvent===eventId){data.projectTheme=result.projectTheme;RallyOffline.save?.(data);}
      closeDialog();
      showToast('Project theme saved for everyone');
    });
  const select=el.dialogRoot.querySelector('select[name="projectTheme"]');
  const preview=()=>{
    const theme=window.RallyProjectThemes.themeFor(select.value);
    themePreview={eventId,owner,theme:theme.id};applyProjectTheme();
    document.getElementById('themePreview').innerHTML=`<div class="theme-swatches" aria-hidden="true">${['paper','card','soft','accent'].map(key=>`<i style="background:${theme.colors[key]}"></i>`).join('')}</div><strong>${escapeHtml(theme.name)}</strong><p>${escapeHtml(theme.description)}</p><span class="theme-preview-sample">Your crew. Your weekend.</span>`;
  };
  select.addEventListener('change',preview);preview();
}
async function refreshProjectTheme() {
  if(!data||offlineMode||document.hidden||!window.Clerk?.isSignedIn)return;
  const eventId=activeEvent,owner=window.Clerk.user.id;
  try{
    const room=await convexQuery('rally:get',{eventId});
    if(activeEvent!==eventId||owner!==window.Clerk?.user?.id)return;
    if((data.projectTheme||'warm')!==(room.projectTheme||'warm')){data.projectTheme=room.projectTheme||'warm';applyProjectTheme();}
    if(activeView==='passes'&&!el.dialogRoot.children.length&&JSON.stringify([data.passes,data.members])!==JSON.stringify([room.passes,room.members])){
      data.passes=room.passes;data.members=room.members;RallyOffline.save?.(data);renderTicketBoard();
    }
  }catch{ /* Keep the current saved palette when offline or reconnecting. */ }
}
function openSectionSettings() {
  if (!data?.isAdmin) return;
  if (offlineMode) return showToast('Reconnect to change project settings.');
  const eventId=activeEvent, owner=window.Clerk?.user?.id;
  const available=optionalSections.filter(id=>id!=='meetups'||data.id===DEFAULT_EVENT);
  openDialog('Manage sections','Choose what everyone sees in this event. Turning a section off hides it without deleting any data. Home, Lineup, Crew, and Notes stay available.',
    `<div class="lineup-day-settings">${available.map(id=>`<label><input type="checkbox" name="${id}" ${sectionEnabled(id)?'checked':''}><span>${views.find(v=>v[0]===id)[1]}</span></label>`).join('')}</div>`,async values=>{
      if(offlineMode)throw new Error('Reconnect to change project settings.');
      const hiddenSections=optionalSections.filter(id=>available.includes(id)?!values[id]:(data.hiddenSections||[]).includes(id));
      await convexMutation('rallySections:save',{eventId,hiddenSections});
      if(owner!==window.Clerk?.user?.id)return;
      closeDialog();
      if(activeEvent===eventId){data.hiddenSections=hiddenSections;render();}
      showToast('Sections updated for everyone');
    });
}

// One icon vocabulary for sidebar, overview, and mobile navigation.
function rallyIcon(id) {
  const paths = {
    home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    stay:'<path d="M3 18V7m18 11V9a2 2 0 0 0-2-2H3m0 6h18M3 18v3m18-3v3M7 7v6"/>',
    crew:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    travel:'<path d="m22 2-7 20-4-9-9-4Z M22 2 11 13"/>',
    passes:'<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4Z M15 5v3m0 3v2m0 3v3"/>',
    tasks:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',
    lineup:'<path d="M9 18V5l11-2v13M9 8l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    meetups:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    notes:'<path d="M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5"/>',
    search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
    more:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    ellipsis:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  return `<svg class="rally-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[id] || paths.notes}</svg>`;
}

const eventTemplates = [
  { id: "festival-weekend", icon: "◉", name: "Festival weekend", badge: "Recommended", description: "A multi-day trip with lodging, travel, passes, packing, and crew checkpoints.", summary: "7 starter tasks · 4 pass categories" },
  { id: "local-show", icon: "◆", name: "Local show", description: "A lighter plan for a one-night show or block party.", summary: "3 starter tasks · 2 pass categories" },
  { id: "blank", icon: "○", name: "Blank room", description: "Start from scratch and add only what this event needs.", summary: "No starter items" },
  { id: "copy-current", icon: "⧉", name: "Copy this room’s setup", description: "Reuse task and pass names without copying members, assignments, bookings, costs, or confirmations.", summary: "Structure only · trip details excluded" },
];

let data = null;
let events = [];
let activeView = "home";
let activeEvent = null;
let unlockPending = null;
let roomLoadRevision = 0;
let draggedTask = null;
let lineupSaveTimer = null;
let lineupRefreshTimer = null;
let offlineMode = RallyOffline.native || !navigator.onLine;
let shellSaved = RallyOffline.native || !!window.webkit?.messageHandlers?.rallyOffline;
let notesRevision = 0;
let themePreview = null;

const el = Object.fromEntries(["accessGate","clerkSignIn","authStatus","authSignOut","rallyApp","sidebar","closeMenu","openMenu","menuBackdrop","eventSwitcher","eventMenu","eventName","eventThumb","mobileEventName","mobileCountdown","sideNav","page","topInvite","accountButton","signOut","newEvent","dialogRoot","toast"].map((id) => [id, document.getElementById(id)]));

init();

async function init() {
  const params = new URLSearchParams(location.search);
  activeView = views.some(([id]) => id === params.get("view")) ? params.get("view") : "home";
  activeEvent = params.get("event") || null;
  wireShell();
  setupOffline();
  if (offlineMode && !params.has('join') && openSavedRoom()) return;
  await initializeClerk();
}

function openSavedRoom() {
  if(!activeEvent){
    const savedEvents=RallyOffline.events||[];
    activeEvent=savedEvents.some(event=>event.id===RallyOffline.lastEvent)?RallyOffline.lastEvent:(savedEvents.find(event=>!RallyEvents.lifecycle(event).past)||savedEvents[0])?.id||null;
  }
  const saved = RallyOffline.room(activeEvent);
  if (!saved) return false;
  data = saved; events = RallyOffline.events; offlineMode = true;
  render(); el.accessGate.hidden = true; el.rallyApp.hidden = false;
  document.body.classList.remove('booting'); updateOfflineStatus();
  return true;
}
function updateOfflineStatus() {
  const banner = document.getElementById('offlineStatus');
  if (!banner || !data) return;
  const stamp = RallyOffline.savedAt(activeEvent);
  const pending = RallyOffline.pendingCount;
  banner.title = `${stamp ? 'Last saved ' + new Date(stamp).toLocaleString() + '. ' : ''}${offlineMode ? 'Viewing a saved copy. Favorites sync when you reconnect; other edits require internet.' : 'Trip details are saved on this device.'}`;
  banner.textContent = RallyOffline.storageError ? 'Device storage unavailable — offline saving is not ready.' :
    `${offlineMode ? 'Offline · Saved' : shellSaved && stamp ? 'Available offline' : 'Preparing offline access…'}${stamp ? ' · ' + new Date(stamp).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : ''}${pending ? ' · Favorites waiting to sync' : ''}`;
  if(data.id===DEFAULT_EVENT && shellSaved && stamp && !RallyOffline.storageError && !offlineMode) window.RallyDino?.ready(banner);
}
function setupOffline() {
  const edits = '#topInvite,#accountButton,#newEvent,#addRoom,#addCar,#addFlight,#addPass,#newTicket,#addLineupArtist,[data-room-edit],[data-assign-room],[data-flight-leg],[data-car-edit],[data-pass-edit],[data-ticket-slot],[data-lineup-edit],[data-task],[data-invite-member],[data-edit-member],[data-remove-member]';
  document.addEventListener('click', event => {
    if (offlineMode && event.target.closest(edits)) {
      event.preventDefault(); event.stopImmediatePropagation(); showToast('This change needs internet. Your saved trip and favorites are available offline.');
    }
  }, true);
  document.addEventListener('dragstart', event => { if (offlineMode) event.preventDefault(); }, true);
  const banner = document.createElement('div'); banner.id = 'offlineStatus'; banner.role = 'status';
  banner.style.cssText = 'padding:6px 16px;background:#eeefe5;color:#68705e;font-size:12px;line-height:1.5;flex-shrink:0';
  el.page.before(banner);
  new ResizeObserver(() => document.documentElement.style.setProperty('--offline-status-height', `${banner.offsetHeight}px`)).observe(banner);
  window.addEventListener('rally-cache-change', updateOfflineStatus);
  window.addEventListener('offline', () => { offlineMode = true; updateOfflineStatus(); updateNotesConnectivity(); });
  window.addEventListener('online', () => { if (!RallyOffline.native) void reconnect(); });
  if (!window.webkit?.messageHandlers?.rallyOffline && 'serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost','127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('/rally-sw.js', {scope:'/'}).then(() => navigator.serviceWorker.ready).then(() => { shellSaved = true; updateOfflineStatus(); }).catch(() => { shellSaved = false; updateOfflineStatus(); });
  }
  setInterval(() => { if (navigator.onLine && !RallyOffline.native && window.Clerk?.isSignedIn) void syncFavorites(); }, 15000);
  setInterval(refreshProjectTheme,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshProjectTheme();});
}
async function reconnect() {
  if (!window.Clerk?.isSignedIn) return initializeClerk();
  offlineMode = false;
  await unlock();
}
async function syncFavorites() {
  const eventId=activeEvent,owner=window.Clerk?.user?.id;
  try {
    const changed=await RallyOffline.flush(networkConvexCall, owner);
    if (changed && data && activeEvent===eventId && owner===window.Clerk?.user?.id) {
      const saved=RallyOffline.room(eventId);
      if(saved){data.currentLineupFavorites=saved.currentLineupFavorites;data.lineupInterests=saved.lineupInterests;}
      if(activeView === 'lineup') sendLineupState();
    }
  } catch { /* Durable queue is retried; never claim a remote save on failure. */ }
  updateOfflineStatus();
}

function wireShell() {
  window.RallyInvites?.configure({
    state:()=>data,offline:()=>offlineMode,query:convexQuery,mutate:convexMutation,
    dialog:openDialog,field,select:selectField,toast:showToast,navigate:navigateTo,
    email:openEmailInvite,recovery:showAuthRecovery,
    enter:async url=>{history.replaceState({},'',url.pathname+url.search);activeEvent=url.searchParams.get('event');activeView='crew';await openAuthorizedRoom();},
  });
  document.addEventListener('click',event=>{if(offlineMode&&event.target.closest('[data-rally-collection]')){event.preventDefault();showToast('Reconnect to open your personal collection.');}});
  el.openMenu.innerHTML=rallyIcon('more');
  document.addEventListener("click", handleAppLink);
  window.addEventListener("popstate", () => navigateTo(new URL(location.href), { push: false }));
  window.addEventListener('resize', sendLineupLayout);
  el.openMenu.addEventListener("click", () => { el.sidebar.classList.add("open"); el.menuBackdrop.hidden = false; });
  [el.closeMenu, el.menuBackdrop].forEach((button) => button.addEventListener("click", closeMenu));
  el.eventSwitcher.setAttribute('aria-controls','eventMenu');
  el.eventSwitcher.setAttribute('aria-expanded','false');
  el.eventSwitcher.addEventListener("click", () => {
    renderEventMenu(); el.eventMenu.hidden = !el.eventMenu.hidden;
    el.eventSwitcher.setAttribute('aria-expanded',String(!el.eventMenu.hidden));
    if(!el.eventMenu.hidden)el.eventMenu.querySelector('input').focus({preventScroll:true});
  });
  el.eventMenu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.stopPropagation();el.eventMenu.hidden=true;el.eventSwitcher.setAttribute('aria-expanded','false');el.eventSwitcher.focus();}
    if(['ArrowDown','ArrowUp'].includes(event.key)){
      const options=[...el.eventMenu.querySelectorAll('button[data-event]')].filter(button=>!button.hidden&&button.getClientRects().length);
      if(!options.length)return;
      event.preventDefault();const index=options.indexOf(document.activeElement);
      options[(index+(event.key==='ArrowDown'?1:options.length-1)+options.length)%options.length].focus();
    }
  });
  document.addEventListener('pointerdown',event=>{
    if(!el.eventMenu.hidden&&!el.eventMenu.contains(event.target)&&!el.eventSwitcher.contains(event.target)){
      el.eventMenu.hidden=true;el.eventSwitcher.setAttribute('aria-expanded','false');
    }
  });
  el.signOut.addEventListener("click", signOut);
  el.accountButton.addEventListener("click", () => openProfile(data?.members.find((member) => member.id === data.currentMemberId)));
  el.topInvite.addEventListener("click", () => openInvite());
  document.getElementById('sidebarSearch').onclick = openProjectSearch;
  const searchDialog = document.getElementById('projectSearch');
  searchDialog.querySelector('header button').onclick = () => searchDialog.close();
  searchDialog.addEventListener('click', event => { if(event.target === searchDialog) searchDialog.close(); });
  document.getElementById('projectSearchInput').addEventListener('input', renderProjectSearch);
  document.getElementById('searchResults').addEventListener('click', event => { if(event.target.closest('a')) searchDialog.close(); });
  document.addEventListener('keydown', event => { if(data && (event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); openProjectSearch(); } });
}

function closeMenu() { el.sidebar.classList.remove("open"); el.menuBackdrop.hidden = true; }

function readRoute(url) {
  const params = url.searchParams;
  return {
    view: views.some(([id]) => id === params.get("view")) ? params.get("view") : "home",
    eventId: params.get("event") || activeEvent,
  };
}

function handleAppLink(event) {
  if (event.defaultPrevented || (event.button !== undefined && event.button !== 0) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target.closest("a[href]");
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || url.pathname !== BASE_PATH) return;
  event.preventDefault();
  void navigateTo(url);
}

async function navigateTo(url, { push = true } = {}) {
  const route = readRoute(url);
  closeDialog({preserveRoute:true});
  if (push) history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  if(url.searchParams.has('join')){await initializeClerk();return;}
  closeMenu();
  el.eventMenu.hidden = true;
  const eventChanged = route.eventId !== activeEvent || data?.id !== route.eventId;
  activeView = route.view;
  if (eventChanged) {
    const revision=beginProjectLoading(route.eventId),owner=window.Clerk?.user?.id;
    window.RallyLineup?.destroy();
    document.getElementById('lineupView').hidden=true;
    el.page.hidden=false;
    activeEvent = route.eventId;
    el.page.className = "page";
    el.page.innerHTML = `<div class="empty">Opening ${escapeHtml(events.find((event) => event.id === activeEvent)?.name || "rave room")}…</div>`;
    try {
      const room = await convexMutation("rally:bootstrap", { eventId: route.eventId });
      const available = await convexQuery("rally:listEvents", {});
      if(revision!==roomLoadRevision||owner!==window.Clerk?.user?.id)return;
      data=room;events=available;
    } catch (error) {
      if(revision!==roomLoadRevision)return;
      showAuthError(error);
      return;
    }
  }
  render();
  el.accessGate.hidden=true;el.rallyApp.hidden=false;
  document.body.classList.remove('booting');
  void window.RallyInvites?.restore();
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function initializeClerk() {
  try {
    if (!window.Clerk) throw new Error("Secure sign-in did not load.");
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    if (window.Clerk.isSignedIn) return unlock();
    RallyOffline.clear();
    window.RallyProjectThemes?.apply('warm');
    window.RallyLineup?.destroy();
    document.body.classList.remove("booting");
    el.rallyApp.hidden = true;
    el.accessGate.hidden = false;
    el.accessGate.classList.remove('auth-recovery');
    el.clerkSignIn.hidden = false;
    document.getElementById('authTitle').hidden = true;
    document.getElementById('authOptions').hidden = true;
    el.authStatus.hidden = true;
    el.authSignOut.hidden = true;
    window.Clerk.mountSignIn(el.clerkSignIn, {
      routing: "hash", withSignUp: true,
      forceRedirectUrl: location.href.split("#")[0], signUpForceRedirectUrl: location.href.split("#")[0],
      appearance: { variables: { colorPrimary: "#1c1d19", colorBackground: "#fffef9", borderRadius: "9px", fontFamily: "Inter, ui-sans-serif, system-ui" } },
    });
  } catch (error) { if (!navigator.onLine && openSavedRoom()) return; showAuthError(error); }
}

function unlock() {
  if (unlockPending) return unlockPending;
  unlockPending = openAuthorizedRoom().finally(() => { unlockPending = null; });
  return unlockPending;
}

function beginProjectLoading(eventId){
  document.body.classList.add('booting');
  el.accessGate.hidden=true;
  window.RallyProjectThemes?.prepare?.(eventId);
  return ++roomLoadRevision;
}

async function openAuthorizedRoom() {
  const revision=beginProjectLoading(new URLSearchParams(location.search).get('event'));
  try {
    const owner = window.Clerk.user.id;
    RallyOffline.identify(owner);
    offlineMode = false;
    if(new URLSearchParams(location.search).has('join')){
      if(!window.RallyInvites)throw new Error('Invitation tools did not load. Refresh to try again.');
      await window.RallyInvites.join();return;
    }
    // Resolve membership before opening a room. A generic landing URL must not
    // require membership in Lost Lands, and authorization errors are redacted
    // by Convex in production, so matching their error text isn't reliable.
    const knownEvents = await convexQuery("rally:listEvents", {});
    if (window.Clerk.user?.id !== owner || revision!==roomLoadRevision) return;
    events = knownEvents;
    if(!new URLSearchParams(location.search).has('event') && events.length){
      activeEvent=(events.find(event=>!RallyEvents.lifecycle(event).past)||[...events].sort((a,b)=>b.endsAt.localeCompare(a.endsAt))[0]).id;
      const url=new URL(location.href);url.searchParams.set('event',activeEvent);history.replaceState({},'',url.pathname+url.search+url.hash);
    }
    if (!events.some(event => event.id === activeEvent)) {
      if (!new URLSearchParams(location.search).has('event') && events.length) {
        activeEvent = events[0].id;
        const url = new URL(location.href);
        url.searchParams.set('event', activeEvent);
        history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      } else {
        showRoomAccess();
        return;
      }
    }
    window.RallyProjectThemes?.prepare?.(activeEvent);
    const requestedEvent=activeEvent;
    const room = await convexMutation("rally:bootstrap", { eventId: requestedEvent });
    if (window.Clerk.user?.id !== owner || revision!==roomLoadRevision) return;
    if(activeEvent!==requestedEvent)return;
    data = room;
    render();
    el.accessGate.hidden = true;
    el.rallyApp.hidden = false;
    document.body.classList.remove("booting");
    void window.RallyInvites?.restore();
    updateOfflineStatus();
    void (async () => {
      for (const event of events) {
        try { await convexQuery('rally:get', {eventId:event.id}); } catch { /* Existing saved copies remain available. */ }
      }
      await syncFavorites();
    })();
  } catch (error) {
    if(revision!==roomLoadRevision)return;
    if ((!navigator.onLine || ['TypeError','TimeoutError','AbortError'].includes(error.name)) && openSavedRoom()) return;
    showAuthError(error);
  }
}

function showRoomAccess() {
  showAuthRecovery('Choose your rave room', events.length
    ? 'This account does not have access to the linked project. You can open one of your rooms below, or ask its admin to invite this email.'
    : 'Your personal rave collection is ready — open Rave diary to start logging nights. To join a shared plan, ask its admin to invite the email shown below.');
}

function showAuthRecovery(title, message) {
  document.body.classList.remove('booting');
  el.accessGate.hidden = false; el.rallyApp.hidden = true;
  el.accessGate.classList.add('auth-recovery');
  el.clerkSignIn.hidden = true;
  const heading = document.getElementById('authTitle');
  heading.hidden = false; heading.textContent = title;
  const email = window.Clerk?.user?.primaryEmailAddress?.emailAddress;
  el.authStatus.hidden = false;
  el.authStatus.textContent = `${email ? `Signed in as ${email}. ` : ''}${message}`;
  const options = document.getElementById('authOptions');
  options.replaceChildren(); options.hidden = false;
  if (window.Clerk?.isSignedIn) for (const event of events) {
    const button = document.createElement('button');
    button.className = 'secondary'; button.textContent = `Open ${event.name}`;
    button.onclick = () => {
      if (unlockPending) return;
      activeEvent = event.id;
      const url = new URL(location.href);
      url.searchParams.set('event', event.id);
      history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      void unlock();
    };
    options.append(button);
  }
  const retry = document.createElement('button');
  retry.className = 'secondary'; retry.textContent = 'Try again';
  retry.onclick = () => window.Clerk?.isSignedIn ? unlock() : location.reload();
  options.append(retry);
  el.authSignOut.hidden = !window.Clerk?.isSignedIn;
  el.authSignOut.onclick = signOut;
}

function showAuthError(error) {
  console.error(error);
  const signedIn = window.Clerk?.isSignedIn;
  showAuthRecovery(signedIn ? 'Your room could not load' : 'Sign-in could not load', signedIn
    ? 'You are signed in, but Rally could not load this project. Try again, or open another room below.'
    : 'Secure sign-in is unavailable right now. Check your connection and try again.');
}

async function signOut() { if (offlineMode) return showToast('Reconnect to sign out securely.'); if (RallyOffline.pendingCount && !confirm('Sign out and discard favorites that have not synced yet?')) return; window.RallyCrewLocation?.clearCache(); RallyOffline.clear(); if (window.Clerk?.isSignedIn) await window.Clerk.signOut(); location.assign(BASE_PATH); }

function renderEventMenu(){
  el.eventMenu.innerHTML = RallyHistory.menu(events,data);
  el.eventMenu.insertAdjacentHTML('afterbegin','<label class="event-menu-search"><input type="search" aria-label="Find a rave room" placeholder="Find a rave room…" autocomplete="off"></label><p class="event-menu-empty" hidden>No matching rave rooms.</p>');
  const roomSearch=el.eventMenu.querySelector('input');
  roomSearch.oninput=()=>{
    const query=roomSearch.value.trim().toLocaleLowerCase();
    const buttons=[...el.eventMenu.querySelectorAll('button[data-event]')];
    buttons.forEach(button=>button.hidden=!button.textContent.toLocaleLowerCase().includes(query));
    el.eventMenu.querySelector('.event-menu-empty').hidden=buttons.some(button=>!button.hidden);
    el.eventMenu.querySelectorAll('details').forEach(group=>{
      if(query&&!group.dataset.searching){group.dataset.wasOpen=String(group.open);group.dataset.searching='true';}
      group.hidden=!!query&&![...group.querySelectorAll('button[data-event]')].some(button=>!button.hidden);
      if(query)group.open=true;
      else if(group.dataset.searching){group.open=group.dataset.wasOpen==='true';delete group.dataset.searching;}
    });
  };
  el.eventMenu.insertAdjacentHTML('beforeend','<button id="newEvent" class="new-event-menu-item">＋ New rave room</button>');
  document.getElementById('newEvent').onclick=()=>{el.eventMenu.hidden=true;closeMenu();openNewEvent();};
  el.eventMenu.querySelectorAll('button[data-event]').forEach(button=>{
    if(button.dataset.event===data.id){button.classList.add('active');button.setAttribute('aria-current','true');}
    button.onclick=()=>navigateTo(new URL(href('home',button.dataset.event),location.href));
  });
  RallyHistory.mount(data);
}
function render() {
  applyProjectTheme();
  if(!sectionEnabled(activeView)){
    activeView='home';
    history.replaceState(null,'',href('home'));
  }
  window.RallyLineup?.hide();
  window.RallyMeetups?.unmount();
  document.body.classList.remove('lineup-overlay');
  RallyOffline.select(activeEvent);
  updateOfflineStatus();
  clearInterval(lineupRefreshTimer); lineupRefreshTimer = null;
  const days = eventDaysAway(data);
  el.eventName.textContent = data.name; el.mobileEventName.textContent = data.name; el.mobileCountdown.textContent = `${days} days away`;
  el.eventThumb.textContent = initials(data.name); el.topInvite.hidden = !data.isAdmin;
  renderAccountButton();
  el.sideNav.innerHTML = views.filter(([id]) => sectionEnabled(id) && (id !== 'meetups' || data.id === DEFAULT_EVENT) && (id !== "lineup" || data.id === DEFAULT_EVENT || data.lineup?.length || data.isAdmin)).map(([id,label]) => `<a href="${href(id)}" class="${activeView === id ? "active" : ""}" ${activeView === id ? 'aria-current="page"' : ''}><span class="nav-icon">${rallyIcon(id)}</span>${label}</a>`).join("");
  renderEventMenu();
  window.RallyCrewLocation?.unmount();
  const nativeLineup=activeView==='lineup';
  el.page.className = 'page';
  el.page.hidden=nativeLineup;
  document.getElementById('lineupView').hidden=!nativeLineup;
  const renderer = { home: renderHome, stay: renderStay, crew: renderCrew, travel: renderTravel, passes: renderPasses, tasks: renderTasks, lineup: renderLineup, notes: renderNotes, meetups: renderMeetups }[activeView] || renderHome;
  renderer();
  if(activeView==='home')window.RallyCollection?.mount(data,{offline:()=>offlineMode,loadExperience:()=>convexQuery('rallyCollection:draftFromEvent',{eventId:data.id})});
  const eventStatus=RallyEvents.lifecycle(data);
  if(eventStatus.finished||eventStatus.past){const label=eventStatus.finished?'Event finished':'Past rave';el.mobileCountdown.textContent=label;const countdown=el.page.querySelector('.countdown');if(countdown){countdown.querySelector('strong')?.remove();const caption=countdown.querySelector('span');if(caption)caption.textContent=label;}}
  if(activeView!=='meetups')resumeCrewLocation();
  if (activeView==='home') renderSectionNotes('general');
  else if (['stay','crew','travel','passes'].includes(activeView)) renderSectionNotes(activeView);
  renderMobileNav();
  focusSearchResult();
}

function renderAccountButton() {
  const member = data.members.find(person => person.id === data.currentMemberId);
  const name = member?.name || window.Clerk?.user?.fullName || 'Your profile';
  el.accountButton.textContent = member?.name ? initials(member.name) : window.Clerk?.user?.fullName ? initials(name) : '?';
  el.accountButton.title = name;
  el.accountButton.setAttribute('aria-label', `Edit ${name} profile`);
}

function renderMobileNav() {
  const icon = rallyIcon;
  const tabs=[['home','Home'],['lineup','Lineup'],...(data.id===DEFAULT_EVENT&&sectionEnabled('meetups')?[['meetups','Meetups']]:[['notes','Notes']])];
  const nav=document.getElementById('mobileNav');
  const navKey=data.id+':'+tabs.map(tab=>tab[0]).join(',');
  if(nav.dataset.eventId!==navKey){
    nav.dataset.eventId=navKey;
    nav.innerHTML = `<div class="nav-glass-group">${tabs.map(([id,label])=>`<a data-nav-view="${id}" href="${href(id)}" class="${activeView===id?'active':''}" ${activeView===id?'aria-current="page"':''}>${icon(id)}${label}</a>`).join('')}<button type="button" id="quickMore" ${!tabs.some(([id])=>id===activeView)?'aria-current="page"':''}>${icon('more')}More</button></div><button type="button" id="quickSearch" aria-label="Search this rave">${icon('search')}</button>`;
    document.getElementById('quickSearch').onclick = openProjectSearch;
    document.getElementById('quickMore').onclick = () => el.openMenu.click();
  }
  nav.querySelectorAll('[data-nav-view]').forEach(link=>{
    const active=link.dataset.navView===activeView;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  const more=document.getElementById('quickMore');
  if(!tabs.some(([id])=>id===activeView))more.setAttribute('aria-current','page');else more.removeAttribute('aria-current');
  requestAnimationFrame(sendLineupLayout);
}

function sendLineupLayout() {
  const nav=document.getElementById('mobileNav');
  if(!nav||activeView!=='lineup')return;
  const bottomInset=matchMedia('(max-width:900px)').matches?Math.max(0,innerHeight-nav.getBoundingClientRect().top+16):0;
  window.RallyLineup?.receive({type:'rally-lineup-layout',bottomInset});
}

// Deliberately indexes only data already authorized for the current project.
// No account-directory lookup, API query, or copy of search terms is stored.
function projectSearchItems() {
  const map=memberMap(), items=views.filter(([view])=>view!=='meetups'||data.id===DEFAULT_EVENT).map(([view,title])=>({view,title,detail:'Open section'}));
  const add=(view,rows,title,detail)=>rows?.forEach(row=>items.push({view,id:row.id,title:title(row),detail:detail(row)}));
  add('crew',data.members,r=>r.name,r=>[r.email,r.origin,r.role].filter(Boolean).join(' · '));
  add('stay',data.rooms,r=>r.hotel,r=>[r.roomType,r.confirmation,r.notes,...(r.memberIds||[]).map(id=>map[id]?.name)].filter(Boolean).join(' · '));
  add('travel',groupedFlights(),r=>`${r.airline} ${r.number}: ${r.origin} → ${r.destination}`,r=>[r.departure,r.confirmation,...r.memberIds.map(id=>map[id]?.name)].filter(Boolean).join(' · '));
  add('travel',data.cars,r=>`${r.company} · ${r.vehicle}`,r=>[r.pickup,r.dropoff,map[r.driverId]?.name].filter(Boolean).join(' · '));
  add('passes',data.passes,r=>r.name,r=>[r.category,map[r.ownerId]?.name,r.notes].filter(Boolean).join(' · '));
  add('tasks',data.tasks,r=>r.title,r=>[r.category,r.status,map[r.assigneeId]?.name,r.description].filter(Boolean).join(' · '));
  if(data.id===DEFAULT_EVENT)add('meetups',data.meetups,r=>r.title,r=>[r.spot,r.when,r.instructions,r.status,r.timing?.label].filter(Boolean).join(' · '));
  (data.notes||[]).forEach(note=>items.push({view:noteSection(note)==='general'?'notes':noteSection(note),id:note.id,title:note.body,detail:`${noteSections[noteSection(note)]} note · ${map[note.authorId]?.name||note.authorName}`}));
  const sets=data.id===DEFAULT_EVENT?(window.LOST_LANDS_SET_TIMES||[]):(data.lineup||[]);
  sets.filter(r=>!(data.lineupHiddenDays||[]).includes(r.day||'Day TBD')).forEach(r=>items.push({view:'lineup',id:r.id,title:r.artist||r.name,day:r.day,detail:[r.day,r.stage,r.genre].filter(Boolean).join(' · '),artist:r.artist||r.name}));
  return items.filter(item=>sectionEnabled(item.view));
}

function openProjectSearch() {
  if(!data)return;
  closeMenu();
  const dialog=document.getElementById('projectSearch');
  document.getElementById('searchScope').textContent=`${data.name} · Only this project’s information`;
  document.getElementById('projectSearchInput').value='';
  renderProjectSearch();
  dialog.showModal();
  document.getElementById('projectSearchInput').focus();
}

function renderProjectSearch() {
  const query=document.getElementById('projectSearchInput').value.trim().toLowerCase();
  const words=query.split(/\s+/).filter(Boolean);
  const results=projectSearchItems().filter(item=>words.length?words.every(word=>`${item.title} ${item.detail}`.toLowerCase().includes(word)):!item.id);
  document.getElementById('searchResults').innerHTML=results.slice(0,80).map(item=>{
    const url=new URL(href(item.view),location.href);
    if(item.id)url.searchParams.set('focus',item.id);
    if(item.artist){url.searchParams.set('find',item.artist);if(item.day)url.searchParams.set('day',item.day);}
    return `<a href="${escapeAttr(url.pathname+url.search)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(views.find(([id])=>id===item.view)?.[1]||'')} · ${escapeHtml(item.detail||'')}</small></a>`;
  }).join('')+(results.length>80?'<p>Showing the first 80 matches. Keep typing to narrow your search.</p>':'')||'<p>No matches in this project. Try an artist, person, booking, or task name.</p>';
}

function focusSearchResult() {
  const id=new URLSearchParams(location.search).get('focus');
  if(!id)return;
  requestAnimationFrame(()=>{
    const attributes=['data-room-edit','data-edit','data-invite','data-car-edit','data-pass-edit','data-task','data-lineup-edit','data-note-id','data-meetup-id'];
    const target=[...el.page.querySelectorAll(attributes.map(a=>`[${a}]`).join(','))].find(node=>attributes.some(a=>node.getAttribute(a)===id));
    const flight=[...el.page.querySelectorAll('[data-flight-leg]')].find(node=>{const [trip,leg]=node.dataset.flightLeg.split(':').map(Number);return flightItineraries()[trip]?.legs[leg]?.ids.includes(id);});
    const memberCard=activeView==='crew'?el.page.querySelectorAll('.member-card')[data.members.findIndex(member=>member.id===id)]:null;
    const card=memberCard||(target||flight)?.closest('article');
    if(card){card.classList.add('search-highlight');card.scrollIntoView({block:'center'});}
  });
}

function href(view, eventId = activeEvent) {
  const params = new URLSearchParams(); if (view !== "home") params.set("view", view); if (eventId) params.set("event", eventId);
  return `${BASE_PATH}${params.size ? `?${params}` : ""}`;
}

function heading(eyebrow, title, description, action = "") { return `<header class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${action}</header>`; }
function memberMap() { return Object.fromEntries(data.members.map((member) => [member.id, member])); }
function groupedFlights(){const groups=new Map();data.travel.forEach((trip)=>{const key=JSON.stringify([trip.airline,trip.number,trip.origin,trip.destination,trip.departure,trip.arrival,trip.confirmation||""]);if(!groups.has(key))groups.set(key,{...trip,ids:[],memberIds:[]});const group=groups.get(key);group.ids.push(trip.id);if(!group.memberIds.includes(trip.memberId))group.memberIds.push(trip.memberId)});return [...groups.values()].sort((left,right)=>String(left.departure).localeCompare(String(right.departure)))}
function flightItineraries(){const itineraries=[];groupedFlights().forEach((leg)=>{const travelers=[...leg.memberIds].sort().join("|"),departure=new Date(leg.departure).getTime();const itinerary=[...itineraries].reverse().find((item)=>{const previous=item.legs[item.legs.length-1],gap=departure-new Date(previous.arrival).getTime();return previous.destination===leg.origin&&item.travelerKey===travelers&&gap>=0&&gap<=24*60*60*1000&&((leg.confirmation&&item.confirmation===leg.confirmation)||(!leg.confirmation&&!item.confirmation))});if(itinerary)itinerary.legs.push(leg);else itineraries.push({confirmation:leg.confirmation||"",travelerKey:travelers,memberIds:leg.memberIds,legs:[leg]})});return itineraries}
function layoverLabel(arrival,departure){const minutes=Math.max(0,Math.round((new Date(departure)-new Date(arrival))/60000)),hours=Math.floor(minutes/60),rest=minutes%60;return `${hours?`${hours}h `:""}${rest?`${rest}m`:hours?"":"0m"} layover`}
function flightTime(value){if(!value)return "—";const date=new Date(value);return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(date)}
function flightDay(value){if(!value)return "Date not added";const date=new Date(value);return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric"}).format(date)}
function money(value){const amount=Number(value);return Number.isFinite(amount)&&amount>0?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(amount):"—"}

function renderHome() {
  const assigned = data.rooms.reduce((sum, room) => sum + room.memberIds.length, 0), capacity = data.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const days = eventDaysAway(data);
  const cards = [
    ["crew","●","Crew",`${data.members.length} going`,data.members.filter((m)=>m.origin!=="TBD").map((m)=>m.origin).join(" · ") || "Origins not added yet"],
    ["stay","▣","Stay",capacity ? `${assigned} of ${capacity} assigned` : "No rooms yet",data.rooms[0]?.hotel || "Add lodging"],
    ["travel","✈","Travel",`${new Set(data.travel.map((trip)=>trip.memberId)).size} of ${data.members.length} linked`,`${data.travel.length} flight legs · ${data.cars.length} cars`],
    ["passes","◇","Passes",`${data.passes.length} types tracked`,"Tickets, shuttles, and add-ons"],
    ["tasks","✓","Tasks",`${data.tasks.filter((task)=>task.status!=="done").length} open`,"Loose ends, owners, and status"],
    ["notes","≡","Notes",`${(data.notes||[]).length} shared notes`,"Tidbits and updates from the crew"],
  ];
  if (data.id === DEFAULT_EVENT || data.lineup?.length || data.isAdmin) cards.splice(0,0,["lineup","♫","Lineup",data.lineup?.length?`${data.lineup.length} performances`:"Lineup not added yet","Save favorites and see who else is interested"]);
  if(data.id===DEFAULT_EVENT)cards.splice(1,0,['meetups','⌖','Meetups',`${(data.meetups||[]).filter(m=>m.status==='planned').length} planned`,'Festival map and shared meeting spots']);
  el.page.innerHTML = `<section class="overview-header"><div><span class="eyebrow">${escapeHtml(data.presenter||"Project overview")}</span><h1>${escapeHtml(data.name)}</h1><p>⌖ ${escapeHtml(data.location)} · ${eventDateLine(data)}</p></div><div class="countdown"><strong>${days}</strong><span>days to go</span></div></section><div class="overview-grid">${cards.map(([view,icon,label,strong,small])=>`<a class="overview-tile" data-view="${view}" href="${href(view)}"><span class="overview-icon">${rallyIcon(view)}</span><span><small>${label}</small><strong>${strong}</strong><em>${escapeHtml(small)}</em></span><b>→</b></a>`).join("")}</div><section class="section-card"><header><div><span class="eyebrow">Loose ends</span><h2>Open tickets</h2></div><a class="primary" href="${href("tasks")}">Open board →</a></header><div class="row-list">${data.tasks.filter((task)=>task.status!=="done").slice(0,4).map((task)=>`<div class="row"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(memberMap()[task.assigneeId]?.name || "Unassigned")}</span></div>`).join("") || `<div class="empty">Nothing is waiting right now.</div>`}</div></section>`;
  if(data.id===DEFAULT_EVENT)window.RallyDino?.home(el.page);
  el.page.querySelectorAll('.overview-tile').forEach(card=>{if(!sectionEnabled(card.dataset.view))card.remove();});
  if(!sectionEnabled('tasks'))el.page.querySelector('.section-card')?.remove();
  if(data.isAdmin){
    el.page.querySelector('.overview-header').insertAdjacentHTML('afterend','<div class="section-settings-action"><button type="button" id="projectThemeButton">Project theme</button><button type="button" id="manageSections">Manage sections</button></div>');
    document.getElementById('manageSections').onclick=openSectionSettings;
    document.getElementById('projectThemeButton').onclick=openProjectTheme;
  }
}

function renderMeetups() {
  const eventId=activeEvent,owner=window.Clerk?.user?.id;
  let revision=0;
  const mount={};el.page.meetupMount=mount;
  const sameAccount=()=>owner===window.Clerk?.user?.id;
  const accept=room=>{
    if(!sameAccount())throw new Error('Your account changed. Reopen the project.');
    if(activeEvent===eventId&&activeView==='meetups'&&el.page.meetupMount===mount){data=room;updateOfflineStatus();}
    return room;
  };
  window.RallyMeetups.mount({root:el.page,room:data,offline:()=>offlineMode||!navigator.onLine,toast:showToast,
    query:async()=>{
      const requested=revision,room=await networkConvexCall('query','rally:get',{eventId});
      if(requested!==revision||!sameAccount())throw new Error('A newer meetup change is already being saved.');
      return accept(owner===RallyOffline.userId?RallyOffline.save(room):room);
    },
    mutate:async(action,payload)=>{
      if(!sameAccount())throw new Error('Your account changed. Reopen the project.');
      revision++;
      return accept(await convexMutation('rally:act',{eventId,action,payload}));
    },
  });
  if(!window.RallyCrewLocation)return;
  const locationRoot=document.createElement('div');el.page.querySelector('.meetups-plans').prepend(locationRoot);
  window.RallyCrewLocation.mount({root:locationRoot,room:data,owner:owner||RallyOffline.userId,
    query:()=>{if(!sameAccount())throw new Error('Account changed');return networkConvexCall('query','rally:crewLocations',{eventId});},
    mutate:(operation,sessionId,position)=>{if(!sameAccount())throw new Error('Account changed');return networkConvexCall('mutation','rally:shareCrewLocation',{eventId,operation,sessionId,...(position?{position}:{})});}
  });
}

function resumeCrewLocation(){
  const owner=window.Clerk?.user?.id||RallyOffline.userId,eventId=activeEvent;
  window.RallyCrewLocation?.checkOwner(owner);
  if(!window.RallyCrewLocation?.hasSession(owner,eventId))return;
  window.RallyCrewLocation.mount({root:document.createElement('div'),room:data,owner,
    query:()=>{if(owner!==(window.Clerk?.user?.id||RallyOffline.userId))throw new Error('Account changed');return networkConvexCall('query','rally:crewLocations',{eventId});},
    mutate:(operation,sessionId,position)=>{if(owner!==(window.Clerk?.user?.id||RallyOffline.userId))throw new Error('Account changed');return networkConvexCall('mutation','rally:shareCrewLocation',{eventId,operation,sessionId,...(position?{position}:{})});}
  });
}

function hotelAddress(room) {
  return String(room.address||'').trim() || (/^hyatt regency columbus$/i.test(String(room.hotel||'').trim())?'350 North High Street, Columbus, OH 43215':'');
}
function hotelLocation(room) {
  const address=hotelAddress(room),query=[room.hotel,address||data.location].filter(Boolean).join(', ');
  if(!query)return '';
  const url='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);
  const apple='https://maps.apple.com/?q='+encodeURIComponent(query);
  const googleIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#34a853" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z"/><path fill="#4285f4" d="M12 2a7 7 0 0 0-7 7l7 4 7-4a7 7 0 0 0-7-7Z"/><path fill="#fbbc04" d="m5 9 7 4-4 5C6.5 15.5 5 12 5 9Z"/><path fill="#ea4335" d="M12 2v11l7-4a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>';
  const appleIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="#e5efdf"/><path d="M3 16 21 7M8 2l4 20" stroke="white" stroke-width="5"/><path d="M3 16 21 7" stroke="#f4cf58" stroke-width="2"/><path d="m14 6 5 12-5-3-5 3Z" fill="#2785ed" stroke="white" stroke-width="1.2"/></svg>';
  return `<div class="hotel-location">${address?`<span>${escapeHtml(address)}</span>`:''}<div class="hotel-map-actions"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="hotel-map-link" aria-label="Open hotel in Google Maps" title="Google Maps">${googleIcon}</a><a href="${escapeAttr(apple)}" target="_blank" rel="noopener noreferrer" class="hotel-map-link" aria-label="Open hotel in Apple Maps" title="Apple Maps">${appleIcon}</a></div></div>`;
}
function noteSection(note) { return Object.hasOwn(noteSections,note.section) ? note.section : 'general'; }
function notesForSection(notes, section) { return notes.filter(note=>noteSection(note)===(Object.hasOwn(noteSections,section)?section:'general')); }
function noteReactions(note) {
  const map=memberMap();
  const reactionTypes={like:'👍',heart:'❤️',laugh:'😂',fire:'🔥',eyes:'👀',check:'✅'};
  const buttons=Object.entries(reactionTypes).map(([key,emoji])=>{
    const ids=note.reactions?.[key]||[],mine=ids.includes(data.currentMemberId);
    const names=ids.map(id=>map[id]?.name||'Former member').join(', ');
    return `<button type="button" data-note-react="${escapeAttr(note.id)}" data-emoji="${emoji}" aria-pressed="${mine}" aria-label="${escapeAttr(`${emoji}${names?': '+names:' — React'}`)}" title="${escapeAttr(names||'React')}" ${offlineMode?'disabled':''}>${emoji}${ids.length?` <span>${ids.length}</span>`:''}</button>`;
  }).join('');
  const used=Object.entries(note.reactions||{}).filter(([key,ids])=>reactionTypes[key]&&ids.length).map(([key,ids])=>`<details class="reaction-count"><summary aria-label="${escapeAttr(reactionTypes[key]+' · '+ids.length+' reactions')}" class="${ids.includes(data.currentMemberId)?'mine':''}">${reactionTypes[key]} <span>${ids.length}</span></summary><div class="reaction-names">${ids.map(id=>`<p>${escapeHtml(map[id]?.name||'Former member')}</p>`).join('')}</div></details>`).join('');
  return `<div class="note-tapbacks">${used}<details class="reaction-picker"><summary aria-label="React to note" title="React"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9M18 2v6m-3-3h6M8 14s1 3 4 3 4-3 4-3"/><circle cx="8" cy="10" r=".6"/><circle cx="14" cy="10" r=".6"/></svg></summary><div class="note-reactions" role="group" aria-label="Choose a reaction">${buttons}</div></details></div>`;
}
function noteCards(notes) {
  const map = memberMap();
  return [...notes].sort((a,b)=>b.createdAt-a.createdAt).map(note => {
    const name = map[note.authorId]?.name || note.authorName || 'Former member';
    const owner = note.authorId === data.currentMemberId;
    const date = new Date(note.createdAt);
    const stamp = date.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
    const section=noteSection(note);
    const badge=activeView==='notes'?`<a class="note-section-badge" href="${escapeAttr(href(section==='general'?'notes':section))}">${noteSections[section]}</a>`:'';
return `<article class="note-card" data-note-id="${escapeAttr(note.id)}"><header><span class="note-avatar" aria-hidden="true">${escapeHtml(initials(name))}</span><div><strong>${escapeHtml(name)}</strong><div class="note-date"><time datetime="${date.toISOString()}">${escapeHtml(stamp)}</time>${note.updatedAt>note.createdAt?' · Edited':''}</div></div>${badge}</header><div class="note-body">${note.richText?window.RallyNoteEditor.render(note):escapeHtml(note.body)}</div>${noteReactions(note)}${owner||data.isAdmin?`<footer>${owner?`<button type="button" data-note-edit="${escapeAttr(note.id)}" ${offlineMode?'disabled':''}>Edit</button>`:''}<button type="button" data-note-delete="${escapeAttr(note.id)}" ${offlineMode?'disabled':''}>Delete</button></footer>`:''}</article>`;
  }).join('') || '<div class="notes-empty"><h2>No notes yet</h2><p>Share a meetup spot, a reminder, or anything the crew should know.</p></div>';
}

function renderNoteList() {
  const list = document.getElementById('notesList');
  if (!list) return;
  list.innerHTML = noteCards(notesForSection(data.notes || [], list.dataset.section||'general'));
  list.querySelectorAll('.note-tapbacks details').forEach(detail=>{
    detail.addEventListener('toggle',()=>{if(detail.open)list.querySelectorAll('.note-tapbacks details[open]').forEach(other=>{if(other!==detail)other.open=false;});});
    detail.addEventListener('keydown',event=>{if(event.key==='Escape'){detail.open=false;detail.querySelector('summary').focus();}});
    detail.addEventListener('focusout',()=>setTimeout(()=>{if(!detail.contains(document.activeElement))detail.open=false;},0));
  });
  list.querySelectorAll('[data-note-react]').forEach(button=>button.onclick=async()=>{
    if(offlineMode)return showToast('Reconnect to react.');
    button.disabled=true;
    try{await saveNote(activeEvent,'react-note',{id:button.dataset.noteReact,emoji:button.dataset.emoji,active:button.getAttribute('aria-pressed')!=='true'});}
    catch(error){showToast(error.message||'Could not save reaction.');}
    finally{button.disabled=offlineMode;}
  });
  list.querySelectorAll('[data-note-edit]').forEach(button => button.onclick=()=>openEditNote(data.notes.find(note=>note.id===button.dataset.noteEdit)));
  list.querySelectorAll('[data-note-delete]').forEach(button => button.onclick=()=>{
    if(offlineMode)return showToast('Reconnect to delete notes.');
    const note=data.notes.find(note=>note.id===button.dataset.noteDelete), eventId=activeEvent;
    openDangerDialog('Delete this note?', 'This removes the note for everyone in this project.', 'Delete note', async()=>{
      await saveNote(eventId,'delete-note',{id:note.id,expectedUpdatedAt:note.updatedAt}); closeDialog(); showToast('Note deleted');
    });
  });
}

function updateNotesConnectivity() {
  const form=document.getElementById('noteComposer');
  if(!form)return;
  form.querySelector('fieldset').disabled=offlineMode;
  form.elements.body.richEditor?.setDisabled(offlineMode);
  document.getElementById('refreshNotes').disabled=offlineMode;
  document.getElementById('notesStatus').textContent=offlineMode?'Offline · Saved notes. Reconnect to post or refresh.':'';
  document.querySelectorAll('[data-note-edit],[data-note-delete],[data-note-react]').forEach(button=>button.disabled=offlineMode);
}

function renderNotes() {
  el.page.innerHTML=heading('Shared with your crew','General notes','Project-wide updates. Hotel notes live in Stay; other details stay in their own section.', '<button id="refreshNotes" class="secondary" type="button">Refresh</button>')+notesBoardMarkup('general');
  wireNotes('general');
}

function renderSectionNotes(section) {
  el.page.insertAdjacentHTML('beforeend',`<section class="section-notes" aria-label="${noteSections[section]} notes"><header class="section-notes-heading"><div><h2>${noteSections[section]} notes</h2><p>Shared details for the crew.</p></div><button id="refreshNotes" class="secondary" type="button">Refresh notes</button></header>${notesBoardMarkup(section)}</section>`);
  wireNotes(section);
}

function notesBoardMarkup(section) {
  const placeholder={stay:'Check-in details, parking, room reminders…',crew:'Meetup plans, contact details, crew reminders…',travel:'Airport pickup, baggage, flight reminders…',passes:'Shuttle pickup, ticket transfers, entry reminders…'}[section]||'Meetup spot, useful link, last-minute reminder…';
return `<div class="notes-board"><form id="noteComposer" class="note-composer"><fieldset><label for="noteBody">${`Leave a ${noteSections[section].toLowerCase()} note`}</label><textarea id="noteBody" name="body" rows="3" maxlength="4000" required placeholder="${placeholder}"></textarea><div class="note-composer-footer"><small>Visible to everyone in this project</small><button class="primary" type="submit">Post note</button></div></fieldset><p id="noteError" class="note-error" role="alert" hidden></p></form><p id="notesStatus" class="notes-status" role="status"></p><section id="notesList" data-section="${section}" aria-label="Shared notes"></section></div>`;
}

function wireNotes(section) {
  const eventId=activeEvent;
  const form=document.getElementById('noteComposer');
  window.RallyNoteEditor.mount(form.elements.body);
  renderNoteList(); updateNotesConnectivity();
  form.onsubmit=async event=>{
    event.preventDefault();
    const input=form.elements.body, error=form.querySelector('#noteError'), fieldset=form.querySelector('fieldset');
    if(offlineMode)return showToast('Reconnect to post your note.');
    if(!input.value.trim())return input.richEditor?input.richEditor.focus():input.focus();
    fieldset.disabled=true; error.hidden=true;
    input.richEditor?.setDisabled(true);
    try { await saveNote(eventId,'add-note',{...(input.richEditor?input.richEditor.getValue():{body:input.value}),section}); input.value=''; input.richEditor?.clear(); showToast('Note posted'); }
    catch(reason){error.textContent=reason.message||'Could not post. Your draft is still here.';error.hidden=false;}
    finally {fieldset.disabled=offlineMode;input.richEditor?.setDisabled(offlineMode);}
  };
  document.getElementById('refreshNotes').onclick=refreshNotes;
  if(!offlineMode)void refreshNotes();
}

async function refreshNotes() {
  const eventId=activeEvent, view=activeView, revision=++notesRevision, status=document.getElementById('notesStatus');
  if(offlineMode||!status)return;
  status.textContent='Refreshing notes…';
  try {
    const room=await convexQuery('rally:get',{eventId});
    if(revision!==notesRevision||eventId!==activeEvent||activeView!==view)return;
    data.notes=room.notes||[]; renderNoteList(); focusSearchResult();
    status.textContent='Up to date · Newest notes first';
  } catch(error) {
    if(revision===notesRevision&&eventId===activeEvent&&activeView===view)status.textContent='Could not refresh. Showing saved notes; try again when connected.';
  }
}

async function saveNote(eventId,action,payload) {
  if(offlineMode)throw new Error('Reconnect to change notes.');
  const owner=window.Clerk?.user?.id;
  ++notesRevision;
  const room=await convexMutation('rally:act',{eventId,action,payload});
  ++notesRevision;
  if(owner===window.Clerk?.user?.id&&eventId===activeEvent){
    data=room;
    if(document.getElementById('notesList')){renderNoteList();document.getElementById('notesStatus').textContent='Saved · Newest notes first';}
  }
}

function openEditNote(note) {
  if(!note||offlineMode)return;
  const eventId=activeEvent;
  let editor;
  openDialog(`Edit ${noteSections[noteSection(note)].toLowerCase()} note`,`Shared with your crew in ${noteSections[noteSection(note)]} only.`,`<div class="field"><span>Note</span><textarea class="note-edit-body" name="body" rows="7" maxlength="4000" required>${escapeHtml(note.body)}</textarea></div>`,async values=>{
    const content=editor.getValue();editor.setDisabled(true);
    try{await saveNote(eventId,'edit-note',{id:note.id,...content,section:noteSection(note),expectedUpdatedAt:note.updatedAt});closeDialog();showToast('Note updated');}
    finally{editor.setDisabled(false);}
  });
  editor=window.RallyNoteEditor.mount(el.dialogRoot.querySelector('[name="body"]'),note);
}

function renderCrew() {
  el.page.innerHTML = heading(`${data.members.length} people`,"The crew","Invite each person to claim their existing profile.",data.isAdmin?`<button id="inviteCrew" class="primary">＋ Invite crew</button>`:"") + `<div class="toolbar"><label class="search">⌕ <input id="crewSearch" placeholder="Search the crew"></label></div><div id="memberGrid" class="member-grid">${memberCards(data.members)}</div>`;
  document.getElementById("inviteCrew")?.addEventListener("click",()=>openInvite());
  document.getElementById("crewSearch").addEventListener("input",(event)=>{ document.getElementById("memberGrid").innerHTML=memberCards(data.members.filter((m)=>`${m.name} ${m.email} ${m.origin}`.toLowerCase().includes(event.target.value.toLowerCase()))); wireMemberCards(); });
  wireMemberCards();
}

function memberReadiness(member) {
  return [['passes','Pass',memberHasTicket(member.id)],['stay','Stay',data.rooms.some(room=>room.memberIds?.includes(member.id))],['travel','Flight',data.travel.some(trip=>trip.memberId===member.id)]]
    .filter(([section])=>sectionEnabled(section)).map(([,label,ready])=>`<span>${ready?'✓':'○'} ${label}</span>`).join('');
}
function memberCards(members) { return members.map((member)=>{ const current=member.id===data.currentMemberId, admin=["admin","leader"].includes(member.role); return `<article class="member-card"><div class="avatar-bubble avatar-${escapeAttr(member.color||'purple')}">${escapeHtml(initials(member.name))}</div><div><h3>${escapeHtml(member.name)}${admin?`<span class="badge">Admin</span>`:""}${current?`<span class="badge">You</span>`:""}</h3><p>${escapeHtml(member.email || "Not invited yet")}</p></div><span class="origin">${escapeHtml(member.origin)}</span><footer><div class="checks">${memberReadiness(member)}</div>${current?`<button class="member-action" data-edit="${escapeAttr(member.id)}">Edit my profile</button>`:data.isAdmin&&!admin?`<div class="member-actions">${member.status!=="confirmed"?`<button class="member-action" data-invite="${escapeAttr(member.id)}">${member.status==="invited"?"Resend invite":"Invite"}</button>`:`<span class="claimed-label">Claimed</span>`}<button class="member-action remove" data-remove-member="${escapeAttr(member.id)}">Remove</button></div>`:""}</footer></article>`; }).join(""); }
function wireMemberCards(){ document.querySelectorAll("[data-invite]").forEach((button)=>button.addEventListener("click",()=>openInvite(data.members.find((m)=>m.id===button.dataset.invite)))); document.querySelectorAll("[data-edit]").forEach((button)=>button.addEventListener("click",()=>openProfile(data.members.find((m)=>m.id===button.dataset.edit)))); document.querySelectorAll("[data-remove-member]").forEach((button)=>button.addEventListener("click",()=>openRemoveMember(data.members.find((m)=>m.id===button.dataset.removeMember)))); }

function renderStay(){ const map=memberMap(); el.page.innerHTML=heading("Lodging plan","Stay","Hotel rooms, confirmations, capacity, bathrooms, and who sleeps where.",`<button id="addRoom" class="primary">＋ Add room</button>`)+`<div class="room-grid">${data.rooms.map((room,index)=>{const bathrooms=Number(room.bathrooms)||1;return `<article class="room-card"><header><span>Room ${index+1}</span>${room.confirmation?`<span>Confirmation ${escapeHtml(room.confirmation)}</span>`:""}</header><div class="room-identity"><div><h3>${escapeHtml(room.hotel)}</h3><p class="room-type">${escapeHtml(room.roomType)}</p></div><button class="room-edit" data-room-edit="${room.id}" aria-label="Edit ${escapeAttr(room.hotel)}">•••</button></div>${hotelLocation(room)}${room.notes?`<p class="room-note">${escapeHtml(room.notes)}</p>`:""}${room.totalCost?`<strong class="room-price">${escapeHtml(room.totalCost)}</strong>`:""}<div class="room-stats"><span><strong>${room.capacity}</strong> sleeps</span><span><strong>${bathrooms}</strong> ${bathrooms===1?"bathroom":"bathrooms"}</span></div><div class="meter"><i style="width:${Math.min(100,room.memberIds.length/room.capacity*100)}%"></i></div><small>${room.memberIds.length} assigned · ${room.capacity-room.memberIds.length} open</small><div class="row-list">${room.memberIds.map((id)=>`<div class="row"><strong>${escapeHtml(map[id]?.name||"Crew")}</strong><span>${escapeHtml(map[id]?.origin||"")}</span></div>`).join("")}<button class="secondary" data-assign-room="${room.id}">＋ Assign person</button></div></article>`}).join("")||`<div class="empty">No rooms added yet.</div>`}</div>`; document.getElementById("addRoom").onclick=()=>openRoom(); document.querySelectorAll("[data-room-edit]").forEach((b)=>b.onclick=()=>openRoom(data.rooms.find((r)=>r.id===b.dataset.roomEdit))); document.querySelectorAll("[data-assign-room]").forEach((b)=>b.onclick=()=>openAssign(b.dataset.assignRoom)); }

function renderTravel(){const map=memberMap(),itineraries=flightItineraries();el.page.innerHTML=heading("Trip itineraries","Travel","Connecting flights stay together as one trip, with every leg and layover shown in order.",`<div><button id="addCar" class="secondary">＋ Rental car</button> <button id="addFlight" class="primary">＋ Add flight leg</button></div>`)+`<div class="flight-board">${itineraries.map((trip,tripIndex)=>{const first=trip.legs[0],last=trip.legs[trip.legs.length-1];return `<article class="itinerary-card"><header class="itinerary-head"><div><span class="eyebrow">${escapeHtml(flightDay(first.departure))} · ${trip.legs.length} ${trip.legs.length===1?"leg":"legs"}</span><h3>${escapeHtml(first.origin)} → ${escapeHtml(last.destination)}</h3></div>${trip.confirmation?`<span class="confirmation-pill">${escapeHtml(trip.confirmation)}</span>`:""}</header><div class="itinerary-legs">${trip.legs.map((leg,legIndex)=>`${legIndex?`<div class="layover"><span>${escapeHtml(leg.origin)}</span><b>${escapeHtml(layoverLabel(trip.legs[legIndex-1].arrival,leg.departure))}</b></div>`:""}<section class="itinerary-leg"><button class="room-edit" data-flight-leg="${tripIndex}:${legIndex}" aria-label="Edit ${escapeAttr(leg.airline)} ${escapeAttr(leg.number)}">•••</button><div class="leg-flight"><strong>${escapeHtml(leg.airline)} ${escapeHtml(leg.number)}</strong><small>${escapeHtml(flightDay(leg.departure))}</small></div><div class="leg-stop"><strong>${escapeHtml(leg.origin)}</strong><span>${escapeHtml(flightTime(leg.departure))}</span></div><i><span>✈</span><b></b></i><div class="leg-stop end"><strong>${escapeHtml(leg.destination)}</strong><span>${escapeHtml(flightTime(leg.arrival))}</span></div></section>`).join("")}</div><footer class="flight-travelers"><small>${trip.memberIds.length} ${trip.memberIds.length===1?"traveler":"travelers"}</small><div>${trip.memberIds.map((id)=>`<span class="traveler-chip"><i class="avatar-${map[id]?.color||"purple"}">${escapeHtml(map[id]?.initials||"?")}</i>${escapeHtml(map[id]?.name||"Crew")}</span>`).join("")}</div></footer></article>`}).join("")||`<div class="empty">No flights linked yet. Add each flight leg and Rally will connect matching layovers.</div>`}</div><section class="section-card"><header><div><span class="eyebrow">Ground transportation</span><h2>Rental cars</h2></div></header><div class="car-grid">${data.cars.map((car)=>`<article class="car-card editable-card"><button class="card-menu" data-car-edit="${car.id}" aria-label="Edit rental car">•••</button><h3>${escapeHtml(car.company)} · ${escapeHtml(car.vehicle)}</h3><p>${escapeHtml(car.pickup)} → ${escapeHtml(car.dropoff)}</p><small>Driver: ${escapeHtml(map[car.driverId]?.name||"Unassigned")}</small></article>`).join("")||`<div class="empty">No rental car stored.</div>`}</div></section>`;document.getElementById("addFlight").onclick=()=>openFlight();document.getElementById("addCar").onclick=()=>openCar();document.querySelectorAll("[data-flight-leg]").forEach((button)=>button.onclick=()=>{const[tripIndex,legIndex]=button.dataset.flightLeg.split(":").map(Number);openFlight(itineraries[tripIndex].legs[legIndex])});document.querySelectorAll("[data-car-edit]").forEach((button)=>button.onclick=()=>openCar(data.cars.find((car)=>car.id===button.dataset.carEdit)))}

function passQuantity(pass){return Math.min(500,Math.max(1,Math.floor(Number(pass.quantity)||1)));}
function ticketAssignee(pass,slot){return (pass.ticketAssignments||[]).find(item=>item.slot===slot)?.memberId||'';}
function memberHasTicket(id){return data.passes.some(pass=>(pass.category||'Pass')==='Pass'&&(pass.ticketAssignments||[]).some(item=>item.memberId===id&&item.slot>=0&&item.slot<passQuantity(pass)));}
function ticketDistributionMarkup(){
  if(!data.passes.length)return '<p class="ticket-distribution-empty">Add a purchase to start the distribution table.</p>';
  const map=memberMap();
  const columns=data.passes.map(pass=>{
    const quantities=new Map();
    for(let slot=0;slot<passQuantity(pass);slot++){
      const id=ticketAssignee(pass,slot);if(map[id])quantities.set(id,(quantities.get(id)||0)+1);
    }
    return {pass,quantities,assigned:[...quantities.values()].reduce((sum,count)=>sum+count,0)};
  });
  return `<div class="ticket-distribution-scroll" tabindex="0" role="region" aria-label="Ticket distribution by crew member; scroll to see all purchases"><table class="ticket-distribution-table" style="min-width:${(columns.length+1)*180}px"><caption>Ticket assignments by person and purchase</caption><thead><tr><th scope="col">Crew member</th>${columns.map(({pass})=>`<th scope="col"><strong>${escapeHtml(pass.name)}</strong><small>${escapeHtml(pass.category||'Pass')} · ${passQuantity(pass)} purchased</small><small>Buyer: ${escapeHtml(map[pass.ownerId]?.name||'Unassigned')}</small></th>`).join('')}</tr></thead><tbody>${data.members.map(member=>`<tr><th scope="row"><span>${escapeHtml(member.name)}</span><small>${memberHasTicket(member.id)?'Festival ticket assigned':'No festival ticket assigned'}</small></th>${columns.map(({quantities})=>{
    const count=quantities.get(member.id)||0;
    return `<td>${count?`<span class="ticket-distribution-count" aria-label="${count} ticket${count===1?'':'s'} assigned">${count}</span>`:'<span class="ticket-distribution-none" aria-label="No tickets assigned">—</span>'}</td>`;
  }).join('')}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">Assigned</th>${columns.map(({assigned})=>`<td>${assigned}</td>`).join('')}</tr><tr><th scope="row">Available</th>${columns.map(({pass,assigned})=>`<td>${passQuantity(pass)-assigned}</td>`).join('')}</tr></tfoot></table></div><p class="ticket-distribution-help">Numbers show how many tickets each person has. Edit individual assignments in the purchases below.</p>`;
}
function ticketCoverageMarkup(){
  const covered=new Set(data.passes.filter(pass=>(pass.category||'Pass')==='Pass').flatMap(pass=>(pass.ticketAssignments||[]).filter(item=>item.slot>=0&&item.slot<passQuantity(pass)).map(item=>item.memberId)));
  const count=data.members.filter(member=>covered.has(member.id)).length;
  return `<section class="ticket-coverage" aria-label="Crew ticket coverage"><header><div><h2>Ticket distribution</h2><p>${count} of ${data.members.length} people assigned a festival ticket</p></div><button class="secondary" type="button" id="refreshTickets" ${offlineMode?'disabled':''}>Refresh tickets</button></header><details class="ticket-coverage-list"><summary>Assignments by person <span aria-hidden="true">⌄</span></summary>${ticketDistributionMarkup()}</details><p class="ticket-coverage-note">Assignments don’t transfer tickets or record payment. Missing someone? <a href="${href('crew')}">Add them in Crew.</a></p></section>`;
}
function renderPasses(){
  el.page.innerHTML=heading('Purchase ledger','Passes & shuttles','Track the original buyer, then assign each ticket to someone in your crew.',`<button id="addPass" class="primary" ${offlineMode?'disabled':''}>＋ Add purchase</button>`)+'<div id="ticketPurchaseBoard"></div>';
  document.getElementById('addPass').onclick=()=>openPass();
  renderTicketBoard();
}
function renderTicketBoard(){
  const board=document.getElementById('ticketPurchaseBoard');if(!board)return;
  const expanded=board.querySelector('.ticket-coverage-list')?.open;
  const tableScroll=board.querySelector('.ticket-distribution-scroll');
  const scroll={left:tableScroll?.scrollLeft||0,top:tableScroll?.scrollTop||0};
  const focused=board.contains(document.activeElement)?{passId:document.activeElement.dataset.ticketPass,slot:document.activeElement.dataset.ticketSlot}:null;
  const map=memberMap();
  board.innerHTML=ticketCoverageMarkup()+`<div class="pass-grid">${data.passes.map(pass=>{
    const quantity=passQuantity(pass),total=Number(pass.totalCost)>0?pass.totalCost:Number(pass.unitCost)>0?Number(pass.unitCost)*quantity:'';
    const assigned=Array.from({length:quantity},(_,slot)=>Boolean(map[ticketAssignee(pass,slot)])).filter(Boolean).length;
    return `<article class="pass-card purchase-card editable-card"><button type="button" class="card-menu" data-pass-edit="${escapeAttr(pass.id)}" aria-label="Edit purchase details: ${escapeAttr(pass.name)}" ${offlineMode?'disabled':''}>${rallyIcon('ellipsis')}</button><div class="purchase-head"><span class="eyebrow">${escapeHtml(pass.category||'Pass')}</span><span class="quantity-pill">× ${quantity}</span></div><h3>${escapeHtml(pass.name)}</h3><div class="purchase-meta"><div><small>Original buyer</small><strong>${escapeHtml(map[pass.ownerId]?.name||'Unassigned')}</strong></div><div><small>Cost each</small><strong>${money(pass.unitCost)}</strong></div><div><small>Total paid</small><strong>${money(total)}</strong></div></div><section class="purchase-assignments" aria-label="Ticket assignments"><h4>${assigned} assigned · ${quantity-assigned} available</h4><ol class="ticket-slots">${Array.from({length:quantity},(_,slot)=>{
      const id=ticketAssignee(pass,slot),member=map[id];
      return `<li><button type="button" data-ticket-pass="${escapeAttr(pass.id)}" data-ticket-slot="${slot}" ${offlineMode?'disabled':''} aria-label="${member?'Change':'Assign'} ticket ${slot+1} for ${escapeAttr(pass.name)}${member?' · '+escapeAttr(member.name):''}"><span class="ticket-slot-number">${slot+1}</span><span class="ticket-slot-person">${member?escapeHtml(member.name):'<span class="ticket-unassigned">Assign to someone</span>'}${id&&!member?'<small>Previous person left the crew</small>':''}</span><span aria-hidden="true">${member?'↗':'+'}</span></button></li>`;
    }).join('')}</ol></section><footer>${pass.status?`<span class="purchase-status">${escapeHtml(pass.status)}</span>`:''}${pass.notes?`<small>${escapeHtml(pass.notes)}</small>`:''}</footer></article>`;
  }).join('')||'<div class="empty">No purchases yet. Add a purchase to start assigning tickets.</div>'}</div>`;
  board.querySelector('.ticket-coverage-list').open=expanded===undefined?true:expanded;
  const newTableScroll=board.querySelector('.ticket-distribution-scroll');
  if(newTableScroll){newTableScroll.scrollLeft=scroll.left;newTableScroll.scrollTop=scroll.top;}
  document.querySelectorAll('[data-pass-edit]').forEach(button=>button.onclick=()=>openPass(data.passes.find(pass=>pass.id===button.dataset.passEdit)));
  document.querySelectorAll('[data-ticket-slot]').forEach(button=>button.onclick=()=>openTicketAssignment(data.passes.find(pass=>pass.id===button.dataset.ticketPass),Number(button.dataset.ticketSlot)));
  document.getElementById('refreshTickets').onclick=()=>refreshTickets();
  if(focused?.passId)[...board.querySelectorAll('[data-ticket-slot]')].find(button=>button.dataset.ticketPass===focused.passId&&button.dataset.ticketSlot===focused.slot)?.focus({preventScroll:true});
}
async function refreshTickets(){
  if(offlineMode)return showToast('Reconnect to refresh tickets.');
  const button=document.getElementById('refreshTickets'),eventId=activeEvent,owner=window.Clerk?.user?.id;
  if(button)button.disabled=true;
  try{
    const room=await convexQuery('rally:get',{eventId});
    if(eventId!==activeEvent||owner!==window.Clerk?.user?.id)return;
    data.passes=room.passes;data.members=room.members;RallyOffline.save?.(data);
    if(activeView==='passes'&&!el.dialogRoot.children.length)renderTicketBoard();
  }catch(error){showToast(error.message||'Could not refresh tickets.');}
  finally{if(button?.isConnected)button.disabled=offlineMode;}
}
async function saveTicketChange(action,payload,eventId=activeEvent){
  if(offlineMode)throw new Error('Reconnect to change tickets.');
  const owner=window.Clerk?.user?.id;
  const result=await convexMutation('rallyTickets:update',{eventId,action,payload});
  if(eventId!==activeEvent||owner!==window.Clerk?.user?.id)return false;
  data.passes=result.passes;RallyOffline.save?.(data);return true;
}
function openTicketAssignment(pass,slot){
  if(!pass)return;
  if(offlineMode)return showToast('Reconnect to change tickets.');
  const eventId=activeEvent,expectedMemberId=ticketAssignee(pass,slot);
  const selected=data.members.some(member=>member.id===expectedMemberId)?expectedMemberId:'';
  openDialog(`Assign ticket ${slot+1}`,escapeHtml(pass.name)+' · Anyone in this project can assign tickets, including to crew who haven’t signed in yet.',selectField('Ticket holder','memberId',[['','Unassigned'],...data.members.map(member=>[member.id,member.name])],selected)+`<p class="ticket-assignment-help">This won’t change the original buyer or transfer the actual ticket.</p>`,async values=>{
    if(await saveTicketChange('assign',{passId:pass.id,slot,memberId:values.memberId,expectedMemberId},eventId)){closeDialog();renderTicketBoard();showToast(values.memberId?'Ticket assigned':'Ticket unassigned');}
  });
}

function renderTasks(){ const map=memberMap(), columns=[["todo","To do"],["doing","In progress"],["done","Done"]]; el.page.innerHTML=heading("Trip operations","Tickets","Drag tickets between columns. Click a ticket to edit or assign it.",`<button id="newTicket" class="primary">＋ New ticket</button>`)+`<div class="kanban">${columns.map(([id,label])=>`<section class="column" data-column="${id}"><header><span>${label}</span><b>${data.tasks.filter((task)=>task.status===id).length}</b></header>${data.tasks.filter((task)=>task.status===id).map((task)=>`<article class="ticket-card" draggable="true" data-task="${task.id}"><h3>${escapeHtml(task.title)}</h3><div class="ticket-meta"><span>${escapeHtml(task.category)}</span><strong>${escapeHtml(map[task.assigneeId]?.name||"Unassigned")}</strong></div></article>`).join("")}</section>`).join("")}</div>`; document.getElementById("newTicket").onclick=()=>openTask(); document.querySelectorAll("[data-task]").forEach((card)=>{ card.onclick=()=>openTask(data.tasks.find((task)=>task.id===card.dataset.task)); card.ondragstart=()=>{draggedTask=card.dataset.task;card.classList.add("dragging")}; card.ondragend=()=>{draggedTask=null;card.classList.remove("dragging")}; }); document.querySelectorAll("[data-column]").forEach((column)=>{ column.ondragover=(event)=>{event.preventDefault();column.classList.add("drop")}; column.ondragleave=()=>column.classList.remove("drop"); column.ondrop=async(event)=>{event.preventDefault();column.classList.remove("drop");if(draggedTask)await act("move-task",{id:draggedTask,status:column.dataset.column},"Ticket moved")}; }); }

function renderLineup(){
  const searchRoute=new URLSearchParams(location.search);
  const filters=new URLSearchParams(location.hash.slice(1));
  if(searchRoute.get('find'))filters.set('q',searchRoute.get('find'));
  if(searchRoute.get('day'))filters.set('days',searchRoute.get('day'));
  window.RallyLineup.show({
    container:document.getElementById('lineupView'),key:`${data.id}:${data.currentMemberId}`,
    state:lineupState(),params:filters.size?filters.toString():null,
    event:{id:data.id,name:data.name,startsAt:data.startsAt,endsAt:data.endsAt,timeZone:RallyEvents.zoneFor(data)||'UTC',lineup:data.id===DEFAULT_EVENT?window.LOST_LANDS_SET_TIMES||data.lineup||[]:data.lineup||[],lineupBlocks:data.lineupBlocks||[],orderNote:data.lineupOrderNote||'',source:data.lineupSource||''},
    shareUrl:`https://www.john-ta.com${href('lineup')}`,
    onEvent:handleLineupEvent,
    onToast:showToast,
    onParams(params){
      if(activeView!=='lineup')return;
      const url=new URL(location.href);url.hash=params.toString();
      url.searchParams.delete('find');url.searchParams.delete('day');
      history.replaceState({},'',url.pathname+url.search+url.hash);
    }
  });
  lineupRefreshTimer=setInterval(refreshLineupState,15000);
  return;
}
function lineupState(){const currentMember=data.members.find((member)=>member.id===data.currentMemberId);return {type:"rally-lineup-state",projectTheme:data.projectTheme||'warm',reviewMode:RallyEvents.lifecycle(data).finished||RallyEvents.lifecycle(data).past,artistIds:data.currentLineupFavorites||[],interests:data.lineupInterests||{},currentMember,hiddenDays:data.lineupHiddenDays||[],canManageDays:data.isAdmin&&!offlineMode};}
function sendLineupState(){window.RallyLineup?.receive(lineupState());applyProjectTheme();}
async function refreshLineupState(){if(activeView!=="lineup")return;const eventId=activeEvent;try{const updated=await convexQuery("rally:get",{eventId});if(!updated||activeEvent!==eventId||activeView!=="lineup")return;const changed=JSON.stringify([data.lineup,data.lineupBlocks])!==JSON.stringify([updated.lineup,updated.lineupBlocks]);data=updated;if(changed&&data.id!==DEFAULT_EVENT){clearInterval(lineupRefreshTimer);renderLineup();}else sendLineupState()}catch(error){console.warn("Could not refresh lineup interests",error)}}
function openLineupDays() {
  if (!data?.isAdmin) return;
  if (offlineMode) return showToast('Reconnect to change project settings.');
  const eventId = activeEvent;
  const catalog = data.id === DEFAULT_EVENT ? window.LOST_LANDS_SET_TIMES || data.lineup || [] : data.lineup || [];
  const days = [...new Set(catalog.map(entry => entry.day || 'Day TBD'))];
  if (!days.length) return showToast('Add a lineup before managing days.');
  const hidden = new Set(data.lineupHiddenDays || []);
  openDialog('Manage lineup days','Checked days appear for everyone in this project. Hidden sets and saved favorites are kept, so you can restore them anytime.',
    `<div class="lineup-day-settings">${days.map((day,index)=>`<label><input type="checkbox" name="day${index}" ${hidden.has(day)?'':'checked'}><span>${escapeHtml(day)}</span><small>${catalog.filter(entry=>(entry.day||'Day TBD')===day).length} sets</small></label>`).join('')}</div>`,
    async values => {
      const hiddenDays = days.filter((day,index)=>!values[`day${index}`]);
      if (hiddenDays.length === days.length) throw new Error('Keep at least one lineup day visible.');
      const updated = await convexMutation('rally:act',{eventId,action:'save-lineup-days',payload:{hiddenDays}});
      closeDialog();
      if (activeEvent === eventId) { data=updated; if(data.id===DEFAULT_EVENT)sendLineupState();else render(); }
      showToast('Lineup days updated for everyone');
    });
}

async function handleLineupEvent(message) {
  if(activeView!=='lineup'||!message)return;
  const event={data:message};
  if(event.data.type === "rally-lineup-ready") { sendLineupState(); sendLineupLayout(); return; }
  if(event.data.type === 'rally-lineup-manage-days') { openLineupDays(); return; }
  if(event.data.type === 'rally-lineup-add') { if(data.isAdmin&&!offlineMode)openLineupArtist(); return; }
  if(event.data.type === 'rally-lineup-edit') { if(data.isAdmin&&!offlineMode)openLineupArtist((data.lineup||[]).find(set=>set.id===event.data.id)); return; }
  if(event.data.type === 'rally-lineup-overlay') { document.body.classList.toggle('lineup-overlay',event.data.open===true); return; }
  if(event.data.type !== "rally-lineup-favorites-changed" || !Array.isArray(event.data.artistIds)) return;
  const eventId = activeEvent;
  const memberId = data.currentMemberId;
  const artistIds = [...new Set(event.data.artistIds.filter(id => typeof id === "string"))];
  try {
    const updated = await convexMutation("rally:act", {eventId, action:"save-lineup-favorites", payload:{artistIds}});
    if(activeEvent !== eventId || data.currentMemberId !== memberId) return;
    data = updated;
    if(activeView==='lineup')sendLineupState();
    window.RallyLineup?.receive({type:"rally-lineup-favorites-saved",offline:RallyOffline.pendingCount>0});
  } catch(error) { showToast(error.message || "Could not save lineup favorites"); }
}

function dialogTrigger(){
  let node=document.activeElement;
  while(node?.shadowRoot?.activeElement)node=node.shadowRoot.activeElement;
  return node;
}
function openDialog(title,description,formHtml,onSubmit,footerHtml=""){
  const returnFocus=dialogTrigger();closeDialog({preserveRoute:true});
  el.dialogRoot.innerHTML=`<div class="dialog-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="rallyDialogTitle"><button type="button" class="dialog-close" aria-label="Close dialog">×</button><span class="eyebrow">Rally project room</span><h2 id="rallyDialogTitle">${title}</h2><p>${description}</p><form>${formHtml}<div class="dialog-actions${footerHtml?" split":""}"><button class="primary" type="submit">Save</button>${footerHtml}</div></form></section></div>`;
  const backdrop=el.dialogRoot.firstElementChild,form=backdrop.querySelector('form');
  enhanceDialogSelects(form);wireDialog(backdrop,returnFocus);
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;
    button.disabled=true;
    try{await onSubmit(Object.fromEntries(new FormData(form)));}
    catch(error){if(form.isConnected)showToast(error.message||'Could not save');}
    finally{if(button.isConnected)button.disabled=false;}
  };
}
function wireDangerButton(id,onDelete){const button=document.getElementById(id);if(!button)return;button.onclick=async()=>{if(button.dataset.confirm!=="true"){button.dataset.confirm="true";button.classList.add("armed");button.textContent="Click again to delete";return}button.disabled=true;try{await onDelete()}catch(error){showToast(error.message||"Could not delete");button.disabled=false}};}
function openDangerDialog(title,description,label,onDelete){
  const returnFocus=dialogTrigger();closeDialog();
  el.dialogRoot.innerHTML=`<div class="dialog-backdrop"><section class="dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="rallyDialogTitle"><button type="button" class="dialog-close" aria-label="Close dialog">×</button><span class="eyebrow">Rally project room</span><h2 id="rallyDialogTitle">${title}</h2><p>${description}</p><div class="dialog-actions split"><button id="cancelDanger" class="secondary" type="button">Cancel</button><button id="confirmDanger" class="danger-button armed" type="button">${label}</button></div></section></div>`;
  wireDialog(el.dialogRoot.firstElementChild,returnFocus);
  document.getElementById('cancelDanger').onclick=closeDialog;
  const button=document.getElementById('confirmDanger');
  button.onclick=async()=>{
    if(button.disabled)return;button.disabled=true;
    try{await onDelete();}catch(error){if(button.isConnected)showToast(error.message||'Could not remove');}
    finally{if(button.isConnected)button.disabled=false;}
  };
}
function wireDialog(backdrop,returnFocus){
  el.dialogRoot.returnFocus=returnFocus;el.rallyApp.inert=true;
  const close=backdrop.querySelector('.dialog-close');close.onclick=closeDialog;
  backdrop.onmousedown=event=>{if(event.target===backdrop)closeDialog();};
  backdrop.onkeydown=event=>{
    if(event.defaultPrevented)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDialog();}
    if(event.key==='Tab'){
      const focusable=[...backdrop.querySelectorAll('button,input,textarea,select,a[href],[tabindex],[contenteditable="true"]')].filter(node=>!node.disabled&&(node.tabIndex>=0||node.isContentEditable)&&!node.hidden&&node.getClientRects().length);
      const target=event.shiftKey?focusable.at(-1):focusable[0],edge=event.shiftKey?focusable[0]:focusable.at(-1);
      if(target&&(document.activeElement===edge||!backdrop.contains(document.activeElement))){event.preventDefault();target.focus();}
    }
  };
  close.focus({preventScroll:true});
}
function enhanceDialogSelects(form){
  form.querySelectorAll('select').forEach((select,index)=>{
    select.id ||= 'rally-dialog-select-'+index;
    select.setAttribute('aria-label',select.closest('label')?.querySelector('span')?.textContent||select.name);
    window.SearchableSelect?.enhance(select);
  });
}
function closeDialog(options={}){
  window.RallyInvites?.dismiss(options);
  el.dialogRoot.querySelectorAll('select').forEach(select=>window.SearchableSelect?.enhance(select).destroy());
  el.dialogRoot.innerHTML="";
  el.rallyApp.inert=false;
  if(el.dialogRoot.returnFocus?.isConnected)el.dialogRoot.returnFocus.focus({preventScroll:true});
  el.dialogRoot.returnFocus=null;
  if(themePreview){themePreview=null;applyProjectTheme();}
}
function field(label,name,value="",type="text",required=true){return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeAttr(value)}" ${required?"required":""}></label>`}
function selectField(label,name,options,value=""){return `<label class="field"><span>${label}</span><select name="${name}">${options.map(([id,text])=>`<option value="${escapeAttr(id)}" ${id===value?"selected":""}>${escapeHtml(text)}</option>`).join("")}</select></label>`}

function openInvite(member){return window.RallyInvites?window.RallyInvites.open(member):openEmailInvite(member);}
async function openEmailInvite(member){const context=projectContext();let shared=[];try{shared=await convexQuery("rally:sharedCrewCandidates",{eventId:context.eventId})}catch(error){return showToast(error.message||"Could not load invite options")}try{assertProjectContext(context);if(context.dialog!==el.dialogRoot.firstElementChild)return;}catch{return;}const profiles=data.members.filter((person)=>!["admin","leader"].includes(person.role)&&(person.status!=="confirmed"||!person.email)),selected=member||null,choice=(person,attribute,value)=>`<button type="button" ${attribute}="${escapeAttr(value)}" class="${selected?.id===person.id?"selected":""}"><i class="avatar-${person.color||"purple"}">${escapeHtml(person.initials||initials(person.name))}</i>${escapeHtml(person.name)}</button>`,profilePicker=profiles.length?`<div class="invite-section"><span>Unclaimed profiles in this room</span><div class="member-picker">${profiles.map((person)=>choice(person,"data-invite-profile",person.id)).join("")}</div></div>`:"",sharedPicker=shared.length?`<div class="invite-section"><span>From your other crews</span><div class="member-picker">${shared.map((person,index)=>choice(person,"data-invite-shared",index)).join("")}</div></div>`:"";openDialog("Invite crew","Add someone by exact email, or choose a person you already share another Rally room with. Rally never exposes a global user directory.",`<input type="hidden" name="memberId" value="${escapeAttr(selected?.id||"")}">${profilePicker}${sharedPicker}${field("Name","name",selected?.name||"")}${field("Email address","email",selected?.email||"","email")}${field("Home airport or city","origin",selected?.origin==="TBD"?"":selected?.origin||"","text",false)}<p class="invite-privacy">Existing Clerk users get access with this verified email. New users receive a secure signup invitation.</p>`,async(values)=>{const submitContext=projectContext();const result=await convexAction("rally:sendInvitation",{eventId:context.eventId,...values});assertProjectContext(submitContext);data=result.room;window.RallyInvites?.clearEmailDraft();closeDialog();render();showToast(`Clerk invite sent to ${result.memberName}`)});const form=el.dialogRoot.querySelector("form"),memberId=form.elements.memberId,nameInput=form.elements.name,emailInput=form.elements.email,originInput=form.elements.origin,buttons=[...form.querySelectorAll("[data-invite-profile],[data-invite-shared]")],selectChoice=(person,id="")=>{memberId.value=id;nameInput.value=person.name||"";emailInput.value=person.email||"";originInput.value=person.origin==="TBD"?"":person.origin||"";buttons.forEach((button)=>button.classList.toggle("selected",button.dataset.inviteProfile===id||(button.dataset.inviteShared!==undefined&&shared[Number(button.dataset.inviteShared)]?.email===person.email)))};form.querySelectorAll("[data-invite-profile]").forEach((button)=>button.onclick=()=>selectChoice(profiles.find((person)=>person.id===button.dataset.inviteProfile),button.dataset.inviteProfile));form.querySelectorAll("[data-invite-shared]").forEach((button)=>button.onclick=()=>selectChoice(shared[Number(button.dataset.inviteShared)]));nameInput.addEventListener("input",()=>{memberId.value="";buttons.forEach((button)=>button.classList.remove("selected"))})}
function openProfile(member){if(!member)return;openDialog("Edit my profile","Change how your name and home airport appear throughout this rave room.",field("Name","name",member.name)+field("Home airport or city","origin",member.origin==="TBD"?"":member.origin,"text",false),async(values)=>{await act("update-profile",values,"Profile updated");closeDialog()});}
function openRemoveMember(member){if(!member)return;openDangerDialog(`Remove ${escapeHtml(member.name)}?`,"They will lose access to this rave room. Their room assignment and flight legs will be removed; their tickets, passes, and rental cars will remain but become unassigned.","Remove from crew",async()=>{await act("remove-member",{id:member.id},`${member.name} removed`);closeDialog()});}
function openTask(task){const opts=data.members.map((m)=>[m.id,m.name]);openDialog(task?"Edit ticket":"New ticket","Give every loose end an owner and a clear status.",field("Ticket title","title",task?.title||"")+`<div class="form-row">${selectField("Status","status",[["todo","To do"],["doing","In progress"],["done","Done"]],task?.status||"todo")}${selectField("Category","category",[["General","General"],["Stay","Stay"],["Travel","Travel"],["Passes","Passes"],["Crew","Crew"]],task?.category||"General")}</div>`+selectField("Assigned to","assigneeId",[["","Unassigned"],...opts],task?.assigneeId||"")+field("Due date","dueDate",task?.dueDate||"","date",false),async(values)=>{await act("save-task",{...values,id:task?.id||""},task?"Ticket updated":"Ticket created");closeDialog()},task?`<button id="deleteTask" class="danger-button" type="button">Delete ticket</button>`:"");if(task)wireDangerButton("deleteTask",async()=>{await act("delete-task",{id:task.id},"Ticket deleted");closeDialog()});}
function openRoom(room){
  openDialog(room?"Edit room":"Add room","Store the reservation, capacity, and bathroom count so the room assignment stays clear.",
    field("Hotel","hotel",room?.hotel||"")+field("Hotel address","address",room?hotelAddress(room):"","text",false)+field("Room type","roomType",room?.roomType||"")+
    `<div class="form-row">${field("Sleeps","capacity",room?.capacity||4,"number")}${field("Bathrooms","bathrooms",room?.bathrooms||1,"number")}</div>`+
    `<div class="form-row">${field("Confirmation","confirmation",room?.confirmation||"","text",false)}${field("Total cost","totalCost",room?.totalCost||"","text",false)}</div>`+
    `<label class="field"><span>Booking notes</span><textarea class="booking-notes-input" name="notes" rows="7" placeholder="Check-in details, hotel benefits, parking, reminders…">${escapeHtml(room?.notes||"")}</textarea></label>`+
    `<div class="form-row">${field("Check-in","checkIn",room?.checkIn||"")}${field("Check-out","checkOut",room?.checkOut||"")}</div>`,
    async(values)=>{await act("save-room",{...values,id:room?.id||""},room?"Room updated":"Room added");closeDialog()},
    room?`<button id="deleteRoom" class="danger-button" type="button">Delete room</button>`:"");
  const notes=el.dialogRoot.querySelector('textarea[name="notes"]');
  el.dialogRoot.querySelectorAll('[name="capacity"],[name="bathrooms"]').forEach(input=>{input.min='1';input.step='1';});
  const fitNotes=()=>{notes.style.height='auto';notes.style.height=Math.min(320,Math.max(160,notes.scrollHeight))+'px';};
  fitNotes();notes.addEventListener('input',fitNotes);
  if(room)wireDangerButton("deleteRoom",async()=>{await act("delete-room",{id:room.id},"Room deleted");closeDialog()});
}
function openAssign(roomId){openDialog("Assign a room","Choose a person. Existing assignments move automatically.",selectField("Person","memberId",data.members.map((m)=>[m.id,m.name]))+selectField("Room","roomId",data.rooms.map((r,i)=>[r.id,`Room ${i+1} · ${r.roomType}`]),roomId),async(values)=>{await act("assign-room",values,"Room assignment updated");closeDialog()});}
function openFlight(group){const selected=new Set(group?.memberIds||[data.currentMemberId]);openDialog(group?"Edit shared flight":"Add flight","Select everyone on this exact flight leg. Layovers should remain separate cards.",`<div class="field"><span>Travelers</span><div class="member-picker">${data.members.map((member)=>`<button type="button" data-flight-member="${member.id}" class="${selected.has(member.id)?"selected":""}" aria-pressed="${selected.has(member.id)}"><i class="avatar-${member.color}">${escapeHtml(member.initials)}</i>${escapeHtml(member.name)}</button>`).join("")}</div></div><div class="form-row">${field("Airline","airline",group?.airline||"")}${field("Flight number","number",group?.number||"")}</div>`+field("Confirmation","confirmation",group?.confirmation||"","text",false)+`<div class="form-row">${field("From","origin",group?.origin||"")}${field("To","destination",group?.destination||"")}</div><div class="form-row">${field("Departs","departure",group?.departure||"","datetime-local")}${field("Arrives","arrival",group?.arrival||"","datetime-local")}</div>`,async(values)=>{if(!selected.size)throw new Error("Choose at least one traveler.");await act("save-flight-group",{...values,ids:group?.ids||[],memberIds:[...selected]},group?"Shared flight updated":"Flight added");closeDialog()},group?`<button id="deleteFlight" class="danger-button" type="button">Delete flight</button>`:"");document.querySelectorAll("[data-flight-member]").forEach((button)=>button.onclick=()=>{const id=button.dataset.flightMember;if(selected.has(id))selected.delete(id);else selected.add(id);button.classList.toggle("selected",selected.has(id));button.setAttribute("aria-pressed",String(selected.has(id)))});if(group)wireDangerButton("deleteFlight",async()=>{await act("delete-flight-group",{ids:group.ids},"Flight deleted");closeDialog()})}
function openCar(car){openDialog(car?"Edit rental car":"Add rental car","Keep ground transportation next to the crew’s flights.",`<div class="form-row">${field("Company","company",car?.company||"")}${field("Vehicle","vehicle",car?.vehicle||"")}</div>`+field("Confirmation","confirmation",car?.confirmation||"")+`<div class="form-row">${field("Pickup","pickup",car?.pickup||"","datetime-local")}${field("Drop-off","dropoff",car?.dropoff||"","datetime-local")}</div>`+selectField("Driver","driverId",[["","Unassigned"],...data.members.map((m)=>[m.id,m.name])],car?.driverId||""),async(values)=>{await act("save-car",{...values,id:car?.id||""},car?"Rental car updated":"Rental car added");closeDialog()},car?`<button id="deleteCar" class="danger-button" type="button">Delete car</button>`:"");if(car)wireDangerButton("deleteCar",async()=>{await act("delete-car",{id:car.id},"Rental car deleted");closeDialog()});}
function openPass(pass){
  if(offlineMode)return showToast('Reconnect to change purchases.');
  const eventId=activeEvent;
  openDialog(pass?'Edit purchase':'Add purchase','Keep the original buyer and cost separate from ticket holders. Existing ticket assignments are preserved.',field('Pass or shuttle name','name',pass?.name||'')+`<div class="form-row">${selectField('Type','category',[['Pass','Festival pass'],['Shuttle','Shuttle'],['Parking','Parking'],['Add-on','Add-on']],pass?.category||'Pass')}${field('Quantity','quantity',pass?.quantity||1,'number')}</div>`+selectField('Originally purchased by','ownerId',[['','Unassigned'],...data.members.map(member=>[member.id,member.name])],pass?.ownerId||'')+`<div class="form-row">${field('Cost per item (USD)','unitCost',pass?.unitCost||'','text',false)}${field('Total paid incl. fees (USD)','totalCost',pass?.totalCost||'','text',false)}</div>`+field('Purchase status (optional)','status',pass?.status||'','text',false)+field('Purchase notes','notes',pass?.notes||'','text',false),async values=>{
    if(await saveTicketChange('save',{...values,id:pass?.id||''},eventId)){closeDialog();renderTicketBoard();showToast(pass?'Purchase updated':'Purchase added');}
  },pass?'<button id="deletePass" class="danger-button" type="button">Delete purchase</button>':'');
  const quantity=el.dialogRoot.querySelector('[name="quantity"]');quantity.min='1';quantity.max='500';quantity.step='1';
  if(pass)wireDangerButton('deletePass',async()=>{if(await saveTicketChange('delete',{id:pass.id},eventId)){closeDialog();renderTicketBoard();showToast('Purchase deleted');}});
}
function openLineupArtist(artist){
  const date=artist?.festivalDate||artist?.date||'';
  const start=artist?.start||(/^\d{2}:\d{2}$/.test(artist?.time||'')&&date?`${date}T${artist.time}`:'');
  openDialog(artist?'Edit artist':'Add artist','Use the event’s local time. Leave unannounced times blank. For a set ending after midnight, choose the next date for its end.',
    field('Artist or set name','name',artist?.artist||artist?.name||'')+`<div class="form-row">${field('Festival day','day',artist?.day||'Day TBD')}${field('Festival date','date',date,'date',false)}</div>`+
    field('Set starts','start',start,'datetime-local',false)+field('Set ends','end',artist?.end||'','datetime-local',false)+field('Stage','stage',artist?.stage||'','text',false)+field('Notes','notes',artist?.notes||'','text',false),
    async values=>{await act('save-lineup-artist',{...values,id:artist?.id||''},artist?'Artist updated':'Artist added');closeDialog();},
    artist?'<button id="deleteLineupArtist" class="danger-button" type="button">Remove artist</button>':'');
  if(artist)wireDangerButton('deleteLineupArtist',async()=>{await act('delete-lineup-artist',{id:artist.id},'Artist removed');closeDialog();});
}
function openNewEvent(){const cards=eventTemplates.map((template,index)=>`<label class="event-template-card${index===0?" selected":""}"><input type="radio" name="templateId" value="${template.id}" ${index===0?"checked":""}><span class="template-icon">${template.icon}</span><span class="template-copy"><span class="template-title">${escapeHtml(template.name)}${template.badge?`<em>${escapeHtml(template.badge)}</em>`:""}</span><span>${escapeHtml(template.description)}</span><small>${escapeHtml(template.summary)}</small></span></label>`).join("");openDialog("New rave room","Start with a useful plan. Every starter item can be changed or deleted afterward.",`<fieldset class="template-picker"><legend>Choose a starting point</legend><div class="template-grid">${cards}</div><p id="templatePreview" class="template-preview">${escapeHtml(eventTemplates[0].summary)}</p></fieldset>`+field("Rave name","name")+field("Location","location")+`<div class="form-row">${field("Starts","startsAt","","date")}${field("Ends","endsAt","","date")}</div>`+field("Event timezone","eventTimeZone",Intl.DateTimeFormat().resolvedOptions().timeZone)+field("Admin name","adminName",data.members.find((m)=>m.id===data.currentMemberId)?.name||"John"),async(values)=>{const created=await convexMutation("rally:act",{eventId:activeEvent,action:"create-event",payload:values});closeDialog();await navigateTo(new URL(href("home",created.id),location.href))});el.dialogRoot.querySelector(".dialog").classList.add("new-event-dialog");const form=el.dialogRoot.querySelector("form"),submit=form.querySelector('[type="submit"]'),preview=document.getElementById("templatePreview");submit.textContent="Create room";form.querySelectorAll('[name="templateId"]').forEach((input)=>input.addEventListener("change",()=>{form.querySelectorAll(".event-template-card").forEach((card)=>card.classList.toggle("selected",card.contains(input)));preview.textContent=eventTemplates.find((template)=>template.id===input.value)?.summary||""}))}

function projectContext(){return {eventId:activeEvent,owner:window.Clerk?.user?.id,revision:roomLoadRevision,dialog:el.dialogRoot.firstElementChild};}
function assertProjectContext(context){
  if(context.eventId!==activeEvent||context.owner!==window.Clerk?.user?.id||context.revision!==roomLoadRevision||(context.dialog&&context.dialog!==el.dialogRoot.firstElementChild))throw new Error('The project or editor changed. Reopen it to see the saved change.');
}
async function act(action,payload,message,rerender=true){
  const context=projectContext();
  const updated=await convexMutation("rally:act",{eventId:context.eventId,action,payload});
  assertProjectContext(context);data=updated;
  if(rerender)render();showToast(message);return data;
}
function showToast(message){
  // A manual popover stays above native dialogs without stealing focus.
  // Do not label errors or offline notices with a success checkmark.
  el.toast.textContent=message;el.toast.hidden=false;
  if(typeof el.toast.showPopover==='function'&&!el.toast.matches(':popover-open'))el.toast.showPopover();
  clearTimeout(el.toast.timer);
  el.toast.timer=setTimeout(()=>{el.toast.hidePopover?.();el.toast.hidden=true;},4500);
}

async function convexQuery(path,args){return convexCall("query",path,args)} async function convexMutation(path,args){return convexCall("mutation",path,args)} async function convexAction(path,args){return convexCall("action",path,args)}
async function convexCall(kind, path, args) {
  if (path === 'rally:act' && args.action === 'save-lineup-favorites') {
    const room = RallyOffline.queue(args.eventId, args.payload.artistIds);
    void syncFavorites();
    return room;
  }
  if (offlineMode) {
    if (path === 'rally:listEvents') return RallyOffline.events;
    if (path === 'rally:get' || path === 'rally:bootstrap') {
      const room = RallyOffline.room(args.eventId);
      if (room) return room;
      throw new Error('This room is not saved on this device yet. Open it online first.');
    }
    throw new Error('You are offline. Trip details are readable and favorites can be saved; other changes need internet.');
  }
  const owner = window.Clerk?.user?.id;
  const dialog=el.dialogRoot.firstElementChild;
  const value = await networkConvexCall(kind, path, args);
  if(owner!==window.Clerk?.user?.id)throw new Error('Your account changed. Reopen the project.');
  let result=value;
  if (owner && owner === RallyOffline.userId) {
    if (path === 'rally:listEvents') RallyOffline.list(value);
    if (value?.id && Array.isArray(value.members)) result=RallyOffline.save(value);
  }
  if(kind!=='query'&&dialog&&dialog!==el.dialogRoot.firstElementChild)throw new Error('The editor changed. Reopen it to see the saved change.');
  return result;
}
async function networkConvexCall(kind,path,args){const token=await getConvexToken();if(!token)throw new Error("Not authenticated with Clerk.");const response=await fetch(`${CONVEX_URL}/api/${kind}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({path,args}),signal:AbortSignal.timeout(12000)});const result=await response.json();if(!response.ok||result.status!=="success")throw new Error(typeof result.errorData==='string'?result.errorData:result.errorMessage||`Convex ${kind} failed`);return result.value}
async function getConvexToken(){const session=window.Clerk?.session;if(!session)return null;const sessionToken=await session.getToken();const audience=readJwtPayload(sessionToken)?.aud;if(audience==="convex"||(Array.isArray(audience)&&audience.includes("convex")))return sessionToken;try{return await session.getToken({template:"convex"})}catch{return sessionToken}}
function readJwtPayload(token){if(!token)return null;try{const encoded=token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(decodeURIComponent(escape(atob(encoded))))}catch{return null}}
function escapeHtml(value){const span=document.createElement("span");span.textContent=String(value??"");return span.innerHTML} function escapeAttr(value){return escapeHtml(value).replace(/"/g,"&quot;")}
function initials(value){return String(value).split(/\s+/).map((part)=>part[0]).join("").replace(/[^a-z]/gi,"").slice(0,2).toUpperCase()||"RR"}
function eventDaysAway(event,now=Date.now()){
  const zone=event.eventTimeZone||event.timeZone||window.RallyEvents?.zoneFor(event)||'UTC';
  let parts;
  try{parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(part=>[part.type,part.value]));}
  catch{return 0;}
  const days=(Date.parse(event.startsAt+'T00:00:00Z')-Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`))/86400000;
  return Number.isFinite(days)?Math.max(0,Math.round(days)):0;
}
function dateRange(start,end){const format=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"});if(start===end)return `${format.format(new Date(`${start}T12:00:00Z`))}, ${new Date(`${start}T12:00:00Z`).getUTCFullYear()}`;return `${format.format(new Date(`${start}T12:00:00Z`))}–${format.format(new Date(`${end}T12:00:00Z`))}, ${new Date(`${end}T12:00:00Z`).getUTCFullYear()}`}
function eventDateLine(event){const sameDay=event.startsAt===event.endsAt,day=sameDay?new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(`${event.startsAt}T12:00:00Z`)):dateRange(event.startsAt,event.endsAt);if(!event.startTime)return day;const [rawHour,minute="00"]=event.startTime.split(":"),hour=Number(rawHour),clock=`${hour%12||12}:${minute} ${hour>=12?"PM":"AM"}`;return `${day} · ${clock}${event.timeZoneLabel?` ${escapeHtml(event.timeZoneLabel)}`:""}`}
