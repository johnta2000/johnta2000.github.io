(() => {
'use strict';
const API='https://rapid-shark-565.convex.cloud', FILE='https://rapid-shark-565.convex.site/statement-pdf';
const $=id=>document.getElementById(id), people=['parents','john','jevin','other'];
const token=location.hash.slice(1), pending=new Map(), expandedRows=new Set(), failures=new Map(), needsRefresh=new Set();
const pdfHome=$('pdf-panel').parentElement;
let data=null,filter='auto',editing=null,pdfUrl=null,pdfLoading=null,request=0,saveWarning='',managerEpoch=0,sharedViewVersion=null,viewSaving=false;
const money=n=>(n/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
const title=s=>s[0].toUpperCase()+s.slice(1);
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function errorText(e){const m=(e?.message||'').match(/(?:This statement link is unavailable\.|This charge changed on another device\.[^\n]*|The split must[^\n]*|Keep notes[^\n]*|Charge not found\.)/);return m?.[0]||'Could not confirm the change. Check your connection and try again.';}
async function call(kind,name,args,auth){const response=await fetch(`${API}/api/${kind}`,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify({path:`statements:${name}`,args,format:'json'})});const result=await response.json();if(!response.ok||result.status!=='success')throw Error(result.errorMessage||'Request failed');return result.value;}
function saved(){
 const warning=failures.values().next().value||saveWarning;
 $('save-status').textContent=pending.size?`Saving ${pending.size} ${pending.size===1?'change':'changes'}…${warning?' Some changes need review.':''}`:warning||'All changes saved';
 $('save-status').classList.toggle('error',!!warning);
}
function effectiveFilter(){return filter==='auto'?(data.rows.some(r=>!r.allocation)?'unassigned':'all'):filter;}
function syncViewControls(){
 const current=effectiveFilter();
 for(const b of document.querySelectorAll('[data-filter]')){const active=b.dataset.filter===current;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
 const view=data.view||{filter:'auto',search:''};
 const name=view.filter==='auto'?'Unassigned first (all items when finished)':view.filter==='all'?'All items':title(view.filter);
 $('view-summary').textContent='Shared opening view: '+name+(view.search?' · Search: “'+view.search+'”':'');
 $('save-view').disabled=viewSaving;
}
function updateTotals(){
 const totals={parents:0,john:0,jevin:0,other:0,unassigned:0};let assigned=0;
 for(const r of data.rows){if(r.allocation){assigned++;for(const p of people)totals[p]+=r.allocation[p]??0;}else totals.unassigned+=r.amountCents;}
 for(const [p,n] of Object.entries(totals))$(p+'-total').textContent=money(n);
 $('progress').textContent=assigned===data.rows.length?'All items assigned':`${data.rows.length-assigned} ${data.rows.length-assigned===1?'item':'items'} left to assign`;
 $('progress-bar').max=data.rows.length;$('progress-bar').value=assigned;saved();
}
function updateRow(r){
 const item=[...$('transactions').querySelectorAll('.row')].find(n=>n.dataset.id===r._id);if(!item)return;
 const label=allocationLabel(r);item.classList.toggle('saving',pending.has(r._id));
 for(const b of item.querySelectorAll('[data-label]')){b.setAttribute('aria-pressed',String(label===b.dataset.label));b.disabled=needsRefresh.has(r._id);}
 item.querySelector('.edit-row').disabled=pending.has(r._id)||needsRefresh.has(r._id);
 const clear=item.querySelector('.clear-row');clear.hidden=!r.allocation;clear.disabled=needsRefresh.has(r._id);
 item.querySelector('.split-text').hidden=label!=='split';item.querySelector('.split-text').textContent=label==='split'?people.filter(p=>r.allocation[p]).map(p=>`${title(p)} ${money(r.allocation[p])}`).join(' · '):'';
 item.querySelector('summary').textContent=r.note?'Details · Note added':'Details';
 const note=item.querySelector('.row-note');note.hidden=!r.note;note.textContent=r.note;
}

function clearReview(){++request;for(const entry of pending.values())entry.resolve(false);pending.clear();needsRefresh.clear();failures.clear();closePdf();data=null;sharedViewVersion=null;$('review').hidden=true;$('balance').hidden=true;$('copy-link').hidden=true;$('transactions').replaceChildren();if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=null;StatementPdf.reset();$('pdf-open').removeAttribute('href');$('edit-dialog').close();editing=null;}
async function refresh(silent=false){if(pending.size||editing||viewSaving)return;const seq=++request;try{const value=await call('query','review',{token});if(seq!==request||pending.size||editing||viewSaving)return;const oldRows=new Map((data?.rows||[]).map(r=>[r._id,r]));const sameList=data&&data.rows.length===value.rows.length&&value.rows.every(r=>oldRows.has(r._id));value.rows=value.rows.map(r=>{const old=oldRows.get(r._id);if(old){delete old.allocation;Object.assign(old,r);return old;}return r;});const viewChanged=sharedViewVersion!==(value.viewVersion??0);data=value;if(viewChanged){sharedViewVersion=value.viewVersion??0;filter=value.view?.filter||'auto';$('search').value=value.view?.search||'';}needsRefresh.clear();$('status').textContent='';syncViewControls();if(sameList&&!viewChanged&&filter==='all'&&!$('search').value){updateTotals();data.rows.forEach(updateRow);}else render();}catch(e){if(seq!==request)return;if(/unavailable/.test(e.message)){clearReview();$('status').textContent='This statement link is unavailable. Ask John for a current link.';}else if(!silent||!data){$('status').textContent='Could not load the statement. Check your connection, then reload this page.';}else{saveWarning='Could not refresh. Displaying the last loaded version.';saved();}}}
function allocationLabel(row){if(!row.allocation)return null;return people.find(p=>row.allocation[p]===row.amountCents&&people.filter(x=>x!==p).every(x=>(row.allocation[x]??0)===0))||'split';}
function render(){
 $('review').hidden=false;$('balance').hidden=false;$('copy-link').hidden=false;$('title').textContent=data.title;$('period').textContent=data.period;$('balance-amount').textContent=money(data.balanceCents);$('due-date').textContent='Due '+new Date(data.dueDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
 updateTotals();
 const kinds={opening:'Opening balance',purchase:'Purchases',credit:'Credits & adjustments',payment:'Card payments',fee:'Fees',interest:'Interest'};
 $('breakdown').replaceChildren();for(const [kind,label] of Object.entries(kinds)){const sum=data.rows.filter(r=>r.kind===kind).reduce((s,r)=>s+r.amountCents,0);if(!sum)continue;const n=el('div',undefined,'breakdown-row');n.append(el('span',label),el('strong',money(sum)));$('breakdown').append(n);}
 const sum=data.rows.reduce((s,r)=>s+r.amountCents,0);$('reconciled').textContent=sum===data.balanceCents?'✓ Reconciled':'Needs review';
 renderRows();
}
function renderRows(){
 syncViewControls();
 const root=$('transactions');root.replaceChildren();const search=$('search').value.toLowerCase().trim(),current=effectiveFilter();
 const rows=data.rows.filter(r=>(current==='all'||current==='unassigned'&&!r.allocation||people.includes(current)&&r.allocation?.[current]!==0&&r.allocation?.[current]!==undefined)&&(!search||`${r.description} ${r.date} ${r.note} ${money(r.amountCents)}`.toLowerCase().includes(search)));
 const groups=[['purchase','Purchases',''],['credit','Credits & adjustments','Assign the rent adjustment to the same person as the corresponding rent charge if it offsets that charge.'],['fee','Fees',''],['interest','Interest',''],['opening','Opening balance','Allocate the carried balance based on the previous month’s split.'],['payment','Card payments','Assign payments to the share they paid down. They reduce the amount still owed.']];
 for(const [kind,label,help] of groups){const group=rows.filter(r=>r.kind===kind);if(!group.length)continue;const heading=el('div',undefined,'group-heading');heading.append(el('h2',label),el('span',`${group.length} ${group.length===1?'item':'items'} · ${money(group.reduce((s,r)=>s+r.amountCents,0))}`));root.append(heading);if(help)root.append(el('p',help,'group-help'));for(const r of group)root.append(row(r));}
 if(!rows.length)root.append(el('p','No items match this view.','empty'));
}
function merchantName(description){
 // Display-only shortening. The exact imported description stays in Details and export.
 const known=[[/^Wellhub\b/i,'Wellhub'],[/^OURARING\b/i,'Oura'],[/^STARBUCKS\b/i,'Starbucks'],[/^BJS WHOLESALE\b/i,"BJ’s Wholesale"],[/^TRADER JOE[ ’]?S\b/i,'Trader Joe’s'],[/^WHOLEFDS\b/i,'Whole Foods']];
 for(const [pattern,name] of known)if(pattern.test(description))return name;
 return description.replace(/^TST\*\s*/i,'').split(/\s+\d{1,6}\s+(?=[A-Za-z])|\s+\d{7,}\b/)[0].trim()||description;
}
function row(r){
 const item=el('article',undefined,'row');item.dataset.id=r._id;
 const top=el('div',undefined,'row-top'),heading=el('div'),amount=el('div',money(r.amountCents),'amount'+(r.amountCents<0?' negative':''));
 heading.append(el('h3',merchantName(r.description),'merchant'),el('div',new Date(r.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),'date'));top.append(heading,amount);item.append(top);
 const actions=el('div',undefined,'row-actions'),label=allocationLabel(r);
 for(const p of people){const b=el('button',title(p),'label-button');b.dataset.label=p;b.setAttribute('aria-pressed',String(label===p));b.setAttribute('aria-label',`Assign ${r.description} to ${title(p)}`);b.disabled=needsRefresh.has(r._id);b.onclick=()=>saveRow(r,Object.fromEntries(people.map(k=>[k,k===p?r.amountCents:0])),r.note);actions.append(b);}
 item.append(actions);
 const split=el('p',label==='split'?people.filter(p=>r.allocation[p]).map(p=>`${title(p)} ${money(r.allocation[p])}`).join(' · '):'','split-text');split.hidden=label!=='split';item.append(split);
 const details=el('details',undefined,'charge-details');details.open=expandedRows.has(r._id);
 details.append(el('summary',r.note?'Details · Note added':'Details'));
 details.append(el('p',r.description,'full-description'));
 const secondary=el('div',undefined,'secondary-actions');
 const edit=el('button','Split / note','quiet edit-row');edit.disabled=pending.has(r._id)||needsRefresh.has(r._id);edit.onclick=()=>openEditor(r);secondary.append(edit);
 {const undo=el('button','Clear label','quiet clear-row');undo.hidden=!r.allocation;undo.disabled=needsRefresh.has(r._id);undo.setAttribute('aria-label','Clear assignment for '+r.description);undo.onclick=()=>saveRow(r,null,r.note);secondary.append(undo);}
 const source=el('button',`PDF p. ${r.page} ↗`,'quiet source');source.onclick=()=>showPdf(r.page);secondary.append(source);details.append(secondary);
 const noteText=el('p',r.note,'row-note');noteText.hidden=!r.note;details.append(noteText);
 details.addEventListener('toggle',()=>{if(!details.isConnected)return;if(details.open)expandedRows.add(r._id);else expandedRows.delete(r._id);});item.append(details);return item;
}
// Each charge has its own serial queue. The visible intent changes immediately;
// later taps replace queued intent, while acknowledged versions advance in order.
function saveRow(r,allocation,note,fromEditor=false){
 if(needsRefresh.has(r._id))return Promise.resolve(false);
 ++request;failures.delete(r._id);saveWarning='';
 let entry=pending.get(r._id);
 if(!entry){let resolve;const done=new Promise(r=>resolve=r);entry={row:r,confirmed:{allocation:r.allocation,note:r.note,version:r.version},revision:0,done,resolve,fromEditor,running:false};pending.set(r._id,entry);}
 entry.desired={allocation:allocation||undefined,note:note.trim()};entry.revision++;
 Object.assign(r,entry.desired);updateRow(r);updateTotals();
 if(!entry.running){entry.running=true;void flushRow(entry);}
 return entry.done;
}
async function flushRow(entry){
 const r=entry.row;
 while(pending.get(r._id)===entry){
  const revision=entry.revision,desired={...entry.desired};
  try{
   const result=await call('mutation','save',{token,id:r._id,expectedVersion:entry.confirmed.version,allocation:desired.allocation||null,note:desired.note});
   if(pending.get(r._id)!==entry)return;
   entry.confirmed={...desired,version:result.version};r.version=result.version;
   if(revision!==entry.revision)continue;
   pending.delete(r._id);entry.resolve(true);updateRow(r);updateTotals();
   // Keep rapid taps stable until saves finish, then remove completed work from the queue.
   if(!pending.size&&!editing&&(filter!=='all'||$('search').value))renderRows();
  }catch(e){
   if(pending.get(r._id)!==entry)return;
   Object.assign(r,entry.confirmed);pending.delete(r._id);needsRefresh.add(r._id);
   const message=errorText(e);failures.set(r._id,message);
   if(entry.fromEditor)$('edit-error').textContent=message;
   entry.resolve(false);
   if(/unavailable/.test(e.message)){clearReview();$('status').textContent='This statement link is unavailable.';return;}
   updateRow(r);updateTotals();
  }
 }
 // Read after an uncertain write before accepting a retry with an old version.
 if(!pending.size&&needsRefresh.size&&!editing)void refresh(true);
}
function openEditor(r){editing=r;$('edit-description').textContent=r.description;$('edit-amount').textContent='Total: '+money(r.amountCents);for(const p of people)$('split-'+p).value=r.allocation?((r.allocation[p]??0)/100).toFixed(2):'';$('edit-note').value=r.note;$('edit-error').textContent='';$('edit-dialog').showModal();}
function closeEditor(){if(editing&&pending.has(editing._id))return;$('edit-dialog').close();editing=null;refresh(true);}
$('edit-close').onclick=closeEditor;$('edit-dialog').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('edit-form').onsubmit=async e=>{e.preventDefault();if(!editing)return;let allocation=null;const values=people.map(p=>$('split-'+p).value.trim());if(values.some(Boolean)){allocation={};for(let i=0;i<people.length;i++){const raw=values[i]||'0';if(!/^-?\d+(\.\d{1,2})?$/.test(raw)){$('edit-error').textContent='Enter dollar amounts with up to two decimal places.';return;}const [whole,decimal='']=raw.replace('-','').split('.');allocation[people[i]]=(Number(whole)*100+Number(decimal.padEnd(2,'0')))*(raw.startsWith('-')?-1:1);}if(Object.values(allocation).some(n=>!Number.isSafeInteger(n)||(editing.amountCents>=0?n<0:n>0))||Object.values(allocation).reduce((s,n)=>s+n,0)!==editing.amountCents){$('edit-error').textContent='The split must add up to '+money(editing.amountCents)+', with the same sign.';return;}}
 $('edit-save').disabled=true;$('edit-close').disabled=true;const ok=await saveRow(editing,allocation,$('edit-note').value,true);$('edit-save').disabled=false;$('edit-close').disabled=false;if(ok)closeEditor();};
async function showPdf(page=1){$('pdf-panel').hidden=false;if(matchMedia('(max-width:700px)').matches&&!$('pdf-dialog').open){$('pdf-dialog').append($('pdf-panel'));$('pdf-dialog').showModal();}else if(!$('pdf-dialog').open&&innerWidth<1050)$('pdf-panel').scrollIntoView({block:'start'});$('pdf-status').textContent='Loading original PDF…';try{if(!pdfUrl){if(!pdfLoading)pdfLoading=(async()=>{const res=await fetch(FILE,{headers:{'X-Statement-Token':token},cache:'no-store',signal:AbortSignal.timeout(20000)});if(!res.ok||!res.headers.get('content-type')?.includes('application/pdf'))throw Error('PDF unavailable');const blob=await res.blob();await StatementPdf.load(await blob.arrayBuffer());return URL.createObjectURL(blob);})();pdfUrl=await pdfLoading;}
 $('pdf-open').href=`${pdfUrl}#page=${page}`;$('pdf-open').hidden=false;await StatementPdf.show(page);$('pdf-status').textContent='Original statement · All pages included';
 }catch(e){console.warn('Statement PDF preview:',e?.message||'Load failed');$('pdf-status').textContent='Could not load the PDF. Tap “View statement” to retry.';}finally{pdfLoading=null;}}
function closePdf(){ $('pdf-panel').hidden=true; if($('pdf-dialog').open)$('pdf-dialog').close();pdfHome.append($('pdf-panel'));}
$('show-pdf').onclick=()=>showPdf();$('close-pdf').onclick=closePdf;
$('pdf-dialog').addEventListener('cancel',e=>{e.preventDefault();closePdf();});
$('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('copy-link').textContent='Link copied';setTimeout(()=>$('copy-link').textContent='Copy review link',2000);}catch{$('status').textContent='Copy the full address from your browser to share this review.';}};
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter==='unassigned'?'auto':b.dataset.filter;$('view-status').textContent='';renderRows();};
$('search').oninput=()=>{if(data){$('view-status').textContent='';renderRows();}};
$('save-view').onclick=async()=>{
 if(!data||viewSaving)return;
 const view={filter,search:$('search').value.trim()},expectedVersion=data.viewVersion??0;
 viewSaving=true;++request;syncViewControls();$('view-status').classList.remove('error');$('view-status').textContent='Saving the shared opening view…';
 let failed=false;
 try{const result=await call('mutation','saveView',{token,expectedVersion,view});if(!data)return;data.view=result.view;data.viewVersion=result.viewVersion;sharedViewVersion=result.viewVersion;$('view-status').textContent='Saved. Everyone using this link will see this view.';}
 catch(e){failed=true;if(/unavailable/.test(e.message)){clearReview();$('status').textContent='This statement link is unavailable.';}else{$('view-status').classList.add('error');$('view-status').textContent=e.message.match(/(?:The shared view changed on another device\. Reload before saving your view\.|Keep the shared search under 160 characters\.)/)?.[0]||'Could not confirm the shared view. Check your connection and try again.';}}
 finally{viewSaving=false;if(data){syncViewControls();if(failed)void refresh(true);}}
};
$('export').onclick=()=>{const cell=(value,index)=>'"'+String(value??'').replace(index===1||index===people.length+5?/^[=+@\t\r-]/:/^[=+@\t\r]/,"'$&").replaceAll('"','""')+'"';const rows=[['Date','Description','Type','Amount',...people.map(title),'Unassigned','Note','PDF page'],...data.rows.map(r=>[r.date,r.description,r.kind,(r.amountCents/100).toFixed(2),...people.map(p=>r.allocation?((r.allocation[p]??0)/100).toFixed(2):''),r.allocation?'':(r.amountCents/100).toFixed(2),r.note,r.page])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download='statement-split.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
async function manager(){
 $('manager').hidden=false;$('status').textContent='Sign in to see your statement library. Shared review links open without sign-in.';
 async function script(src,attributes={}){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.crossOrigin='anonymous';Object.entries(attributes).forEach(([k,v])=>s.setAttribute(k,v));s.onload=resolve;s.onerror=reject;document.head.append(s);});}
 try{await script('https://clerk.john-ta.com/npm/@clerk/ui@1/dist/ui.browser.js');await script('https://clerk.john-ta.com/npm/@clerk/clerk-js@6/dist/clerk.browser.js',{'data-clerk-publishable-key':'pk_live_Y2xlcmsuam9obi10YS5jb20k'});await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});let previous=null;
 async function update({session}){if(previous===session?.id)return;previous=session?.id;const epoch=++managerEpoch;$('statement-list').replaceChildren();if(!session){$('status').textContent='Sign in to manage statement links.';window.Clerk.mountSignIn($('sign-in'));return;}window.Clerk.unmountSignIn($('sign-in'));try{let auth=await session.getToken();try{auth=await session.getToken({template:'convex'})||auth;}catch{}const statements=await call('query','list',{},auth);if(epoch!==managerEpoch)return;$('status').textContent=statements.length?'Only shared review links open without sign-in.':'No statements imported yet.';for(const s of statements){const card=el('article',undefined,'statement-card'),details=el('div');details.append(el('h2',s.title),el('p',s.period,'muted'));const actions=el('div');if(s.enabled){const a=el('a','Open review ↗','button');a.href='#'+s.token;actions.append(a);const revoke=el('button','Disable link');revoke.onclick=async()=>{if(!confirm('Disable this statement link? Everyone using it will lose access.'))return;revoke.disabled=true;try{const fresh=await session.getToken({template:'convex'}).catch(()=>session.getToken());await call('mutation','revoke',{id:s._id},fresh);previous=undefined;await update({session});}catch{$('status').textContent='Could not disable the link. Please try again.';revoke.disabled=false;}};actions.append(revoke);}else actions.append(el('span','Link disabled'));card.append(details,actions);$('statement-list').append(card);}}catch{if(epoch===managerEpoch)$('status').textContent='Sign in with an approved Payments account to see statements.';}}
 window.Clerk.addListener(update);await update({session:window.Clerk.session});
 }catch{$('status').textContent='Could not load sign-in. Reload this page to try again.';}
}
window.addEventListener('hashchange',()=>location.reload());
window.addEventListener('beforeunload',e=>{if(pending.size){e.preventDefault();e.returnValue='';}});
if(token){if(/^[A-Za-z0-9_-]{43}$/.test(token)){refresh();setInterval(()=>{if(!document.hidden)refresh(true);},20000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});window.addEventListener('online',()=>refresh(true));}else $('status').textContent='This statement link is unavailable. Ask John for a current link.';}else manager();
})();
