(() => {
  'use strict';
  const $ = id => document.getElementById(id), API = 'https://rapid-shark-565.convex.cloud';
  let session, sessionId, epoch = 0, loadId = 0, records = [], filter = 'active', selected = new URL(location.href).searchParams.get('pdp'), editing = null, initialForm = '', saving = false, mounted = false;
  let device = new URL(location.href).searchParams.get('device') === 'mobile' ? 'mobile' : 'desktop', draftFileKey = '', previewEpoch = 0;
  let editorRequest=0,drafts=[],draftVersion=0,draftSaved='',draftTimer,draftPromise=Promise.resolve(),lastRoute=location.href;
  const objectUrls = new Set();
  const fileCache=new Map(),fileCacheLimit=32*1024*1024;
  function clearFileCache(){for(const entry of fileCache.values())entry.controller.abort();fileCache.clear();}
  // Only production images persist locally; source PDFs and editable records do not.
  // Metadata is reauthorized by capture() before a cached immutable file key is used.
  const captureCacheLimit=128*1024*1024,captureCacheAge=7*24*60*60*1000;
  function storedCapture(action,key='',blob=null,scope=sessionId,current=epoch){
    return new Promise(resolve=>{
      let db,tx,done=false,result=null;
      const finish=value=>{if(done)return;done=true;clearTimeout(timer);db?.close();resolve(value);};
      const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(null);},1500);
      try{
        const request=indexedDB.open('pdp-production-cache',1);
        request.onupgradeneeded=()=>{request.result.createObjectStore('images');request.result.createObjectStore('metadata',{keyPath:'id'});};
        request.onerror=()=>finish(null);
        request.onsuccess=()=>{
          db=request.result;if(done){db.close();return;}
          if(current!==epoch){finish(null);return;}
          tx=db.transaction(['images','metadata'],'readwrite');
          tx.oncomplete=()=>finish(current===epoch?result:null);tx.onabort=tx.onerror=()=>finish(null);
          const images=tx.objectStore('images'),metadata=tx.objectStore('metadata'),all=metadata.getAll();
          all.onsuccess=()=>{
            if(current!==epoch){tx.abort();return;}
            const now=Date.now(),id=scope+':'+key,valid=[];
            for(const item of all.result){
              if(!scope||item.scope!==scope||item.expires<=now){images.delete(item.id);metadata.delete(item.id);}
              else valid.push(item);
            }
            if(!scope)return;
            if(action==='read'){
              const item=valid.find(item=>item.id===id);
              if(item){item.usedAt=now;metadata.put(item);const read=images.get(id);read.onsuccess=()=>{result=read.result||null;};}
            }
            if(action==='write'&&blob&&blob.size<=captureCacheLimit){
              let bytes=blob.size;
              for(const item of valid.filter(item=>item.id!==id).sort((a,b)=>b.usedAt-a.usedAt)){
                bytes+=item.size;if(bytes>captureCacheLimit){images.delete(item.id);metadata.delete(item.id);}
              }
              images.put(blob,id);metadata.put({id,scope,size:blob.size,expires:now+captureCacheAge,usedAt:now});
            }
          };
        };
      }catch{finish(null);}
    });
  }
  const referenceFields = ['mockupUrl','emailUrl','approvalDate','approvalVersion','pdfPage'];
  const referenceFor = (v,mode=device) => v.references?.[mode] || (mode==='desktop' ? Object.fromEntries(referenceFields.map(f=>[f,v[f]||''])) : Object.fromEntries(referenceFields.map(f=>[f,''])));
  const fields = ['name','issuer','publisher','liveUrl','mockupUrl','emailUrl','approvalDate','approvalVersion','pdfPage','notes'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
  const referenceLinked = ref => !!((ref.mockupUrl || ref.fileKey) && ref.emailUrl);
  const linked = v => ['desktop','mobile'].every(mode=>referenceLinked(referenceFor(v,mode)));
  const isBofa = v => /bank\s*of\s*america|\bbofa\b/i.test(v);
  const date = value => value ? new Date(value).toLocaleString() : '—';
  const link = (url, label, cls = 'action') => safeUrl(url) ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
  function pdfUrl(v) { const url = safeUrl(v.mockupUrl); if (!url || !v.pdfPage || !/\.pdf$/i.test(new URL(url).pathname)) return url; const u = new URL(url); u.hash = 'page=' + v.pdfPage; return u.href; }
  function download(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'})); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
  const inlineFields={name:['Product name','text',200],issuer:['Issuer','text',200],publisher:['Publisher / site','text',200],liveUrl:['Production page','url',4000],notes:['Notes','textarea',10000],exactMatch:['1:1 match required','boolean'],archived:['Record status','boolean'],mockupUrl:['Mockup source link','url',4000],emailUrl:['Approval email','url',4000],approvalDate:['Approval date','date'],approvalVersion:['Approved version','text',200],pdfPage:['PDF starting page','text',4],referenceNotes:['Reference notes','textarea',10000],fileKey:['Saved PDF','file']};
  let inline=null,inlineTimer,inlineQueue=Promise.resolve(),fieldDrafts=[],replayingNavigation=false;
  function inlineValue(value,field,mode=device){const ref=referenceFor(value,mode);return field==='referenceNotes'?ref.notes||'':field==='fileKey'?ref.fileKey||'':referenceFields.includes(field)?ref[field]||'':value[field]??'';}
  function editable(field,value,display=''){
    const label=inlineFields[field][0],present=value!==''&&value!==undefined;
    return `<div class="inline-field" data-field="${field}"><div class="inline-label"><span>${esc(label)}</span><button type="button" class="field-edit" data-inline="${field}" aria-label="${present?'Edit':'Add'} ${esc(label.toLowerCase())}">${present?'Edit':'＋ Add'}</button></div><div class="inline-display">${display||esc(value)||'<span class="field-missing">Not added</span>'}</div><div class="inline-host"></div></div>`;
  }
  function evidenceLabel(value){const refs=['desktop','mobile'].map(mode=>referenceFor(value,mode)),mockup=refs.some(ref=>!ref.mockupUrl&&!ref.fileKey),email=refs.some(ref=>!ref.emailUrl);return mockup&&email?'Mockup and approval email missing':mockup?'Mockup missing':email?'Approval email missing':'Evidence linked';}
  function inlineStatus(text){if(inline?.host?.isConnected)inline.host.querySelector('[data-field-status]').textContent=text;}
  function persistInline(){
    clearTimeout(inlineTimer);const state=inline;if(!state)return Promise.resolve();
    if(state.loading)return state.ready.then(()=>persistInline());
    if(state.loadError)return Promise.reject(Error('Saved edit could not be loaded. Retry before continuing.'));
    const value=state.value,current=epoch;
    inlineQueue=inlineQueue.catch(()=>{}).then(async()=>{
      if(inline!==state||current!==epoch||JSON.stringify(value)===state.saved)return;
      inlineStatus('Saving unfinished edit…');
      try{const saved=await api('saveFieldDraft',{key:state.key,device:state.device,field:state.field,value,baseVersion:state.baseVersion,expectedVersion:state.draftVersion},true);if(inline!==state||current!==epoch)return;state.draftVersion=saved.version;state.saved=JSON.stringify(value);fieldDrafts=fieldDrafts.filter(d=>!(d.key===state.key&&d.device===state.device&&d.field===state.field)).concat({key:state.key,device:state.device,field:state.field});inlineStatus('Unfinished edit saved privately.');}
      catch(error){if(inline===state)inlineStatus(error.message+' Your edit is still here. Download it to keep a copy.');throw error;}
    });return inlineQueue;
  }
  async function closeInline(updateRoute=true){if(!inline)return;await persistInline();const state=inline;inline=null;clearTimeout(inlineTimer);state.host.replaceChildren();state.host.parentElement.classList.remove('is-editing');if(updateRoute){route({field:null});state.host.parentElement.querySelector('[data-inline]')?.focus({preventScroll:true});}renderList();}
  async function openInline(field,restoring=false){
    if(saving||!inlineFields[field])return;if(inline){if(inline.field===field)return;try{await closeInline(false);}catch{return;}}
    const record=records.find(r=>r.key===selected),host=$('detail').querySelector(`[data-field="${field}"] .inline-host`);if(!record||!host)return;
    const state=inline={key:record.key,device,field,baseVersion:record.version,value:inlineValue(record.value,field),draftVersion:0,saved:'',host,loading:true,loadError:false};
    if(!restoring)route({field,edit:null});
    const [label,type,max]=inlineFields[field];host.parentElement.classList.add('is-editing');host.innerHTML=`<form class="field-form"><label>${esc(label)}${type==='textarea'?'<textarea data-value rows="3"></textarea>':type==='boolean'?`<select data-value><option value="false">${field==='archived'?'Active':'No'}</option><option value="true">${field==='archived'?'Archived':'Yes'}</option></select>`:type==='file'?'<input data-file type="file" accept="application/pdf,.pdf"><p data-file-name></p><button type="button" data-remove>Remove PDF attachment</button>':`<input data-value type="${type}" ${max?'maxlength="'+max+'"':''} ${type==='url'?'placeholder="https://…"':''}>`}</label>${field==='exactMatch'&&isBofa(record.value.issuer)?'<p>Bank of America always requires a 1:1 match.</p>':''}<p data-field-status role="status">Loading saved edit…</p><div class="field-actions"><button type="submit" class="primary" data-save>Save</button><button type="button" data-close>Close</button><button type="button" data-download>Download edit</button></div></form>`;
    const form=host.querySelector('form'),input=host.querySelector('[data-value]');
    const lock=locked=>{form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=locked);if(!locked&&field==='exactMatch'&&isBofa(record.value.issuer))input.disabled=true;};
    const showValue=()=>{if(input)input.value=String(state.value);else host.querySelector('[data-file-name]').textContent=state.value?'A private PDF is attached. Choose a PDF to replace it.':'No saved PDF attached.';};showValue();lock(true);
    state.ready=(async()=>{try{const draft=await api('fieldDraft',{key:state.key,device:state.device,field});if(inline!==state)return;if(draft){state.value=draft.value;state.baseVersion=draft.baseVersion;state.draftVersion=draft.version;showValue();}state.saved=JSON.stringify(state.value);inlineStatus(draft?'Recovered unfinished edit.':'Only this field will change when you save.');}
    catch(error){if(inline===state){state.loadError=true;inlineStatus(error.message+' Close and reopen this field to retry.');}}
    finally{state.loading=false;if(inline===state){lock(false);if(state.loadError){host.querySelector('[data-save]').disabled=true;host.querySelector('[data-close]').onclick=()=>{inline=null;host.replaceChildren();host.parentElement.classList.remove('is-editing');route({field:null});};}else input?.focus();}}})();
    if(input)input.oninput=()=>{state.value=type==='boolean'?input.value==='true':input.value;inlineStatus('Unsaved edit…');clearTimeout(inlineTimer);inlineTimer=setTimeout(()=>void persistInline().catch(()=>{}),400);};
    host.querySelector('[data-close]').onclick=()=>void closeInline().catch(()=>{});
    host.querySelector('[data-download]').onclick=()=>download({record:state.key,device:state.device,field:state.field,value:state.value},'pdp-field-edit.json');
    form.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();void closeInline().catch(()=>{});}};
    form.onsubmit=async event=>{event.preventDefault();if(saving||state.loading||state.loadError)return;saving=true;lock(true);const current=epoch;
      try{await persistInline();const saved=await api('saveField',{key:state.key,device:state.device,field,value:state.value,expectedVersion:state.baseVersion,draftVersion:state.draftVersion},true);if(current!==epoch||inline!==state)return;records=records.filter(r=>r.key!==saved.key).concat(saved);fieldDrafts=fieldDrafts.filter(d=>!(d.key===state.key&&d.device===state.device&&d.field===field));inline=null;route({field:null});renderList();renderDetail();$('detail').querySelector(`[data-inline="${field}"]`)?.focus({preventScroll:true});$('message').textContent=label+' saved.';}
      catch(error){if(inline===state)inlineStatus(error.message+' Your edit is still here.');}finally{if(current===epoch){saving=false;if(inline===state)lock(false);}}
    };
    if(type==='file'){
      host.querySelector('[data-remove]').onclick=()=>{state.value='';showValue();void persistInline().catch(()=>{});};
      host.querySelector('[data-file]').onchange=async event=>{const file=event.target.files[0];if(!file)return;if(file.size>20*1024*1024){inlineStatus('Choose a PDF under 20 MB.');return;}saving=true;lock(true);inlineStatus('Uploading privately…');const current=epoch;
        try{const url=await api('uploadUrl',{},true);const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/pdf'},body:file,signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Upload failed. Try again.');const {storageId}=await response.json();if(current!==epoch)return;const uploaded=await api('registerFile',{key:crypto.randomUUID(),recordKey:state.key,device:state.device,storageId,name:file.name},'action');if(current!==epoch||inline!==state)return;state.value=uploaded.key;host.querySelector('[data-file-name]').textContent=uploaded.name;await persistInline();}
        catch(error){if(inline===state)inlineStatus(error.message);}finally{if(current===epoch){saving=false;if(inline===state)lock(false);}}
      };
    }
    await state.ready;
  }

  function formValue() {
    const value=Object.fromEntries(fields.map(f=>[f,$('form').elements[f].value.trim()]));
    const reference=Object.fromEntries(referenceFields.map(f=>[f,value[f]]));
    reference.notes=$('form').elements.referenceNotes.value.trim();
    if(draftFileKey)reference.fileKey=draftFileKey;
    const base=editing?.value||{};
    for(const field of referenceFields)value[field]=base[field]||'';
    return {...value,exactMatch:$('form').elements.exactMatch.checked,archived:$('form').elements.archived.checked,references:{...base.references,[device]:reference}};
  }
  function releasePreviews(){++previewEpoch;for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls.clear();}
  async function privatePdf(key,kind='pdf'){
    const current=epoch,s=session;if(!s)throw Error('Sign in to load this file.');
    const cacheKey=kind+':'+key,existing=fileCache.get(cacheKey);
    if(existing&&existing.expires>Date.now()){fileCache.delete(cacheKey);fileCache.set(cacheKey,existing);return existing.promise;}
    if(existing){existing.controller.abort();fileCache.delete(cacheKey);}
    const entry={controller:new AbortController(),bytes:0,expires:Date.now()+5*60*1000};
    entry.promise=(async()=>{try{
      let blob=kind==='capture'?await storedCapture('read',key,null,s.id,current):null;
      if(current!==epoch)throw Error('Your session changed.');
      if(!blob){
        const token=await tokenFor(s);if(current!==epoch)throw Error('Your session changed.');
        const response=await fetch('https://rapid-shark-565.convex.site/pdp-approval-file?key='+encodeURIComponent(key)+'&kind='+kind,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.any([entry.controller.signal,AbortSignal.timeout(30000)])});
        if(!response.ok)throw Error('Could not load the private file. Try again.');
        blob=await response.blob();if(current!==epoch)throw Error('Your session changed.');
        if(kind==='capture')await storedCapture('write',key,blob,s.id,current);
      }
      if(current!==epoch)throw Error('Your session changed.');
      entry.bytes=blob.size;
      let bytes=[...fileCache.values()].reduce((sum,item)=>sum+item.bytes,0);
      for(const [id,item]of fileCache){if(bytes<=fileCacheLimit)break;if(item.bytes){fileCache.delete(id);bytes-=item.bytes;}}
      return blob;
    }catch(error){if(fileCache.get(cacheKey)===entry)fileCache.delete(cacheKey);throw error;}})();
    fileCache.set(cacheKey,entry);return entry.promise;
  }
  async function downloadPdf(key,name){const current=epoch;try{const blob=await privatePdf(key);if(current!==epoch)return;const url=URL.createObjectURL(blob);objectUrls.add(url);const a=document.createElement('a');a.href=url;a.download=name.endsWith('.pdf')?name:name+'.pdf';a.click();}catch(error){if(current===epoch)$('message').textContent=error.message;}}

  function dirty() { return editing && JSON.stringify(formValue()) !== initialForm; }
  function lockForm(locked) { $('form').querySelectorAll('input,textarea,button').forEach(e=>e.disabled=locked); $('cancel-top').disabled=locked; if(!locked)syncStrict(); }
  function clearPrivate() {
    inline=null;clearTimeout(inlineTimer);inlineQueue=Promise.resolve();fieldDrafts=[];releasePreviews();clearFileCache();clearTimeout(draftTimer);drafts=[];draftVersion=0;draftSaved='';draftPromise=Promise.resolve();draftFileKey='';records=[]; editing=null; saving=false; lockForm(false); ++loadId;
    $('workspace').hidden=true; $('editor').hidden=true; $('add').hidden=true; $('detail').replaceChildren(); $('list').replaceChildren(); $('form').reset(); initialForm=''; $('search').value=''; $('message').textContent=''; $('save-message').textContent='';$('draft-status').textContent='';$('draft-list').replaceChildren();
    for (const id of ['total','paired','missing','strict']) $(id).textContent='0';
  }
  async function tokenFor(s) {
    const token = await s.getToken();
    try { const p=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); if(p.aud==='convex'||Array.isArray(p.aud)&&p.aud.includes('convex'))return token; }catch{}
    try { return await s.getToken({template:'convex'}); }catch{return token;}
  }
  async function api(name,args={}, mutation=false) {
    const current = epoch, s = session;
    if (!s) throw Error('Sign in to continue.');
    const token = await tokenFor(s);
    if (current !== epoch || !token) throw Error('Your session changed.');
    const response = await fetch(API+'/api/'+(mutation==='action'?'action':mutation?'mutation':'query'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({path:'pdpApprovals:'+name,args}),signal:AbortSignal.timeout(20000),cache:'no-store'});
    const result = await response.json();
    if (current !== epoch) throw Error('Your session changed.');
    if(!response.ok||result.status!=='success')throw Error(result.errorMessage?.replace(/^.*?Uncaught Error: /s,'').split('\n')[0]||'Could not save or load. Please try again.');
    return result.value;
  }
  function route(changes={},replace=false){
    const old=new URL(location.href),u=new URL(location.origin+location.pathname);
    const state={pdp:selected,device,filter:filter==='active'?null:filter,q:$('search').value.trim(),edit:old.searchParams.get('edit'),preview:old.searchParams.get('preview'),history:old.searchParams.get('history'),before:old.searchParams.get('before'),revision:old.searchParams.get('revision'),field:old.searchParams.get('field'),...changes};
    if(state.q && (/https?:|@|[?=]/i.test(state.q)||state.q.length>100))state.q=null;
    for(const [key,value]of Object.entries(state))if(value)u.searchParams.set(key,value);
    if(u.href!==location.href)history[replace?'replaceState':'pushState']({},'',u);
    lastRoute=u.href;
  }
  function readRoute(){const u=new URL(location.href);device=u.searchParams.get('device')==='mobile'?'mobile':'desktop';filter=['active','missing','strict','archived'].includes(u.searchParams.get('filter'))?u.searchParams.get('filter'):'active';selected=u.searchParams.get('pdp');if(selected&&!/^[a-zA-Z0-9_-]{1,100}$/.test(selected))selected=null;$('search').value=(u.searchParams.get('q')||'').slice(0,100);document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));lastRoute=location.href;}
  async function restoreRoute(){
    inline=null;readRoute();const edit=new URL(location.href).searchParams.get('edit');
    if(edit==='1'||edit==='new'){const record=records.find(r=>r.key===selected);if(record||edit==='new'){await openEditor(record,true);return;}}
    editing=null;$('form').reset();$('editor').hidden=true;$('workspace').hidden=false;$('add').hidden=false;renderList();renderDetail();
  }
  function setSelection(key,replace=false){selected=key;route({pdp:key,edit:null,field:null,history:null,before:null,revision:null},replace);renderList();renderDetail();}
  function persistDraft(){
    clearTimeout(draftTimer);if(!editing)return Promise.resolve();
    const record=editing,mode=device,current=epoch,value=formValue(),snapshot=JSON.stringify(value);
    draftPromise=draftPromise.catch(()=>{}).then(async()=>{
      if(current!==epoch||editing?.key!==record.key||device!==mode||snapshot===draftSaved)return;
      $('draft-status').textContent='Saving draft…';
      try{const saved=await api('saveDraft',{key:record.key,device:mode,value,baseVersion:record.version,expectedVersion:draftVersion},true);if(current!==epoch||editing?.key!==record.key||device!==mode)return;draftVersion=saved.version;draftSaved=snapshot;drafts=drafts.filter(d=>d.key!==record.key||d.device!==mode).concat({key:record.key,device:mode,name:value.name,baseVersion:record.version,updatedAt:Date.now()});$('draft-status').textContent='Draft saved privately.';}
      catch(error){if(current===epoch)$('draft-status').textContent='Draft not saved: '+error.message+' Download your draft to keep a copy.';throw error;}
    });return draftPromise;
  }
  function scheduleDraft(){if(!editing||saving)return;clearTimeout(draftTimer);$('draft-status').textContent='Unsaved draft…';draftTimer=setTimeout(()=>{void persistDraft().catch(()=>{});},500);}
  function renderList() {
    const active=records.filter(r=>!r.value.archived);
    $('total').textContent=active.length; $('paired').textContent=active.filter(r=>linked(r.value)).length; $('missing').textContent=active.filter(r=>!linked(r.value)).length; $('strict').textContent=active.filter(r=>r.value.exactMatch).length;
    const term=$('search').value.toLowerCase().trim();
    const shown=records.filter(r=>{const v=r.value;return (filter==='archived'?v.archived:!v.archived)&&(filter!=='missing'||!linked(v))&&(filter!=='strict'||v.exactMatch)&&[v.name,v.issuer,v.publisher,v.liveUrl,v.approvalVersion].join(' ').toLowerCase().includes(term);}).sort((a,b)=>a.value.issuer.localeCompare(b.value.issuer)||a.value.name.localeCompare(b.value.name));
    $('count').textContent=shown.length+' PDP'+(shown.length===1?'':'s');
    $('list').innerHTML=shown.map(r=>`<a class="record" href="?pdp=${encodeURIComponent(r.key)}&device=${device}${filter==='active'?'':'&filter='+filter}${$('search').value.trim()&&!/https?:|@|[?=]/i.test($('search').value)?'&q='+encodeURIComponent($('search').value.trim().slice(0,100)):''}" data-key="${esc(r.key)}" aria-current="${r.key===selected}"><strong>${esc(r.value.name)}</strong><small>${esc(r.value.publisher)} · ${esc(r.value.issuer)}</small><span class="badge ${linked(r.value)?'':'warn'}">${esc(evidenceLabel(r.value))}</span>${r.value.exactMatch?' <span class="badge strict">1:1</span>':''}</a>`).join('')||'<p class="empty">No PDPs in this view.</p>';
    $('list').querySelectorAll('[data-key]').forEach(b=>b.onclick=event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setSelection(b.dataset.key);});
    $('draft-list').innerHTML=drafts.length?'<p class="list-label">Unfinished drafts</p>'+drafts.map(d=>`<a class="draft-link" href="?pdp=${encodeURIComponent(d.key)}&device=${d.device}&edit=${d.baseVersion?'1':'new'}">Resume ${esc(d.name||'Untitled PDP')} · ${d.device}</a>`).join(''):'';
    $('draft-list').innerHTML+=fieldDrafts.map(d=>`<a class="draft-link" href="?pdp=${encodeURIComponent(d.key)}&device=${d.device}&field=${d.field}">Resume ${esc(inlineFields[d.field]?.[0]||'field edit')} · ${esc(records.find(r=>r.key===d.key)?.value.name||'PDP')} · ${d.device}</a>`).join('');
    $('draft-list').querySelectorAll('a').forEach(a=>a.onclick=event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();history.pushState({},'',a.href);void restoreRoute();});
  }
  function renderDetail() {
    const r=records.find(r=>r.key===selected);
    if(!r){releasePreviews();$('detail').innerHTML=`<div class="empty"><div class="symbol">▤</div><h2>${selected?'PDP unavailable':records.length?'Your references, side by side.':'Start your approval library.'}</h2><p>${selected?'This record could not be found in your workspace.':records.length?'Choose a PDP to open its live page, approved mockup, and approval email.':'Add a production page now. Attach its approved mockup and email chain whenever they are ready.'}</p><button class="primary" id="empty-add">＋ Add PDP</button></div>`;$('empty-add').onclick=()=>openEditor();return;}
    const v=r.value, ref=referenceFor(v), modeLabel=device==='desktop'?'Desktop':'Mobile';
    const reopen=new URL(location.href).searchParams.get('preview')!=='0';releasePreviews();
    $('detail').innerHTML=`<div class="detail-head"><div><div class="record-identity">${editable('issuer',v.issuer)}${editable('publisher',v.publisher)}</div>${editable('name',v.name,'<h2>'+esc(v.name)+'</h2>')}<div class="badges"><span class="badge ${linked(v)?'':'warn'}">${esc(evidenceLabel(v))}</span>${v.archived?'<span class="badge">Archived</span>':''}${v.exactMatch?'<span class="badge strict">1:1 match required</span>':''}</div></div></div>
    ${editable('exactMatch',v.exactMatch,v.exactMatch?'Yes':'No')}${editable('archived',v.archived,v.archived?'Archived':'Active')}
    ${v.exactMatch?'<div class="notice"><strong>Exact match required.</strong> Use the approved version as the reference for this PDP. This tracker does not scan or certify the live page.</div>':''}
    <div class="device-controls" role="group" aria-label="Comparison device"><button data-device="desktop" aria-pressed="${device==='desktop'}">Desktop</button><button data-device="mobile" aria-pressed="${device==='mobile'}">Mobile</button><span>${modeLabel} reference and approval evidence</span></div>
    <div class="preview-actions"><p>Approved reference on the left. A timestamped production capture on the right. Use Open live page for the current interactive page.</p><button id="preview" aria-expanded="false" aria-controls="approved-preview live-preview">Show previews</button></div>
    <div class="comparison">
      <div class="comparison-column approved-column">
        <article class="pane" aria-labelledby="approved-title"><div class="pane-inner"><p class="eyebrow">APPROVED REFERENCE</p><h3 id="approved-title">Approved mockup · ${modeLabel}</h3>${editable('fileKey',ref.fileKey||'',ref.fileKey?'<span>Private PDF attached</span>':'<span class="field-missing">No '+device+' PDF attached</span>')}${ref.fileKey?'<button id="saved-pdf">Preview saved PDF</button><button id="download-pdf" class="text-action">Download PDF</button>':''}${editable('mockupUrl',ref.mockupUrl,ref.mockupUrl?link(pdfUrl(ref),ref.fileKey?'Open source package':'Open approved mockup'):'<span class="field-missing">No '+device+' mockup linked yet.</span>')}${editable('pdfPage',ref.pdfPage)}</div><div id="approved-preview" class="preview-slot" hidden></div></article>
        <section class="evidence" aria-labelledby="evidence-title"><p class="eyebrow">APPROVAL RECORD</p><h3 id="evidence-title">${modeLabel} approval evidence</h3>${editable('emailUrl',ref.emailUrl,ref.emailUrl?link(ref.emailUrl,'Open approval email chain'):'<span class="field-missing">Approval email missing</span>')}<div class="meta">${editable('approvalDate',ref.approvalDate)}${editable('approvalVersion',ref.approvalVersion)}</div>${editable('referenceNotes',ref.notes||'')}${editable('notes',v.notes)}<p class="record-meta">Record revision ${r.version} · Saved ${esc(date(r.updatedAt))}</p><div class="record-actions"><button id="history">View record history</button><button id="copy">Copy PDP shortcut</button><button id="edit" class="all-fields">All fields</button></div><div id="history-list" class="history"></div></section>
      </div>
      <div class="comparison-column live-column">
        <article class="pane" aria-labelledby="live-title"><div class="pane-inner"><p class="eyebrow">PRODUCTION CAPTURE</p><h3 id="live-title">Production capture · ${modeLabel}</h3>${editable('liveUrl',v.liveUrl)}${link(v.liveUrl,'Open live page')}<p id="capture-meta" class="capture-meta">Saved screenshot, not a live feed.</p><a id="capture-full" class="text-action" target="_blank" rel="noopener noreferrer" hidden>Open capture full size ↗</a></div><div id="live-preview" class="preview-slot live-preview" hidden></div></article><p class="viewport-label">${device==='mobile'?'402 px mobile viewport':'1440 px desktop viewport'} · original page capture</p>
      </div>
    </div>`;
    document.querySelectorAll('[data-device]').forEach(button=>button.onclick=()=>{device=button.dataset.device;setSelection(r.key);});
    $('edit').onclick=()=>openEditor(r);
    $('detail').querySelectorAll('[data-inline]').forEach(b=>b.onclick=()=>void openInline(b.dataset.inline));
    const requestedField=new URL(location.href).searchParams.get('field');if(inlineFields[requestedField])void openInline(requestedField,true);
    const renderPreviews=async(open,restoring=false)=>{
      route({preview:open?'1':'0'},restoring);releasePreviews();const request=previewEpoch,current=epoch;
      $('preview').textContent=open?'Hide previews':'Show previews';$('preview').setAttribute('aria-expanded',String(open));
      for(const id of ['approved-preview','live-preview']){$(id).hidden=!open;$(id).replaceChildren();}
      if(!open){$('capture-full').hidden=true;$('capture-full').removeAttribute('href');return;}
      const production=$('live-preview'),meta=$('capture-meta'),full=$('capture-full');
      production.textContent='Loading production capture…';full.hidden=true;full.removeAttribute('href');
      void(async()=>{try{
        const captured=await api('capture',{recordKey:r.key,device});
        if(request!==previewEpoch||current!==epoch)return;
        if(!captured){production.innerHTML='<p class="preview-empty">No '+esc(device)+' production capture saved yet. Open the live page using the link above.</p>';meta.textContent='No capture saved for this page and device.';return;}
        meta.textContent='Captured '+new Date(captured.capturedAt).toLocaleString(undefined,{timeZoneName:'short'})+' · '+captured.viewportWidth+' px wide. Saved screenshot, not a live feed.';
        const blob=await privatePdf(captured.key,'capture');if(request!==previewEpoch||current!==epoch)return;
        const url=URL.createObjectURL(blob);objectUrls.add(url);const img=document.createElement('img');img.src=url;img.alt=modeLabel+' production page captured '+date(captured.capturedAt);img.className='production-image';img.dataset.viewportWidth=String(captured.viewportWidth);
        production.replaceChildren(img);full.href=url;full.hidden=false;
      }catch(error){if(request===previewEpoch&&current===epoch){production.textContent=error.message;meta.textContent='Capture unavailable. Open the live page above.';}}})();
      const approved=$('approved-preview');approved.textContent='Loading approved reference…';
      try{
        let url=pdfUrl(ref);
        if(ref.fileKey){const blob=await privatePdf(ref.fileKey);if(request!==previewEpoch||current!==epoch)return;url=URL.createObjectURL(blob);objectUrls.add(url);if(ref.pdfPage)url+='#page='+ref.pdfPage;}
        if(request!==previewEpoch||current!==epoch)return;approved.replaceChildren();
        if(url){const frame=document.createElement('iframe');frame.title='Approved mockup';frame.src=url;frame.referrerPolicy='no-referrer';if(!ref.fileKey)frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups');approved.append(frame);}
        else{const empty=document.createElement('p');empty.className='preview-empty';empty.textContent='Add the '+device+' mockup to preview it here.';approved.append(empty);}
      }catch(error){if(request===previewEpoch&&current===epoch)approved.textContent=error.message;}
    };
    $('preview').onclick=()=>void renderPreviews($('approved-preview').hidden);
    if($('saved-pdf'))$('saved-pdf').onclick=()=>void renderPreviews(true);
    if($('download-pdf'))$('download-pdf').onclick=()=>void downloadPdf(ref.fileKey,ref.approvalVersion||v.name+' '+device);
    if(reopen)void renderPreviews(true,true);
    $('history').onclick=()=>{if($('history-list').children.length){$('history-list').replaceChildren();$('history').textContent='View record history';route({history:null,before:null,revision:null});}else void loadHistory(r.key);};if(new URL(location.href).searchParams.get('history')==='1')void loadHistory(r.key,Number(new URL(location.href).searchParams.get('before'))||undefined);$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+location.search);$('message').textContent='Shortcut copied. Sign-in is still required.';}catch{$('message').textContent='Copy the page URL from your address bar.';}};
  }
  async function loadHistory(key,beforeVersion,resetRevision=false) {
    route({history:'1',before:beforeVersion?String(beforeVersion):null,...(resetRevision?{revision:null}:{})});$('history').textContent='Hide record history';
    const current=epoch, target=$('history-list'), mode=device;
    try {
      const data=await api('history',{key,...(beforeVersion?{beforeVersion}:{})});
      if(current!==epoch||selected!==key||target!==$('history-list'))return;
      target.querySelector('[data-more]')?.remove();
      const div=document.createElement('div');div.innerHTML=data.records.map(r=>{const ref=referenceFor(r.value,mode);return `<details data-revision="${r.version}" ${new URL(location.href).searchParams.get('revision')===String(r.version)?'open':''}><summary>Revision ${r.version} · ${esc(date(r.updatedAt))}</summary><p>Saved by ${esc(r.updatedBy)} · ${r.value.archived?'Archived':'Active'} · ${r.value.exactMatch?'1:1 required':'Standard reference'}</p><strong>${esc(r.value.name)}</strong><p>${esc(r.value.publisher)} · ${esc(r.value.issuer)}<br>Approved: ${esc(ref.approvalDate||'Date not recorded')} · ${esc(ref.approvalVersion||'Version not recorded')}${ref.pdfPage?' · PDF page '+esc(ref.pdfPage):''}</p>${link(r.value.liveUrl,'Production','')}${link(pdfUrl(ref),'Mockup source','')}${link(ref.emailUrl,'Approval email','')}${ref.fileKey?`<button data-history-file="${esc(ref.fileKey)}">Download ${esc(mode)} PDF</button>`:''}<p class="notes">${esc(r.value.notes)}</p></details>`;}).join('');
      target.replaceChildren();target.append(div);div.querySelectorAll('details').forEach(detail=>detail.addEventListener('toggle',()=>{const currentRevision=new URL(location.href).searchParams.get('revision');if(detail.open&&currentRevision!==detail.dataset.revision){route({revision:detail.dataset.revision});div.querySelectorAll('details').forEach(other=>{if(other!==detail)other.open=false;});}else if(!detail.open&&currentRevision===detail.dataset.revision)route({revision:null});}));if(beforeVersion){const b=document.createElement('button');b.textContent='Latest revisions';b.onclick=()=>loadHistory(key,undefined,true);target.append(b);}div.querySelectorAll('[data-history-file]').forEach(b=>b.onclick=()=>void downloadPdf(b.dataset.historyFile,'PDP '+mode+' reference.pdf'));
      if(data.nextBeforeVersion){const b=document.createElement('button');b.dataset.more='true';b.textContent='Older revisions';b.onclick=()=>loadHistory(key,data.nextBeforeVersion,true);target.append(b);}
    }catch(error){if(current===epoch)$('message').textContent=error.message;}
  }
  function syncStrict() { const f=$('form').elements, strict=isBofa(f.issuer.value); if(strict)f.exactMatch.checked=true;f.exactMatch.disabled=strict; }
  function fillEditor(){
    $('form').reset();for(const field of fields)$('form').elements[field].value=editing.value[field]||'';
    const ref=referenceFor(editing.value);for(const field of referenceFields)$('form').elements[field].value=ref[field]||'';draftFileKey=ref.fileKey||'';$('form').elements.referenceNotes.value=ref.notes||'';$('upload-status').textContent=draftFileKey?'A private PDF is attached.':'No saved PDF attached.';$('reference-device').textContent=(device==='desktop'?'Desktop':'Mobile')+' approved reference';
    $('form').elements.exactMatch.checked=!!editing.value.exactMatch;$('form').elements.archived.checked=!!editing.value.archived;syncStrict();initialForm=JSON.stringify(formValue());
  }
  async function openEditor(record,restoring=false){
    clearTimeout(draftTimer);releasePreviews();const current=epoch,generation=++editorRequest,mode=device;
    const key=record?.key||(restoring&&selected)||crypto.randomUUID();
    editing=record?structuredClone(record):{key,version:0,value:Object.fromEntries(fields.map(f=>[f,'']))};
    selected=key;draftVersion=0;draftSaved='';draftPromise=Promise.resolve();
    if(!restoring)route({pdp:key,field:null,edit:record?'1':'new',preview:null,history:null,before:null,revision:null});
    fillEditor();$('save-message').textContent='';$('draft-status').textContent='Checking saved draft…';$('workspace').hidden=true;$('editor').hidden=false;$('add').hidden=true;$('editor-title').textContent=(record?'Edit PDP':'Add PDP')+' · '+(device==='desktop'?'Desktop':'Mobile');lockForm(true);
    try{const draft=await api('draft',{key,device});if(current!==epoch||generation!==editorRequest||editing?.key!==key||device!==mode)return;if(draft){editing.value=draft.value;editing.version=draft.baseVersion;draftVersion=draft.version;fillEditor();draftSaved=JSON.stringify(formValue());$('draft-status').textContent=record&&record.version!==draft.baseVersion?'Recovered draft. The saved PDP has changed; download this draft before reconciling it.':'Recovered your saved draft.';}else{$('draft-status').textContent='Changes are saved as a private draft.';draftSaved=JSON.stringify(formValue());}}
    catch(error){if(current===epoch)$('draft-status').textContent='Could not check saved drafts. '+error.message;}
    finally{if(current===epoch&&generation===editorRequest&&editing?.key===key&&device===mode){lockForm(false);$('form').elements.name.focus();}}
  }
  async function closeEditor(){if(saving)return;try{await persistDraft();}catch{return;}const key=records.some(r=>r.key===editing?.key)?editing.key:null;editing=null;$('form').reset();initialForm='';$('editor').hidden=true;$('workspace').hidden=false;$('add').hidden=false;selected=key;route({pdp:key,edit:null,preview:null,history:null,before:null,revision:null});renderList();renderDetail();$('add').focus();}
  async function load() {
    const current=epoch, request=++loadId;$('refresh').disabled=true;$('retry').hidden=true;
    try {const data=await api('workspace');if(current!==epoch||request!==loadId)return;records=data.records;drafts=data.drafts||[];fieldDrafts=data.fieldDrafts||[];$('gate').hidden=true;$('sign-in').hidden=true;if(mounted){window.Clerk.unmountSignIn($('sign-in'));mounted=false;}$('workspace').hidden=false;$('add').hidden=false;$('message').textContent='';await restoreRoute();}
    catch(error){if(current!==epoch||request!==loadId)return;$('message').textContent=error.message;$('gate-message').textContent=error.message;$('retry').hidden=false;}
    finally{if(current===epoch&&request===loadId)$('refresh').disabled=false;}
  }
  function changed({session:next}) {
    if(next===undefined)return;const id=next?.id||null;if(id===sessionId)return;sessionId=id;session=next||null;++epoch;clearPrivate();void storedCapture('prune');$('gate').hidden=false;$('sign-out').hidden=!session;
    if(session){$('gate-message').textContent='Opening your private library…';void load();return;}
    $('sign-in').hidden=false;$('gate-message').textContent='Sign in with your approved owner account to access PDP records.';
    if(!mounted){const dest=location.href.split('#')[0];window.Clerk.mountSignIn($('sign-in'),{routing:'hash',withSignUp:false,forceRedirectUrl:dest,signUpForceRedirectUrl:dest});mounted=true;}
  }
  $('form').onsubmit=async event=>{
    event.preventDefault();if(!editing||saving)return;const current=epoch, record=editing;syncStrict();const value=formValue();saving=true;lockForm(true);$('save-message').textContent='Saving…';
    try{await persistDraft();if(current!==epoch)return;const saved=await api('save',{key:record.key,value,expectedVersion:record.version,draftDevice:device,draftVersion},true);if(current!==epoch)return;records=records.filter(r=>r.key!==saved.key).concat(saved);drafts=drafts.filter(d=>d.key!==record.key||d.device!==device);editing=null;initialForm='';$('form').reset();$('editor').hidden=true;$('workspace').hidden=false;$('add').hidden=false;filter=value.archived?'archived':'active';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));setSelection(saved.key);$('message').textContent='Saved privately. Revision '+saved.version+'.';}
    catch(error){if(current===epoch)$('save-message').textContent=error.message+' Your draft is still here.';}
    finally{if(current===epoch){saving=false;lockForm(false);}}
  };
  $('pdf-upload').onchange=async()=>{
    const file=$('pdf-upload').files[0];if(!file||!editing)return;
    const current=epoch,record=editing,mode=device;
    if(file.size>20*1024*1024){$('upload-status').textContent='Choose a PDF under 20 MB.';return;}
    saving=true;lockForm(true);$('upload-status').textContent='Uploading privately…';
    try{
      const url=await api('uploadUrl',{},true);if(current!==epoch)return;
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/pdf'},body:file,signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw Error('Upload failed. Please try again.');const {storageId}=await response.json();
      if(current!==epoch)return;
      const saved=await api('registerFile',{key:crypto.randomUUID(),recordKey:record.key,device:mode,storageId,name:file.name},'action');
      if(current!==epoch)return;draftFileKey=saved.key;$('form').elements.approvalVersion.value=file.name;$('upload-status').textContent=file.name+' uploaded. Save the PDP to attach it.';await persistDraft();
    }catch(error){if(current===epoch)$('upload-status').textContent=error.message;}
    finally{if(current===epoch){saving=false;lockForm(false);}}
  };
  $('form').elements.issuer.oninput=syncStrict;$('cancel').onclick=closeEditor;$('cancel-top').onclick=closeEditor;$('draft').onclick=()=>download({key:editing.key,expectedVersion:editing.version,value:formValue()},'pdp-unsaved-draft.json');
  $('add').onclick=()=>openEditor();$('refresh').onclick=()=>load();$('retry').onclick=()=>session?load():location.reload();$('search').oninput=()=>{route({},true);renderList();};$('form').addEventListener('input',scheduleDraft);$('form').addEventListener('change',scheduleDraft);
  $('export').onclick=()=>download({exportedAt:new Date().toISOString(),records},'pdp-approvals.json');
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));route({filter:filter==='active'?null:filter});renderList();});
  $('sign-out').onclick=async()=>{if(saving)return;try{if(inline)await persistInline();if(editing)await persistDraft();}catch{return;}++epoch;clearPrivate();$('gate').hidden=false;$('gate-message').textContent='Signing out…';try{await window.Clerk.signOut();await storedCapture('prune','',null,null);location.replace(location.pathname);}catch{$('gate-message').textContent='Sign-out failed. Please retry.';}};
  document.addEventListener('click',async event=>{const target=event.target.closest('[data-key],[data-device],#edit,#add,#empty-add,#refresh,.draft-link');if(!target||!inline||replayingNavigation||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();event.stopImmediatePropagation();if(saving)return;try{await closeInline(false);replayingNavigation=true;target.click();}catch{}finally{replayingNavigation=false;}},true);
  window.addEventListener('beforeunload',e=>{if((inline&&JSON.stringify(inline.value)!==inline.saved)||(dirty()&&JSON.stringify(formValue())!==draftSaved)||saving){e.preventDefault();e.returnValue='';}});
  window.addEventListener('popstate',async()=>{if(!session)return;const destination=location.href;if(saving){history.pushState({},'',lastRoute);return;}try{if(inline)await persistInline();if(editing)await persistDraft();if(location.href!==destination)return;await restoreRoute();}catch{history.pushState({},'',lastRoute);}});
  window.addEventListener('pageshow',e=>{if(e.persisted){++epoch;clearPrivate();location.reload();}});
  async function start(){try{await new Promise((resolve,reject)=>{const start=Date.now();const check=()=>{if(window.Clerk&&window.__internal_ClerkUICtor)resolve();else if(Date.now()-start>20000)reject(Error('Sign-in could not load. Please retry.'));else setTimeout(check,100);};check();});await Promise.race([window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor},appearance:{variables:{colorPrimary:'#171717',colorText:'#171717',colorTextSecondary:'#666666',colorBackground:'#ffffff',colorDanger:'#333333',colorSuccess:'#333333',colorWarning:'#555555',colorNeutral:'#333333'}}}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Sign-in timed out.')),20000))]);changed({session:window.Clerk.session});window.Clerk.addListener(changed);}catch(error){$('gate-message').textContent=error.message;$('retry').hidden=false;}}
  void start();
})();
