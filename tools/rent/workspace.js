/* Authenticated shared drafts with a durable local fallback for pending file bytes. */
window.RentWorkspace = function({call,status}) {
  let owner=null,state={},version=0,attempt=null,timer,chain=Promise.resolve(),generation=0,dirty=false,conflict=false;
  const tab=sessionStorage.rentDraftTab ||= crypto.randomUUID();
  const db=new Promise((resolve,reject)=>{const r=indexedDB.open('rent-workspace-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  // Store attachment bytes as ArrayBuffers: Safari can abort IndexedDB Blob writes.
  let storageChain=Promise.resolve();
  async function encode(value){if(value instanceof Blob)return {__rentFileBytes:await value.arrayBuffer(),type:value.type,name:value.name||''};if(Array.isArray(value))return Promise.all(value.map(encode));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await encode(v)])));return value;}
  function decode(value){if(value instanceof Blob)return value;if(value?.__rentFileBytes instanceof ArrayBuffer)return new File([value.__rentFileBytes],value.name,{type:value.type});if(Array.isArray(value))return value.map(decode);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));return value;}
  function local(write,value,key){const job=storageChain.catch(()=>{}).then(async()=>{const d=await db,encoded=write?await encode(value):null;return new Promise((resolve,reject)=>{const t=d.transaction('drafts',write?'readwrite':'readonly'),r=write?t.objectStore('drafts').put(encoded,key):t.objectStore('drafts').get(key);t.oncomplete=()=>resolve(write?r.result:decode(r.result));t.onerror=t.onabort=()=>reject(t.error||Error('Local storage transaction aborted.'));});});storageChain=job;return job;}
  const pack=()=>({state,version,attempt,dirty,updatedAt:Date.now()});
  function persist(){if(!owner)return Promise.resolve();const key=owner+':'+tab,value=structuredClone(pack());return local(true,value,key).catch(()=>{status('Draft storage failed. Keep this page open and retry saving.');throw Error('Could not preserve draft on this device.');});}
  async function flush(){clearTimeout(timer);const g=generation;chain=chain.catch(()=>{}).then(async()=>{
    if(!owner||!dirty)return;if(conflict)throw Error('Your draft changed elsewhere. This copy is preserved locally; reload before saving.');
    await persist();
    while(dirty&&g===generation){const value=JSON.stringify(state,(key,value)=>key==='blob'?undefined:value);attempt ||= {value,expectedVersion:version,requestKey:crypto.randomUUID()};await persist();
      try{const next=await call('mutation','rentDrafts:save',attempt);if(g!==generation)return;version=next;const sent=attempt.value;attempt=null;dirty=JSON.stringify(state,(k,v)=>k==='blob'?undefined:v)!==sent;await persist();status(dirty?'Saving draft…':'Draft saved');}
      catch(e){if(g!==generation)return;if(/another tab|another device/.test(e.message))conflict=true;status(conflict?e.message:'Draft kept on this device. Sync failed; retry when connected.',conflict);throw e;}
    }
  });return chain;}
  return {
    async load(email){owner=email;const g=++generation;const [remote,cached]=await Promise.all([call('query','rentDrafts:get'),local(false,null,owner+':'+tab)]);if(g!==generation)return;
      version=remote?.version||0;state=remote?JSON.parse(remote.value):{};dirty=false;attempt=null;conflict=false;
      if(cached&&!cached.dirty&&cached.version===version&&JSON.stringify(cached.state,(k,v)=>k==='blob'?undefined:v)===(remote?.value||'{}'))state=cached.state;
      if(cached?.dirty){if(cached.attempt&&cached.attempt.requestKey===remote?.requestKey){state=cached.state;dirty=JSON.stringify(state,(k,v)=>k==='blob'?undefined:v)!==remote.value;}
        else {state=cached.state;attempt=cached.attempt;dirty=true;conflict=cached.version!==version;version=cached.version;}}
      if(conflict)status('A newer draft exists on another device. Choose which copy to continue; the other copy is retained on this device.',true);else if(dirty)void flush().catch(()=>{});
    },
    get:key=>state[key],
    set(key,value){if(!owner)return;state[key]=value;dirty=true;void persist().catch(()=>{});clearTimeout(timer);timer=setTimeout(()=>void flush().catch(()=>{}),400);},
    async resolve(useRemote){const remote=await call('query','rentDrafts:get');await local(true,{...pack(),remote},owner+':'+tab+':recovery:'+Date.now());version=remote?.version||0;attempt=null;conflict=false;if(useRemote){state=remote?JSON.parse(remote.value):{};dirty=false;await persist();status('Loaded saved draft');}else{dirty=true;await flush();}},
    flush,clear(){clearTimeout(timer);generation++;owner=null;state={};dirty=false;attempt=null;conflict=false;chain=Promise.resolve();},isDirty:()=>dirty,
  };
};
window.RentRoute = {
  read(){return Object.fromEntries(new URL(location.href).searchParams);},
  go(values,replace=false,silent=false){const u=new URL(location.href);for(const [k,v] of Object.entries(values))v===null||v===undefined?u.searchParams.delete(k):u.searchParams.set(k,v);if(u.href===location.href)return;history[replace?'replaceState':'pushState']({},'',u);if(!silent)window.dispatchEvent(new Event('rent-route'));},
  close(){this.go({view:null,payer:null,id:null});},
};
window.addEventListener('popstate',()=>window.dispatchEvent(new Event('rent-route')));
window.RentBackdrop=function(dialog,close){let outside=false,opener,openerLabel;
 const restore=()=>{const target=opener?.isConnected?opener:openerLabel?[...document.querySelectorAll('button[aria-label]')].find(n=>n.getAttribute('aria-label')===openerLabel):null;target?.focus();};
 dialog.addEventListener('pointerdown',e=>{const r=dialog.getBoundingClientRect();outside=e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);});dialog.addEventListener('pointerup',e=>{const r=dialog.getBoundingClientRect();if(outside&&e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))close();outside=false;});dialog.addEventListener('close',()=>{restore();window.rentRestoreFocus=restore;});return ()=>{if(!dialog.open){opener=document.activeElement;openerLabel=opener?.getAttribute('aria-label');}};};
