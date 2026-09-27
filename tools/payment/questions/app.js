(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = 'https://rapid-shark-565.convex.cloud', FILE_API = 'https://rapid-shark-565.convex.site/payment-question-file';
  const filterPicker = SearchableSelect.enhance($('filter')), statusPicker = SearchableSelect.enhance($('update-status'));
  let session = null, sessionId, epoch = 0, request = 0, detailRequest = 0, mounted = false, busy = false;
  let tickets = [], selected = null, detail = null, draftFiles = [], pendingFiles = [], editing = null, updateMode = 'note', updateTarget = null, createKey = '', updateKey = '';
  const urls = new Set(), detailUrls = new Set();
  const fieldNames = ['title','transactionDate','cardholder','card','payer','payee','followUp','context'];
  const statusNames = { open: 'Open', waiting: 'Waiting', resolved: 'Resolved' };
  const currency = cents => cents === null ? 'Unknown' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const day = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) : 'Not added';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  function errorText(error) { return error?.message?.match(/(?:This question changed[^\n]*|This account is not authorized[^\n]*|Question not found\.|Enter [^\n]*|Repayment must[^\n]*|Screenshots must[^\n]*|Choose a PNG[^\n]*|A question can[^\n]*)/)?.[0] || 'Couldn’t confirm this change. Your draft is still here; retry when connected.'; }
  function notice(text = '') { $('notice').textContent = text; $('notice').hidden = !text; }
  function objectUrl(file, group = urls) { const url = URL.createObjectURL(file); group.add(url); return url; }
  function revoke(group) { group.forEach(url => URL.revokeObjectURL(url)); group.clear(); }
  function setBusy(value) { busy = value; document.querySelectorAll('dialog button,dialog input,dialog textarea,dialog select,#new,#more-files').forEach(n => n.disabled = value); }
  async function token(current = session) {
    if (!current) throw Error('Sign in again.');
    let result = await current.getToken();
    try { const claims = JSON.parse(atob(result.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); if (claims.aud === 'convex' || claims.aud?.includes?.('convex')) return result; } catch {}
    try { result = await current.getToken({ template: 'convex' }); } catch {}
    return result;
  }
  async function call(kind, name, args = {}) {
    const generation = epoch, current = session, bearer = await token(current);
    if (generation !== epoch) throw Error('Session changed.');
    const r = await fetch(`${API}/api/${kind}`, { method:'POST', cache:'no-store', signal:AbortSignal.timeout(20000), headers:{'Content-Type':'application/json', Authorization:`Bearer ${bearer}`}, body:JSON.stringify({path:`paymentQuestions:${name}`, args, format:'json'}) });
    const result = await r.json();
    if (generation !== epoch) throw Error('Session changed.');
    if (!r.ok || result.status !== 'success') throw Error(result.errorMessage || 'Request failed.');
    return result.value;
  }
  async function fileRequest(id, options = {}) {
    const generation = epoch, bearer = await token();
    if (generation !== epoch) throw Error('Session changed.');
    const result = await fetch(`${FILE_API}?id=${encodeURIComponent(id)}`, { ...options, cache:'no-store', signal:AbortSignal.timeout(60000), headers:{...options.headers, Authorization:`Bearer ${bearer}`} });
    if (generation !== epoch) throw Error('Session changed.');
    if (!result.ok) throw Error(await result.text()); return result;
  }
  function clear() {
    ++request; ++detailRequest; tickets=[]; selected=null; detail=null; draftFiles=[]; pendingFiles=[]; editing=null;
    filterPicker.close(); statusPicker.close(); document.querySelectorAll('dialog[open]').forEach(d => d.close());
    $('app').hidden=true; $('new').hidden=true; $('tickets').replaceChildren(); $('detail').replaceChildren(); $('draft-files').replaceChildren();
    $('ticket-form').reset(); $('update-form').reset(); $('search').value=''; $('files').value=''; $('more-files').value=''; $('full-image').removeAttribute('src');
    revoke(urls); revoke(detailUrls); setBusy(false); notice();
  }
  function badge(status) { return node('span', statusNames[status], `badge ${status}`); }
  function button(text, fn, style='') { const b=node('button', text, style); b.type='button'; b.addEventListener('click', fn); return b; }
  function renderList() {
    const active=tickets.filter(t => t.status !== 'resolved');
    $('open-count').textContent=active.length;
    const known=active.filter(t => t.expectedCents !== null);
    $('owed-total').textContent=known.length ? currency(known.reduce((sum,t) => sum+Math.max(0,t.expectedCents-t.receivedCents),0)) : '—';
    const q=$('search').value.trim().toLowerCase(), filter=$('filter').value;
    const visible=tickets.filter(t => (filter === 'all' || (filter === 'active' ? t.status !== 'resolved' : t.status === filter)) && [t.title,t.cardholder,t.card,t.payer,t.payee,t.context,t.transactionDate].join(' ').toLowerCase().includes(q)).sort((a,b) => b.updatedAt-a.updatedAt);
    $('list-count').textContent=`${visible.length} ${visible.length === 1 ? 'question' : 'questions'}`; $('tickets').replaceChildren();
    for (const t of visible) {
      const row=button('', () => void openTicket(t._id), `ticket${selected===t._id ? ' selected' : ''}`); row.dataset.id=t._id; row.setAttribute('aria-pressed', String(selected===t._id));
      const top=node('div',undefined,'ticket-top'); top.append(node('span',t.title,'ticket-title'), node('span',t.amountCents===null ? '—' : currency(t.amountCents),'ticket-amount'));
      const meta=node('p',[t.cardholder,t.card,t.payer ? `${t.payer} → ${t.payee || '?'}` : 'Who owes? Still to confirm'].filter(Boolean).join(' · '),'ticket-meta');
      const bottom=node('div',undefined,'ticket-bottom'); bottom.append(badge(t.status));
      if(t.followUp && t.status !== 'resolved') bottom.append(node('span',`Follow up ${day(t.followUp)}`,t.followUp<=today() ? 'follow-up' : 'muted small'));
      row.append(top,meta,bottom); $('tickets').append(row);
    }
    if(!visible.length) { const empty=node('div',undefined,'empty'); empty.append(node('h2',tickets.length ? 'Nothing here right now.' : 'Start with a screenshot.'),node('p',tickets.length ? 'Try another view or search.' : 'Flag a charge, even if you don’t know the full story yet.')); $('tickets').append(empty); }
  }
  async function refresh() {
    if(!session) return; const serial=++request,generation=epoch;
    try { const result=await call('query','list'); if(serial!==request||generation!==epoch)return; tickets=result;renderList();notice(); }
    catch(e){if(generation===epoch)notice(errorText(e));}
  }
  async function openTicket(id) {
    const serial=++detailRequest,generation=epoch; selected=id; detail=null; renderList(); revoke(detailUrls);
    document.querySelector('.workspace').classList.add('show-detail'); $('detail').replaceChildren(node('p','Loading question…','muted'));
    try { const data=await call('query','detail',{id}); if(serial!==detailRequest||generation!==epoch)return; detail=data;renderDetail(); }
    catch(e){if(serial===detailRequest&&generation===epoch){$('detail').replaceChildren(button('← Back to inbox',back,'quiet'),node('p',errorText(e),'error'),button('Try again',()=>void openTicket(id)));}}
  }
  function back(){++detailRequest;document.querySelector('.workspace').classList.remove('show-detail');selected=null;detail=null;revoke(detailUrls);renderList();}
  function fact(list,label,value){const part=node('div');part.append(node('dt',label),node('dd',value||'Still to confirm'));list.append(part);}
  function renderDetail() {
    if(!detail)return;const {item:t,events,files}=detail;const area=$('detail');area.replaceChildren();
    area.append(button('← All questions',back,'quiet mobile-back'));
    const heading=node('div',undefined,'detail-heading'),left=node('div');left.append(badge(t.status),node('h2',t.title));heading.append(left,button('Edit',()=>editTicket(t),'quiet'));area.append(heading);
    const amount=node('p',t.amountCents===null ? 'Amount not added' : currency(t.amountCents),'detail-amount');amount.append(node('small','charge'));area.append(amount,node('p',t.transactionDate ? `Transaction · ${day(t.transactionDate)}` : 'Transaction date not added','muted small'));
    const facts=node('dl',undefined,'facts');fact(facts,'Cardholder',t.cardholder);fact(facts,'Card',t.card);fact(facts,'Who owes',t.payer);fact(facts,'Who gets paid',t.payee);if(t.followUp)fact(facts,'Follow up',day(t.followUp));area.append(facts);
    if(t.context)area.append(node('h3','The story so far'),node('p',t.context,'context'));
    const balance=node('div',undefined,'balance');
    for(const [label,value] of [['Expected',t.expectedCents],['Received',t.receivedCents],['Remaining',t.expectedCents===null ? null : Math.max(0,t.expectedCents-t.receivedCents)]]){const n=node('div',label);n.append(node('strong',currency(value)));balance.append(n);}area.append(balance);
    const actions=node('div',undefined,'detail-actions');actions.append(button('Add update',()=>openUpdate('note')),button('Log repayment',()=>openUpdate('payment')),button(t.status==='resolved'?'Reopen':'Resolve',()=>openUpdate(t.status==='resolved'?'reopen':'resolve'),'primary'));area.insertBefore(actions,facts);
    const screenshotHead=node('div',undefined,'section-head');screenshotHead.append(node('h3',`Screenshots · ${files.length}`),button('+ Add',()=>$('more-files').click(),'quiet'));area.append(screenshotHead);
    if(pendingFiles.some(f=>f.ticketId===t._id)){area.append(node('p',`${pendingFiles.filter(f=>f.ticketId===t._id).length} screenshot(s) still need uploading. The question itself is saved.`,'error'),button('Retry screenshots',()=>void uploadPending(t._id)));}
    const gallery=node('div',undefined,'screenshots');area.append(gallery);
    if(!files.length)gallery.append(node('p','No screenshots yet. You can paste an image here.','muted small'));
    for(const file of files){const tile=button('',()=>{},'screenshot');tile.disabled=true;tile.append(node('span','Loading…'));gallery.append(tile);void loadImage(file,tile);}
    const history=node('section',undefined,'history');history.append(node('h3','Activity'));
    for(const event of [...events].sort((a,b)=>b.createdAt-a.createdAt)){
      const item=node('div',undefined,'event');const label=event.kind==='payment'?`Repayment received · ${currency(event.amountCents)}`:event.kind==='edit'?'Details edited':event.kind==='note'?'Update':`Marked ${statusNames[event.kind]?.toLowerCase()||event.kind}`;
      item.append(node('strong',label),node('p',event.kind==='edit'?friendlyEdit(event.text):event.text),node('p',`${new Date(event.createdAt).toLocaleString()} · ${event.author}`,'event-meta'));history.append(item);
    }
    const created=node('div',undefined,'event');created.append(node('strong','Question opened'),node('p',`${new Date(t.createdAt).toLocaleString()} · ${t.createdBy}`,'event-meta'));history.append(created);area.append(history);
  }
  function friendlyEdit(text){const names={title:'Question',amountCents:'Charge (cents)',transactionDate:'Transaction date',cardholder:'Cardholder',card:'Card',payer:'Who owes',payee:'Who gets paid',expectedCents:'Expected (cents)',followUp:'Follow up',context:'Context'};return text.replace(/^(\w+):/gm,(_,key)=>`${names[key]||key}:`);}
  async function loadImage(file,tile){const generation=epoch,serial=detailRequest;try{const response=await fileRequest(file._id);const blob=await response.blob();if(generation!==epoch||serial!==detailRequest||!tile.isConnected)return;const url=objectUrl(blob,detailUrls),img=node('img');img.src=url;img.alt=file.name;await img.decode();if(generation!==epoch||serial!==detailRequest||!tile.isConnected)return;tile.replaceChildren(img,node('span',file.name));tile.disabled=false;tile.onclick=()=>{$('full-image').src=url;$('image-dialog').showModal();};}catch{if(generation!==epoch||!tile.isConnected)return;tile.replaceChildren(node('span','Retry image'));tile.disabled=false;tile.onclick=()=>void loadImage(file,tile);}}
  function moneyInput(id){const value=$(id).value.trim();if(!value)return null;if(!/^\d+(\.\d{1,2})?$/.test(value))throw Error('Enter a valid amount with at most two decimal places.');const n=Math.round(Number(value)*100);if(!Number.isSafeInteger(n)||n>100000000)throw Error('Enter a valid amount.');return n;}
  function getFields(){const f=Object.fromEntries(fieldNames.map(id=>[id,$(id).value.trim()]));f.title=f.title||(draftFiles.length?'Screenshot to review':'');if(!f.title)throw Error('Enter a title or add a screenshot.');return {...f,amountCents:moneyInput('amount'),expectedCents:moneyInput('expected')};}
  function newTicket(){editing=null;createKey=crypto.randomUUID();draftFiles=[];revoke(urls);$('ticket-form').reset();$('draft-files').replaceChildren();$('capture-area').hidden=false;$('ticket-title').textContent='Flag a charge';$('ticket-submit').textContent='Create question';$('ticket-error').textContent='';$('ticket-dialog').showModal();}
  function editTicket(t){editing={id:t._id,version:t.version};$('ticket-form').reset();for(const id of fieldNames)$(id).value=t[id];$('amount').value=t.amountCents===null?'':(t.amountCents/100).toFixed(2);$('expected').value=t.expectedCents===null?'':(t.expectedCents/100).toFixed(2);$('capture-area').hidden=true;$('ticket-title').textContent='Edit question';$('ticket-submit').textContent='Save details';$('ticket-error').textContent='';$('ticket-dialog').showModal();}
  function addDraft(files){for(const file of files){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024||!file.size){$('ticket-error').textContent='Choose a PNG, JPEG, or WebP screenshot under 8 MB.';continue;}if(draftFiles.length>=20){$('ticket-error').textContent='A question can have up to 20 screenshots.';break;}draftFiles.push({file,key:crypto.randomUUID(),url:objectUrl(file)});}renderDraft();}
  function renderDraft(){$('draft-files').replaceChildren();for(const entry of draftFiles){const item=node('div',undefined,'draft-file'),img=node('img');img.src=entry.url;img.alt='Screenshot preview';const remove=button('×',()=>{draftFiles=draftFiles.filter(f=>f!==entry);URL.revokeObjectURL(entry.url);urls.delete(entry.url);renderDraft();});remove.setAttribute('aria-label',`Remove ${entry.file.name}`);item.append(img,node('span',entry.file.name),remove);$('draft-files').append(item);}}
  async function uploadPending(id){if(busy)return;const generation=epoch;setBusy(true);notice('Uploading screenshots…');try{for(const item of [...pendingFiles]){if(item.ticketId!==id)continue;await fileRequest(id,{method:'POST',headers:{'Content-Type':item.file.type,'X-File-Name':encodeURIComponent(item.file.name),'X-Request-Key':item.key},body:item.file});if(generation!==epoch)return;pendingFiles=pendingFiles.filter(f=>f!==item);}notice();}catch(e){if(generation===epoch)notice(errorText(e));}finally{if(generation===epoch){setBusy(false);if(selected===id)await openTicket(id);}}}
  $('ticket-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const generation=epoch;setBusy(true);$('ticket-error').textContent='';let id;
    try{const f=getFields();if(editing){id=editing.id;await call('mutation','edit',{...f,id,expectedVersion:editing.version});}else{id=await call('mutation','create',{...f,requestKey:createKey});pendingFiles.push(...draftFiles.map(f=>({...f,ticketId:id})));draftFiles=[];}if(generation!==epoch)return;$('ticket-dialog').close();await refresh();if(generation!==epoch)return;await openTicket(id);}
    catch(e){if(generation===epoch)$('ticket-error').textContent=errorText(e);}finally{if(generation===epoch)setBusy(false);}if(id&&generation===epoch&&pendingFiles.some(f=>f.ticketId===id))void uploadPending(id);
  });
  function openUpdate(mode){if(!detail||busy)return;updateMode=mode;updateTarget={id:detail.item._id,version:detail.item.version};updateKey=crypto.randomUUID();$('update-form').reset();$('update-error').textContent='';$('repayment-field').hidden=mode!=='payment';$('update-status-field').hidden=mode==='payment';$('update-status').value=mode==='resolve'?'resolved':mode==='reopen'?'open':detail.item.status;statusPicker.sync();$('update-title').textContent={note:'Add an update',payment:'Log a repayment',resolve:'Close the loop',reopen:'Reopen this question'}[mode];$('update-prompt').textContent=mode==='resolve'?'How was it resolved?':mode==='payment'?'Payment details / confirmation':'What changed?';$('update-help').textContent=mode==='payment'?'Record money actually received, including who paid, when, and how. This keeps the question open until you explicitly resolve it.':mode==='resolve'?'Repaid, identified, refunded, or no reimbursement needed—leave a note for your future self. Resolving does not add a repayment.':'';$('update-dialog').showModal();}
  $('update-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const generation=epoch;setBusy(true);$('update-error').textContent='';try{const args={id:updateTarget.id,expectedVersion:updateTarget.version,requestKey:updateKey,text:$('update-text').value.trim()};if(updateMode==='payment'){args.amountCents=moneyInput('repayment');if(!args.amountCents)throw Error('Repayment must be greater than zero.');}else args.status=$('update-status').value;await call('mutation','update',args);if(generation!==epoch)return;$('update-dialog').close();await refresh();if(generation!==epoch)return;await openTicket(args.id);}catch(e){if(generation===epoch)$('update-error').textContent=errorText(e);}finally{if(generation===epoch)setBusy(false);}});
  $('new').onclick=newTicket;$('search').oninput=renderList;$('filter').onchange=renderList;$('refresh').onclick=async()=>{await refresh();if(selected&&!busy)await openTicket(selected);};
  $('files').onchange=()=>{addDraft($('files').files);$('files').value='';};
  $('more-files').onchange=()=>{if(!selected||busy)return;queueFiles([...$('more-files').files]);$('more-files').value='';};
  function queueFiles(files){const id=selected;for(const file of files){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){notice('Choose a PNG, JPEG, or WebP screenshot under 8 MB.');return;}pendingFiles.push({file,key:crypto.randomUUID(),ticketId:id});}void uploadPending(id);}
  const drop=$('dropzone');drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');if(!busy)addDraft(e.dataTransfer.files);};
  document.addEventListener('paste',event=>{if(!session||$('app').hidden||busy)return;const files=[...event.clipboardData.items].filter(x=>x.kind==='file'&&x.type.startsWith('image/')).map(x=>x.getAsFile()).filter(Boolean);if(!files.length)return;if($('ticket-dialog').open&&!editing){event.preventDefault();addDraft(files);}else if(!document.querySelector('dialog[open]')){event.preventDefault();if(selected)queueFiles(files);else{newTicket();addDraft(files);}}});
  document.querySelectorAll('.close').forEach(b=>b.onclick=()=>{if(!busy)b.closest('dialog').close();});document.querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{if(busy)e.preventDefault();}));
  window.addEventListener('beforeunload',e=>{if(busy||pendingFiles.length||($('ticket-dialog').open&&($('title').value||draftFiles.length))){e.preventDefault();e.returnValue='';}});
  async function sessionChanged(state){if(state.session===undefined||(state.session?.id||null)===sessionId)return;session=state.session;sessionId=session?.id||null;const generation=++epoch;clear();$('gate').hidden=false;$('sign-out').hidden=!session;
    if(!session){$('gate-message').textContent='Sign in to keep your charge questions and screenshots together.';$('sign-in').hidden=false;if(!mounted){const returnUrl=location.origin+location.pathname;window.Clerk.mountSignIn($('sign-in'),{routing:'hash',withSignUp:false,forceRedirectUrl:returnUrl,appearance:{variables:{colorPrimary:'#276347'},elements:{cardBox:{boxShadow:'none'}}}});mounted=true;}return;}
    if(mounted){window.Clerk.unmountSignIn($('sign-in'));mounted=false;}$('sign-in').hidden=true;$('gate-message').textContent='Opening your inbox…';
    try{await call('query','verify');if(generation!==epoch)return;$('gate').hidden=true;$('app').hidden=false;$('new').hidden=false;const placeholder=node('div',undefined,'detail-placeholder');placeholder.append(node('span','↗'),node('h2','One charge, one place.'),node('p','Select a question to see the full story, or flag a charge to get started.'));$('detail').replaceChildren(placeholder);await refresh();}catch(e){if(generation!==epoch)return;$('gate-message').textContent=/not authorized/.test(e.message)?'This account doesn’t have access to Payment questions. Use your approved email.':'Your inbox couldn’t load. Check your connection and try again.';$('retry-auth').hidden=false;}}
  $('sign-out').onclick=async()=>{++epoch;session=null;sessionId=undefined;clear();$('gate').hidden=false;$('gate-message').textContent='Signing out…';try{await window.Clerk.signOut();await sessionChanged({session:null});}catch{$('gate-message').textContent='Sign-out failed. Try again.';}};$('retry-auth').onclick=()=>location.reload();
  window.addEventListener('offline',()=>notice('You’re offline. Reconnect before saving; keep this page open to retain your draft.'));window.addEventListener('online',()=>{if(!busy)void refresh();});window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  async function start(){try{await new Promise((resolve,reject)=>{let ticks=0;const timer=setInterval(()=>{if(window.Clerk&&window.__internal_ClerkUICtor){clearInterval(timer);resolve();}else if(++ticks>200){clearInterval(timer);reject(Error('Sign-in timed out'));}},100);});await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});window.Clerk.addListener(sessionChanged);await sessionChanged({session:window.Clerk.session||null});}catch{clear();$('gate-message').textContent='Sign-in couldn’t load. Check your connection and try again.';$('retry-auth').hidden=false;}}
  void start();
})();
