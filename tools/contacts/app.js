(() => {
  'use strict';
  const API='https://rapid-shark-565.convex.site/contact-share';
  const $=id=>document.getElementById(id),group=location.pathname.split('/').filter(Boolean).at(-1);
  let contacts=[],selected=new Set(),expiresAt=0,deadline=0,expiryTimer,busy=false,generation=0;
  const date=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function unavailable(expired=false){generation++;clearTimeout(expiryTimer);contacts=[];selected.clear();expiresAt=0;deadline=0;$('content').hidden=true;$('list').replaceChildren();$('expiry').textContent='';$('notice').hidden=false;$('notice-title').textContent=expired?'This link has expired':'Contacts unavailable';$('notice-body').textContent=expired?'The contact list and downloads are no longer available.':'Check your connection and try again, or ask John for a new link.';$('retry').hidden=expired;$('status').textContent='';}
  async function request(action,ids){
    const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({group,action,...(ids?{ids}:{})}),cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!res.ok){if(res.status===410||res.status===404)unavailable(res.status===410);throw Error(res.status===410?'This contact link has expired.':'Couldn’t load the contacts. Please try again.');}
    return res;
  }
  function restore(){const raw=new URL(location.href).searchParams.get('pick')||'';selected=new Set(raw.split(',').filter(id=>contacts.some(c=>c.id===id)));sync();}
  function updateUrl(){const url=new URL(location.href);const ids=contacts.filter(c=>selected.has(c.id)).map(c=>c.id);if(ids.length)url.searchParams.set('pick',ids.join(','));else url.searchParams.delete('pick');history.pushState(null,'',url);sync();}
  function sync(){for(const input of $('list').querySelectorAll('input'))input.checked=selected.has(input.value);$('selected').textContent=`Download selected (${selected.size})`;$('selected').disabled=busy||!selected.size;$('everyone').disabled=busy;for(const b of $('list').querySelectorAll('button'))b.disabled=busy;}
  function phone(value){const n=value.replace(/\D/g,'');return n.length===11?`+${n[0]} (${n.slice(1,4)}) ${n.slice(4,7)}-${n.slice(7)}`:value;}
  function render(){
    $('list').replaceChildren();
    for(const c of contacts){const li=el('li'),label=el('label'),input=el('input'),avatar=el('span'),copy=el('span'),name=[c.first,c.last].filter(Boolean).join(' '),save=el('button','Save');
      li.className='contact';label.className='person';input.type='checkbox';input.value=c.id;input.setAttribute('aria-label',`Select ${name}`);input.onchange=()=>{input.checked?selected.add(c.id):selected.delete(c.id);updateUrl();};
      avatar.className='avatar';avatar.textContent=(c.first[0]+(c.last[0]||'')).toUpperCase();avatar.setAttribute('aria-hidden','true');copy.className='person-copy';const n=el('span',name),p=el('span',phone(c.phone));n.className='name';p.className='phone';copy.append(n,p);label.append(input,avatar,copy);save.type='button';save.className='save';save.setAttribute('aria-label',`Save ${name}`);save.onclick=()=>void download([c.id],name);li.append(label,save);$('list').append(li);
    }
    $('count').textContent=`${contacts.length} people`;$('content').hidden=false;$('notice').hidden=true;restore();
  }
  async function load(){
    const current=++generation;$('status').textContent='Loading contacts…';$('retry').disabled=true;
    const started=performance.now();
    try{const data=await(await request('view')).json();if(current!==generation)return;
      const remaining=data.expiresAt-data.serverNow-(performance.now()-started);if(!Number.isFinite(remaining)||remaining<=0){unavailable(true);return;}
      contacts=data.contacts;expiresAt=data.expiresAt;deadline=performance.now()+remaining;clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>unavailable(true),remaining);render();$('expiry').textContent=`Available until ${date.format(new Date(expiresAt))}`;$('status').textContent='';
    }catch{if(current===generation)unavailable(false);}finally{$('retry').disabled=false;}
  }
  async function download(ids,name){
    if(busy)return;if(performance.now()>=deadline){unavailable(true);return;}busy=true;sync();$('status').textContent='Preparing your contact file…';
    try{const res=await request('download',ids),blob=await res.blob();if(performance.now()>=deadline){unavailable(true);return;}const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name?`${name.replace(/\s+/g,'-')}.vcf`:'decadence-contacts.vcf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent='Contact file ready. Open it to add the contacts.';
    }catch{if(contacts.length)$('status').textContent='Couldn’t download the contacts. Check your connection and try again.';}finally{busy=false;sync();}
  }
  $('everyone').onclick=()=>void download('all');$('selected').onclick=()=>void download([...selected]);
  $('select-all').onclick=()=>{selected=new Set(contacts.map(c=>c.id));updateUrl();};$('clear').onclick=()=>{selected.clear();updateUrl();};$('retry').onclick=()=>void load();
  addEventListener('popstate',restore);
  addEventListener('pageshow',e=>{if(e.persisted){$('content').hidden=true;$('list').replaceChildren();void load();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(deadline&&performance.now()>=deadline)unavailable(true);else void load();}});
  if(/^[a-f0-9]{32}$/.test(group))void load();else unavailable();
})();
