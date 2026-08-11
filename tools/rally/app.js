const CONVEX_URL = "https://dashing-heron-837.convex.cloud";
const BASE_PATH = "/tools/rally/";
const DEFAULT_EVENT = "lost-lands-2026";
const views = [
  ["home", "Home", "⌂"], ["stay", "Stay", "▣"], ["crew", "Crew", "●"],
  ["travel", "Travel", "✈"], ["passes", "Passes", "◇"], ["tasks", "Tasks", "✓"], ["lineup", "Lineup", "♫"],
];

let data = null;
let events = [];
let activeView = "home";
let activeEvent = DEFAULT_EVENT;
let draggedTask = null;
let lineupSaveTimer = null;

const el = Object.fromEntries(["accessGate","clerkSignIn","authStatus","authSignOut","rallyApp","sidebar","closeMenu","openMenu","menuBackdrop","eventSwitcher","eventMenu","eventName","eventThumb","mobileEventName","mobileCountdown","sideNav","bottomNav","page","topInvite","accountButton","signOut","newEvent","dialogRoot","toast"].map((id) => [id, document.getElementById(id)]));

init();

async function init() {
  const params = new URLSearchParams(location.search);
  activeView = views.some(([id]) => id === params.get("view")) ? params.get("view") : "home";
  activeEvent = params.get("event") || DEFAULT_EVENT;
  wireShell();
  await initializeClerk();
}

function wireShell() {
  document.addEventListener("click", handleAppLink);
  window.addEventListener("popstate", () => navigateTo(new URL(location.href), { push: false }));
  window.addEventListener("message", handleLineupMessage);
  el.openMenu.addEventListener("click", () => { el.sidebar.classList.add("open"); el.menuBackdrop.hidden = false; });
  [el.closeMenu, el.menuBackdrop].forEach((button) => button.addEventListener("click", closeMenu));
  el.eventSwitcher.addEventListener("click", () => { el.eventMenu.hidden = !el.eventMenu.hidden; });
  el.signOut.addEventListener("click", signOut);
  el.accountButton.addEventListener("click", () => openProfile(data?.members.find((member) => member.id === data.currentMemberId)));
  el.topInvite.addEventListener("click", () => openInvite());
  el.newEvent.addEventListener("click", openNewEvent);
}

function closeMenu() { el.sidebar.classList.remove("open"); el.menuBackdrop.hidden = true; }

function readRoute(url) {
  const params = url.searchParams;
  return {
    view: views.some(([id]) => id === params.get("view")) ? params.get("view") : "home",
    eventId: params.get("event") || DEFAULT_EVENT,
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
  if (push) history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  closeMenu();
  el.eventMenu.hidden = true;
  const eventChanged = route.eventId !== activeEvent;
  activeView = route.view;
  if (eventChanged) {
    activeEvent = route.eventId;
    el.page.className = "page";
    el.page.innerHTML = `<div class="empty">Opening ${escapeHtml(events.find((event) => event.id === activeEvent)?.name || "rave room")}…</div>`;
    try {
      data = await convexMutation("rally:bootstrap", { eventId: activeEvent });
      events = await convexQuery("rally:listEvents", {});
    } catch (error) {
      showToast(error.message || "Could not open that rave room");
      return;
    }
  }
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function initializeClerk() {
  try {
    if (!window.Clerk) throw new Error("Secure sign-in did not load.");
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    if (window.Clerk.isSignedIn) return unlock();
    document.body.classList.remove("booting");
    el.rallyApp.hidden = true;
    el.accessGate.hidden = false;
    el.authStatus.hidden = true;
    window.Clerk.mountSignIn(el.clerkSignIn, {
      routing: "hash", withSignUp: true,
      forceRedirectUrl: location.href.split("#")[0], signUpForceRedirectUrl: location.href.split("#")[0],
      appearance: { variables: { colorPrimary: "#1c1d19", colorBackground: "#fffef9", borderRadius: "9px", fontFamily: "Inter, ui-sans-serif, system-ui" } },
    });
  } catch (error) { showAuthError(error); }
}

async function unlock() {
  try {
    const [room, knownEvents] = await Promise.all([
      convexMutation("rally:bootstrap", { eventId: activeEvent }),
      convexQuery("rally:listEvents", {}),
    ]);
    data = room;
    events = knownEvents.length ? knownEvents : await convexQuery("rally:listEvents", {});
    render();
    el.accessGate.hidden = true;
    el.rallyApp.hidden = false;
    document.body.classList.remove("booting");
  } catch (error) { showAuthError(error); }
}

function showAuthError(error) {
  console.error(error); document.body.classList.remove("booting"); el.accessGate.hidden = false; el.rallyApp.hidden = true; el.authStatus.hidden = false; el.authSignOut.hidden = !window.Clerk?.isSignedIn;
  el.authStatus.textContent = /not been invited/i.test(String(error?.message || error)) ? "This email has not been invited to this Rally room." : "Secure sign-in could not finish. Refresh and try again.";
  el.authSignOut.onclick = signOut;
}

async function signOut() { if (window.Clerk?.isSignedIn) await window.Clerk.signOut(); location.assign(BASE_PATH); }

function render() {
  const days = Math.max(0, Math.ceil((new Date(`${data.startsAt}T12:00:00Z`) - Date.now()) / 86400000));
  el.eventName.textContent = data.name; el.mobileEventName.textContent = data.name; el.mobileCountdown.textContent = `${days} days away`;
  el.eventThumb.textContent = initials(data.name); el.topInvite.hidden = !data.isAdmin;
  el.sideNav.innerHTML = views.filter(([id]) => data.id === DEFAULT_EVENT || id !== "lineup").map(([id,label,icon]) => `<a href="${href(id)}" class="${activeView === id ? "active" : ""}"><span class="nav-icon">${icon}</span>${label}</a>`).join("");
  el.bottomNav.innerHTML = views.filter(([id]) => ["home","stay","crew","travel","tasks"].includes(id)).map(([id,label,icon]) => `<a href="${href(id)}" class="${activeView === id ? "active" : ""}"><span>${icon}</span>${label}</a>`).join("");
  el.eventMenu.innerHTML = events.map((event) => `<button data-event="${event.id}"><strong>${escapeHtml(event.name)}</strong><br><small>${escapeHtml(event.location)}</small></button>`).join("");
  el.eventMenu.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => navigateTo(new URL(href("home", button.dataset.event), location.origin))));
  el.page.className = `page${activeView === "lineup" ? " lineup" : ""}`;
  const renderer = { home: renderHome, stay: renderStay, crew: renderCrew, travel: renderTravel, passes: renderPasses, tasks: renderTasks, lineup: renderLineup }[activeView] || renderHome;
  renderer();
}

function href(view, eventId = activeEvent) {
  const params = new URLSearchParams(); if (view !== "home") params.set("view", view); if (eventId !== DEFAULT_EVENT) params.set("event", eventId);
  return `${BASE_PATH}${params.size ? `?${params}` : ""}`;
}

function heading(eyebrow, title, description, action = "") { return `<header class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${action}</header>`; }
function memberMap() { return Object.fromEntries(data.members.map((member) => [member.id, member])); }
function groupedFlights(){const groups=new Map();data.travel.forEach((trip)=>{const key=JSON.stringify([trip.airline,trip.number,trip.origin,trip.destination,trip.departure,trip.arrival,trip.confirmation||""]);if(!groups.has(key))groups.set(key,{...trip,ids:[],memberIds:[]});const group=groups.get(key);group.ids.push(trip.id);if(!group.memberIds.includes(trip.memberId))group.memberIds.push(trip.memberId)});return [...groups.values()].sort((left,right)=>String(left.departure).localeCompare(String(right.departure)))}
function flightTime(value){if(!value)return "—";const date=new Date(value);return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(date)}
function flightDay(value){if(!value)return "Date not added";const date=new Date(value);return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric"}).format(date)}

function renderHome() {
  const assigned = data.rooms.reduce((sum, room) => sum + room.memberIds.length, 0), capacity = data.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const days = Math.max(0, Math.ceil((new Date(`${data.startsAt}T12:00:00Z`) - Date.now()) / 86400000));
  const cards = [
    ["crew","●","Crew",`${data.members.length} going`,data.members.filter((m)=>m.origin!=="TBD").map((m)=>m.origin).join(" · ") || "Origins not added yet"],
    ["stay","▣","Stay",capacity ? `${assigned} of ${capacity} assigned` : "No rooms yet",data.rooms[0]?.hotel || "Add lodging"],
    ["travel","✈","Travel",`${new Set(data.travel.map((trip)=>trip.memberId)).size} of ${data.members.length} linked`,`${data.travel.length} flight legs · ${data.cars.length} cars`],
    ["passes","◇","Passes",`${data.passes.length} types tracked`,"Tickets, shuttles, and add-ons"],
    ["tasks","✓","Tasks",`${data.tasks.filter((task)=>task.status!=="done").length} open`,"Loose ends, owners, and status"],
  ];
  if (data.id === DEFAULT_EVENT) cards.splice(4,0,["lineup","♫","Lineup","Full 2026 lineup","Search, filter, and save favorites"]);
  el.page.innerHTML = `<section class="overview-header"><div><span class="eyebrow">Project overview</span><h1>${escapeHtml(data.name)}</h1><p>⌖ ${escapeHtml(data.location)} · ${dateRange(data.startsAt,data.endsAt)}</p></div><div class="countdown"><strong>${days}</strong><span>days to go</span></div></section><div class="overview-grid">${cards.map(([view,icon,label,strong,small])=>`<a class="overview-tile" href="${href(view)}"><span class="overview-icon">${icon}</span><span><small>${label}</small><strong>${strong}</strong><em>${escapeHtml(small)}</em></span><b>→</b></a>`).join("")}</div><section class="section-card"><header><div><span class="eyebrow">Loose ends</span><h2>Open tickets</h2></div><a class="primary" href="${href("tasks")}">Open board →</a></header><div class="row-list">${data.tasks.filter((task)=>task.status!=="done").slice(0,4).map((task)=>`<div class="row"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(memberMap()[task.assigneeId]?.name || "Unassigned")}</span></div>`).join("") || `<div class="empty">Nothing is waiting right now.</div>`}</div></section>`;
}

function renderCrew() {
  el.page.innerHTML = heading(`${data.members.length} people`,"The crew","Invite each person to claim their existing profile.",data.isAdmin?`<button id="inviteCrew" class="primary">＋ Invite crew</button>`:"") + `<div class="toolbar"><label class="search">⌕ <input id="crewSearch" placeholder="Search the crew"></label></div><div id="memberGrid" class="member-grid">${memberCards(data.members)}</div>`;
  document.getElementById("inviteCrew")?.addEventListener("click",()=>openInvite());
  document.getElementById("crewSearch").addEventListener("input",(event)=>{ document.getElementById("memberGrid").innerHTML=memberCards(data.members.filter((m)=>`${m.name} ${m.email} ${m.origin}`.toLowerCase().includes(event.target.value.toLowerCase()))); wireMemberCards(); });
  wireMemberCards();
}

function memberCards(members) { return members.map((member)=>{ const current=member.id===data.currentMemberId, admin=["admin","leader"].includes(member.role); return `<article class="member-card"><div class="avatar-bubble avatar-${member.color}">${member.initials}</div><div><h3>${escapeHtml(member.name)}${admin?`<span class="badge">Admin</span>`:""}${current?`<span class="badge">You</span>`:""}</h3><p>${escapeHtml(member.email || "Not invited yet")}</p></div><span class="origin">${escapeHtml(member.origin)}</span><footer><div class="checks"><span>✓ Pass</span><span>✓ Stay</span><span>${data.travel.some((trip)=>trip.memberId===member.id)?"✓":"○"} Flight</span></div>${current?`<button class="member-action" data-edit="${member.id}">Edit my profile</button>`:data.isAdmin&&!admin?`<div class="member-actions">${member.status!=="confirmed"?`<button class="member-action" data-invite="${member.id}">${member.status==="invited"?"Resend invite":"Invite"}</button>`:`<span class="claimed-label">Claimed</span>`}<button class="member-action remove" data-remove-member="${member.id}">Remove</button></div>`:""}</footer></article>`; }).join(""); }
function wireMemberCards(){ document.querySelectorAll("[data-invite]").forEach((button)=>button.addEventListener("click",()=>openInvite(data.members.find((m)=>m.id===button.dataset.invite)))); document.querySelectorAll("[data-edit]").forEach((button)=>button.addEventListener("click",()=>openProfile(data.members.find((m)=>m.id===button.dataset.edit)))); document.querySelectorAll("[data-remove-member]").forEach((button)=>button.addEventListener("click",()=>openRemoveMember(data.members.find((m)=>m.id===button.dataset.removeMember)))); }

function renderStay(){ const map=memberMap(); el.page.innerHTML=heading("Lodging plan","Stay","Hotel rooms, confirmations, capacity, bathrooms, and who sleeps where.",`<button id="addRoom" class="primary">＋ Add room</button>`)+`<div class="room-grid">${data.rooms.map((room,index)=>{const bathrooms=Number(room.bathrooms)||1;return `<article class="room-card"><header><span>Room ${index+1}</span><button data-room-edit="${room.id}">•••</button></header><h3>${escapeHtml(room.roomType)}</h3><p>${escapeHtml(room.hotel)}${room.confirmation?` · Confirmation ${escapeHtml(room.confirmation)}`:""}</p>${room.notes?`<p class="room-note">${escapeHtml(room.notes)}</p>`:""}${room.totalCost?`<strong class="room-price">${escapeHtml(room.totalCost)}</strong>`:""}<div class="room-stats"><span><strong>${room.capacity}</strong> sleeps</span><span><strong>${bathrooms}</strong> ${bathrooms===1?"bathroom":"bathrooms"}</span></div><div class="meter"><i style="width:${Math.min(100,room.memberIds.length/room.capacity*100)}%"></i></div><small>${room.memberIds.length} assigned · ${room.capacity-room.memberIds.length} open</small><div class="row-list">${room.memberIds.map((id)=>`<div class="row"><strong>${escapeHtml(map[id]?.name||"Crew")}</strong><span>${escapeHtml(map[id]?.origin||"")}</span></div>`).join("")}<button class="secondary" data-assign-room="${room.id}">＋ Assign person</button></div></article>`}).join("")||`<div class="empty">No rooms added yet.</div>`}</div>`; document.getElementById("addRoom").onclick=()=>openRoom(); document.querySelectorAll("[data-room-edit]").forEach((b)=>b.onclick=()=>openRoom(data.rooms.find((r)=>r.id===b.dataset.roomEdit))); document.querySelectorAll("[data-assign-room]").forEach((b)=>b.onclick=()=>openAssign(b.dataset.assignRoom)); }

function renderTravel(){const map=memberMap(),groups=groupedFlights();el.page.innerHTML=heading("Arrival board","Travel","Shared flights appear once, with everyone on that itinerary grouped together.",`<div><button id="addCar" class="secondary">＋ Rental car</button> <button id="addFlight" class="primary">＋ Add flight</button></div>`)+`<div class="flight-board">${groups.map((group,index)=>`<article class="flight-card grouped-flight editable-card"><button class="card-menu" data-flight-group="${index}" aria-label="Edit flight">•••</button><header class="flight-head"><div><span class="eyebrow">${escapeHtml(flightDay(group.departure))}</span><h3>${escapeHtml(group.airline)} ${escapeHtml(group.number)}</h3></div>${group.confirmation?`<span class="confirmation-pill">${escapeHtml(group.confirmation)}</span>`:""}</header><div class="flight-route"><div><strong>${escapeHtml(group.origin)}</strong><span>${escapeHtml(flightTime(group.departure))}</span></div><i><span>✈</span><b></b></i><div><strong>${escapeHtml(group.destination)}</strong><span>${escapeHtml(flightTime(group.arrival))}</span></div></div><footer class="flight-travelers"><small>${group.memberIds.length} ${group.memberIds.length===1?"traveler":"travelers"}</small><div>${group.memberIds.map((id)=>`<span class="traveler-chip"><i class="avatar-${map[id]?.color||"purple"}">${escapeHtml(map[id]?.initials||"?")}</i>${escapeHtml(map[id]?.name||"Crew")}</span>`).join("")}</div></footer></article>`).join("")||`<div class="empty">No flights linked yet. Add each layover as its own leg.</div>`}</div><section class="section-card"><header><div><span class="eyebrow">Ground transportation</span><h2>Rental cars</h2></div></header><div class="car-grid">${data.cars.map((car)=>`<article class="car-card editable-card"><button class="card-menu" data-car-edit="${car.id}" aria-label="Edit rental car">•••</button><h3>${escapeHtml(car.company)} · ${escapeHtml(car.vehicle)}</h3><p>${escapeHtml(car.pickup)} → ${escapeHtml(car.dropoff)}</p><small>Driver: ${escapeHtml(map[car.driverId]?.name||"Unassigned")}</small></article>`).join("")||`<div class="empty">No rental car stored.</div>`}</div></section>`;document.getElementById("addFlight").onclick=()=>openFlight();document.getElementById("addCar").onclick=()=>openCar();document.querySelectorAll("[data-flight-group]").forEach((button)=>button.onclick=()=>openFlight(groups[Number(button.dataset.flightGroup)]));document.querySelectorAll("[data-car-edit]").forEach((button)=>button.onclick=()=>openCar(data.cars.find((car)=>car.id===button.dataset.carEdit)))}

function renderPasses(){ const map=memberMap(); el.page.innerHTML=heading("Shared inventory","Passes","Tickets, shuttles, early entry, and add-ons.",`<button id="addPass" class="primary">＋ Add passes</button>`)+`<div class="pass-grid">${data.passes.map((pass)=>`<article class="pass-card editable-card"><button class="card-menu" data-pass-edit="${pass.id}" aria-label="Edit pass">•••</button><span class="eyebrow">Tracked</span><h3>${escapeHtml(pass.name)}</h3><p>Held by ${escapeHtml(map[pass.ownerId]?.name||"Unassigned")}</p><strong>${escapeHtml(pass.status)}</strong></article>`).join("")||`<div class="empty">No passes tracked yet.</div>`}</div>`; document.getElementById("addPass").onclick=()=>openPass(); document.querySelectorAll("[data-pass-edit]").forEach((button)=>button.onclick=()=>openPass(data.passes.find((pass)=>pass.id===button.dataset.passEdit))); }

function renderTasks(){ const map=memberMap(), columns=[["todo","To do"],["doing","In progress"],["done","Done"]]; el.page.innerHTML=heading("Trip operations","Tickets","Drag tickets between columns. Click a ticket to edit or assign it.",`<button id="newTicket" class="primary">＋ New ticket</button>`)+`<div class="kanban">${columns.map(([id,label])=>`<section class="column" data-column="${id}"><header><span>${label}</span><b>${data.tasks.filter((task)=>task.status===id).length}</b></header>${data.tasks.filter((task)=>task.status===id).map((task)=>`<article class="ticket-card" draggable="true" data-task="${task.id}"><h3>${escapeHtml(task.title)}</h3><div class="ticket-meta"><span>${escapeHtml(task.category)}</span><strong>${escapeHtml(map[task.assigneeId]?.name||"Unassigned")}</strong></div></article>`).join("")}</section>`).join("")}</div>`; document.getElementById("newTicket").onclick=()=>openTask(); document.querySelectorAll("[data-task]").forEach((card)=>{ card.onclick=()=>openTask(data.tasks.find((task)=>task.id===card.dataset.task)); card.ondragstart=()=>{draggedTask=card.dataset.task;card.classList.add("dragging")}; card.ondragend=()=>{draggedTask=null;card.classList.remove("dragging")}; }); document.querySelectorAll("[data-column]").forEach((column)=>{ column.ondragover=(event)=>{event.preventDefault();column.classList.add("drop")}; column.ondragleave=()=>column.classList.remove("drop"); column.ondrop=async(event)=>{event.preventDefault();column.classList.remove("drop");if(draggedTask)await act("move-task",{id:draggedTask,status:column.dataset.column},"Ticket moved")}; }); }

function renderLineup(){el.page.innerHTML=`<iframe id="lineupFrame" class="lineup-frame" title="Lost Lands 2026 lineup" src="/lost-lands-2026-lineup/?rally=1"></iframe>`}
function handleLineupMessage(event){if(event.origin!==location.origin)return;const frame=document.getElementById("lineupFrame");if(!frame||event.source!==frame.contentWindow||!event.data||typeof event.data!=="object")return;if(event.data.type==="rally-lineup-ready"){frame.contentWindow.postMessage({type:"rally-lineup-favorites",artistIds:data.currentLineupFavorites||[]},location.origin);return}if(event.data.type!=="rally-lineup-favorites-changed"||!Array.isArray(event.data.artistIds))return;const eventId=activeEvent;const artistIds=[...new Set(event.data.artistIds.filter((id)=>typeof id==="string"))];data.currentLineupFavorites=artistIds;clearTimeout(lineupSaveTimer);lineupSaveTimer=setTimeout(async()=>{try{const updated=await convexMutation("rally:act",{eventId,action:"save-lineup-favorites",payload:{artistIds}});data.currentLineupFavorites=updated.currentLineupFavorites||[];document.getElementById("lineupFrame")?.contentWindow?.postMessage({type:"rally-lineup-favorites-saved"},location.origin)}catch(error){showToast(error.message||"Could not save lineup favorites")}},350)}

function openDialog(title,description,formHtml,onSubmit,footerHtml=""){ el.dialogRoot.innerHTML=`<div class="dialog-backdrop"><section class="dialog"><button class="dialog-close">×</button><span class="eyebrow">Rally project room</span><h2>${title}</h2><p>${description}</p><form>${formHtml}<div class="dialog-actions${footerHtml?" split":""}"><button class="primary" type="submit">Save</button>${footerHtml}</div></form></section></div>`; const backdrop=el.dialogRoot.firstElementChild, form=backdrop.querySelector("form"); backdrop.querySelector(".dialog-close").onclick=closeDialog; backdrop.onmousedown=(event)=>{if(event.target===backdrop)closeDialog()}; form.onsubmit=async(event)=>{event.preventDefault();const button=form.querySelector("[type=submit]");button.disabled=true;try{await onSubmit(Object.fromEntries(new FormData(form)))}catch(error){showToast(error.message||"Could not save");button.disabled=false}}; }
function wireDangerButton(id,onDelete){const button=document.getElementById(id);if(!button)return;button.onclick=async()=>{if(button.dataset.confirm!=="true"){button.dataset.confirm="true";button.classList.add("armed");button.textContent="Click again to delete";return}button.disabled=true;try{await onDelete()}catch(error){showToast(error.message||"Could not delete");button.disabled=false}};}
function openDangerDialog(title,description,label,onDelete){el.dialogRoot.innerHTML=`<div class="dialog-backdrop"><section class="dialog confirm-dialog"><button class="dialog-close">×</button><span class="eyebrow">Rally project room</span><h2>${title}</h2><p>${description}</p><div class="dialog-actions split"><button id="cancelDanger" class="secondary" type="button">Cancel</button><button id="confirmDanger" class="danger-button armed" type="button">${label}</button></div></section></div>`;const backdrop=el.dialogRoot.firstElementChild;backdrop.querySelector(".dialog-close").onclick=closeDialog;document.getElementById("cancelDanger").onclick=closeDialog;backdrop.onmousedown=(event)=>{if(event.target===backdrop)closeDialog()};document.getElementById("confirmDanger").onclick=async(event)=>{event.currentTarget.disabled=true;try{await onDelete()}catch(error){showToast(error.message||"Could not remove");event.currentTarget.disabled=false}};}
function closeDialog(){ el.dialogRoot.innerHTML=""; }
function field(label,name,value="",type="text",required=true){return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeAttr(value)}" ${required?"required":""}></label>`}
function selectField(label,name,options,value=""){return `<label class="field"><span>${label}</span><select name="${name}">${options.map(([id,text])=>`<option value="${escapeAttr(id)}" ${id===value?"selected":""}>${escapeHtml(text)}</option>`).join("")}</select></label>`}

function openInvite(member){ const inviteable=data.members.filter((m)=>!["admin","leader"].includes(m.role)&&(m.status!=="confirmed"||!m.email)); if(!inviteable.length)return showToast("Everyone has claimed their profile"); const selected=member||inviteable[0]; openDialog(`Invite ${escapeHtml(selected.name)}`,"Clerk will email them a secure invitation. When they join, they’ll claim this existing crew profile and its assignments.",selectField("Crew profile","memberId",inviteable.map((m)=>[m.id,m.name]),selected.id)+field("Email address","email",selected.email,"email"),async(values)=>{const target=data.members.find((m)=>m.id===values.memberId);data=await convexAction("rally:sendInvitation",{eventId:activeEvent,...values});closeDialog();render();showToast(`Clerk invite sent to ${target?.name||values.email}`);}); }
function openProfile(member){if(!member)return;openDialog("Edit my profile","Change how your name and home airport appear throughout this rave room.",field("Name","name",member.name)+field("Home airport or city","origin",member.origin==="TBD"?"":member.origin,"text",false),async(values)=>{await act("update-profile",values,"Profile updated");closeDialog()});}
function openRemoveMember(member){if(!member)return;openDangerDialog(`Remove ${escapeHtml(member.name)}?`,"They will lose access to this rave room. Their room assignment and flight legs will be removed; their tickets, passes, and rental cars will remain but become unassigned.","Remove from crew",async()=>{await act("remove-member",{id:member.id},`${member.name} removed`);closeDialog()});}
function openTask(task){const opts=data.members.map((m)=>[m.id,m.name]);openDialog(task?"Edit ticket":"New ticket","Give every loose end an owner and a clear status.",field("Ticket title","title",task?.title||"")+`<div class="form-row">${selectField("Status","status",[["todo","To do"],["doing","In progress"],["done","Done"]],task?.status||"todo")}${selectField("Category","category",[["General","General"],["Stay","Stay"],["Travel","Travel"],["Passes","Passes"],["Crew","Crew"]],task?.category||"General")}</div>`+selectField("Assigned to","assigneeId",[["","Unassigned"],...opts],task?.assigneeId||"")+field("Due date","dueDate",task?.dueDate||"","date",false),async(values)=>{await act("save-task",{...values,id:task?.id||""},task?"Ticket updated":"Ticket created");closeDialog()},task?`<button id="deleteTask" class="danger-button" type="button">Delete ticket</button>`:"");if(task)wireDangerButton("deleteTask",async()=>{await act("delete-task",{id:task.id},"Ticket deleted");closeDialog()});}
function openRoom(room){openDialog(room?"Edit room":"Add room","Store the reservation, capacity, and bathroom count so the room assignment stays clear.",field("Hotel","hotel",room?.hotel||"Hyatt Regency Columbus")+field("Room type","roomType",room?.roomType||"")+`<div class="form-row">${field("Sleeps","capacity",room?.capacity||4,"number")}${field("Bathrooms","bathrooms",room?.bathrooms||1,"number")}</div>`+`<div class="form-row">${field("Confirmation","confirmation",room?.confirmation||"","text",false)}${field("Total cost","totalCost",room?.totalCost||"","text",false)}</div>`+field("Booking notes","notes",room?.notes||"","text",false)+`<div class="form-row">${field("Check-in","checkIn",room?.checkIn||"")}${field("Check-out","checkOut",room?.checkOut||"")}</div>`,async(values)=>{await act("save-room",{...values,id:room?.id||""},room?"Room updated":"Room added");closeDialog()},room?`<button id="deleteRoom" class="danger-button" type="button">Delete room</button>`:"");if(room)wireDangerButton("deleteRoom",async()=>{await act("delete-room",{id:room.id},"Room deleted");closeDialog()});}
function openAssign(roomId){openDialog("Assign a room","Choose a person. Existing assignments move automatically.",selectField("Person","memberId",data.members.map((m)=>[m.id,m.name]))+selectField("Room","roomId",data.rooms.map((r,i)=>[r.id,`Room ${i+1} · ${r.roomType}`]),roomId),async(values)=>{await act("assign-room",values,"Room assignment updated");closeDialog()});}
function openFlight(group){const selected=new Set(group?.memberIds||[data.currentMemberId]);openDialog(group?"Edit shared flight":"Add flight","Select everyone on this exact flight leg. Layovers should remain separate cards.",`<div class="field"><span>Travelers</span><div class="member-picker">${data.members.map((member)=>`<button type="button" data-flight-member="${member.id}" class="${selected.has(member.id)?"selected":""}" aria-pressed="${selected.has(member.id)}"><i class="avatar-${member.color}">${escapeHtml(member.initials)}</i>${escapeHtml(member.name)}</button>`).join("")}</div></div><div class="form-row">${field("Airline","airline",group?.airline||"")}${field("Flight number","number",group?.number||"")}</div>`+field("Confirmation","confirmation",group?.confirmation||"","text",false)+`<div class="form-row">${field("From","origin",group?.origin||"")}${field("To","destination",group?.destination||"")}</div><div class="form-row">${field("Departs","departure",group?.departure||"","datetime-local")}${field("Arrives","arrival",group?.arrival||"","datetime-local")}</div>`,async(values)=>{if(!selected.size)throw new Error("Choose at least one traveler.");await act("save-flight-group",{...values,ids:group?.ids||[],memberIds:[...selected]},group?"Shared flight updated":"Flight added");closeDialog()},group?`<button id="deleteFlight" class="danger-button" type="button">Delete flight</button>`:"");document.querySelectorAll("[data-flight-member]").forEach((button)=>button.onclick=()=>{const id=button.dataset.flightMember;if(selected.has(id))selected.delete(id);else selected.add(id);button.classList.toggle("selected",selected.has(id));button.setAttribute("aria-pressed",String(selected.has(id)))});if(group)wireDangerButton("deleteFlight",async()=>{await act("delete-flight-group",{ids:group.ids},"Flight deleted");closeDialog()})}
function openCar(car){openDialog(car?"Edit rental car":"Add rental car","Keep ground transportation next to the crew’s flights.",`<div class="form-row">${field("Company","company",car?.company||"")}${field("Vehicle","vehicle",car?.vehicle||"")}</div>`+field("Confirmation","confirmation",car?.confirmation||"")+`<div class="form-row">${field("Pickup","pickup",car?.pickup||"","datetime-local")}${field("Drop-off","dropoff",car?.dropoff||"","datetime-local")}</div>`+selectField("Driver","driverId",[["","Unassigned"],...data.members.map((m)=>[m.id,m.name])],car?.driverId||""),async(values)=>{await act("save-car",{...values,id:car?.id||""},car?"Rental car updated":"Rental car added");closeDialog()},car?`<button id="deleteCar" class="danger-button" type="button">Delete car</button>`:"");if(car)wireDangerButton("deleteCar",async()=>{await act("delete-car",{id:car.id},"Rental car deleted");closeDialog()});}
function openPass(pass){openDialog(pass?"Edit passes":"Add passes","Track tickets, shuttles, parking, or entry add-ons.",field("Pass type","name",pass?.name||"")+`<div class="form-row">${selectField("Held by","ownerId",[["","Unassigned"],...data.members.map((m)=>[m.id,m.name])],pass?.ownerId||"")}${field("Quantity","quantity",pass?.quantity||1,"number")}</div>`+field("Status","status",pass?.status||`1 / ${data.members.length} secured`),async(values)=>{await act("save-pass",{...values,id:pass?.id||""},pass?"Pass updated":"Pass added");closeDialog()},pass?`<button id="deletePass" class="danger-button" type="button">Delete pass</button>`:"");if(pass)wireDangerButton("deletePass",async()=>{await act("delete-pass",{id:pass.id},"Pass deleted");closeDialog()});}
function openNewEvent(){openDialog("New rave room","Give every rave its own crew, stay, travel, passes, and tickets.",field("Rave name","name")+field("Location","location")+`<div class="form-row">${field("Starts","startsAt","","date")}${field("Ends","endsAt","","date")}</div>`+field("Admin name","adminName",data.members.find((m)=>m.id===data.currentMemberId)?.name||"John"),async(values)=>{const created=await convexMutation("rally:act",{eventId:activeEvent,action:"create-event",payload:values});closeDialog();await navigateTo(new URL(href("home",created.id),location.origin))});}

async function act(action,payload,message,rerender=true){data=await convexMutation("rally:act",{eventId:activeEvent,action,payload});if(rerender)render();showToast(message);return data;}
function showToast(message){el.toast.textContent=`✓ ${message}`;el.toast.hidden=false;clearTimeout(el.toast.timer);el.toast.timer=setTimeout(()=>el.toast.hidden=true,2800)}

async function convexQuery(path,args){return convexCall("query",path,args)} async function convexMutation(path,args){return convexCall("mutation",path,args)} async function convexAction(path,args){return convexCall("action",path,args)}
async function convexCall(kind,path,args){const token=await getConvexToken();if(!token)throw new Error("Not authenticated with Clerk.");const response=await fetch(`${CONVEX_URL}/api/${kind}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({path,args})});const result=await response.json();if(!response.ok||result.status!=="success")throw new Error(result.errorMessage||`Convex ${kind} failed`);return result.value}
async function getConvexToken(){const session=window.Clerk?.session;if(!session)return null;const sessionToken=await session.getToken();const audience=readJwtPayload(sessionToken)?.aud;if(audience==="convex"||(Array.isArray(audience)&&audience.includes("convex")))return sessionToken;try{return await session.getToken({template:"convex"})}catch{return sessionToken}}
function readJwtPayload(token){if(!token)return null;try{const encoded=token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(decodeURIComponent(escape(atob(encoded))))}catch{return null}}
function escapeHtml(value){const span=document.createElement("span");span.textContent=String(value??"");return span.innerHTML} function escapeAttr(value){return escapeHtml(value).replace(/"/g,"&quot;")}
function initials(value){return String(value).split(/\s+/).map((part)=>part[0]).join("").replace(/[^a-z]/gi,"").slice(0,2).toUpperCase()||"RR"}
function dateRange(start,end){const format=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"});return `${format.format(new Date(`${start}T12:00:00Z`))}–${format.format(new Date(`${end}T12:00:00Z`))}, ${new Date(`${end}T12:00:00Z`).getUTCFullYear()}`}
