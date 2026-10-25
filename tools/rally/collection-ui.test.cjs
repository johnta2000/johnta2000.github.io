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
    if (path === 'rallyCollection:remove') { rows[subject] = rows[subject].filter(r => r.id !== args.id); return success({ok: true}); }
    if (path === 'rallyCollection:draftFromEvent') return success({rave: rows[subject].find(r => r.sourceEventId === args.eventId) || {...entry('Plan night'), id: '', sourceEventId: args.eventId, notes: ''}, existing: rows[subject].some(r => r.sourceEventId === args.eventId), artistSuggestions: optionsRef.artistSuggestions || ['Suggested DJ'], crewSuggestions: optionsRef.crewSuggestions || ['Suggested Friend']});
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
test('a failed plans request does not block collection access or manual entry', async () => {
  const h = harness({plansFail: true}); try {
    await until(() => h.text().includes('Alice private night')); h.button('From My raves').click(); await tick();
    assert(h.text().includes('Your plans could not be loaded')); h.button('Add by hand').click(); await tick(); assert(h.w.document.querySelector('.rave-form'));
  } finally { h.close(); }
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
test('Rally projects exclude future events, open unsaved drafts, and do not preselect suggested artists or crew', async () => {
  const h = harness({events: [{id: 'past', name: 'Past event', startsAt: '2025-06-01'}, {id: 'future', name: 'Future event', startsAt: '2099-01-01'}]}); try {
    await until(() => h.text().includes('Alice private night')); h.button('From My raves').click(); await tick();
    const select = h.w.document.querySelector('select[aria-label="Your Rally events"]'); assert(select.textContent.includes('Past event')); assert(!select.textContent.includes('Future event'));
    select.value = 'past'; select.dispatchEvent(new h.w.Event('change', {bubbles: true})); await tick(); h.button('Open my experience').click(); await until(() => h.w.document.querySelector('.rave-form'));
    assert.equal(h.w.document.querySelectorAll('.input-tag').length, 0); assert(h.text().includes('Suggested DJ')); assert.equal(h.saves.length, 0);
  } finally { h.close(); }
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
    await h.fill('.rave-form input[maxlength="160"]', 'Updated memory');
    h.button('Save changes').click(); await until(() => !h.w.document.querySelector('.rave-form'));
    assert(h.button('View Updated memory')); assert.equal(h.saves.length, 1); assert.equal(h.saves[0].sourceEventId, 'linked-room');
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
test('mobile add choices and account menu preserve plan access and sign out', async () => {
  const h = harness({mobile:true}); try {
    await until(() => h.w.document.querySelector('.timeline-card'));
    h.button('Add a rave').click(); await tick(); assert(h.text().includes('Log a good night'));
    h.button('From My raves').click(); await tick(); assert(h.text().includes('No Rally projects yet'));
    h.button('Add by hand').click(); await tick(); assert(h.w.document.querySelector('.rave-form'));
    h.button('Cancel').click(); await tick();
    h.button('Diary account and navigation').click(); await tick(); assert(h.w.document.querySelector('dialog a[href="/tools/rally/collection/?view=projects"]'));
    h.button('Sign out').click(); await until(() => h.text().includes('Sign in / create account')); assert(!h.text().includes('Alice private night'));
  } finally { h.close(); }
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
  await until(()=>h.w.document.querySelector('dialog')?.textContent.includes('Open rave plan'));
  assert(!h.w.document.querySelector('.rave-form'));
  assert.equal(h.saves.length,0);
  assert.equal(h.w.document.querySelector('dialog a[href*="event=room"]').textContent,'Open rave plan');
 }finally{h.close();}
});
test('projects separate future planning from personal logging and clear status on account switch',async()=>{
 const h=harness({search:'?view=projects',events:[{id:'room',name:'Past warehouse',startsAt:'2025-01-01'},{id:'future',name:'Future festival',startsAt:'2099-01-01'}],raves:[{...entry('Saved'),sourceEventId:'room'}]});try{
  await until(()=>h.text().includes('View my experience'));
  const rows=[...h.w.document.querySelectorAll('.project-row')];
  assert.equal(rows.find(r=>r.textContent.includes('Future festival')).querySelector('.project-experience'),null);
  assert.equal(rows.find(r=>r.textContent.includes('Past warehouse')).querySelector('.project-experience').getAttribute('href'),'/tools/rally/collection/?from=room');
  h.switchUser('bob');await until(()=>h.text().includes('Log my experience'));assert(!h.text().includes('View my experience'));
  await h.fill('input[type="search"]','nothing');assert(h.text().includes('No raves match'));
 }finally{h.close();}
});
test('project overview ignores a delayed experience status after account changes',async()=>{
 const dom=new JSDOM('<main id="page"></main>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;
 try{w.Clerk={user:{id:'alice'}};w.eval(fs.readFileSync(__dirname+'/personal-collection.js','utf8'));
  let resolve;w.RallyCollection.mount({id:'room',startsAt:'2025-01-01'},{loadExperience:()=>new Promise(r=>resolve=r)});await tick();w.Clerk.user.id='bob';resolve({existing:true});await tick();assert(!w.document.body.textContent.includes('View my experience'));
  w.RallyCollection.mount({id:'room',startsAt:'2025-01-01'},{loadExperience:async()=>({existing:true})});await tick();assert(w.document.body.textContent.includes('View my experience'));
 }finally{w.close();}
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
    await until(() => h.w.document.querySelector('.rave-form'));
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
    [...picker.querySelectorAll('button')].find(b => b.textContent === 'All 24').click(); await tick();
    await h.fill('input[aria-label="Search artists"]', '24');
    picker.querySelector('input[type=checkbox]').click(); await tick();
    await h.fill('input[aria-label="Search artists"]', 'Unmatched search');
    assert(picker.textContent.includes('No matching names'));
    const search = picker.querySelector('input[aria-label="Search artists"]');
    const event = new h.w.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}); search.dispatchEvent(event);
    assert(event.defaultPrevented); assert.equal(h.saves.length, 0);
    h.button('Save to rave diary').click(); await until(() => h.saves.length === 1);
    assert.deepEqual(h.saves[0].artists, ['Artist 24']); assert.deepEqual(h.saves[0].crew, []);
  } finally { h.close(); }
});

test('plan and diary names deduplicate, custom names can be added and removed, and keyboard search reaches choices', async () => {
  const h = harness({search: '?from=past', artistSuggestions: ['Same DJ', 'Other DJ'], raves: [{...entry('Earlier rave'), artists: ['same dj', 'History DJ']}]});
  try {
    await until(() => h.w.document.querySelector('.rave-form'));
    const picker = h.w.document.querySelector('.name-picker');
    assert.equal(picker.querySelectorAll('input[type=checkbox]').length, 3);
    assert(picker.textContent.includes('From this lineup')); assert(picker.textContent.includes('From your diary'));
    const search = picker.querySelector('input[aria-label="Search artists"]'); search.focus();
    search.dispatchEvent(new h.w.KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
    assert.equal(h.w.document.activeElement, picker.querySelector('input[type=checkbox]'));
    await h.fill('input[aria-label="Artists you actually saw"]', 'New DJ, new dj'); h.button('Add artist').click(); await tick();
    assert(picker.textContent.includes('Added by you')); assert.equal(picker.querySelectorAll('input:checked').length, 1);
    picker.querySelector('input:checked').click(); await tick();
    assert.equal(picker.querySelectorAll('input:checked').length, 0);
    await h.fill('input[aria-label="Search friends"]', 'Nobody');
    h.button('Save to rave diary').click(); await until(() => h.saves.length === 1);
    assert.deepEqual(h.saves[0].artists, []); assert.deepEqual(h.saves[0].crew, []);
  } finally { h.close(); }
});
