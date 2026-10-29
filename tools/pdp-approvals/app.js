(() => {
  'use strict';
  const $ = id => document.getElementById(id), API = 'https://rapid-shark-565.convex.cloud';
  let session, sessionId, epoch = 0, loadId = 0, records = [], filter = 'active', selected = new URL(location.href).searchParams.get('pdp'), editing = null, initialForm = '', saving = false, mounted = false;
  const fields = ['name','issuer','publisher','liveUrl','mockupUrl','emailUrl','approvalDate','approvalVersion','pdfPage','notes'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
  const linked = v => !!(v.mockupUrl && v.emailUrl);
  const isBofa = v => /bank\s*of\s*america|\bbofa\b/i.test(v);
  const date = value => value ? new Date(value).toLocaleString() : '—';
  const link = (url, label, cls = 'action') => safeUrl(url) ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
  function pdfUrl(v) { const url = safeUrl(v.mockupUrl); if (!url || !v.pdfPage || !/\.pdf$/i.test(new URL(url).pathname)) return url; const u = new URL(url); u.hash = 'page=' + v.pdfPage; return u.href; }
  function download(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'})); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
  function formValue() { const v = Object.fromEntries(fields.map(f => [f, $('form').elements[f].value.trim()])); return {...v, exactMatch:$('form').elements.exactMatch.checked, archived:$('form').elements.archived.checked}; }
  function dirty() { return editing && JSON.stringify(formValue()) !== initialForm; }
  function lockForm(locked) { $('form').querySelectorAll('input,textarea,button').forEach(e=>e.disabled=locked); $('cancel-top').disabled=locked; if(!locked)syncStrict(); }
  function clearPrivate() {
    records=[]; editing=null; saving=false; lockForm(false); ++loadId;
    $('workspace').hidden=true; $('editor').hidden=true; $('add').hidden=true; $('detail').replaceChildren(); $('list').replaceChildren(); $('form').reset(); initialForm=''; $('search').value=''; $('message').textContent=''; $('save-message').textContent='';
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
    const response = await fetch(API+'/api/'+(mutation?'mutation':'query'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({path:'pdpApprovals:'+name,args}),signal:AbortSignal.timeout(20000),cache:'no-store'});
    const result = await response.json();
    if (current !== epoch) throw Error('Your session changed.');
    if(!response.ok||result.status!=='success')throw Error(result.errorMessage?.replace(/^.*?Uncaught Error: /s,'').split('\n')[0]||'Could not save or load. Please try again.');
    return result.value;
  }
  function setSelection(key, replace=false) {
    selected=key; const u=new URL(location.origin+location.pathname); if(key)u.searchParams.set('pdp',key); history[replace?'replaceState':'pushState']({},'',u); renderList();renderDetail();
  }
  function renderList() {
    const active=records.filter(r=>!r.value.archived);
    $('total').textContent=active.length; $('paired').textContent=active.filter(r=>linked(r.value)).length; $('missing').textContent=active.filter(r=>!linked(r.value)).length; $('strict').textContent=active.filter(r=>r.value.exactMatch).length;
    const term=$('search').value.toLowerCase().trim();
    const shown=records.filter(r=>{const v=r.value;return (filter==='archived'?v.archived:!v.archived)&&(filter!=='missing'||!linked(v))&&(filter!=='strict'||v.exactMatch)&&[v.name,v.issuer,v.publisher,v.liveUrl,v.approvalVersion].join(' ').toLowerCase().includes(term);}).sort((a,b)=>a.value.issuer.localeCompare(b.value.issuer)||a.value.name.localeCompare(b.value.name));
    $('count').textContent=shown.length+' PDP'+(shown.length===1?'':'s');
    $('list').innerHTML=shown.map(r=>`<button class="record" data-key="${esc(r.key)}" aria-current="${r.key===selected}"><strong>${esc(r.value.name)}</strong><small>${esc(r.value.publisher)} · ${esc(r.value.issuer)}</small><span class="badge ${linked(r.value)?'':'warn'}">${linked(r.value)?'Evidence linked':'Missing evidence'}</span>${r.value.exactMatch?' <span class="badge strict">1:1</span>':''}</button>`).join('')||'<p class="empty">No PDPs in this view.</p>';
    $('list').querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>setSelection(b.dataset.key));
  }
  function renderDetail() {
    const r=records.find(r=>r.key===selected);
    if(!r){$('detail').innerHTML=`<div class="empty"><div class="symbol">▤</div><h2>${selected?'PDP unavailable':records.length?'Your references, side by side.':'Start your approval library.'}</h2><p>${selected?'This record could not be found in your workspace.':records.length?'Choose a PDP to open its live page, approved mockup, and approval email.':'Add a production page now. Attach its approved mockup and email chain whenever they are ready.'}</p><button class="primary" id="empty-add">＋ Add PDP</button></div>`;$('empty-add').onclick=()=>openEditor();return;}
    const v=r.value;
    $('detail').innerHTML=`<div class="detail-head"><div><p class="eyebrow">${esc(v.issuer)} / ${esc(v.publisher)}</p><h2>${esc(v.name)}</h2><div class="badges"><span class="badge ${linked(v)?'':'warn'}">${linked(v)?'Evidence linked':'Missing evidence'}</span>${v.archived?'<span class="badge">Archived</span>':''}${v.exactMatch?'<span class="badge strict">1:1 match required</span>':''}</div></div><button id="edit">Edit record</button></div>
    ${v.exactMatch?'<div class="notice"><strong>Exact match required.</strong> Use the approved version as the reference for this PDP. This tracker does not scan or certify the live page.</div>':''}
    <div class="comparison"><article class="pane"><div class="pane-inner"><p class="eyebrow">01 / PRODUCTION</p><h3>Live PDP</h3><p class="url">${esc(v.liveUrl)}</p>${link(v.liveUrl,'Open live page')}</div></article><article class="pane"><div class="pane-inner"><p class="eyebrow">02 / APPROVED REFERENCE</p><h3>Approved mockup</h3>${v.mockupUrl?`<p class="url">${esc(v.approvalVersion||v.mockupUrl)}${v.pdfPage?'<br>Starting page '+esc(v.pdfPage):''}</p>${link(pdfUrl(v),'Open approved mockup')}`:'<p class="missing">No approved mockup linked yet.</p>'}</div></article></div>
    <div class="preview-actions"><p>Live previews may be blocked by the source. Use the links above if a preview is blank or asks you to sign in.</p><button id="preview" aria-expanded="false">Show previews</button></div><div id="frames" class="frames" hidden></div>
    <section class="evidence"><h3>Approval evidence</h3>${v.emailUrl?link(v.emailUrl,'Open approval email chain'):'<p class="badge warn">Approval email is missing</p>'}<dl class="meta"><div><dt>Approval date</dt><dd>${esc(v.approvalDate||'Not recorded')}</dd></div><div><dt>Approved version</dt><dd>${esc(v.approvalVersion||'Not recorded')}</dd></div></dl>${v.notes?`<h3>Notes</h3><p class="notes">${esc(v.notes)}</p>`:''}<p class="url">Record revision ${r.version} · Saved ${esc(date(r.updatedAt))}</p><button id="history">View record history</button> <button id="copy">Copy PDP shortcut</button><div id="history-list" class="history"></div></section>`;
    $('edit').onclick=()=>openEditor(r);$('preview').onclick=()=>{
      const open=$('frames').hidden;$('frames').hidden=!open;$('preview').textContent=open?'Hide previews':'Show previews';$('preview').setAttribute('aria-expanded',String(open));
      $('frames').replaceChildren();if(open)for(const [url,title] of [[v.liveUrl,'Live production page'],[pdfUrl(v),'Approved mockup']]){const box=document.createElement('div');const label=document.createElement('p');label.textContent=title;box.append(label);if(safeUrl(url)){const frame=document.createElement('iframe');frame.title=title;frame.src=url;frame.referrerPolicy='no-referrer';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups');box.append(frame);}else box.append('Add a mockup link to preview it.');$('frames').append(box);}
    };
    $('history').onclick=()=>loadHistory(r.key);$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+'?pdp='+encodeURIComponent(r.key));$('message').textContent='Shortcut copied. Sign-in is still required.';}catch{$('message').textContent='Copy the page URL from your address bar.';}};
  }
  async function loadHistory(key,beforeVersion) {
    const current=epoch, target=$('history-list');
    try {
      const data=await api('history',{key,...(beforeVersion?{beforeVersion}:{})});
      if(current!==epoch||selected!==key||target!==$('history-list'))return;
      target.querySelector('[data-more]')?.remove();
      const div=document.createElement('div');div.innerHTML=data.records.map(r=>`<details><summary>Revision ${r.version} · ${esc(date(r.updatedAt))}</summary><p>Saved by ${esc(r.updatedBy)} · ${r.value.archived?'Archived':'Active'} · ${r.value.exactMatch?'1:1 required':'Standard reference'}</p><strong>${esc(r.value.name)}</strong><p>${esc(r.value.publisher)} · ${esc(r.value.issuer)}<br>Approved: ${esc(r.value.approvalDate||'Date not recorded')} · ${esc(r.value.approvalVersion||'Version not recorded')}${r.value.pdfPage?' · PDF page '+esc(r.value.pdfPage):''}</p>${link(r.value.liveUrl,'Production','')}${link(pdfUrl(r.value),'Mockup','')}${link(r.value.emailUrl,'Approval email','')}<p class="notes">${esc(r.value.notes)}</p></details>`).join('');
      if(!beforeVersion)target.replaceChildren();target.append(div);
      if(data.nextBeforeVersion){const b=document.createElement('button');b.dataset.more='true';b.textContent='Older revisions';b.onclick=()=>loadHistory(key,data.nextBeforeVersion);target.append(b);}
    }catch(error){if(current===epoch)$('message').textContent=error.message;}
  }
  function syncStrict() { const f=$('form').elements, strict=isBofa(f.issuer.value); if(strict)f.exactMatch.checked=true;f.exactMatch.disabled=strict; }
  function openEditor(record) {
    editing=record?structuredClone(record):{key:crypto.randomUUID(),version:0,value:Object.fromEntries(fields.map(f=>[f,'']))};
    $('form').reset();for(const field of fields)$('form').elements[field].value=editing.value[field]||'';
    $('form').elements.exactMatch.checked=!!editing.value.exactMatch;$('form').elements.archived.checked=!!editing.value.archived;syncStrict();
    initialForm=JSON.stringify(formValue());$('save-message').textContent='';$('save').disabled=false;$('workspace').hidden=true;$('editor').hidden=false;$('add').hidden=true;$('editor-title').textContent=record?'Edit PDP':'Add PDP';$('form').elements.name.focus();
  }
  function closeEditor() { if(saving)return;if(dirty()&&!confirm('Discard the unsaved changes? Download the draft first if you need to keep them.'))return;editing=null;$('form').reset();initialForm='';$('editor').hidden=true;$('workspace').hidden=false;$('add').hidden=false;$('add').focus();renderList();renderDetail(); }
  async function load() {
    const current=epoch, request=++loadId;$('refresh').disabled=true;$('retry').hidden=true;
    try {const data=await api('workspace');if(current!==epoch||request!==loadId)return;records=data.records;$('gate').hidden=true;$('sign-in').hidden=true;if(mounted){window.Clerk.unmountSignIn($('sign-in'));mounted=false;}$('workspace').hidden=false;$('add').hidden=false;$('message').textContent='';renderList();renderDetail();}
    catch(error){if(current!==epoch||request!==loadId)return;$('message').textContent=error.message;$('gate-message').textContent=error.message;$('retry').hidden=false;}
    finally{if(current===epoch&&request===loadId)$('refresh').disabled=false;}
  }
  function changed({session:next}) {
    if(next===undefined)return;const id=next?.id||null;if(id===sessionId)return;sessionId=id;session=next||null;++epoch;clearPrivate();$('gate').hidden=false;$('sign-out').hidden=!session;
    if(session){$('gate-message').textContent='Opening your private library…';void load();return;}
    $('sign-in').hidden=false;$('gate-message').textContent='Sign in with your approved owner account to access PDP records.';
    if(!mounted){const dest=location.origin+location.pathname+(selected?'?pdp='+encodeURIComponent(selected):'');window.Clerk.mountSignIn($('sign-in'),{routing:'hash',withSignUp:false,forceRedirectUrl:dest,signUpForceRedirectUrl:dest});mounted=true;}
  }
  $('form').onsubmit=async event=>{
    event.preventDefault();if(!editing||saving)return;const current=epoch, record=editing;syncStrict();const value=formValue();saving=true;lockForm(true);$('save-message').textContent='Saving…';
    try{const saved=await api('save',{key:record.key,value,expectedVersion:record.version},true);if(current!==epoch)return;records=records.filter(r=>r.key!==saved.key).concat(saved);editing=null;initialForm='';$('form').reset();$('editor').hidden=true;$('workspace').hidden=false;$('add').hidden=false;filter=value.archived?'archived':'active';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));setSelection(saved.key);$('message').textContent='Saved privately. Revision '+saved.version+'.';}
    catch(error){if(current===epoch)$('save-message').textContent=error.message+' Your draft is still here.';}
    finally{if(current===epoch){saving=false;lockForm(false);}}
  };
  $('form').elements.issuer.oninput=syncStrict;$('cancel').onclick=closeEditor;$('cancel-top').onclick=closeEditor;$('draft').onclick=()=>download({key:editing.key,expectedVersion:editing.version,value:formValue()},'pdp-unsaved-draft.json');
  $('add').onclick=()=>openEditor();$('refresh').onclick=()=>load();$('retry').onclick=()=>session?load():location.reload();$('search').oninput=renderList;
  $('export').onclick=()=>download({exportedAt:new Date().toISOString(),records},'pdp-approvals.json');
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderList();});
  $('sign-out').onclick=async()=>{if(dirty()&&!confirm('Sign out and discard the unsaved draft?'))return;++epoch;clearPrivate();$('gate').hidden=false;$('gate-message').textContent='Signing out…';try{await window.Clerk.signOut();location.replace(location.pathname);}catch{$('gate-message').textContent='Sign-out failed. Please retry.';}};
  window.addEventListener('beforeunload',e=>{if(dirty()||saving){e.preventDefault();e.returnValue='';}});
  window.addEventListener('popstate',()=>{if(editing){if(dirty()&&!confirm('Discard the unsaved changes?')){const u=new URL(location.origin+location.pathname);if(selected)u.searchParams.set('pdp',selected);history.pushState({},'',u);return;}editing=null;$('form').reset();$('editor').hidden=true;$('workspace').hidden=!session;$('add').hidden=!session;}selected=new URL(location.href).searchParams.get('pdp');if(session){renderList();renderDetail();}});
  window.addEventListener('pageshow',e=>{if(e.persisted){++epoch;clearPrivate();location.reload();}});
  async function start(){try{await new Promise((resolve,reject)=>{const start=Date.now();const check=()=>{if(window.Clerk&&window.__internal_ClerkUICtor)resolve();else if(Date.now()-start>20000)reject(Error('Sign-in could not load. Please retry.'));else setTimeout(check,100);};check();});await Promise.race([window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Sign-in timed out.')),20000))]);changed({session:window.Clerk.session});window.Clerk.addListener(changed);}catch(error){$('gate-message').textContent=error.message;$('retry').hidden=false;}}
  void start();
})();
