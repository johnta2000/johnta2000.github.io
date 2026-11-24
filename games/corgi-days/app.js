import {mountCorgi} from './corgi-2d.mjs?v=8';
import {fresh,day,needs,act,currentStreak,valid,actions,dailyWish} from './model.mjs?v=7';
import {normalize,editorDraft,adopt,anniversary,calendarReminder} from './setup.mjs?v=6';
const $=s=>document.querySelector(s),KEY='corgi-days-v1',DRAFT='corgi-days-style-v1',EDITORS='corgi-days-editors-v1';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let bubbleTimer;
let pet,badSave=false,saveError='',draftError='',drafts={},stage=null,toastTimer,scenePose={};
try{const raw=localStorage.getItem(KEY);if(raw){pet=JSON.parse(raw);if(!valid(pet))throw Error('Your save could not be read. It has been kept intact. Restore a backup to continue.');pet=normalize(pet);}else pet={...fresh(),adopted:false,accessory:'none'};}catch(e){saveError=e.message;badSave=true;pet={...fresh(),adopted:false};}
try{
  scenePose=JSON.parse(localStorage.getItem('corgi-days-pose-v1')||'{}');
  const saved=JSON.parse(localStorage.getItem(EDITORS)||'null');
  if(saved&&typeof saved==='object'){for(const kind of ['adopt','wardrobe','settings'])if(saved[kind])drafts[kind]=editorDraft(pet,saved[kind],kind);}
  if(!saved){const legacy=JSON.parse(localStorage.getItem(DRAFT)||'null');if(legacy){drafts.wardrobe=editorDraft(pet,legacy,'wardrobe');drafts.settings=editorDraft(pet,legacy,'settings');}}
}catch{draftError='A saved draft could not be read. Your corgi is safe; download a backup before replacing the draft.';}
function save(){if(badSave)return false;try{localStorage.setItem(KEY,JSON.stringify(pet));saveError='';return true;}catch{saveError='Your progress could not be saved on this device. Keep this tab open, retry, or download a backup.';return false;}}
function draftSave(){try{localStorage.setItem(EDITORS,JSON.stringify(drafts));draftError='';return true;}catch{draftError='Your edits could not be saved. Keep this tab open, retry, or download a backup.';toast(draftError);return false;}}
function toast(s){clearTimeout(toastTimer);$('#toast').textContent=s;$('#toast').style.display='block';toastTimer=setTimeout(()=>$('#toast').style.display='none',4000);}
function view(){const v=new URLSearchParams(location.search).get('view');if(!pet.adopted)return 'adopt';return ['home','wardrobe','journal','settings'].includes(v)?v:'home';}
function route(v){const u=new URL(location.href);u.searchParams.set('view',v);u.hash='';for(const k of ['v','mode','az','el','zoom'])u.searchParams.delete(k);return u.search;}
function go(v,hash=''){history.pushState({},'',route(v)+hash);render();scrollTo({top:0,behavior:'instant'});if(hash)$(hash)?.scrollIntoView();}
function currentDraft(){const kind=view();if(!['adopt','wardrobe','settings'].includes(kind))return null;if(!drafts[kind])drafts[kind]=editorDraft(pet,kind==='adopt'?{name:''}:{},kind);return drafts[kind];}
function previewPet(){return {...pet,...currentDraft()};}
const coats=[['golden','🍯 Golden'],['tricolor','🐾 Tricolor'],['cocoa','🌰 Cocoa'],['cream','☁ Cream']];
const accessories=[['none','Just me · skip'],['bandana','Bandana'],['bow','Bow tie'],['crown','Crown'],['flower','Flower']];
function choices(key,list){const d=currentDraft();return `<div class="options">${list.map(([val,label])=>`<button type="button" class="option" data-style="${key}" data-value="${val}" aria-pressed="${d[key]===val}">${label}</button>`).join('')}</div>`;}
function nameAndCoat(){const d=currentDraft();return `<label for="name" class="eyebrow">Your corgi’s name</label><input class="field" id="name" name="name" maxlength="24" value="${esc(d.name)}" placeholder="e.g. Mochi" required autocomplete="off"><h2 class="section-heading">Coat color</h2>${choices('coat',coats)}`;}
function colorField(){return `<h2 class="section-heading"><label for="color">Accessory color</label></h2><div class="colors"><input type="color" id="color" value="${currentDraft().color}" aria-label="Accessory color"></div>`;}
function adoptionDate(){return new Date(pet.created).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric',timeZone:pet.timezone});}
function backupControls(){return `<div class="backup"><button type="button" id="backup">↓ Download backup</button><label for="restore" tabindex="0" role="button">↑ Restore backup</label><input id="restore" class="hidden" type="file" accept="application/json,.json"></div>`;}
function adoption(){currentDraft();return `<div class="intro"><div><div class="eyebrow">Adoption</div><h1>Meet your little loaf.</h1><p>Choose a name and coat to bring your corgi home.</p></div></div><div class="layout adoption"><section>${scene(previewPet())}<p class="note">You can change their name and coat later in Settings.<br>Dress them up any day in Wardrobe.</p></section><form class="card" id="adopt-form">${nameAndCoat()}<h2 class="section-heading">A first accessory <small>optional</small></h2>${choices('accessory',accessories)}<div class="setup-details"><p>♡ Your adoption day starts when you bring them home.</p><p>Daily care resets at midnight in <strong>${esc(pet.timezone)}</strong>.</p><p>Your corgi lives in this browser on this device. Backups keep a copy safe.</p></div><button class="primary" ${badSave?'disabled':''}>Bring my corgi home ♡</button><p class="save-note">No account needed. Your unfinished setup saves as you go.</p></form></div><div class="restore-setup"><p>Already have a corgi? Restore your backup.</p>${backupControls()}</div>`;}
function wardrobe(){currentDraft();return `<div class="intro"><div><div class="eyebrow">A fresh look for a familiar friend</div><h1>Dress for a little joy.</h1><p>Accessories, favorite colors, and somewhere cozy.</p></div><a class="edit-link" href="?view=settings">Name & coat settings ↗</a></div><div class="layout"><section>${scene(previewPet())}<p class="note">Every look is yours. No biscuits required.</p></section><form class="card" id="style-form"><h2>The finishing touch</h2>${choices('accessory',accessories)}${colorField()}<h2 class="section-heading">Somewhere cozy</h2>${choices('room',[['garden','🌿 Garden'],['peach','🍑 Peach'],['lavender','🪻 Lavender']])}<button class="primary" ${badSave?'disabled':''}>Save this look ♡</button><p class="save-note">Your unfinished look is kept while you explore.</p></form></div>`;}
function hasPerfectDay(){return Object.values(pet.days).some(a=>a.length===4);}
function homeWelcome(){const years=anniversary(pet);if(years)return `<div class="welcome" role="status">♡ Happy gotcha day, ${esc(pet.name)}! ${years} ${years===1?'year':'years'} together.</div>`;if(!Object.values(pet.days).some(a=>a.length))return `<div class="welcome"><strong>Welcome home, ${esc(pet.name)}!</strong><p>Read your corgi’s wish on the screen, then press a care button.</p></div>`;const keys=Object.keys(pet.days).sort(),last=keys.at(-1);if(last&&last<day(Date.now()-86400000,pet.timezone))return `<div class="welcome"><strong>Happy to see you again. ♡</strong><p>No catching up needed. Your corgi is safe and today is a fresh start.</p></div>`;return '';}
function reminderPrompt(){return hasPerfectDay()&&!pet.reminderPromptDismissed?`<div class="card reminder-prompt"><h2>A little nudge tomorrow?</h2><p>Optional: add a daily reminder to your calendar.</p><a class="edit-link" href="?view=settings#reminders">Choose a reminder ↗</a><button class="quiet-button" id="dismiss-reminder">No thanks</button></div>`:'';}
function settings(){currentDraft();return `<div class="intro"><div><div class="eyebrow">The little details</div><h1>Your corgi, your way.</h1><p>Identity, daily rhythm, and keeping your friend safe.</p></div></div><div class="layout"><section>${scene(previewPet())}<p class="note">♡ Home together since ${adoptionDate()}</p></section><form class="card" id="identity-form">${nameAndCoat()}<p>Changing these keeps the same corgi, adoption day, and care history.</p><button class="primary" ${badSave?'disabled':''}>Save name & coat</button><p class="save-note">Your unfinished edits save as you go.</p><a class="edit-link" href="?view=wardrobe">Change accessories in Wardrobe ↗</a></form></div><div class="settings-grid"><section class="card"><h2>Our daily rhythm</h2><p>Care for your corgi anytime. Each button earns biscuits on its first use each day. A new day begins at midnight in <strong>${esc(pet.timezone)}</strong>, the timezone recorded when your corgi’s home was created. Travel won’t unexpectedly reset your progress.</p><p>Miss a day? Your streak restarts, but your corgi is always safe and happy to see you.</p></section><section class="card" id="reminders"><h2>A gentle reminder</h2>${hasPerfectDay()?`<p>Add an optional daily event to your calendar. The calendar handles notifications, even when the game is closed.</p><label for="reminder-time">Remind me at</label><input class="field" type="time" id="reminder-time" value="${pet.reminderTime||'09:00'}"><button class="primary" id="calendar-reminder">Download calendar reminder</button><p class="save-note">Open the downloaded file and add it to your calendar. It uses your calendar’s local time. Manage or remove it there; remove an old reminder before importing a replacement.</p>`:'<p>Finish your first day’s four rituals to unlock an optional calendar reminder. For now, just enjoy getting to know each other.</p>'}</section><section class="card"><h2>Keep your friend safe</h2><p>Your corgi and edits save in this browser on this device. They don’t sync to other devices. Clearing browser data removes them.</p><p>Download a backup to keep a copy or move to another device. Restore replaces the current corgi after confirmation.</p>${backupControls()}</section></div>`;}
const care = {
  feed: { label: 'Feed', icon: '🥣', reply: 'Nom, nom!', wish: 'My bowl is empty!', thanks: 'A full tummy! Happy little tail wiggles.' },
  play: { label: 'Play', icon: '🎾', reply: 'Throw it again!', wish: 'I brought you my ball!', thanks: 'Caught it! One victory lap around the garden.' },
  wash: { label: 'Wash', icon: '🫧', reply: 'Shake, shake!', wish: 'Oops. Muddy paws!', thanks: 'Shake, shake! You got a little wet too.' },
  sleep: { label: 'Rest', icon: '🌙', reply: 'Zzz… cozy paws.', wish: 'Is it nap time yet?', thanks: 'Three tiny snores. One very happy corgi.' }
};
const labels = ['Full tummy', 'Happiness', 'Freshness', 'Energy'];
const icons = actions.map(action => care[action].icon);

function careKeys(done) {
  return `<div class="care-keys" aria-label="Daily care">${actions.map(action => {
    const finished = done.includes(action);
    return `<button data-action="${action}" ${badSave ? 'disabled' : ''} aria-label="${care[action].label}${finished ? ', daily biscuit earned' : ''}">
      <span class="keycap" aria-hidden="true">${care[action].icon}${finished ? '<span class="earned">✓</span>' : ''}</span>${care[action].label}
    </button>`;
  }).join('')}</div>`;
}

function scene(p) {
  const homeScreen = view() === 'home';
  const wish = dailyWish(p);
  const ask = care[wish.action];
  const message = homeScreen
    ? (wish.fulfilled ? 'My wish came true! ♡' : ask.wish)
    : (view() === 'adopt' ? 'Hello, human!' : 'How do I look?');
  return `<div class="handheld"><div class="shell-label">Corgi Days</div>
    <div class="scene scene-2d ${p.room}">
      <div class="scene-top"><span>${homeScreen ? (wish.fulfilled ? '♥ WISH MET' : '◇ DAILY WISH') : '♡ YOUR CORGI'}</span><span aria-hidden="true">▮▮▮</span></div>
      <div id="bubble" class="bubble" aria-live="polite">${message}</div>
      <div class="sun" aria-hidden="true"></div><div class="hill" aria-hidden="true"></div><div class="hill two" aria-hidden="true"></div>
      <button id="pet" class="corgi-button" aria-label="Cuddle your corgi"><span id="corgi-stage"></span></button>
      <div class="scene-caption">Tap for a cuddle ♡</div>
    </div>
    ${homeScreen ? careKeys(p.days[day(Date.now(),p.timezone)] || []) : '<div class="speaker" aria-hidden="true"></div>'}
  </div>`;
}

function home() {
  const done = pet.days[day(Date.now(), pet.timezone)] || [];
  const stats = needs(pet);
  return `<div class="layout pocket-home"><section>${scene(pet)}</section>
    <aside><div class="pet-heading"><div><div class="eyebrow">My corgi</div><h1>${esc(pet.name)}</h1></div><a class="edit-link" href="?view=wardrobe">Dress up ↗</a></div>
    ${homeWelcome()}
    <div class="card"><div class="card-head"><h2>Daily care</h2><span class="count">${done.length} / 4</span></div>
      <div class="stats">${stats.map((n,i) => `<div class="stat"><div class="stat-label"><span>${labels[i]}</span><span>${n}%</span></div><div class="meter" role="meter" aria-label="${labels[i]}" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="100"><i style="width:${n}%"></i></div></div>`).join('')}</div>
      <div class="bonus">${done.length === 4 ? 'Daily bonus collected! Keep playing anytime.' : 'First tap per button: +5 biscuits. All four: +20 bonus.'}</div>
    </div><a class="history-link" href="?view=journal">☀ ${currentStreak(pet)}-day streak <span>Journal ↗</span></a>${reminderPrompt()}</aside></div>`;
}
function journal(){const entries=Object.entries(pet.days).sort().reverse(),total=entries.filter(([,v])=>v.length===4).length;return `<div class="journal"><div class="intro"><div><div class="eyebrow">The days add up to love</div><h1>Our little story.</h1><p>All the good days with ${esc(pet.name)}.</p></div></div><p class="adoption-date">♡ Home together since ${adoptionDate()}</p><div class="journal-summary"><div class="card"><strong>${total}</strong><small>happy days</small></div><div class="card"><strong>${currentStreak(pet)}</strong><small>day streak</small></div><div class="card"><strong>${pet.biscuits}</strong><small>biscuits earned</small></div></div><div class="card"><h2>Little moments</h2>${entries.length?entries.map(([d,a])=>`<div class="entry"><span>${new Date(d+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}</span><span>${a.map(x=>icons[actions.indexOf(x)]).join(' ')} <small>${a.length===4?'♡ Perfect day':a.length+'/4 rituals'}</small></span></div>`).join(''):'<div class="empty"><span>🌱</span><p>Every friendship starts with a little hello.<br>Complete a ritual to begin your story.</p><a class="edit-link" href="?view=home">Care for your corgi ↗</a></div>'}</div><div class="card" style="margin-top:20px"><h2>A little care guide</h2><p>Visit each day to feed, play, wash, and rest. The first use of each care button earns 5 biscuits per day; completing all four earns 20 more and keeps your streak going. Biscuits are a keepsake of your time together. All styles are free.</p><p>Needs slowly decrease while you’re away. Missed days reset the streak, but your corgi always welcomes you back. Daily rituals reset at midnight in ${esc(pet.timezone)}.</p><h2 class="section-heading">Keep your friend safe</h2><p>Your corgi saves in this browser on this device. Clearing browser data removes it. Download a backup to keep a copy or move to another device. Restore replaces the current corgi after confirmation.</p><div class="backup"><button id="backup">↓ Download backup</button><label for="restore">↑ Restore backup</label><input id="restore" class="hidden" type="file" accept="application/json,.json"></div></div></div>`}
function render(){
  clearTimeout(bubbleTimer);stage?.dispose();stage=null;const v=view();
  if(new URLSearchParams(location.search).get('view')!==v)history.replaceState({},'',route(v));
  $('#app').innerHTML=`<header><a href="?view=home" class="brand"><span class="brand-mark">🐾</span><div>Corgi Days<p class="tagline">pocket pet</p></div></a><div class="header-right"><a class="tiny-link" href="/">John Ta ↗</a>${pet.adopted?`<span class="coin" title="Biscuits earned by daily care">✿ ${pet.biscuits} biscuits</span><a class="settings-link" href="?view=settings" aria-label="Settings" ${v==='settings'?'aria-current="page"':''}>⚙</a>`:''}</div></header><main>${saveError||draftError?`<div role="alert" class="error">${esc(saveError||draftError)} <button id="retry">Retry save</button> <button id="emergency-backup">Download backup</button></div>`:''}${({adopt:adoption,home,wardrobe,journal,settings})[v]()}</main>${pet.adopted?`<nav class="nav" aria-label="Game sections">${[['home','⌂','My corgi'],['wardrobe','✿','Wardrobe'],['journal','▤','Journal']].map(([k,icon,label])=>`<a href="?view=${k}" ${v===k?'aria-current="page"':''} class="${v===k?'active':''}"><span>${icon}</span>${label}</a>`).join('')}</nav>`:''}`;
  bind();
}
function petAnimation(message,action){stage?.react(action);const b=$('#bubble'),p=$('#pet');if(!b||!p)return;const restingText = b.dataset.resting || b.textContent;
  b.dataset.resting = restingText;
  b.textContent = message;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { b.textContent = restingText; }, 3200);p.classList.remove('happy');void p.offsetWidth;p.classList.add('happy');}
function downloadFile(contents,type,name){const blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function download(){downloadFile(JSON.stringify({pet,drafts,scenePose},null,2),'application/json','corgi-days-backup.json');toast('Your corgi’s story, ready to keep.');}
function submitEditor(e){
  e.preventDefault();if(badSave)return;const kind=view(),d=currentDraft();
  if('name' in d&&!d.name.trim()){$('#name').setCustomValidity('Give your corgi a name.');$('#name').reportValidity();return;}
  const next=kind==='adopt'?adopt(pet,d):{...pet,...editorDraft(pet,d,kind)};
  if('name' in d)next.name=next.name.trim();
  pet=next;
  if(save()){delete drafts[kind];draftSave();go('home');toast(kind==='adopt'?'Welcome home, '+pet.name+'! ♡':kind==='settings'?'Your corgi’s details are saved.':'Looking good, '+pet.name+'! ♡');}else render();
}
async function restore(e){
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>1000000)throw Error('This backup is too large.');
    const data=JSON.parse(await file.text()),p=data.pet||data;
    if(!valid(p))throw Error('This is not a valid Corgi Days backup.');
    if(!confirm('Replace this device’s corgi with '+p.name+' from the backup? Download your current backup first if you want to keep it.'))return;
    const next=normalize(p),nextDrafts={};
    if(data.drafts)for(const kind of ['adopt','wardrobe','settings'])if(data.drafts[kind])nextDrafts[kind]=editorDraft(next,data.drafts[kind],kind);
    if(data.draft){nextDrafts.wardrobe=editorDraft(next,data.draft,'wardrobe');nextDrafts.settings=editorDraft(next,data.draft,'settings');}
    // Commit the pet first; leave the current pet unchanged if storage rejects it.
    try{localStorage.setItem(KEY,JSON.stringify(next));}catch{throw Error('The backup could not be saved. Your current corgi is unchanged.');}
    pet=next;badSave=false;saveError='';drafts=nextDrafts;draftSave();
    if(data.scenePose&&typeof data.scenePose==='object'){scenePose=data.scenePose;try{localStorage.setItem('corgi-days-pose-v1',JSON.stringify(scenePose));}catch{}}
    go(pet.adopted?'home':'adopt');toast('Welcome home, '+pet.name+'!');
  }catch(err){toast(err.message);}finally{e.target.value='';}
}
function bind(){
  const host=$('#corgi-stage');if(host)stage=mountCorgi(host,previewPet());
  document.querySelectorAll('a[href^="?view="]').forEach(a=>a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();const u=new URL(a.href);go(u.searchParams.get('view'),u.hash);});
  $('#pet')?.addEventListener('click',()=>petAnimation(['You’re my favorite human. ♡','A very good day for belly rubs.','Tiny paws. So much love.','Did someone say treats?'][Math.floor(Math.random()*4)]));
  document.querySelectorAll('[data-action]').forEach(button => {
    button.onclick = () => {
      if (badSave) return;
      const action = button.dataset.action;
      const now = Date.now();
      const next = act(pet, action, now);
      if (next === pet) {
        petAnimation(care[action].reply, action);
        return;
      }
      const wish = dailyWish(pet, now);
      const keyboardFocus = button.matches(':focus-visible');
      pet = next;
      const saved = save();
      render();
      if (keyboardFocus) document.querySelector(`[data-action="${action}"]`).focus({preventScroll:true});
      const matched = wish.action === action;
      petAnimation(matched ? care[action].thanks : care[action].reply, action);
      const perfect = pet.days[day(now,pet.timezone)].length === 4;
      if (saved) toast((matched ? 'Wish granted! ' : '') + (perfect ? '+25 biscuits' : '+5 biscuits'));
    };
  });
  $('#name')?.addEventListener('input',e=>{e.target.setCustomValidity('');currentDraft().name=e.target.value;draftSave();});
  $('#color')?.addEventListener('input',e=>{currentDraft().color=e.target.value;draftSave();stage?.style(previewPet());});
  document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{currentDraft()[b.dataset.style]=b.dataset.value;draftSave();render();});
  for(const id of ['adopt-form','style-form','identity-form'])$('#'+id)?.addEventListener('submit',submitEditor);
  $('#retry')?.addEventListener('click',()=>{const a=save(),b=draftSave();if(a&&b)toast('Your corgi and edits are safely saved.');render();});
  $('#backup')?.addEventListener('click',download);$('#emergency-backup')?.addEventListener('click',download);
  $('#restore')?.addEventListener('change',restore);
  $('label[for=restore]')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#restore').click();}});
  $('#dismiss-reminder')?.addEventListener('click',()=>{pet.reminderPromptDismissed=true;save();render();});
  $('#reminder-time')?.addEventListener('input',e=>{if(!e.target.value)return;pet.reminderTime=e.target.value;if(!save())toast(saveError);});
  $('#calendar-reminder')?.addEventListener('click',()=>{try{downloadFile(calendarReminder(pet,$('#reminder-time').value),'text/calendar;charset=utf-8','corgi-days-reminder.ics');pet.reminderPromptDismissed=true;save();render();toast('Open the file to add the reminder to your calendar.');}catch(e){toast(e.message);}});
}
window.addEventListener('popstate',render);
window.addEventListener('beforeunload',e=>{if(saveError||draftError){e.preventDefault();e.returnValue='';}});
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue&&!saveError){try{const p=JSON.parse(e.newValue);if(valid(p)){pet=normalize(p);render();}}catch{}}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
setInterval(()=>{if(!document.hidden&&view()==='home')render();},60000);
history.replaceState({},'',route(view())+location.hash);if(!badSave)save();render();
if(location.hash==='#reminders')$('#reminders')?.scrollIntoView();
