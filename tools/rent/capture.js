/* Amount + proof in one place. Uploads and retries are saved before linking. */
window.RentCapture=function({sheet,workspace,call,fileRequest,refresh,canOpen,review}){
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;},button=(text,fn,cls='outline')=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
 let ledger={months:[],payments:[]},docs={files:[]},items=[],checks={},target=null,saving=false,generation=0,urls=[],flights=new Map(),amount,error,list,submit,check;
 const dialog=el('dialog',undefined,'capture-dialog');dialog.id='rent-capture';dialog.setAttribute('aria-label','Payment and screenshots');document.body.append(dialog);
 const remember=RentBackdrop(dialog,()=>close());dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 const key=(m,p)=>m+':'+p,active=(m,p)=>ledger.payments.filter(x=>x.month===m&&x.payer===p&&!x.voidedAt);
 function persist(){workspace.set('capture',{items,checks});sheet.update();}
 function revoke(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[];}
 function close(route=true){if(saving)return;dialog.close();dialog.replaceChildren();target=null;amount=error=list=submit=check=null;revoke();if(route&&RentRoute.read().view==='entry')RentRoute.close();}
 function name(m,p){return p===3?'Affil':ledger.months.find(x=>x.month===m)?.config.people[p]?.name||ledger.months.at(-1)?.config.people[p]?.name||'Resident';}
 function label(m){return new Date(m+'-15T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'});}
 function cells(m,p){return items.filter(x=>x.month===m&&x.payer===p&&!x.linked);}
 function renderFiles(){if(!target||!list)return;revoke();list.replaceChildren();const g=generation;for(const item of cells(target.month,target.payer)){
  const card=el('div',undefined,'capture-file'),image=el('img');image.alt=item.name;
  if(item.blob&&item.type.startsWith('image/')){const url=URL.createObjectURL(item.blob);urls.push(url);image.src=url;card.append(image);}else if(item.fileId&&item.type.startsWith('image/')){card.append(image);void fileRequest('GET',{id:item.fileId}).then(blob=>{if(g!==generation||!card.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);image.src=url;}).catch(()=>{});}
  const info=el('div');info.append(el('strong',item.name),el('span',item.fileId?'Ready to save':flights.has(item.id)?'Uploading…':item.error||'Waiting to upload','capture-file-status'));card.append(info);
  card.append(button('Remove',()=>{if(saving||flights.has(item.id))return;items=items.filter(x=>x!==item);persist();renderFiles();},'quiet'));list.append(card);
 }
 const attached=docs.files.filter(f=>active(target.month,target.payer).some(p=>f.paymentIds.includes(p._id)));if(active(target.month,target.payer).length)list.append(button(attached.length?`View ${attached.length} saved attachment${attached.length===1?'':'s'} and checks`:'View receipts and checks',()=>{const t=target;close(false);review(t.month,t.payer);},'capture-review'));
 }
 async function upload(item){if(item.fileId)return;if(flights.has(item.id))return flights.get(item.id);if(!item.blob)throw Error('This screenshot is still on the device where it was added. Open that device to finish uploading.');
 const g=generation,job=(async()=>{try{const result=await fileRequest('POST',{},new File([item.blob],item.name,{type:item.type}),item.id);if(g!==generation)return;item.fileId=result.id;delete item.error;persist();await workspace.flush();}catch(e){if(g===generation){item.error='Upload failed — kept for retry';persist();}throw e;}finally{flights.delete(item.id);if(g===generation)renderFiles();}})();flights.set(item.id,job);return job;}
 async function add(files,m,p){if(saving||!canOpen())return;const accepted=[...files].filter(f=>['image/png','image/jpeg','image/webp','application/pdf'].includes(f.type));if(!accepted.length)return;
 for(const f of accepted){if(f.size>15*1024*1024){if(error)error.textContent='Each file must be under 15 MB.';continue;}items.push({id:crypto.randomUUID(),month:m,payer:p,name:f.name||'Pasted screenshot.png',type:f.type,blob:f,...(target?.month===m&&target?.payer===p&&target.paymentId?{paymentId:target.paymentId}:{})});}
 persist();open(m,p);await workspace.flush().catch(()=>{});for(const item of cells(m,p))if(!item.fileId)void upload(item).catch(()=>{});renderFiles();
 }
 function open(m,p,fromRoute=false){if(!canOpen()||saving||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m)||!Number.isInteger(p)||p<0||p>3)return;
 if(target?.month===m&&target?.payer===p&&dialog.open)return;
 target={month:m,payer:p};revoke();dialog.replaceChildren();remember();
 const heading=el('div',undefined,'dialog-heading');heading.append(el('h2',`${name(m,p)} · ${label(m)}`),button('Close',()=>close(),'quiet'));
 const description=el('p','Enter the total received. Paste or drop screenshots here, then save once.','muted');
 const lab=el('label','Total received ($)');amount=el('input');amount.id='capture-amount';amount.inputMode='decimal';amount.autocomplete='off';amount.value=sheet.cellValue(m,p);lab.htmlFor=amount.id;amount.oninput=()=>{sheet.editCell(m,p,amount.value);};
 const drop=el('div',undefined,'capture-drop');drop.tabIndex=0;drop.setAttribute('aria-label','Paste or drop payment screenshots');const file=el('input');file.type='file';file.multiple=true;file.accept='image/png,image/jpeg,image/webp,application/pdf';file.hidden=true;file.onchange=()=>void add(file.files,m,p);
 drop.append(el('strong','Drop screenshots here'),el('span','or paste with ⌘V / Ctrl+V'),button('Choose files',()=>file.click()),file);list=el('div',undefined,'capture-files');
 const choice=el('div',undefined,'capture-receipt-choice');const receipts=active(m,p);if(receipts.length>1){choice.append(el('p','This month has multiple receipts. Select which receipt the screenshot proves; changing the total replaces the old receipts.','small'));for(const r of receipts){const b=button(`$${(r.amountCents/100).toFixed(2)} · ${r.date}`,()=>{target.paymentId=r._id;choice.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));for(const item of cells(m,p))item.paymentId=r._id;persist();});b.setAttribute('aria-pressed','false');choice.append(b);}}
 const checkLabel=el('label',undefined,'check capture-check');check=el('input');check.type='checkbox';check.checked=checks[key(m,p)]??(receipts.length>0&&receipts.every(r=>r.checked));check.onchange=()=>{checks[key(m,p)]=check.checked;persist();};checkLabel.append(check,el('span','Payment checked'));
 error=el('p','','form-error');error.setAttribute('role','alert');submit=button('Save changes',()=>void save(),'primary');const foot=el('div',undefined,'capture-footer');foot.append(el('span','Saves all pending ledger changes and attachments.','small muted'),submit);
 dialog.append(heading,description,lab,amount,drop,choice,list,checkLabel,error,foot);dialog.onpaste=e=>{if(e.clipboardData.files.length){e.preventDefault();void add(e.clipboardData.files,m,p);}};
 dialog.ondragover=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();drop.classList.add('is-over');}};dialog.ondragleave=()=>drop.classList.remove('is-over');dialog.ondrop=e=>{e.preventDefault();drop.classList.remove('is-over');void add(e.dataTransfer.files,m,p);};renderFiles();dialog.showModal();
 if(!fromRoute)RentRoute.go({view:'entry',month:m,payer:p,year:m.slice(0,4),id:null},false,true);
 }
 async function save(){if(saving||!canOpen())return false;const g=generation;saving=true;sheet.setLocked(true);dialog.querySelectorAll('input,button').forEach(n=>n.disabled=true);if(error)error.textContent='';if(submit)submit.disabled=true;
 try{
  for(const [slot,checked] of Object.entries(checks)){const [m,p]=slot.split(':');if(checked&&!(Number(sheet.cellValue(m,Number(p)).replace(/[$,]/g,''))>0))throw Error('Enter an amount before checking this payment.');}
  for(const item of items.filter(x=>!x.linked)){const value=Number(sheet.cellValue(item.month,item.payer).replace(/[$,]/g,''));if(!(value>0))throw Error('Enter an amount received before saving its screenshot.');const receipts=active(item.month,item.payer),total=receipts.reduce((s,p)=>s+p.amountCents,0);if(receipts.length>1&&Math.round(value*100)===total&&!item.paymentId)throw Error('Choose which individual receipt this screenshot proves.');await upload(item);}
  await workspace.flush();sheet.setLocked(false);if(!await sheet.commitRaw())throw Error('The ledger could not save. Your exact changes and screenshots are preserved; retry safely with Save changes.');if(g!==generation)return false;
  sheet.setLocked(true);ledger=await call('query','ledger');
  for(const item of items.filter(x=>!x.linked)){const receipts=active(item.month,item.payer);let p=receipts.find(p=>p._id===item.paymentId);if(!p&&receipts.length===1)p=receipts[0];if(!p)throw Error('The payment changed. Reopen this cell and choose its receipt before retrying.');item.paymentId=p._id;persist();await workspace.flush();await call('mutation','rentRecords:linkFile',{id:item.fileId,paymentId:p._id});if(g!==generation)return false;item.linked=true;persist();}
  for(const [slot,checked] of Object.entries(checks)){const [m,payer]=slot.split(':');const receipts=active(m,Number(payer));if(!receipts.length)continue;for(const p of receipts)await call('mutation','rentRecords:setConfirmation',{id:p._id,checked});}
  items=[];checks={};persist();await workspace.flush();saving=false;sheet.setLocked(false);close();await refresh();return true;
 }catch(e){if(g===generation){if(error)error.textContent=e.message;else sheet.showError(e.message);return false;}}
 finally{if(g===generation){saving=false;sheet.setLocked(false);if(submit)submit.disabled=false;dialog.querySelectorAll('input,button').forEach(n=>n.disabled=false);}}
 }
 return {open,add,save,close,load(l,d){ledger=l;docs=d;},restore(){const s=workspace.get('capture');items=s?.items||[];checks=s?.checks||{};},count:()=>items.filter(x=>!x.linked).length+Object.keys(checks).length,pending:()=>saving,clear(){generation++;saving=false;close(false);items=[];checks={};flights=new Map();ledger={months:[],payments:[]};docs={files:[]};},isOpen:()=>dialog.open};
};
