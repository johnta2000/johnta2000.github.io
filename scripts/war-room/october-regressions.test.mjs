import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source = readFileSync(new URL('../../war-room-10012026/app.js',import.meta.url),'utf8');
const seedSource = readFileSync(new URL('../../convex/warRoomLaunchSeed.ts',import.meta.url),'utf8').replace('export const launchSeedBuckets =', 'seedBuckets =');
const functions = source.slice(source.indexOf('function createFallbackState()'),source.indexOf('\ndocument.querySelectorAll("[data-project]")'));
function model() {
  const context = vm.createContext({console, URL, window:{}});
  vm.runInContext(source.slice(0,source.indexOf('let state = createFallbackState();'))+'\n'+seedSource+'\nseedTaskIds = new Set(seedBuckets.flatMap(b=>b.groups.flatMap(g=>g.tasks.map(t=>getSeedTaskId(b.id,g.id,t)))));\nlet state;\n'+functions,context);
  return code => vm.runInContext(code,context);
}
test('new room has four projects, four complete update workflows, all 16 distribution tickets, and unique IDs',()=>{
 const run=model();
 assert.equal(run('seedBuckets.length'),4);
 assert.equal(run('new Set(createFallbackState().buckets.flatMap(b=>b.groups.flatMap(g=>g.tasks.map(t=>t.id)))).size'),46);
 assert.equal(run('seedBuckets.flatMap(b=>b.groups).filter(g=>g.id.endsWith("-content")).flatMap(g=>g.tasks).length'),16);
 assert.equal(run('getProgressItems(createFallbackState().buckets).length'),74);
 assert.equal(run('getPrepProgressItems(createFallbackState().buckets).length'),43);
 assert.equal(run('getPostProgressItems(createFallbackState().buckets).length'),31);
});
test('edited seeded title, cleared note, tags, links, and staged checks survive reload',()=>{
 const run=model();
 run('state=createFallbackState(); state.buckets[0].groups[0].tasks[0].title="Edited crawl"; state.buckets[0].groups[0].tasks[0].notes=""; state.buckets[0].groups[0].tasks[0].tags=["John"]; state.completed["af-crawl-baseline-crawl-captured"]=true; state.otherLinks["af-crawl"]="https://example.com/a\\nhttps://example.com/b"; state=mergeSeedWithSaved(createFallbackState(),state)');
 assert.equal(run('state.buckets[0].groups[0].tasks[0].title'),'Edited crawl');
 assert.equal(run('state.buckets[0].groups[0].tasks[0].notes'),'');
 assert.equal(run('state.buckets[0].groups[0].tasks[0].tags[0]'),'John');
 assert.equal(run('state.completed["af-crawl-baseline-crawl-captured"]'),true);
 assert.equal(run('state.otherLinks["af-crawl"].split("\\n").length'),2);
});
test('seed deletion and custom staged ticket survive merge; seed stages cannot disappear',()=>{
 const run=model();
 run('state=createFallbackState(); state.deletedTasks["af-feed"]=true; state.buckets[0].groups[0].tasks.push({id:"custom",title:"Extra",custom:true,stages:["Prepared","Content posted"]}); state.buckets[0].groups[0].tasks[0].stages=[]; state=mergeSeedWithSaved(createFallbackState(),state)');
 assert.equal(run('state.buckets[0].groups[0].tasks.some(t=>t.id==="af-feed")'),false);
 assert.equal(run('state.buckets[0].groups[0].tasks.filter(t=>t.id==="custom").length'),1);
 assert.equal(run('state.buckets[0].groups[0].tasks[0].stages.length'),1);
});
test('export reports staged completion and uses October board identity',()=>{
 const run=model();
 run('state=createFallbackState(); const task=state.buckets[0].groups[0].tasks[0]; task.stages.forEach(s=>state.completed[getStageId(task,s)]=true)');
 assert.equal(run('buildExport().buckets[0].groups[0].tasks[0].done'),true);
 assert.match(run('buildExport().warRoom'),/October 1, 2026/);
 run('window.WarRoomNotes = {getText: id => id === "air-france" ? "Handoff notes" : ""}');
 assert.equal(run('buildExport().buckets[0].notes'),'Handoff notes');
 assert.equal(run('BOARD_ID'),'war-room-10012026');
});
test('pasted link lists exclude executable URLs',()=>{
 const run=model();
 assert.equal(run('safeUrls("javascript:alert(1) https://example.com data:text/html,test")'),'https://example.com');
});

test('splitting the old BOFA bucket keeps custom tickets, edits, deleted tasks, and checks in their matching groups',()=>{
 const run=model();
 run(`state=createFallbackState();
 const af=state.buckets[0], apr=state.buckets[1];
 apr.groups[0].tasks[0].title="Custom rate crawl";
 apr.groups[0].tasks[1].title=legacyAprDefaults["apr-feed"].title;
 apr.groups[0].tasks[1].notes=legacyAprDefaults["apr-feed"].notes;
 apr.groups[0].tasks.push({id:"rate-custom",title:"Rate exception",custom:true});
 af.groups[0].tasks.push({id:"launch-custom",title:"Launch exception",custom:true});
 state.buckets=[{id:"bofa",groups:[...af.groups,...apr.groups]},...state.buckets.slice(2)];
 state.completed["apr-feed-live-feed-updated"]=true;
 state.completed["apr-crawl-card-inventory-confirmed"]=true;
 state.completed["rate-custom"]=true;
 state.deletedTasks["af-reddit"]=true;
 state.docLinks["rate-custom"]="https://example.com/rates";
 state=mergeSeedWithSaved(createFallbackState(),state);`);
 assert.equal(run('state.buckets[0].id'),'air-france');
 assert.equal(run('state.buckets[1].id'),'bofa-apr');
 assert.equal(run('state.buckets[0].groups[0].tasks.some(t=>t.id==="launch-custom")'),true);
 assert.equal(run('state.buckets[1].groups[0].tasks.some(t=>t.id==="rate-custom")'),true);
 assert.equal(run('state.buckets[1].groups[0].tasks[0].title'),'Custom rate crawl');
 assert.equal(run('state.buckets[1].groups[0].tasks[1].title'),'Update APRs in the Affil feed');
 assert.equal(run('state.completed["apr-feed-live-feed-updated"]'),true);
 assert.equal(run('state.completed["apr-crawl-card-inventory-confirmed"]'),true);
 assert.equal(run('state.completed["rate-custom"]'),true);
 assert.equal(run('state.docLinks["rate-custom"]'),'https://example.com/rates');
 assert.equal(run('state.buckets[0].groups[1].tasks.some(t=>t.id==="af-reddit")'),false);
});

for (const custom of [false, true]) {
 test(`inline deletion confirms explicitly and persists for ${custom ? 'custom' : 'seeded'} tickets`,()=>{
  const run=model();
  run(`state=createFallbackState();
    let activeLinkTaskId=${JSON.stringify(custom ? 'custom-delete-check' : 'af-crawl')};
    const deleteConfirmation={hidden:true};
    const deleteConfirmationText={textContent:""};
    const cancelDeleteTicket={focus(){}};
    const toggleAddPanel={focus(){}};
    let saves=0;
    saveState=()=>{saves++}; render=()=>{};
    closeLinksModal=()=>{activeLinkTaskId="";deleteConfirmation.hidden=true};`);
  if(custom) run('state.buckets[0].groups[0].tasks.push({id:activeLinkTaskId,title:"Custom deletion check",custom:true,stages:["Prepared"]})');
  run('const deletingId=activeLinkTaskId; const deletingStage=getStageId(findTask(deletingId).task,findTask(deletingId).task.stages[0]); state.completed[deletingStage]=true; state.docLinks[deletingId]="https://example.com/test"; confirmActiveTicketDeletion()');
  assert.equal(run('!!findTask(deletingId)'),true,'no deletion without showing confirmation');
  run('deleteActiveTicket()');
  assert.equal(run('deleteConfirmation.hidden'),false);
  assert.equal(run('!!findTask(deletingId)'),true,'first click only asks for confirmation');
  assert.equal(run('saves'),0);
  run('confirmActiveTicketDeletion()');
  assert.equal(run('!!findTask(deletingId)'),false);
  assert.equal(run('Boolean(state.completed[deletingStage])'),false);
  assert.equal(run('Boolean(state.docLinks[deletingId])'),false);
  assert.equal(run('saves'),1);
  run('state=mergeSeedWithSaved(createFallbackState(),state)');
  assert.equal(run('!!findTask(deletingId)'),false,'deleted ticket must not return on reload');
 });
}

test('renamed crawl and approval steps retain checkbox identity through reload and unchecking',()=>{
 const run=model();
 run(`state=createFallbackState();
 state.completed["af-crawl-baseline-crawl-captured"]=true;
 state.completed["af-mockups-approval-received"]=true;
 state=mergeSeedWithSaved(createFallbackState(),state);`);
 assert.equal(run('findTask("af-crawl").task.stages[0]'),'Crawls started');
 assert.equal(run('getStageId(findTask("af-crawl").task,"Crawls started")'),'af-crawl-baseline-crawl-captured');
 assert.equal(run('state.completed[getStageId(findTask("af-mockups").task,"Approval received & affiliate links deployed")]'),true);
 run('delete state.completed[getStageId(findTask("af-crawl").task,"Crawls started")]; state=mergeSeedWithSaved(createFallbackState(),state)');
 assert.equal(run('Boolean(state.completed[getStageId(findTask("af-crawl").task,"Crawls started")])'),false);
 assert.equal(run('getProgressItems(state.buckets).some(i=>["Card inventory confirmed","Baseline crawl captured","Changes staged","Live feed updated","Approval received"].includes(i.title))'),false);
});

test('simplified docs and news summaries survive older saved state, with QA titles updated',()=>{
 const run=model();
 run(`state=createFallbackState();
 for (const bucket of state.buckets) for (const group of bucket.groups) for (const task of group.tasks) {
   if(task.id.endsWith("-qa")) task.title=task.id==="apr-qa" ? "Verify all rates by noon" : "Verify the live update";
   if(task.id.endsWith("-docs")) task.stages=["Compliance changes drafted","Compliance docs updated"];
   if(["ihg-email","united-email"].includes(task.id)) task.stages=["Recipient list confirmed","Email drafted","Embargo lift confirmed","Email sent"];
 }
 state.completed["apr-docs-compliance-docs-updated"]=true;
 state.completed["ihg-email-email-sent"]=true;
 state=mergeSeedWithSaved(createFallbackState(),state);`);
 assert.equal(run('findTask("af-qa").task.title'),'Live QA completed by another person');
 assert.equal(run('findTask("apr-qa").task.title'),'Live QA completed by another person');
 assert.equal(run('findTask("ihg-docs").task.stages.join(",")'),'Compliance changes drafted');
 assert.equal(run('findTask("apr-docs").task.stages.join(",")'),'Compliance changes drafted');
 assert.equal(run('state.completed[getStageId(findTask("apr-docs").task,"Compliance changes drafted")]'),true);
 assert.equal(run('findTask("ihg-email").task.stages.join(",")'),'Email sent');
 assert.equal(run('findTask("united-email").task.stages.join(",")'),'Email sent');
 assert.equal(run('areAllStagesDone(findTask("ihg-email").task)'),true);
});
