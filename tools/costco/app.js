(() => {
  'use strict';
  const endpoint='https://rapid-shark-565.convex.cloud', filesEndpoint='https://rapid-shark-565.convex.site/costco-receipt';
  const $=id=>document.getElementById(id), M=window.CostcoModel;
  let session=null, sessionId, epoch=0, mounted=false, rows=[], visible=[], view='orders', page=0, loaded=false, detail=null, detailEpoch=0, importOrders=null;
  const urls=new Set();
  const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const filters=()=>({search:$('search').value,channel:$('channel').value,from:$('from').value,to:$('to').value});
  const error=message=>{ $('error').textContent=message; $('error').hidden=!message; };
  function revoke(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
  function closeDetail(){++detailEpoch;detail=null;$('image-dialog').close();$('full-image').removeAttribute('src');$('download-image').removeAttribute('href');$('detail').close();$('detail-body').replaceChildren();revoke();}
  function clearPrivate(){rows=[];visible=[];loaded=false;closeDetail();$('import-dialog').close();importOrders=null;$('import-file').value='';$('import-status').textContent='';$('import-confirm').disabled=true;$('app').hidden=true;$('results').replaceChildren();$('order-count').textContent='0';for(const id of ['purchase-total','refund-total','net-total'])$(id).textContent='$0.00';$('coverage').textContent='';$('results-status').textContent='';$('page-label').textContent='';$('image-name').textContent='Receipt';$('search').value='';$('from').value='';$('to').value='';$('channel').value='';picker?.sync();error('');}
  async function tokenFor(active){
    const token=await active.getToken();
    try{const p=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(p.aud==='convex'||p.aud?.includes?.('convex'))return token;}catch{}
    try{return await active.getToken({template:'convex'});}catch{return token;}
  }
  async function call(kind,name,args={}){
    const active=session, generation=epoch;
    if(!active)throw Error('Sign in to continue.');
    const token=await tokenFor(active);
    if(!token||generation!==epoch)throw Error('Your session changed.');
    const response=await fetch(endpoint+'/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({path:'costco:'+name,args}),signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if(generation!==epoch)throw Error('Your session changed.');
    if(!response.ok||result.status!=='success')throw Error(result.errorMessage||'Could not reach your archive.');
    return result.value;
  }
  function render(){
    visible=M.filter(rows,filters());const purchase=visible.filter(r=>r.order.kind==='purchase').reduce((n,r)=>n+r.order.totalCents,0),refund=visible.filter(r=>r.order.kind==='refund').reduce((n,r)=>n+r.order.totalCents,0);
    $('order-count').textContent=visible.length.toLocaleString();$('purchase-total').textContent=M.money(purchase);$('refund-total').textContent=M.money(refund);$('net-total').textContent=M.money(purchase+refund);
    $('view-orders').setAttribute('aria-pressed',String(view==='orders'));$('view-items').setAttribute('aria-pressed',String(view==='items'));
    const list=view==='orders'?visible:M.items(visible,$('search').value),pages=Math.ceil(list.length/40);page=Math.max(0,Math.min(page,pages-1));
    $('results-status').textContent=`${list.length.toLocaleString()} ${view==='orders'?'orders & receipts':'item lines'}${visible.length!==rows.length?' matching your filters':''}${loaded?'':' · loading history…'}`;
    $('export').disabled=!loaded||!visible.length;$('previous').hidden=page===0;$('next').hidden=page>=pages-1;$('page-label').textContent=pages>1?`Page ${page+1} of ${pages}`:'';
    if(!list.length){$('results').innerHTML=`<div class="empty"><div class="empty-icon" aria-hidden="true">▤</div><h3>${rows.length?'No matches here.':loaded?'Your archive starts here.':'Opening your archive…'}</h3><p>${rows.length?'Try another item name or order ID, or reset your filters.':loaded?'Once your Costco history is imported, every order, item, and receipt will be easy to find here.':'Your saved orders are loading securely.'}</p></div>`;return;}
    let html='<div class="table-wrap"><table><thead><tr>'+(view==='orders'?'<th>Order / receipt</th><th>Date</th><th class="hide-mobile">Channel</th><th class="amount">Total paid</th>':'<th>Item</th><th>Date / order</th><th class="hide-mobile">Qty</th><th class="amount">Item total</th>')+'<th><span class="sr-only">Details</span></th></tr></thead><tbody>';
    for(const entry of list.slice(page*40,page*40+40)){
      const row=view==='orders'?entry:entry.row,o=row.order;
      const open=`data-order="${esc(row._id)}"`;
      if(view==='orders')html+=`<tr><td><button class="order-link" ${open}>${esc(o.orderId)}</button><small>${o.kind==='refund'?'Refund · ':''}${esc(o.items.slice(0,2).map(i=>i.name).join(', ')||o.location||'Item details not imported')}${o.items.length>2?' +'+(o.items.length-2):''}</small></td><td>${M.date(o.date)}<small>${esc(o.recipient||o.location||'')}</small></td><td class="hide-mobile"><span class="tag ${esc(o.channel)}">${M.channel(o.channel)}</span></td><td class="amount ${o.kind==='refund'?'refund':''}">${M.money(o.totalCents)}</td><td><button ${open} aria-label="Open order ${esc(o.orderId)}" class="order-link arrow">↗</button></td></tr>`;
      else html+=`<tr><td><button class="order-link" ${open}>${esc(entry.item.name)}</button><small>${esc(entry.item.itemNumber?'Item #'+entry.item.itemNumber:'Item number unavailable')}</small></td><td>${M.date(o.date)}<small>${esc(o.orderId)}${o.kind==='refund'?' · Refund':''}</small></td><td class="hide-mobile">${entry.item.quantity??'—'}</td><td class="amount">${M.money(entry.item.totalCents)}</td><td><button ${open} aria-label="Open order ${esc(o.orderId)}" class="order-link arrow">↗</button></td></tr>`;
    }
    $('results').innerHTML=html+'</tbody></table></div>';
  }
  async function load(){
    const generation=epoch;loaded=false;rows=[];error('');$('refresh').disabled=true;render();
    try{let cursor=null;do{const result=await call('query','list',{paginationOpts:{numItems:100,cursor}});if(generation!==epoch)return;rows.push(...result.page);cursor=result.isDone?null:result.continueCursor;render();}while(cursor);
      if(generation!==epoch)return;loaded=true;const dates=rows.map(r=>r.order.date).sort();
      $('coverage').textContent=rows.length?`${rows.length} imported records · ${M.date(dates[0])}–${M.date(dates.at(-1))}. Imported records only; completeness has not been verified.`:'No history imported yet. Connect your Costco history to start your archive.';render();
    }catch(e){if(generation===epoch){error('History could not finish loading. Refresh to try again.');$('coverage').textContent='History is incomplete because loading failed.';}}
    finally{if(generation===epoch)$('refresh').disabled=false;}
  }
  async function fileRequest(query, options={}){
    const generation=epoch,active=session;if(!active)throw Error('Sign in again.');
    const token=await tokenFor(active);if(generation!==epoch)throw Error('Session changed.');
    const res=await fetch(filesEndpoint+'?'+new URLSearchParams(query),{...options,headers:{...options.headers,Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000),cache:'no-store'});
    if(!res.ok)throw Error(await res.text());if(generation!==epoch)throw Error('Session changed.');return res;
  }
  async function openOrder(id){
    closeDetail();const generation=epoch,selection=detailEpoch;$('detail-body').innerHTML='<p role="status">Loading order…</p>';$('detail').showModal();
    try{const row=await call('query','detail',{id});if(generation!==epoch||selection!==detailEpoch)return;detail=row;drawDetail(row);await loadReceipts(row,selection,generation);}
    catch(e){if(generation===epoch&&selection===detailEpoch)$('detail-body').innerHTML='<p class="error">This order could not load. Close it and try again.</p>';}
  }
  function drawDetail(row){
    const o=row.order;
    $('detail-body').innerHTML=`<div class="detail-heading"><div><h2 id="detail-title">${esc(o.orderId)}</h2><p class="muted">${M.date(o.date)} · ${o.kind==='refund'?'Refund':'Purchase'}</p></div><strong class="total">${M.money(o.totalCents)}</strong></div><div class="detail-meta"><span class="tag ${esc(o.channel)}">${M.channel(o.channel)}</span>${o.location?'<span>'+esc(o.location)+'</span>':''}${o.recipient?'<span>Recipient: '+esc(o.recipient)+'</span>':''}${o.status?'<span>'+esc(o.status)+'</span>':''}</div><div class="detail-section"><h3>Item breakdown</h3>${o.items.length?'<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th class="amount">Unit price</th><th class="amount">Line total</th></tr></thead><tbody>'+o.items.map(i=>`<tr><td>${esc(i.name)}<small>${esc(i.itemNumber?'#'+i.itemNumber:'')}</small></td><td>${i.quantity??'—'}</td><td class="amount">${M.money(i.unitCents)}</td><td class="amount">${M.money(i.totalCents)}</td></tr>`).join('')+'</tbody></table></div>':'<p class="muted">Item details have not been imported for this record.</p>'}<div class="totals">${[['Subtotal',o.subtotalCents],['Tax',o.taxCents],['Shipping / delivery',o.shippingCents],['Discounts',o.discountCents],['Total paid',o.totalCents]].filter(([,v])=>v!==undefined).map(([k,v])=>`<div><span>${k}</span><span>${M.money(v)}</span></div>`).join('')}</div><p class="muted">Amounts are recorded as shown by the source. A dash means the detail was unavailable.</p></div><section class="detail-section"><h3>Receipt images <span class="muted">· ${row.files.length}</span></h3><p class="muted">Click an image to see the full receipt.</p><div id="receipts" class="receipts"></div><label class="file-label">Attach receipt screenshots<input id="receipt-upload" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><button id="upload-receipts" type="button">Upload selected images</button><p id="receipt-status" class="muted" role="status">${row.files.length?'Loading private images…':'No receipt images saved yet.'}</p></section><section class="detail-section"><h3><label for="order-note">Your notes</label></h3><textarea id="order-note" class="note" maxlength="10000" placeholder="Who was this for? Return details? Anything to remember…">${esc(row.note)}</textarea><div class="note-actions"><button id="save-note" class="primary">Save note</button><span id="note-status" role="status"></span></div></section>${o.sourceText?'<details class="detail-section"><summary>Original receipt text</summary><pre class="source-text">'+esc(o.sourceText)+'</pre></details>':''}<p class="muted">Imported ${new Date(row.importedAt).toLocaleDateString('en-US')}</p>`;
    $('save-note').onclick=saveNote;$('upload-receipts').onclick=uploadReceipts;
  }
  async function loadReceipts(row, selection, generation){
    let failed=0;
    for(const file of row.files){try{const response=await fileRequest({id:file._id});const blob=await response.blob();if(selection!==detailEpoch||generation!==epoch)return;const url=URL.createObjectURL(blob);urls.add(url);const button=document.createElement('button');button.className='receipt-card';const img=document.createElement('img');img.src=url;img.alt=file.name;const label=document.createElement('span');label.textContent=file.name;button.append(img,label);button.onclick=()=>{$('full-image').src=url;$('image-name').textContent=file.name;$('download-image').href=url;$('download-image').download=file.name;$('image-dialog').showModal();};$('receipts').append(button);}catch{failed++;}}
    if(selection===detailEpoch&&generation===epoch)$('receipt-status').textContent=failed?`${failed} image(s) could not load. Reopen this order to retry.`:row.files.length?'Original images · private to your account':'No receipt images saved yet.';
  }
  async function saveNote(){
    const active=detail,selection=detailEpoch,generation=epoch,button=$('save-note'),note=$('order-note').value;button.disabled=true;$('note-status').textContent='Saving…';
    try{const result=await call('mutation','saveNote',{id:active._id,note,version:active.version});if(selection!==detailEpoch||generation!==epoch)return;detail.note=note;detail.version=result.version;const row=rows.find(r=>r._id===active._id);if(row){row.note=note;row.version=result.version;}render();$('note-status').textContent='Saved.';}
    catch(e){if(selection===detailEpoch&&generation===epoch)$('note-status').textContent=/changed on another device/.test(e.message)?'Changed on another device. Copy your note, reopen, and try again.':'Could not save. Your note is still here; try again.';}
    finally{if(selection===detailEpoch&&generation===epoch)button.disabled=false;}
  }
  async function uploadReceipts(){
    const active=detail,selection=detailEpoch,generation=epoch,files=[...$('receipt-upload').files],button=$('upload-receipts');if(!files.length){$('receipt-status').textContent='Choose one or more receipt images first.';return;}button.disabled=true;
    try{for(let i=0;i<files.length;i++){const file=files[i];if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Choose PNG, JPEG, or WebP images under 12 MB.');if(selection!==detailEpoch||generation!==epoch)return;$('receipt-status').textContent=`Uploading image ${i+1} of ${files.length}…`;await fileRequest({order:active._id},{method:'POST',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},body:file});}
      if(selection!==detailEpoch||generation!==epoch)return;const note=$('order-note').value;await openOrder(active._id);if(detail?._id===active._id)$('order-note').value=note;
    }catch(e){if(selection===detailEpoch&&generation===epoch){$('receipt-status').textContent='Upload failed. Your selected images are kept for retry. '+e.message;button.disabled=false;}}
  }
  async function sessionChanged(state){
    if(state.session===undefined)return;const id=state.session?.id||null;if(id===sessionId)return;sessionId=id;session=state.session||null;const generation=++epoch;clearPrivate();$('gate').hidden=false;$('sign-out').hidden=!session;$('retry-auth').hidden=true;
    if(!session){$('gate-message').textContent='Sign in with your authorized John Ta account to view your Costco history.';$('sign-in').hidden=false;if(!mounted){window.Clerk.mountSignIn($('sign-in'),{routing:'hash',withSignUp:false,forceRedirectUrl:location.origin+location.pathname});mounted=true;}return;}
    if(mounted){window.Clerk.unmountSignIn($('sign-in'));mounted=false;}$('sign-in').hidden=true;$('gate-message').textContent='Checking private access…';
    try{await call('query','verify');if(generation!==epoch)return;$('gate').hidden=true;$('app').hidden=false;await load();}
    catch(e){if(generation!==epoch)return;$('gate-message').textContent=/not authorized/.test(e.message)?'This account does not have access to the Costco archive.':'Your archive could not load. Try again.';$('retry-auth').hidden=false;}
  }
  const picker=window.SearchableSelect?.enhance($('channel'));
  for(const id of ['search','channel','from','to'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;render();});
  $('clear').onclick=()=>{for(const id of ['search','channel','from','to'])$(id).value='';picker?.sync();page=0;render();};
  for(const name of ['orders','items'])$('view-'+name).onclick=()=>{view=name;page=0;render();};
  $('previous').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('refresh').onclick=()=>{if(session)void load();};
  $('results').onclick=e=>{const button=e.target.closest('[data-order]');if(button)void openOrder(button.dataset.order);};
  $('close-detail').onclick=closeDetail;$('detail').addEventListener('cancel',e=>{e.preventDefault();closeDetail();});$('close-image').onclick=()=>$('image-dialog').close();
  $('export').onclick=()=>{if(!loaded||!session)return;const url=URL.createObjectURL(new Blob([M.csv(visible)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='costco-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('import-open').onclick=()=>$('import-dialog').showModal();$('close-import').onclick=()=>$('import-dialog').close();
  $('import-file').onchange=async()=>{const generation=epoch;importOrders=null;$('import-confirm').disabled=true;try{const file=$('import-file').files[0];if(!file)return;if(file.size>5*1024*1024)throw Error('Choose a history file under 5 MB.');const data=JSON.parse(await file.text());if(generation!==epoch)return;const orders=Array.isArray(data)?data:data.orders;if(!Array.isArray(orders)||!orders.length||orders.length>2000)throw Error('The file must contain 1–2,000 orders.');importOrders=orders;$('import-status').textContent=`${orders.length} records ready. Existing IDs will be skipped.`;$('import-confirm').disabled=false;}catch(e){if(generation===epoch)$('import-status').textContent=e.message;}};
  $('import-confirm').onclick=async()=>{if(!importOrders||!session)return;const generation=epoch,input=importOrders;let imported=0,skipped=0;$('import-confirm').disabled=true;$('import-file').disabled=true;try{for(let i=0;i<input.length;i+=50){const r=await call('mutation','importOrders',{orders:input.slice(i,i+50)});if(generation!==epoch)return;imported+=r.imported;skipped+=r.skipped;$('import-status').textContent=`${imported} imported · ${skipped} existing records skipped…`;}$('import-status').textContent=`Done. ${imported} imported; ${skipped} existing records kept.`;importOrders=null;$('import-file').value='';await load();}catch(e){if(generation===epoch){$('import-status').textContent=`Import stopped after ${imported} new records. ${e.message} Fix the file and retry; existing records will be skipped.`;$('import-confirm').disabled=false;}}finally{$('import-file').disabled=false;}};
  $('retry-auth').onclick=()=>{sessionId=undefined;if(window.Clerk)void sessionChanged({session:window.Clerk.session||null});else location.reload();};
  $('sign-out').onclick=async()=>{++epoch;session=null;sessionId=undefined;clearPrivate();$('gate').hidden=false;$('gate-message').textContent='Signing out…';try{await window.Clerk.signOut();await sessionChanged({session:null});}catch{$('gate-message').textContent='Sign-out could not complete. Try again.';}};
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!$('app').hidden&&!document.querySelector('dialog[open]')){e.preventDefault();$('search').focus();}});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  async function start(){try{await new Promise((resolve,reject)=>{const scripts=[...document.querySelectorAll('[data-clerk-script]')];const timer=setTimeout(()=>reject(Error('Sign-in timed out.')),20000);function check(){if(window.Clerk&&window.__internal_ClerkUICtor){clearTimeout(timer);resolve();}}scripts.forEach(s=>{s.addEventListener('load',check);s.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Sign-in unavailable.'));});});check();});await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});window.Clerk.addListener(state=>void sessionChanged(state));await sessionChanged({session:window.Clerk.session||null});}catch{$('gate-message').textContent='Sign-in could not load. Open this page on john-ta.com and try again.';$('retry-auth').hidden=false;}}
  void start();
})();
