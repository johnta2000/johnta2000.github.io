const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const {buildSync} = require('esbuild');
const source = __dirname + '/collection-src';
const code = buildSync({entryPoints: [source + '/app/AccountApp.tsx'], bundle: true, write: false, format: 'iife', platform: 'browser', loader: {'.css': 'empty'}, define: {'process.env.NODE_ENV': '"test"'}}).outputFiles[0].text;
const entry = name => ({id: name, name, startDate: '2025-06-14', endDate: '2025-06-14', city: 'Test City', venue: '', kind: 'Festival', artists: [], crew: [], costs: {ticket: null, travel: null, stay: null, other: null}, albumUrl: '', notes: 'Private', rating: 0, favoriteArtist: '', color: 0});
const tick = () => new Promise(r => setTimeout(r, 10));
async function until(fn) { for (let i = 0; i < 150; i++) { if (fn()) return; await tick(); } throw Error('UI did not reach expected state.'); }
function harness(options = {}) {
  const dom = new JSDOM('<div id="root"></div>', {url: 'https://example.test/tools/rally/collection/' + (options.search || ''), runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, requests = [], saves = [];
  let listener, resolveAlice, tokenResolve, heldSession, loadFailures = options.loadFailures || 0, saveFailures = options.saveFailures || 0;
  const rows = {alice: options.raves || (options.empty ? [] : [entry('Alice private night')]), bob: [entry('Bob private night')]};
  function session(subject) { return {id: subject + '-session', getToken: async () => {
    if (heldSession === subject) await new Promise(r => tokenResolve = r);
    return 'e30.' + w.btoa(JSON.stringify({aud: 'convex', subject})) + '.x';
  }}; }
  const clerk = w.Clerk = {user: {id: 'alice', firstName: 'Alice'}, session: session('alice'), load: async () => {}, addListener: fn => { listener = fn; return () => {}; },
    signOut: async () => { clerk.user = null; clerk.session = null; listener({user: null}); }};
  w.fetch = async (_, options) => {
    const {path, args} = JSON.parse(options.body), token = options.headers.Authorization.split(' ')[1], subject = JSON.parse(w.atob(token.split('.')[1])).subject;
    requests.push({path, args, subject});
    const success = value => ({ok: true, json: async () => ({status: 'success', value})});
    const failure = message => ({ok: true, json: async () => ({status: 'error', errorData: message})});
    if (path === 'rally:listEvents') return optionsRef.plansFail ? failure('Plans unavailable') : success(optionsRef.events || []);
    if (path === 'rallyCollection:list') {
      if (subject === 'alice' && optionsRef.holdAlice) await new Promise(r => resolveAlice = r);
      if (loadFailures-- > 0) return failure('Temporary load failure');
      return success({raves: structuredClone(rows[subject] || [])});
    }
    if (path === 'rallyCollection:save') {
      saves.push(args.rave);
      if (saveFailures-- > 0) return failure('Temporary save failure');
      rows[subject] = [args.rave, ...rows[subject].filter(r => r.id !== args.rave.id)];
      return success(args.rave);
    }
    if(path==='rallyCollection:connection') {
      if(optionsRef.connectionFails)return failure('Connection unavailable');
      return success(optionsRef.connection || {details:{...entry('Shared crew plan'),sourceEventId:'project',attendance:'planned'},people:[],lineup:['Suggested DJ'],wishlist:[],revision:'rev-1',canUpdatePlan:true,sharedMemories:[],myMemory:null});
    }
    if(path==='rallyCollection:syncPlan') {
      if(optionsRef.syncFails)return failure('The plan or diary changed. Refresh the preview.');
      let r=rows[subject].find(r=>r.id===args.id);
      if(args.direction==='toDiary'&&args.fields.includes('details'))r={...r,name:optionsRef.connection.details.name,city:optionsRef.connection.details.city};
      rows[subject]=rows[subject].map(old=>old.id===r.id?r:old);return success(r);
    }
    if(path==='rallyCollection:shareMemory') {
      optionsRef.connection.myMemory={memberId:'alice',name:'Alice',note:args.note,albumUrl:args.albumUrl,updatedAt:Date.now()};
      optionsRef.connection.sharedMemories=[optionsRef.connection.myMemory];return success({ok:true});
    }
    if (path === 'rallyCollection:createPlan') {if(optionsRef.createPlanFails) return failure('Could not create plan'); const saved={...rows[subject].find(r=>r.id===args.id),sourceEventId:'created-room'}; rows[subject]=rows[subject].map(r=>r.id===saved.id?saved:r);return success(saved);}
    if (path === 'rallyCollection:remove') { rows[subject] = rows[subject].filter(r => r.id !== args.id); return success({ok: true}); }
    if (path === 'rallyCollection:draftFromEvent') { if (optionsRef.planSuggestionsFail) return failure('Plan unavailable'); if (optionsRef.holdPlan) await new Promise(r => optionsRef.releasePlan = r); return success({rave: rows[subject].find(r => r.sourceEventId === args.eventId) || {...entry('Plan night'), id: 'rally_'+args.eventId, attendance:'planned', sourceEventId: args.eventId, notes: ''}, existing: true, artistSuggestions: optionsRef.artistSuggestions || ['Suggested DJ'], crewSuggestions: optionsRef.crewSuggestions || ['Suggested Friend'],crewPeople:optionsRef.crewPeople||[]}); }
    throw new Error('Unexpected test request: ' + path);
  };
  const optionsRef = options;
  const mediaListeners = new Set();
  const media = {matches: !!options.mobile, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn)};
  w.matchMedia = () => media;
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (options.storageBlocked) { w.Storage.prototype.getItem = () => { throw Error('Storage denied'); }; w.Storage.prototype.setItem = () => { throw Error('Storage denied'); }; }
  w.eval(fs.readFileSync(__dirname + '/../../assets/js/searchable-select.js', 'utf8'));
  w.eval(code);
  const text = () => w.document.body.textContent;
  const button = label => [...w.document.querySelectorAll('button')].find(b => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
  const fill = async (selector, value) => {
    const input = w.document.querySelector(selector); assert(input, selector);
    const prototype = input.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(new w.Event('input', {bubbles: true})); input.dispatchEvent(new w.Event('change', {bubbles: true})); await tick();
  };
  return {w, requests, saves, rows, text, button, fill, resize(mobile) { media.matches = mobile; mediaListeners.forEach(fn => fn()); }, close: () => w.close(),
    switchUser(subject) { clerk.user = subject ? {id: subject, firstName: subject === 'bob' ? 'Bob' : 'Alice'} : null; clerk.session = subject ? session(subject) : null; listener({user: clerk.user}); },
    releaseAlice() { resolveAlice?.(); }, hasPending: () => !!resolveAlice,
    holdToken() { heldSession = 'alice'; }, releaseToken() { heldSession = null; tokenResolve?.(); }, tokenPending: () => !!tokenResolve,
  };
}
test('switching accounts clears private rows, and signing out removes them', async () => {
  const h = harness(); try {
    await until(() => h.text().includes('Alice private night'));
    h.switchUser('bob'); await until(() => h.text().includes('Bob private night')); assert(!h.text().includes('Alice private night'));
    h.switchUser(null); await until(() => h.text().includes('Sign in / create account')); assert(!h.text().includes('Bob private night'));
  } finally { h.close(); }
});
test('a delayed response for a previous account cannot populate the next account', async () => {
  const h = harness({holdAlice: true}); try {
    await until(h.hasPending); h.switchUser('bob'); await until(() => h.text().includes('Bob private night'));
    h.releaseAlice(); await tick(); await tick(); assert(!h.text().includes('Alice private night'));
  } finally { h.close(); }
});
test('a failed plans request does not block collection access or manual entry',async()=>{
 const h=harness({plansFail:true});try{await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();assert(h.w.document.querySelector('.rave-form'));}finally{h.close();}
});
test('failed collection load is not presented as an empty collection; retry recovers', async () => {
  const h = harness({loadFailures: 1}); try {
    await until(() => h.text().includes('Temporary load failure')); assert(!h.text().includes('Your first night starts here')); assert(!h.button('Add a rave'));
    h.button('Try again').click(); await until(() => h.text().includes('Alice private night'));
  } finally { h.close(); }
});
test('searchable filters preserve chosen values and an unmatched search has a clear empty state', async () => {
  const h = harness(); try {
    await until(() => h.text().includes('Alice private night'));
    const select = h.w.document.querySelector('select[aria-label="Year"]'); await until(() => select.hidden);
    const picker = select.nextElementSibling; picker.querySelector('button').click();
    const search = picker.querySelector('input'); search.value = 'nothing'; search.dispatchEvent(new h.w.Event('input', {bubbles: true})); assert(picker.textContent.includes('No'));
    search.value = '2025'; search.dispatchEvent(new h.w.Event('input', {bubbles: true})); picker.querySelector('[role="option"]').click(); await tick(); assert.equal(select.value, '2025');
    assert(h.button('Remove Year filter')); h.button('Remove Year filter').click(); await tick(); assert.equal(select.value, '');
  } finally { h.close(); }
});
test('entry saves uncommitted typed names, retries with the same ID, and stays visible after filters', async () => {
  const h = harness({saveFailures: 1}); try {
    await until(() => h.text().includes('Alice private night')); await h.fill('input[aria-label="Search results"]', 'Alice');
    h.button('Add a rave').click(); await tick();
    await h.fill('.rave-form input[maxlength="160"]', 'New test rave'); await h.fill('.rave-form input[aria-label="Start date"]', '2025-08-01');
    await h.fill('input[aria-label="Artists you actually saw"]', 'Test DJ, Second DJ'); await h.fill('input[aria-label="Who did you go with?"]', 'New Friend');
    h.button('Save to rave diary').click(); await until(() => h.text().includes('Temporary save failure'));
    assert.equal(h.w.document.querySelector('.rave-form input[maxlength="160"]').value, 'New test rave');
    h.button('Save to rave diary').click(); await until(() => !h.w.document.querySelector('.rave-form'));
    assert.equal(h.saves.length, 2); assert.equal(h.saves[0].id, h.saves[1].id); assert.deepEqual(h.saves[1].artists, ['Test DJ', 'Second DJ']); assert.deepEqual(h.saves[1].crew, ['New Friend']);
    assert.equal(h.w.document.querySelector('input[aria-label="Search results"]').value, ''); assert(h.text().includes('New test rave'));
  } finally { h.close(); }
});
test('unsaved changes require an explicit discard and remain when editing continues', async () => {
  const h = harness({empty: true}); try {
    await until(() => h.text().includes('Your first night starts here')); h.button('Add a rave').click(); await tick();
    await h.fill('.rave-form input[maxlength="160"]', 'Unsaved night'); h.button('Cancel').click(); await tick();
    assert(h.text().includes('Discard your unsaved changes?')); h.button('Keep editing').click(); await tick();
    assert.equal(h.w.document.querySelector('.rave-form input[maxlength="160"]').value, 'Unsaved night');
    h.button('Close dialog').click(); await tick(); h.button('Discard changes').click(); await tick(); assert(!h.w.document.querySelector('dialog'));
    assert.equal(h.saves.length, 0);
  } finally { h.close(); }
});
test('a token delayed across account switching cannot send the old draft as the new user', async () => {
  const h = harness(); try {
    await until(() => h.text().includes('Alice private night')); h.button('Add a rave').click(); await tick();
    await h.fill('.rave-form input[maxlength="160"]', 'Alice draft'); await h.fill('.rave-form input[aria-label="Start date"]', '2025-08-01');
    h.holdToken(); h.button('Save to rave diary').click(); await until(h.tokenPending); h.switchUser('bob');
    await until(() => h.text().includes('Bob private night')); h.releaseToken(); await tick(); await tick(); assert.equal(h.saves.length, 0);
  } finally { h.close(); }
});
test('Rally deep links open an automatic entry with explicit attendance and no preselected sets',async()=>{
 const h=harness({search:'?from=past'});try{await until(()=>h.button('Edit your diary'));assert(!h.w.document.querySelector('.rave-form'));assert(h.button('Log your experience'));h.button('Log your experience').click();await tick();assert(h.button('I went'));assert.equal(h.w.document.querySelectorAll('.input-tag').length,0);assert(h.text().includes('Suggested DJ'));assert.equal(h.saves.length,0);}finally{h.close();}
});
test('browser storage restrictions do not break the collection', async () => {
  const h = harness({storageBlocked: true}); try { await until(() => h.text().includes('Alice private night')); assert(h.button('Add a rave')); } finally { h.close(); }
});
test('example mode is labeled and disables exporting actual account data', async () => {
  const h = harness(); try {
    await until(() => h.text().includes('Alice private night')); h.button('Example data').click(); await tick();
    assert(h.text().includes('Fictional raves and costs')); assert(h.button('Back up JSON').disabled); assert(h.button('Import backup').disabled); assert(h.button('Export CSV').disabled);
    h.button('Back to my collection').click(); await tick(); assert(h.text().includes('Alice private night')); assert(!h.text().includes('Lost Lands'));
  } finally { h.close(); }
});
test('planning navigation exposes collection without requiring a room', () => {
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8'); assert(html.includes('href="./collection/"')); assert(html.includes('collection-gate-link'));
  const app = fs.readFileSync(__dirname + '/app.js', 'utf8'); assert(app.includes('window.RallyCollection?.mount(data'));
});
test('adding an album from the sheet opens the photo section and focuses the link', async () => {
  const h = harness(); try {
    await until(() => h.text().includes('Alice private night')); h.button('Add photo album for Alice private night').click(); await tick();
    const album = h.w.document.querySelector('.rave-form input[type="url"]'); assert(album.closest('details').open); assert.equal(h.w.document.activeElement, album);
  } finally { h.close(); }
});

test('mobile timeline uses saved entries, preserves unknown costs, and edits through the existing form', async () => {
  const h = harness({mobile: true, raves: [{...entry('My saved night'), artists: ['Test DJ'], crew: ['A friend'], sourceEventId: 'linked-room', albumUrl: 'https://example.com/album'}]}); try {
    await until(() => h.w.document.querySelector('.timeline-card'));
    assert(!h.w.document.querySelector('.rave-sheet')); assert(h.text().includes('Cost unlogged'));
    h.button('View My saved night').click(); await tick();
    assert(h.w.document.querySelector('a[href="/tools/rally/?event=linked-room"]'));
    assert(h.w.document.querySelector('a[href="https://example.com/album"]'));
    h.button('Edit this night').click(); await tick();
    await h.fill('.rave-form textarea', 'Updated memory');
    h.button('Save changes').click(); await until(() => !h.w.document.querySelector('.rave-form'));
    assert(h.button('View My saved night'));assert.equal(h.saves[0].notes,'Updated memory'); assert.equal(h.saves.length, 1); assert.equal(h.saves[0].sourceEventId, 'linked-room');
  } finally { h.close(); }
});
test('timeline filtering survives switching to desktop and zero costs remain explicit', async () => {
  const h = harness({mobile: true, raves: [{...entry('Free night'), costs: {ticket:0,travel:0,stay:0,other:0}, rating:5}, entry('Unlogged night')]}); try {
    await until(() => h.w.document.querySelector('.timeline-card'));
    assert(h.button('View Free night').textContent.includes('$0.00')); assert(h.button('View Unlogged night').textContent.includes('Cost unlogged'));
    h.button('5-star nights').click(); await tick(); assert(!h.button('View Unlogged night'));
    h.resize(false); await tick(); assert(h.w.document.querySelector('.rave-sheet')); assert(!h.button('View Unlogged night'));
    h.resize(true); await tick(); assert(h.w.document.querySelector('.timeline-card')); assert(!h.w.document.querySelector('.rave-sheet'));
    h.button('Search collection').click(); await tick(); await h.fill('input[aria-label="Search results"]', 'missing'); assert(h.text().includes('No matching nights'));
    h.button('Clear filters').click(); await tick(); assert.equal(h.w.document.querySelectorAll('.timeline-card').length, 2);
  } finally { h.close(); }
});
test('mobile add opens the personal form directly and account navigation remains available',async()=>{
 const h=harness({mobile:true});try{await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();assert(h.w.document.querySelector('.rave-form'));assert(!h.button('From My raves'));h.button('Cancel').click();await tick();h.button('Diary account and navigation').click();await tick();assert(h.w.document.querySelector('dialog a[href="/tools/rally/collection/?view=projects"]'));h.button('Sign out').click();await until(()=>h.text().includes('Sign in / create account'));}finally{h.close();}
});

test('desktop drawer connects collection sections and Rally projects without a tab bar', async () => {
  const h = harness({raves:[{...entry('A night'), artists:['Test DJ'], crew:['Nancy']}]}); try {
    await until(() => h.button('Open navigation'));
    assert(!h.w.document.querySelector('.collection-nav'));
    h.button('Open navigation').click(); await tick();
    assert(h.w.document.querySelector('.collection-drawer[open]'));
    assert(h.w.document.querySelector('.collection-drawer a[href="/tools/rally/collection/?view=projects"]'));
    h.button('Artists').click(); await tick();
    assert(!h.w.document.querySelector('.collection-drawer')); assert(h.text().includes('Artists you’ve seen')); assert(h.text().includes('Test DJ'));
    h.button('Open navigation').click(); await tick(); h.button('Rave history').click(); await tick(); assert(h.w.document.querySelector('.rave-sheet'));
    h.button('Open navigation').focus(); h.button('Open navigation').click(); await tick(); h.w.document.querySelector('.collection-drawer').dispatchEvent(new h.w.Event('cancel', {cancelable:true})); await tick(); assert(!h.w.document.querySelector('.collection-drawer')); assert.equal(h.w.document.activeElement,h.button('Open navigation'));
    h.resize(true); await tick(); assert(h.w.document.querySelector('.collection-nav')); assert(!h.button('Open navigation'));
  } finally { h.close(); }
});

test('linked saved experience opens details without creating a second draft', async () => {
 const h=harness({search:'?from=room',raves:[{...entry('Already saved night'),sourceEventId:'room'}]});try{
  await until(()=>h.w.document.querySelector('dialog')?.textContent.includes('Open crew plan'));
  assert(!h.w.document.querySelector('.rave-form'));
  assert.equal(h.saves.length,0);
  assert.equal(h.w.document.querySelector('dialog a[href*="event=room"]').textContent,'Open crew plan');
 }finally{h.close();}
});
test('projects offer the same diary destination for upcoming and past raves',async()=>{
 const h=harness({search:'?view=projects',events:[{id:'room',name:'Past warehouse',startsAt:'2025-01-01'},{id:'future',name:'Future festival',startsAt:'2099-01-01'}],raves:[{...entry('Saved'),sourceEventId:'room'}]});try{await until(()=>h.text().includes('Open diary entry'));const rows=[...h.w.document.querySelectorAll('.project-row')];assert.equal(rows.length,2);assert(rows.every(r=>r.querySelector('.project-experience').textContent.includes('Open diary entry')));assert(!h.text().includes('Save to my diary'));assert(h.text().includes('automatically'));h.switchUser('bob');await until(()=>h.text().includes('Bob'));assert(!h.text().includes('In your diary'));await h.fill('input[type="search"]','nothing');assert(h.text().includes('No raves match'));}finally{h.close();}
});
test('project overview ignores a delayed experience status after account changes',async()=>{
 const dom=new JSDOM('<main id="page"></main>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;try{w.Clerk={user:{id:'alice'}};w.eval(fs.readFileSync(__dirname+'/personal-collection.js','utf8'));let resolve;w.RallyCollection.mount({id:'room',startsAt:'2025-01-01'},{loadExperience:()=>new Promise(r=>resolve=r)});await tick();w.Clerk.user.id='bob';resolve({sharedMemories:[{name:'Alice crew',note:'Stale secret'}]});await tick();assert(!w.document.body.textContent.includes('Stale secret'));assert(w.document.body.textContent.includes('This rave is in your diary'));}finally{w.close();}
});

test('calendar jumps directly to a searched year and month, accepts leap day, and restores form focus',async()=>{
 const h=harness({empty:true});try{
  await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
  await h.fill('.rave-form input[maxlength="160"]','Old night');h.button('Choose start date on calendar').click();await tick();
  assert(h.w.document.querySelector('.date-calendar-dialog[open]'));
  async function choose(label,searchText){
   const select=h.w.document.querySelector(`select[aria-label="${label}"]`),picker=select.nextElementSibling;
   picker.querySelector('button').click();const input=picker.querySelector('input');input.value=searchText;input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
   const option=[...picker.querySelectorAll('[role="option"]')].find(o=>o.textContent.trim()===searchText);assert(option);option.click();await tick();
  }
  await choose('Calendar year','2020');await choose('Calendar month','February');
  h.button('February 29, 2020').click();await tick();
  assert(!h.w.document.querySelector('.date-calendar-dialog'));assert.equal(h.w.document.querySelector('input[aria-label="Start date"]').value,'02/29/2020');
  assert.equal(h.w.document.activeElement,h.button('Choose start date on calendar'));assert.equal(h.w.document.body.style.overflow,'hidden');
  h.button('Save to rave diary').click();await until(()=>h.saves.length===1);assert.equal(h.saves[0].startDate,'2020-02-29');assert.equal(h.saves[0].endDate,'2020-02-29');
 }finally{h.close();}
});
test('typed dates reject impossible days and reversed ranges without losing edits',async()=>{
 const h=harness({empty:true});try{
  await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();await h.fill('.rave-form input[maxlength="160"]','Typed old night');
  await h.fill('input[aria-label="Start date"]','02/29/2023');assert(!h.w.document.querySelector('input[aria-label="Start date"]').checkValidity());
  h.button('Save to rave diary').click();await tick();assert.equal(h.saves.length,0);
  await h.fill('input[aria-label="Start date"]','02/29/2020');await h.fill('input[aria-label="End date"]','02/28/2020');assert(!h.w.document.querySelector('input[aria-label="End date"]').checkValidity());
  await h.fill('input[aria-label="End date"]','03/01/2020');h.button('Save to rave diary').click();await until(()=>h.saves.length===1);
  assert.equal(h.saves[0].startDate,'2020-02-29');assert.equal(h.saves[0].endDate,'2020-03-01');
 }finally{h.close();}
});
test('calendar keyboard navigation crosses months and Escape only closes the calendar',async()=>{
 const h=harness();try{
  await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();await h.fill('input[aria-label="Start date"]','12/31/2019');
  h.button('Choose start date on calendar').click();await tick();const day=h.button('December 31, 2019');day.focus();day.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await tick();
  assert.equal(h.w.document.activeElement.getAttribute('aria-label'),'January 1, 2020');
  h.w.document.querySelector('.date-calendar-dialog').dispatchEvent(new h.w.Event('cancel',{cancelable:true}));await tick();assert(!h.w.document.querySelector('.date-calendar-dialog'));assert(h.w.document.querySelector('.rave-form'));assert.equal(h.w.document.querySelector('input[aria-label="Start date"]').value,'12/31/2019');
 }finally{h.close();}
});

test('partial date filters do not hide nights and clearing filters resets their text',async()=>{
 const h=harness();try{
  await until(()=>h.text().includes('Alice private night'));
  h.button('More filters').click();await tick();
  await h.fill('input[aria-label="From date"]','02/');assert(h.text().includes('Alice private night'));
  h.button('Reset').click();await tick();assert.equal(h.w.document.querySelector('input[aria-label="From date"]').value,'');
 }finally{h.close();}
});


test('lineup checklist exposes the full lineup, keeps selected rows visible, and never saves search text', async () => {
  const names = Array.from({length: 24}, (_, i) => `Artist ${String(i + 1).padStart(2, '0')}`);
  const h = harness({search: '?from=past', artistSuggestions: names, crewSuggestions: ['Nancy', 'Maya']});
  try {
    await until(()=>h.button('Log your experience'));h.button('Log your experience').click();await tick();h.button('I went').click();await tick();
    const picker = h.w.document.querySelector('.name-picker');
    assert.equal(picker.querySelectorAll('input[type=checkbox]').length, 24);
    assert.equal(picker.querySelectorAll('input:checked').length, 0);
    await h.fill('input[aria-label="Search artists"]', '24');
    assert.equal(picker.querySelectorAll('input[type=checkbox]').length, 1);
    picker.querySelector('input[type=checkbox]').click(); await tick();
    assert(picker.querySelector('input[type=checkbox]').checked);
    assert(picker.textContent.includes('1 selected'));
    h.button('Clear artist search').click(); await tick();
    const selected = [...picker.querySelectorAll('button')].find(b => b.textContent === 'Selected 1');
    selected.click(); await tick(); assert.equal(picker.querySelectorAll('input[type=checkbox]').length, 1);
    picker.querySelector('input[type=checkbox]').click(); await tick(); assert(picker.textContent.includes('No one selected yet'));
    [...picker.querySelectorAll('button')].find(b => b.textContent === 'Lineup 24').click(); await tick();
    await h.fill('input[aria-label="Search artists"]', '24');
    picker.querySelector('input[type=checkbox]').click(); await tick();
    await h.fill('input[aria-label="Search artists"]', 'Unmatched search');
    assert(picker.textContent.includes('No matching names'));
    const search = picker.querySelector('input[aria-label="Search artists"]');
    const event = new h.w.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}); search.dispatchEvent(event);
    assert(event.defaultPrevented); assert.equal(h.saves.length, 0);
    h.button('Save changes').click(); await until(() => h.saves.length === 1);
    assert.deepEqual(h.saves[0].artists, ['Artist 24']); assert.deepEqual(h.saves[0].crew, []);
  } finally { h.close(); }
});

test('plan lineup excludes unrelated diary suggestions, custom names remain reviewable, and keyboard reaches choices', async () => {
  const h = harness({search: '?from=past', artistSuggestions: ['Same DJ', 'Other DJ'], raves: [{...entry('Earlier rave'), artists: ['same dj', 'History DJ']}]});
  try {
    await until(()=>h.button('Log your experience'));h.button('Log your experience').click();await tick();h.button('I went').click();await tick();
    const picker = h.w.document.querySelector('.name-picker');
    assert.equal(picker.querySelectorAll('input[type=checkbox]').length, 2);
    assert(picker.textContent.includes('From this lineup')); assert(!picker.textContent.includes('From your diary')); assert(!picker.textContent.includes('History DJ'));
    const search = picker.querySelector('input[aria-label="Search artists"]'); search.focus();
    search.dispatchEvent(new h.w.KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
    assert.equal(h.w.document.activeElement, picker.querySelector('input[type=checkbox]'));
    await h.fill('input[aria-label="Artists you actually saw"]', 'New DJ, new dj'); h.button('Add artist').click(); await tick();
    assert(picker.textContent.includes('Other logged sets · not in this lineup')); assert.equal(picker.querySelectorAll('input:checked').length, 1);
    picker.querySelector('input:checked').click(); await tick();
    assert.equal(picker.querySelectorAll('input:checked').length, 0);
    await h.fill('input[aria-label="Search friends"]', 'Nobody');
    h.button('Save changes').click(); await until(() => h.saves.length === 1);
    assert.deepEqual(h.saves[0].artists, []); assert.deepEqual(h.saves[0].crew, []);
  } finally { h.close(); }
});


test('logging shows core credits but saves the original collaboration and special-set labels', async () => {
  const labels = ['Space Laces x Excision', 'Excision Detox Set'];
  const h = harness({search: '?from=past', artistSuggestions: labels});
  try {
    await until(()=>h.button('Log your experience'));h.button('Log your experience').click();await tick();h.button('I went').click();await tick();
    const picker = h.w.document.querySelector('.name-picker');
    assert(picker.textContent.includes('Counts toward Space Laces + Excision'));
    assert(picker.textContent.includes('Counts toward Excision'));
    for (const checkbox of picker.querySelectorAll('input[type=checkbox]')) { checkbox.click(); await tick(); }
    assert(picker.textContent.includes('2 sets · 2 unique artists'));
    h.button('Save changes').click(); await until(() => h.saves.length === 1 && !h.w.document.querySelector('.rave-form'));
    assert.deepEqual([...h.saves[0].artists].sort(), [...labels].sort());
    const artistPicker = h.w.document.querySelector('select[aria-label="Artist"]');
    assert(artistPicker.textContent.includes('Excision')); assert(artistPicker.textContent.includes('Space Laces'));
    assert(!artistPicker.textContent.includes('Detox'));
    artistPicker.value = 'Excision'; artistPicker.dispatchEvent(new h.w.Event('change',{bubbles:true})); await tick();
    assert(h.text().includes('Plan night')); assert(h.text().includes('Space Laces x Excision'));
  } finally { h.close(); }
});

async function chooseFestival(h, id) {
  const select=h.w.document.querySelector('select[aria-label="Event and year"]');
  assert(select); select.value=id; select.dispatchEvent(new h.w.Event('change',{bubbles:true})); await tick();
}
test('festival search fills edition metadata without claiming sets or saving attendance', async () => {
  const h=harness({empty:true}); try {
    await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
    const picker=h.w.document.querySelector('.festival-picker');
    picker.querySelector('.search-select-trigger').click();await tick();
    const search=picker.querySelector('.search-select-input');assert(search);
    search.value='Tomorrowland 2022';search.dispatchEvent(new h.w.Event('input',{bubbles:true}));await tick();
    const options=[...picker.querySelectorAll('[role="option"]')];assert.equal(options.length,3);
    options.find(o=>o.textContent.includes('Weekend 2')).click();await tick();
    assert.equal(h.w.document.querySelector('input[maxlength="160"]').value,'Tomorrowland Belgium 2022 · Weekend 2');
    assert.equal(h.w.document.querySelector('input[aria-label="Start date"]').value,'07/22/2022');
    assert.equal(h.w.document.querySelectorAll('.name-picker input[type=checkbox]:checked').length,0);
    assert(h.text().includes('FestivalViewer weekend archive'));assert.equal(h.saves.length,0);
    h.button('Save to rave diary').click();await until(()=>h.saves.length===1);
    assert.equal(h.saves[0].startDate,'2022-07-22');assert.equal(h.saves[0].endDate,'2022-07-24');
    assert.equal(h.saves[0].venue,'De Schorre');assert.equal(h.saves[0].artists.length,0);assert.equal(h.saves[0].costs.ticket,null);
  }finally{h.close();}
});
test('switching festival editions requires explicit replacement and preserves private details and typed names', async()=>{
  const h=harness({empty:true});try{
    await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
    await h.fill('input[maxlength="160"]','My custom night');
    await h.fill('input[aria-label="Artists you actually saw"]','My own set');
    await h.fill('input[aria-label="Who did you go with?"]','My friend');
    await chooseFestival(h,'countdown-nye-2025');
    assert.equal(h.w.document.querySelector('input[maxlength="160"]').value,'My custom night');
    h.button('Keep current details').click();await tick();
    assert.equal(h.w.document.querySelector('input[maxlength="160"]').value,'My custom night');
    await chooseFestival(h,'countdown-nye-2025');h.button('Use these event details').click();await tick();
    assert.equal(h.w.document.querySelector('input[maxlength="160"]').value,'Countdown NYE 2025');
    assert(h.text().includes('24 lineup suggestions'));
    await until(()=>h.w.document.querySelector('input[aria-label="Start date"]').value==='12/31/2025');
    h.button('Save to rave diary').click();await until(()=>h.saves.length===1);
    assert.deepEqual(h.saves[0].artists,['My own set']);assert.deepEqual(h.saves[0].crew,['My friend']);
    assert.equal(h.saves[0].city,'Los Angeles, CA');assert.equal(h.saves[0].venue,'Los Angeles Convention Center');
  }finally{h.close();}
});
test('reopened historical festival entries recover suggestions and clearly identify partial lineups',async()=>{
  const h=harness({raves:[{...entry('lost'),name:'Lost Lands 2024',startDate:'2024-09-20',endDate:'2024-09-22',artists:['Excision (Detox Set)']}]});try{
    await until(()=>h.button('Edit Lost Lands 2024'));h.button('Edit Lost Lands 2024').click();await tick();
    assert(h.text().includes('Partial lineup — only verified artists are listed here.'));
    assert(h.text().includes('Excision B2B Wooli'));
    assert.equal(h.w.document.querySelectorAll('.name-picker input[type=checkbox]:checked').length,1);
    assert.equal(h.saves.length,0);
    await h.fill('input[maxlength="160"]','Unrelated festival');assert(!h.w.document.querySelector('.festival-lineup-note'));
  }finally{h.close();}
});

test('catalog editions warn about existing entries even when their old name omitted the year',async()=>{
  const h=harness({raves:[{...entry('old-edc'),name:'EDC Las Vegas',startDate:'2022-05-20',endDate:'2022-05-22'}]});try{
    await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
    await chooseFestival(h,'edc-las-vegas-2022');assert(h.text().includes('You already have “EDC Las Vegas” on this date.'));
    assert.equal(h.saves.length,0);
  }finally{h.close();}
});


test('Lost Lands short-year Rally entries recover the correct catalog and exclude other diary artists', async()=>{
  const rave={...entry('lost-2026'),name:"Lost Lands '26",sourceEventId:'lost-lands-2026',startDate:'2026-09-18',endDate:'2026-09-20',artists:['EXCISION (DETOX SET)','Previously logged custom set']};
  const h=harness({raves:[rave,{...entry('another'),artists:['2hollis']}],artistSuggestions:['Wrong plan artist'],crewSuggestions:['Nancy']});try{
    await until(()=>h.button("Edit Lost Lands '26")); h.button("Edit Lost Lands '26").click();
    await until(()=>h.w.document.querySelector('.rave-form') && !h.text().includes('Loading suggestions from your Rally plan'));
    const picker=h.w.document.querySelector('.name-picker');
    assert(!h.w.document.querySelector('select[aria-label="Event and year"]'));assert(h.w.document.querySelector('.shared-event-summary'));
    assert(h.text().includes('Lost Lands 2026 · 172 lineup suggestions'));
    assert(!picker.textContent.includes('2hollis')); assert(picker.textContent.includes('Wrong plan artist'));
    assert(picker.textContent.includes('Excision B2B Space Laces'));
    assert(!picker.textContent.includes('Previously logged custom set'));
    assert.equal([...picker.querySelectorAll('.name-picker-option')].find(n=>n.textContent.includes('Excision (Detox)')).querySelector('input').checked,true);
    assert(picker.textContent.includes('1 logged set is not listed in this lineup.'));
    assert(h.text().includes('Nancy')); assert(h.requests.some(r=>r.path==='rallyCollection:draftFromEvent'));
    h.button('Review selected sets').click();await tick();
    assert(picker.textContent.includes('Previously logged custom set'));assert.equal(picker.querySelectorAll('input:checked').length,2);
    assert(picker.textContent.includes('Other logged sets · not in this lineup'));
    h.button('Save changes').click();await until(()=>h.saves.length===1);
    assert.deepEqual(h.saves[0].artists,rave.artists);assert.equal(h.saves[0].sourceEventId,rave.sourceEventId);
    // A second edit must recover the same lineup after the round trip.
    await until(()=>!h.w.document.querySelector('.rave-form'));h.button("Edit Lost Lands '26").click();await tick();
    assert(h.text().includes('172 lineup suggestions'));
  }finally{h.close();}
});

test('shared event details stay in Rally while the diary editor saves only the personal experience',async()=>{
 const r={...entry('Shared night'),sourceEventId:'crew'};const h=harness({raves:[r]});try{await until(()=>h.button('Edit Shared night'));h.button('Edit Shared night').click();await tick();assert(!h.w.document.querySelector('input[maxlength="160"]'));assert(!h.w.document.querySelector('input[aria-label="Start date"]'));assert(!h.w.document.querySelector('.festival-picker'));assert(h.w.document.querySelector('.shared-event-summary a[href*="event=crew"]'));await h.fill('textarea','Personal experience');h.button('Save changes').click();await until(()=>h.saves.length===1);assert.equal(h.saves[0].sourceEventId,'crew');assert.equal(h.saves[0].notes,'Personal experience');}finally{h.close();}
});

test('editing a saved show reloads its Rally lineup and a failed lookup can be retried without losing edits',async()=>{
  const options={planSuggestionsFail:true,raves:[{...entry('saved-show'),sourceEventId:'show',kind:'Show',artists:['Remembered DJ']},{...entry('other'),artists:['2hollis']}],artistSuggestions:['Actual show DJ']};
  const h=harness(options);try{
    await until(()=>h.button('Edit saved-show'));h.button('Edit saved-show').click();
    await until(()=>h.button('Retry plan suggestions'));
    assert(!h.w.document.querySelector('.name-picker').textContent.includes('2hollis'));
    await h.fill('input[aria-label="Artists you actually saw"]','My pending set');
    options.planSuggestionsFail=false;h.button('Retry plan suggestions').click();
    await until(()=>h.w.document.querySelector('.name-picker').textContent.includes('Actual show DJ'));
    assert.equal(h.w.document.querySelector('input[aria-label="Artists you actually saw"]').value,'My pending set');
    h.button('Save changes').click();await until(()=>h.saves.length===1);
    assert.deepEqual(h.saves[0].artists,['Remembered DJ','My pending set']);
  }finally{h.close();}
});

test('late plan suggestions cannot populate a different open entry',async()=>{
  const options={holdPlan:true,raves:[{...entry('linked'),sourceEventId:'room'},entry('manual')],artistSuggestions:['Stale DJ']};
  const h=harness(options);try{
    await until(()=>h.button('Edit linked'));h.button('Edit linked').click();await until(()=>options.releasePlan);
    h.button('Cancel').click();await tick();h.button('Edit manual').click();await tick();
    options.releasePlan();await tick();await tick();assert(!h.w.document.querySelector('.rave-form').textContent.includes('Stale DJ'));
  }finally{h.close();}
});

test('city picker searches common, catalog, and personal cities and keeps a canonical selection on save',async()=>{
  const h=harness({raves:[{...entry('old'),city:'My hometown, CA'},{...entry('old-2'),city:'my hometown, ca'}]});try{
    await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
    const picker=h.w.document.querySelector('.city-picker');
    const select=picker.querySelector('select');
    assert(select.textContent.includes('San Francisco, CA'));assert(select.textContent.includes('Boom, Belgium'));
    assert.equal([...select.options].filter(o=>o.value.toLowerCase()==='my hometown, ca').length,1);
    picker.querySelector('.search-select-trigger').click();await tick();
    await h.fill('.city-picker .search-select-input','san francisco ca');
    assert(picker.querySelector('[role=option]').textContent.includes('San Francisco, CA'));
    picker.querySelector('.search-select-input').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();
    assert.equal(select.value,'San Francisco, CA');assert.equal(h.saves.length,0);
    assert.equal(h.w.document.activeElement,picker.querySelector('.search-select-trigger'));
    await h.fill('input[maxlength="160"]','New show');await h.fill('input[aria-label="Start date"]','10/01/2026');
    h.button('Save to rave diary').click();await until(()=>h.saves.length===1);
    assert.equal(h.saves[0].city,'San Francisco, CA');assert.equal(h.saves[0].venue,'');
  }finally{h.close();}
});

test('custom cities can be explicitly selected, reopened, and cleared without saving search text',async()=>{
  const h=harness({raves:[{...entry('night'),city:'Existing city',venue:'Keep my venue'}]});try{
    await until(()=>h.button('Edit night'));h.button('Edit night').click();await tick();
    let picker=h.w.document.querySelector('.city-picker');
    picker.querySelector('.search-select-trigger').click();await tick();
    await h.fill('.city-picker .search-select-input','A small town, Somewhere');
    assert.equal(picker.querySelector('select').value,'Existing city');
    assert(picker.querySelector('[role=option]').textContent.includes('Use “A small town, Somewhere”'));
    picker.querySelector('.search-select-input').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await tick();
    assert(h.w.document.querySelector('.rave-form'));assert.equal(picker.querySelector('select').value,'Existing city');
    picker.querySelector('.search-select-trigger').click();await tick();
    await h.fill('.city-picker .search-select-input','A small town, Somewhere');
    picker.querySelector('[role=option]').click();await tick();
    assert.equal(picker.querySelector('select').value,'A small town, Somewhere');
    assert(picker.querySelector('.search-select-trigger').textContent.includes('A small town, Somewhere'));
    h.button('Save changes').click();await until(()=>h.saves.length===1 && !h.w.document.querySelector('.rave-form'));
    assert.equal(h.saves[0].city,'A small town, Somewhere');assert.equal(h.saves[0].venue,'Keep my venue');
    h.button('Edit night').click();await tick();picker=h.w.document.querySelector('.city-picker');
    assert.equal(picker.querySelector('select').value,'A small town, Somewhere');
    picker.querySelector('.search-select-trigger').click();await tick();
    await h.fill('.city-picker .search-select-input','x'.repeat(151));assert.equal(picker.querySelectorAll('[role=option]').length,0);
    await h.fill('.city-picker .search-select-input','');picker.querySelector('[role=option]').click();await tick();
    assert.equal(picker.querySelector('select').value,'');
    h.button('Save changes').click();await until(()=>h.saves.length===2);assert.equal(h.saves[1].city,'');
  }finally{h.close();}
});

test('festival autofill updates the city picker and other selectors never offer custom values',async()=>{
  const h=harness({empty:true});try{
    await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
    await chooseFestival(h,'lost-lands-2026');
    const picker=h.w.document.querySelector('.city-picker');
    assert.equal(picker.querySelector('select').value,'Thornville, OH');
    assert(picker.querySelector('.search-select-trigger').textContent.includes('Thornville, OH'));
    const festival=h.w.document.querySelector('.festival-picker');festival.querySelector('.search-select-trigger').click();await tick();
    await h.fill('.festival-picker .search-select-input','A brand new festival');
    assert.equal(festival.querySelectorAll('[role=option]').length,0);assert(festival.textContent.includes('No matches. Try another search.'));
  }finally{h.close();}
});

test('upcoming raves save wishlists separately and offer a Rally connection without auto-creating a room',async()=>{
 const h=harness({empty:true});try{
  await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
  await h.fill('input[maxlength="160"]','My future rave');await h.fill('input[aria-label="Start date"]','01/01/2099');
  assert(h.text().includes('Upcoming rave'));assert(!h.button('I went'));
  await h.fill('input[aria-label="Artists you want to see"]','Wishlist DJ');await h.fill('input[aria-label="Who are you going with?"]','Nancy');
  h.button('Save upcoming rave').click();await until(()=>h.saves.length===1 && !h.w.document.querySelector('.rave-form'));
  assert.equal(h.saves[0].attendance,'planned');assert.deepEqual(h.saves[0].artists,[]);assert.deepEqual(h.saves[0].crew,[]);
  assert.deepEqual(h.saves[0].plannedArtists,['Wishlist DJ']);assert.deepEqual(h.saves[0].plannedCrew,['Nancy']);
  assert(h.button('Plan with friends'));assert(!h.requests.some(r=>r.path==='rallyCollection:createPlan'));
  h.button('Plan with friends').click();await tick();assert(h.text().includes('Your costs, notes, photos, wishlist, and diary crew stay private.'));
  h.button('Start crew plan').click();await until(()=>h.w.document.querySelector('a[href="/tools/rally/?event=created-room"]'));
  assert.equal(h.requests.filter(r=>r.path==='rallyCollection:createPlan').length,1);assert(!h.button('Plan with friends'));
 }finally{h.close();}
});

test('expired plans require explicit attendance and selecting the sets actually seen',async()=>{
 const r={...entry('Unconfirmed night'),attendance:'planned',plannedArtists:['Wishlist DJ'],plannedCrew:['Nancy']};
 const h=harness({raves:[r]});try{
  await until(()=>h.button('Edit Unconfirmed night'));assert(h.text().includes('To log'));
  h.button('Edit Unconfirmed night').click();await tick();assert(h.button('I went'));
  h.button('I went').click();await tick();
  const picker=h.w.document.querySelector('.name-picker');assert(picker.textContent.includes('Wishlist DJ'));assert.equal(picker.querySelectorAll('input:checked').length,0);
  await h.fill('input[aria-label="Artists you actually saw"]','Actual DJ');h.button('Save changes').click();await until(()=>h.saves.length===1);
  assert.equal(h.saves[0].attendance,'attended');assert.deepEqual(h.saves[0].artists,['Actual DJ']);assert.deepEqual(h.saves[0].plannedArtists,['Wishlist DJ']);assert.deepEqual(h.saves[0].crew,[]);
 }finally{h.close();}
});

test('upcoming and past views filter consistently across mobile and desktop and skip planned artist totals',async()=>{
 const h=harness({mobile:true,raves:[{...entry('Next rave'),startDate:'2099-01-01',endDate:'2099-01-01',attendance:'planned',plannedArtists:['Only planned DJ']},{...entry('Past attended'),attendance:'attended',artists:['Actual DJ']},{...entry('Did not go'),attendance:'skipped',artists:['Must not count']}]});try{
  await until(()=>h.button('View Next rave'));h.button('Upcoming 1').click();await tick();assert(h.button('View Next rave'));assert(!h.button('View Past attended'));
  assert(h.w.document.querySelector('.timeline-totals').textContent.includes('1 to see'));
  h.resize(false);await tick();assert(h.button('View Next rave'));assert(!h.button('View Past attended'));
  h.button('Past 2').click();await tick();assert(!h.button('View Next rave'));assert(h.button('View Past attended'));
  assert(h.w.document.querySelector('.result-summary').textContent.includes('1artists seen'));
 }finally{h.close();}
});

test('a failed Plan with friends action keeps the personal entry available',async()=>{
 const h=harness({raves:[{...entry('Upcoming entry'),startDate:'2099-01-01',endDate:'2099-01-01',attendance:'planned',notes:'Keep private'}],createPlanFails:true});try{await until(()=>h.button('View Upcoming entry'));h.button('View Upcoming entry').click();await tick();h.button('Plan with friends').click();await tick();h.button('Start crew plan').click();await until(()=>h.text().includes('Could not create plan'));assert(h.text().includes('Keep private'));assert.equal(h.saves.length,0);assert(!h.button('Link existing plan'));}finally{h.close();}
});

test('automatic Rally entries open directly on mobile and desktop without linking or sync controls',async()=>{
 for(const mobile of [false,true]){const h=harness({mobile,raves:[{...entry('Crew festival'),id:'rally_crew',sourceEventId:'crew',attendance:'planned'}]});try{await until(()=>h.button('View Crew festival'));assert(!h.button('From My raves'));h.button('View Crew festival').click();await until(()=>h.text().includes('Your Rally rave'));assert(!h.button('Link existing plan'));assert(!h.button('Disconnect plan'));assert(!h.button('Review plan → diary'));assert.equal(h.saves.length,0);}finally{h.close();}}
});

test('old personal raves have no project creation or connection panel',async()=>{
 const h=harness({raves:[entry('Old personal night')]});try{await until(()=>h.button('View Old personal night'));h.button('View Old personal night').click();await tick();assert(!h.w.document.querySelector('.diary-plan-link'));assert(!h.button('Plan with friends'));assert(!h.button('Link existing plan'));assert(h.button('Edit this night'));assert.equal(h.requests.filter(r=>r.path==='rallyCollection:createPlan').length,0);}finally{h.close();}
});

test('ISOxo show autofills the selected night and restores its scoped lineup on edit',async()=>{
 const h=harness({empty:true});try{
  await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();await chooseFestival(h,'isoxo-cow-palace-2026-04-04');
  await until(()=>h.w.document.querySelector('input[aria-label="Start date"]').value==='04/04/2026');
  assert.equal(h.w.document.querySelector('input[aria-label="End date"]').value,'04/04/2026');assert.equal(h.button('Show').getAttribute('aria-pressed'),'true');
  assert(h.text().includes('1 lineup suggestions'));assert(h.text().includes('Partial lineup'));assert(h.text().includes('ISOxo'));assert.equal(h.w.document.querySelectorAll('.name-picker input:checked').length,0);
  h.button('Save to rave diary').click();await until(()=>h.saves.length===1);assert.equal(h.saves[0].kind,'Show');assert.equal(h.saves[0].city,'Daly City, CA');assert.equal(h.saves[0].artists.length,0);
  await until(()=>h.button('Edit ISOxo at Cow Palace · April 4, 2026'));h.button('Edit ISOxo at Cow Palace · April 4, 2026').click();await tick();assert(h.text().includes('1 lineup suggestions'));
 }finally{h.close();}
});

for(const mobile of [false,true]) test(`expanded catalog searches aliases and cities without mixing weekend lineups (${mobile?'mobile':'desktop'})`,async()=>{
 const h=harness({empty:true,mobile});try{
  await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
  const picker=h.w.document.querySelector('.festival-picker');assert(picker);
  picker.querySelector('.search-select-trigger').click();await tick();
  await h.fill('.festival-picker .search-select-input','EZoo 2023');
  let options=[...picker.querySelectorAll('[role=option]')];assert.equal(options.length,1);assert(options[0].textContent.includes('Electric Zoo 2023'));
  await h.fill('.festival-picker .search-select-input','Daly City 2025');
  options=[...picker.querySelectorAll('[role=option]')];assert.equal(options.length,2);assert(options.some(o=>o.textContent.includes('Wobbleland')));assert(options.some(o=>o.textContent.includes('Fred again')));
  await h.fill('.festival-picker .search-select-input','Coachella 2023');
  options=[...picker.querySelectorAll('[role=option]')];assert.equal(options.length,2);options.find(o=>o.textContent.includes('Weekend 2')).click();await tick();
  assert.equal(h.w.document.querySelector('input[aria-label="Start date"]').value,'04/21/2023');
  const artistPicker=h.w.document.querySelector('.name-picker');assert(!artistPicker.textContent.includes('Frank Ocean'));assert(artistPicker.textContent.includes('Skrillex x Fred again.. x Four Tet'));
  assert.equal(artistPicker.querySelectorAll('input[type=checkbox]:checked').length,0);assert.equal(h.saves.length,0);
 }finally{h.close();}
});

for(const mobile of [false,true]) test(`historical shows and unknown lineups stay scoped without writing diary data (${mobile?'mobile':'desktop'})`,async()=>{
 const h=harness({mobile,raves:[{...entry('Unrelated night'),artists:['Unrelated DJ']}]});try{
  await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
  assert(h.text().includes('2019–2026'));
  await chooseFestival(h,'firefly-2019');
  assert.equal(h.w.document.querySelector('input[aria-label="Start date"]').value,'06/21/2019');
  assert(h.w.document.querySelector('.name-picker').textContent.includes('Alec Benjamin'));
  await chooseFestival(h,'cave-rave-fight-night-2026-03-28');h.button('Use these event details').click();await tick();
  assert(h.text().includes('No verified lineup is available'));
  assert(h.text().includes('event details loaded. Lineup not available yet.'));
  assert(!h.w.document.querySelector('.name-picker').textContent.includes('Unrelated DJ'));
  assert.equal(h.saves.length,0);
  assert(!h.requests.some(r=>r.path==='rallyCollection:createPlan'||r.path==='rallyCollection:importEntries'));
 }finally{h.close();}
});

for(const mobile of [false,true]) test(`deep catalog finds a night by venue and support act, then keeps its roster scoped (${mobile?'mobile':'desktop'})`,async()=>{
 const h=harness({empty:true,mobile});try{
  await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();
  const picker=h.w.document.querySelector('.festival-picker');
  picker.querySelector('.search-select-trigger').click();await tick();
  await h.fill('.festival-picker .search-select-input','Midway SF Seven Lions 2024');
  let options=[...picker.querySelectorAll('[role=option]')];
  assert.equal(options.length,2);assert(options.some(o=>o.textContent.includes('Afterparty')));
  options.find(o=>o.textContent.includes('Afterparty')).click();await tick();
  assert.equal(h.w.document.querySelector('input[aria-label="Start date"]').value,'10/12/2024');
  const artists=h.w.document.querySelector('.name-picker');assert(artists.textContent.includes('Seven Lions'));assert(!artists.textContent.includes('Crystal Skies'));
  assert.equal(artists.querySelectorAll('input[type=checkbox]:checked').length,0);assert.equal(h.saves.length,0);
  picker.querySelector('.search-select-trigger').click();await tick();
  await h.fill('.festival-picker .search-select-input','Bill Graham SF 2025-10 INZO');
  options=[...picker.querySelectorAll('[role=option]')];assert.equal(options.length,1);assert(options[0].textContent.includes('Oct 24, 2025'));
  assert.equal(h.saves.length,0);
 }finally{h.close();}
});

const connectedPerson={id:'account:nancy',name:'Nancy',kind:'account',projectId:'project',memberId:'nancy'};
const connectionFixture=()=>({details:{...entry('Updated shared plan'),city:'Updated city',sourceEventId:'project',attendance:'planned'},people:[connectedPerson],lineup:['Excision'],wishlist:['Excision'],revision:'rev-1',canUpdatePlan:true,sharedMemories:[],myMemory:null});
for(const mobile of [false,true])test(`automatic crew view keeps memory sharing explicit (${mobile?'mobile':'desktop'})`,async()=>{
 const r={...entry('My crew rave'),sourceEventId:'project',attendance:'planned',notes:'PRIVATE DIARY',albumUrl:'https://example.com/private'},h=harness({mobile,raves:[r],connection:connectionFixture()});try{await until(()=>h.button('View My crew rave'));h.button('View My crew rave').click();await until(()=>h.button('Share a memory with this crew'));assert(!h.button('Review plan → diary'));assert(!h.button('Review diary → plan'));h.button('Share a memory with this crew').click();await tick();assert.equal(h.w.document.querySelector('.plan-sync-review textarea').value,'');assert.equal(h.w.document.querySelector('.plan-sync-review input[type=url]').value,'');await h.fill('.plan-sync-review textarea','Our sunset set');h.button('Publish to this crew').click();await until(()=>h.requests.some(r=>r.path==='rallyCollection:shareMemory'));assert.equal(h.rows.alice[0].notes,'PRIVATE DIARY');assert(!h.requests.some(r=>r.path==='rallyCollection:syncPlan'));}finally{h.close();}
});
test('connected friend selection saves stable identities and keeps actual and planned crew separate',async()=>{
 const r={...entry('Linked plan'),sourceEventId:'project',attendance:'planned',plannedCrew:[],crew:[]};
 const h=harness({raves:[r],crewPeople:[connectedPerson],crewSuggestions:['Nancy']});try{
  await until(()=>h.button('Edit Linked plan'));h.button('Edit Linked plan').click();await until(()=>h.w.document.querySelector('.crew-connection input'));
  assert(!h.w.document.querySelector('.crew-connection input').checked);h.w.document.querySelector('.crew-connection input').click();await tick();
  h.button('Save changes').click();await until(()=>h.saves.length===1);
  assert.deepEqual(h.saves[0].plannedCrew,['Nancy']);assert.equal(h.saves[0].plannedCrewConnections[0].id,'account:nancy');assert.deepEqual(h.saves[0].crew,[]);
 }finally{h.close();}
});
test('a failed crew lookup preserves personal details and can be retried',async()=>{
 const options={raves:[{...entry('My linked night'),sourceEventId:'project',attendance:'planned',notes:'Keep private'}],connectionFails:true};const h=harness(options);try{await until(()=>h.button('View My linked night'));h.button('View My linked night').click();await until(()=>h.button('Reload crew'));assert(h.text().includes('Keep private'));options.connectionFails=false;h.button('Reload crew').click();await until(()=>h.button('Share a memory with this crew'));assert.equal(h.saves.length,0);}finally{h.close();}
});

test('same-name Rally accounts remain separate when opening their crew histories',async()=>{
 const a={...entry('Nancy A night'),attendance:'attended',crew:['Nancy'],crewConnections:[connectedPerson]};
 const b={...entry('Nancy B night'),attendance:'attended',crew:['Nancy'],crewConnections:[{...connectedPerson,id:'account:nancy-b',memberId:'nancy-b'}]};
 const h=harness({raves:[a,b]});try{
  await until(()=>h.button('Open navigation'));h.button('Open navigation').click();await tick();[...h.w.document.querySelectorAll('#collectionNavigation button')].find(b=>b.textContent.trim()==='Crew').click();await tick();
  const rows=[...h.w.document.querySelectorAll('.ranking-sheet tbody tr')];assert.equal(rows.length,2,h.text());
  rows[0].querySelector('button').click();await tick();assert.equal(h.w.document.querySelectorAll('.rave-sheet tbody tr').length,1);
 }finally{h.close();}
});

test('Rally project renders only explicitly shared memories as text and rejects unsafe album links',async()=>{
 const dom=new JSDOM('<main id="page"></main>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;
 try{w.Clerk={user:{id:'alice'}};w.eval(fs.readFileSync(__dirname+'/personal-collection.js','utf8'));
  w.RallyCollection.mount({id:'room',startsAt:'2025-01-01'},{loadExperience:async()=>({existing:true,rave:{notes:'PRIVATE MUST STAY HIDDEN',albumUrl:'https://example.com/private'},sharedMemories:[{memberId:'nancy',name:'Nancy',note:'<img src=x onerror=alert(1)>',albumUrl:'javascript:alert(1)'},{memberId:'maya',name:'Maya',note:'Our shared night',albumUrl:'https://example.com/shared'}]})});
  await tick();assert(w.document.body.textContent.includes('Our shared night'));assert(w.document.body.textContent.includes('<img'));assert(!w.document.querySelector('img'));assert(!w.document.body.textContent.includes('PRIVATE MUST STAY HIDDEN'));
  assert.equal(w.document.querySelectorAll('.project-shared-memories a').length,1);assert.equal(w.document.querySelector('.project-shared-memories a').href,'https://example.com/shared');
 }finally{w.close();}
});

test('a friend link on an experience opens all of that identity’s history across name changes',async()=>{
 const a={...entry('Nancy recent'),attendance:'attended',crew:['Nancy'],crewConnections:[connectedPerson]};
 const b={...entry('Nancy earlier'),attendance:'attended',crew:['Nance'],crewConnections:[{...connectedPerson,name:'Nance'}]};
 const other={...entry('Another Nancy'),attendance:'attended',crew:['Nancy'],crewConnections:[{...connectedPerson,id:'account:different',memberId:'other'}]};
 const h=harness({raves:[a,b,other]});try{
  await until(()=>h.button('View Nancy recent'));h.button('View Nancy recent').click();await tick();h.button('View your rave history with Nancy').click();await tick();
  const names=[...h.w.document.querySelectorAll('.rave-sheet tbody tr')].map(r=>r.textContent);assert.equal(names.length,2);assert(!names.some(n=>n.includes('Another Nancy')));
 }finally{h.close();}
});


test('choosing a catalog rave already supplied by Rally opens its existing diary entry',async()=>{
 const r={...entry('Lost Lands 2026'),id:'rally_crew',sourceEventId:'crew',catalogEventId:'lost-lands-2026',startDate:'2026-09-18',endDate:'2026-09-20',attendance:'planned'};
 const h=harness({raves:[r]});try{await until(()=>h.button('Add a rave'));h.button('Add a rave').click();await tick();await chooseFestival(h,'lost-lands-2026');assert(h.text().includes('This Rally rave is already in your diary'));assert(h.button('Save to rave diary').disabled);h.button('Open existing entry').click();await until(()=>h.text().includes('Your Rally rave'));assert(!h.w.document.querySelector('.rave-form'));assert.equal(h.saves.length,0);}finally{h.close();}
});
test('returning to the diary refreshes shared details while an open personal draft is preserved',async()=>{
 const h=harness({raves:[{...entry('Crew night'),sourceEventId:'crew'}]});try{await until(()=>h.button('View Crew night'));h.rows.alice[0].name='Updated crew night';h.w.dispatchEvent(new h.w.Event('focus'));await until(()=>h.button('View Updated crew night'));h.button('Edit Updated crew night').click();await tick();await h.fill('.rave-form textarea','Unsaved memory');const reads=h.requests.filter(r=>r.path==='rallyCollection:list').length;h.w.dispatchEvent(new h.w.Event('focus'));await tick();assert.equal(h.requests.filter(r=>r.path==='rallyCollection:list').length,reads);assert.equal(h.w.document.querySelector('.rave-form textarea').value,'Unsaved memory');}finally{h.close();}
});
