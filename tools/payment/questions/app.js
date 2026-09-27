(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API='https://rapid-shark-565.convex.cloud', FILE_API='https://rapid-shark-565.convex.site/payment-question-file';
  const stages={open:'Inbox',waiting:'Waiting',resolved:'Done'};
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};
  let session=null,sessionId,epoch=0,request=0,viewRequest=0,mounted=false,queue='open',notes=[],current=null,editor=null;
  let dirty=false,saving=null,saveTimer=null,saveAttempt=null,saveError=false,moving=false,uploading=false,draftKey='',pendingFiles=[];
  const imageUrls=new Set();
  function notice(text=''){$('notice').textContent=text;$('notice').hidden=!text;}
  function errorText(e){return e?.message?.match(/(?:This question changed[^\n]*|This account is not authorized[^\n]*|Write a note[^\n]*|This note has[^\n]*|Invalid note[^\n]*|Unsupported note[^\n]*|Use an https[^\n]*|Enter [^\n]*|Screenshots must[^\n]*|A question can[^\n]*)/)?.[0]||'Couldn’t save. Your note is still here—click Save note to retry.';}
  function savedState(text,error=false){$('save-state').textContent=text;$('save-state').classList.toggle('error',error);}
  function clearUrls(){imageUrls.forEach(u=>URL.revokeObjectURL(u));imageUrls.clear();}
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
  function resetPrivate(){
    ++request;++viewRequest;clearTimeout(saveTimer);notes=[];current=null;dirty=false;saving=null;saveAttempt=null;saveError=false;pendingFiles=[];moving=false;uploading=false;draftKey='';
    editor?.clear();editor=null;$('editor-mount').replaceChildren();$('note-title').value='';$('search').value='';$('files').value='';
    $('tickets').replaceChildren();$('screenshots').replaceChildren();$('events').replaceChildren();$('legacy-details').replaceChildren();$('note').hidden=true;$('placeholder').hidden=false;
    $('full-image').removeAttribute('src');$('image-dialog').close();clearUrls();$('app').hidden=true;$('new').hidden=true;notice();
  }
  function renderQueue(){
    document.querySelectorAll('[data-queue]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.queue===queue));b.querySelector('span').textContent=notes.filter(n=>n.status===b.dataset.queue).length;});
    const q=$('search').value.trim().toLowerCase();const visible=notes.filter(n=>n.status===queue&&[n.title,n.context,n.card,n.cardholder,n.payer,n.payee].join(' ').toLowerCase().includes(q)).sort((a,b)=>b.updatedAt-a.updatedAt);
    $('tickets').replaceChildren();
    for(const n of visible){const b=button('',()=>void openNote(n._id));b.className=`ticket${current?.item._id===n._id?' selected':''}`;b.dataset.id=n._id;b.setAttribute('aria-pressed',String(current?.item._id===n._id));b.append(node('strong',n.title),node('p',n.context||'Screenshot or quick note'),node('time',new Date(n.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})));$('tickets').append(b);}
    if(!visible.length)$('tickets').append(node('p',q?'No matching notes.':queue==='resolved'?'Finished notes will live here.':queue==='waiting'?'Nothing waiting right now.':'Nothing to follow up on. Add a note whenever you need one.','empty'));
  }
  async function refresh(){if(!session)return false;const serial=++request,generation=epoch;try{const data=await call('query','list');if(serial!==request||generation!==epoch)return false;notes=data;renderQueue();return true;}catch(e){if(generation===epoch)notice(errorText(e));return false;}}
  function snapshot(){const richText=RallyNoteRichText.normalizeRichText(RallyNoteEditor.fromDOM(editor.element));return {title:$('note-title').value.trim(),richText};}
  function touch(){dirty=true;saveError=false;savedState('Unsaved');clearTimeout(saveTimer);if(!moving)saveTimer=setTimeout(()=>void saveNote(),900);}
  function applyItem(item){const index=notes.findIndex(n=>n._id===item._id);if(index<0)notes.unshift(item);else notes[index]=item;renderQueue();}
  async function saveNote(force=false){
    clearTimeout(saveTimer);if(saving)return saving;if(!current||!editor||(!dirty&&!force))return true;
    const generation=epoch,target=current;
    saving=Promise.resolve().then(async()=>{
      try{
        // Keep edits made during a request; the next pass saves the latest snapshot.
        do{
          if(!saveAttempt){const value=snapshot();saveAttempt={...value,requestKey:target.item._id?crypto.randomUUID():draftKey,...(target.item._id?{id:target.item._id,expectedVersion:target.item.version}:{})};}
          const attempt=saveAttempt;dirty=false;savedState('Saving…');
          const result=await call('mutation','saveNote',attempt);if(generation!==epoch||current!==target)return false;
          const body=RallyNoteRichText.richTextPlain(attempt.richText).trim();
          Object.assign(target.item,{_id:result.id,version:result.version,title:attempt.title||body.split('\n')[0].slice(0,100)||'Untitled note',context:body,richText:attempt.richText,updatedAt:Date.now()});
          saveAttempt=null;$('note-title').placeholder=target.item.title;applyItem(target.item);
          // A retry may have sent an older snapshot after the user kept typing.
          dirty=JSON.stringify(snapshot())!==JSON.stringify({title:attempt.title,richText:attempt.richText});
        }while(dirty&&generation===epoch&&current===target);
        saveError=false;savedState('Saved');return true;
      }catch(e){if(generation===epoch&&current===target){dirty=true;saveError=true;savedState(errorText(e),true);if(/another device/.test(e.message))notice('A newer version exists. Copy your current note before using Refresh to load it.');}return false;}
      finally{if(generation===epoch)saving=null;}
    });return saving;
  }
  async function settle(){if(!current)return true;if(!(await saveNote()))return false;if(pendingFiles.length&&!uploading)await uploadFiles();if(uploading||pendingFiles.length){notice('Finish or retry the screenshot upload before switching notes.');return false;}return true;}
  function mountNote(data){
    clearTimeout(saveTimer);current=data;dirty=false;saveAttempt=null;saveError=false;draftKey=crypto.randomUUID();clearUrls();$('note').hidden=false;$('placeholder').hidden=true;document.querySelector('.workspace').classList.add('show-note');
    $('note-title').value=data.item.title==='Untitled note'?'':data.item.title||'';$('note-title').placeholder='Untitled note';$('note-title').disabled=false;
    const input=node('textarea');input.id='note-body';input.placeholder='What’s going on? Write freely. Paste a screenshot whenever you need one.';$('editor-mount').replaceChildren(input);
    editor=RallyNoteEditor.mount(input,{body:data.item.context||'',richText:data.item.richText});editor.element.addEventListener('input',touch);
    editor.element.closest('.rich-note-editor').addEventListener('click',e=>{if(e.target.closest('[data-command],[data-link-apply]'))queueMicrotask(touch);});
    savedState(data.item._id?'Saved':'Saves as you write');renderStage();renderImages();renderHistory();renderQueue();renderLegacy();
  }
  function renderStage(){if(!current)return;const status=current.item.status;$('note-stage').textContent=stages[status];$('note-stage').className=`badge ${status}`;document.querySelectorAll('[data-move]').forEach(b=>{b.setAttribute('aria-current',String(b.dataset.move===status));b.disabled=moving;});}
  async function newNote(){if(moving)return;if(!(await settle()))return;current=null;mountNote({item:{status:'open',title:'',context:'',createdAt:Date.now(),updatedAt:Date.now(),createdBy:session?.user?.primaryEmailAddress?.emailAddress||'',version:0},files:[],events:[]});editor.focus();}
  async function openNote(id){if(moving)return;if(current?.item._id===id)return;if(!(await settle()))return;const serial=++viewRequest,generation=epoch;notice('Opening note…');try{const data=await call('query','detail',{id});if(serial!==viewRequest||generation!==epoch)return;mountNote(data);notice();}catch(e){if(generation===epoch)notice(errorText(e));}}
  async function move(status){if(!current||moving)return;const generation=epoch,target=current;moving=true;editor.setDisabled(true);$('note-title').disabled=true;renderStage();
    try{if(!(await saveNote(!target.item._id)))return;if(generation!==epoch||current!==target)return;
      const result=await call('mutation','move',{id:target.item._id,status,expectedVersion:target.item.version,requestKey:crypto.randomUUID()});if(generation!==epoch||current!==target)return;
      target.item.status=status;target.item.version=result.version;target.item.updatedAt=Date.now();target.events.push({kind:status,text:'',createdAt:Date.now()});queue=status;applyItem(target.item);renderHistory();savedState(`Moved to ${stages[status]}`);
    }catch(e){if(generation===epoch)savedState(errorText(e),true);}finally{if(generation===epoch){moving=false;editor?.setDisabled(false);$('note-title').disabled=false;renderStage();}}
  }
  function renderLegacy(){const t=current.item;const rows=[['Charge',t.amountCents==null?'':`$${(t.amountCents/100).toFixed(2)}`],['Date',t.transactionDate],['Cardholder',t.cardholder],['Card',t.card],['Who owes',t.payer],['Who gets paid',t.payee],['Expected',t.expectedCents==null?'':`$${(t.expectedCents/100).toFixed(2)}`],['Received',t.receivedCents?`$${(t.receivedCents/100).toFixed(2)}`:''],['Follow up',t.followUp]].filter(([,v])=>v);$('earlier').hidden=!rows.length;$('earlier').open=false;$('legacy-details').replaceChildren(...rows.map(([k,v])=>node('p',`${k}: ${v}`)));}
  function renderHistory(){$('history').open=false;$('events').replaceChildren();for(const e of [...current.events].sort((a,b)=>b.createdAt-a.createdAt)){const label=e.kind==='note-edit'?'Previous note':stages[e.kind]?`Moved to ${stages[e.kind]}`:e.kind==='payment'?'Earlier repayment':'Earlier update';const p=node('p');p.append(node('strong',label),node('time',new Date(e.createdAt).toLocaleString()));if(e.text)p.append(node('span',e.text));$('events').append(p);}if(!current.events.length)$('events').append(node('p','Nothing to report. Just keep writing.'));}
  function previewImage(file, url, status, retry) {
    const card=node('figure',undefined,'screenshot'), preview=button('',()=>{$('full-image').src=url;$('image-dialog').showModal();});
    preview.className='screenshot-preview';preview.setAttribute('aria-label',`Enlarge ${file.name}`);
    const img=node('img');img.src=url;img.alt=file.name;preview.append(img);
    const caption=node('figcaption');caption.append(node('span',file.name,'screenshot-name'),node('span',status,'screenshot-status'));
    if(retry){const action=button('Retry upload',retry);action.className='screenshot-retry';caption.append(action);}
    card.append(preview,caption);return card;
  }
  function renderImages(){
    clearUrls();$('screenshots').replaceChildren();
    $('upload-state').textContent=pendingFiles.length?(uploading?'Uploading screenshot…':'Your screenshot is still here. Retry the upload below.') : '';
    for(const f of current.files){const placeholder=node('div','Loading screenshot…','screenshot-loading');$('screenshots').append(placeholder);void loadImage(f,placeholder);}
    for(const f of pendingFiles){const url=URL.createObjectURL(f.file);imageUrls.add(url);$('screenshots').append(previewImage(f.file,url,uploading?'Uploading…':'Not uploaded yet',uploading?null:()=>void uploadFiles()));}
  }
  async function loadImage(file,placeholder){const generation=epoch,target=current;
    try{const r=await fileRequest(file._id),blob=await r.blob();if(generation!==epoch||target!==current||!placeholder.isConnected)return;
      const url=URL.createObjectURL(blob);imageUrls.add(url);const img=node('img');img.src=url;await img.decode();
      if(generation!==epoch||target!==current||!placeholder.isConnected)return;
      placeholder.replaceWith(previewImage(file,url,'Saved · click to enlarge'));
    }catch{if(generation!==epoch||!placeholder.isConnected)return;const retry=button('Retry loading screenshot',()=>void loadImage(file,placeholder));placeholder.replaceChildren(retry);}
  }
  async function addFiles(files){if(!current)await newNote();if(!current)return;for(const file of files){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>8*1024*1024){notice('Choose a PNG, JPEG, or WebP screenshot under 8 MB.');continue;}if(current.files.length+pendingFiles.length>=20){notice('A note can have up to 20 screenshots.');break;}pendingFiles.push({file,key:crypto.randomUUID()});}renderImages();await uploadFiles();}
  async function uploadFiles(){if(uploading||!current||!pendingFiles.length)return;const generation=epoch,target=current;uploading=true;renderImages();
    try{if(!(await saveNote(!target.item._id)))return;for(const p of [...pendingFiles]){if(generation!==epoch||current!==target)return;$('upload-state').textContent='Uploading screenshot…';await fileRequest(target.item._id,{method:'POST',headers:{'Content-Type':p.file.type,'X-File-Name':encodeURIComponent(p.file.name),'X-Request-Key':p.key},body:p.file});if(generation!==epoch)return;pendingFiles=pendingFiles.filter(f=>f!==p);}const data=await call('query','detail',{id:target.item._id});if(generation!==epoch||current!==target)return;target.files=data.files;notice();}
    catch(e){if(generation===epoch)notice('Your note is saved, but a screenshot didn’t upload. Click Retry upload below the preview.');}
    finally{if(generation===epoch){uploading=false;renderImages();}}
  }
  $('note-title').oninput=touch;$('new').onclick=()=>void newNote();$('empty-new').onclick=()=>void newNote();$('save').onclick=()=>void saveNote(true);$('search').oninput=renderQueue;
  document.querySelectorAll('[data-queue]').forEach(b=>b.onclick=async()=>{if(!(await settle()))return;queue=b.dataset.queue;renderQueue();});document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>void move(b.dataset.move));
  $('back').onclick=async()=>{if(!(await settle()))return;document.querySelector('.workspace').classList.remove('show-note');};
  $('refresh').onclick=async()=>{if(dirty||saving){notice('Your note has unsaved changes. Save it before refreshing; if there’s a version conflict, copy your note and reload the page.');return;}const target=current?.item._id,generation=epoch;try{await refresh();if(target&&generation===epoch){const data=await call('query','detail',{id:target});if(generation===epoch&&current?.item._id===target)mountNote(data);}}catch(e){if(generation===epoch)notice(errorText(e));}};
  $('attach').onclick=()=>$('files').click();$('files').onchange=()=>{void addFiles([...$('files').files]);$('files').value='';};$('close-image').onclick=()=>$('image-dialog').close();
  document.addEventListener('paste',e=>{if(!session||$('app').hidden)return;const files=[...e.clipboardData.items].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();e.stopPropagation();void addFiles(files);}},true);
  document.addEventListener('dragover',e=>{if(session&&[...e.dataTransfer.types].includes('Files')){e.preventDefault();$('detail').classList.add('dragging');}});document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('detail').classList.remove('dragging');});document.addEventListener('drop',e=>{if(!session||!e.dataTransfer.files.length)return;e.preventDefault();$('detail').classList.remove('dragging');void addFiles([...e.dataTransfer.files]);});
  window.addEventListener('beforeunload',e=>{if(dirty||saving||pendingFiles.length||uploading){e.preventDefault();e.returnValue='';}});
  async function sessionChanged(state){if(state.session===undefined||(state.session?.id||null)===sessionId)return;session=state.session;sessionId=session?.id||null;const generation=++epoch;resetPrivate();$('gate').hidden=false;$('sign-out').hidden=!session;
    if(!session){$('gate-message').textContent='Sign in to open your notes.';$('sign-in').hidden=false;if(!mounted){const returnUrl=location.origin+location.pathname;window.Clerk.mountSignIn($('sign-in'),{routing:'hash',withSignUp:false,forceRedirectUrl:returnUrl,appearance:{variables:{colorPrimary:'#276347'}}});mounted=true;}return;}
    if(mounted){window.Clerk.unmountSignIn($('sign-in'));mounted=false;}$('sign-in').hidden=true;$('gate-message').textContent='Opening your notes…';
    try{await call('query','verify');if(generation!==epoch)return;$('gate').hidden=true;$('app').hidden=false;$('new').hidden=false;await refresh();}catch(e){if(generation!==epoch)return;$('gate-message').textContent=/not authorized/.test(e.message)?'This account doesn’t have access. Use your approved email.':'Your notes couldn’t load. Try again.';$('retry-auth').hidden=false;}}
  $('sign-out').onclick=async()=>{++epoch;session=null;sessionId=undefined;resetPrivate();$('gate').hidden=false;$('gate-message').textContent='Signing out…';try{await window.Clerk.signOut();await sessionChanged({session:null});}catch{$('gate-message').textContent='Sign-out failed. Try again.';}};$('retry-auth').onclick=()=>location.reload();
  window.addEventListener('offline',()=>{clearTimeout(saveTimer);notice('You’re offline. Keep this page open; your unsaved note is still here.');});window.addEventListener('online',()=>{notice();if(dirty&&!saveError)void saveNote();});window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  async function start(){try{await new Promise((resolve,reject)=>{let ticks=0;const timer=setInterval(()=>{if(window.Clerk&&window.__internal_ClerkUICtor){clearInterval(timer);resolve();}else if(++ticks>200){clearInterval(timer);reject(Error('Sign-in timed out'));}},100);});await window.Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});window.Clerk.addListener(sessionChanged);await sessionChanged({session:window.Clerk.session||null});}catch{resetPrivate();$('gate-message').textContent='Sign-in couldn’t load. Check your connection and try again.';$('retry-auth').hidden=false;}}
  void start();
})();
