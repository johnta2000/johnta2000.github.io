(() => {
  'use strict';
  const $=id=>document.getElementById(id),token=location.hash.slice(1),API='https://rapid-shark-565.convex.site/payment-question-share',FILE='https://rapid-shark-565.convex.site/payment-question-share-file';
  const stages={open:'Inbox',waiting:'Waiting',resolved:'Done'},urls=new Set();
  let generation=0,loading=false,expireTimer,lastContent='',remainingUntil=0;
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function clear(){generation++;clearTimeout(expireTimer);remainingUntil=0;lastContent='';urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();$('question').hidden=true;$('footer').hidden=true;$('title').textContent='';$('body').replaceChildren();$('screenshots').replaceChildren();$('fields').replaceChildren();$('stage').textContent='';$('expires').textContent='';$('updated').textContent='';$('image-dialog').close();$('full-image').removeAttribute('src');document.title='Shared payment question';}
  function unavailable(message='This link has expired or been disabled. Ask the sender for a new link.'){clear();$('status').textContent=message;$('retry').hidden=false;}
  function safeLink(href){if(typeof href!=='string'||href.length>2000||/[\u0000-\u0020\u007f]/.test(href))return '';try{const u=new URL(href);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:'';}catch{return '';}}
  function rich(nodes,parent,depth=0){if(!Array.isArray(nodes)||depth>12)return;for(const n of nodes){if(n.type==='text'){parent.append(document.createTextNode(typeof n.text==='string'?n.text:''));continue;}if(n.type==='br'){parent.append(node('br'));continue;}if(!['p','strong','em','u','ul','ol','li','a'].includes(n.type))continue;const el=node(n.type);if(n.type==='a'){const href=safeLink(n.href);if(href){el.href=href;el.target='_blank';el.rel='noopener noreferrer';}}rich(n.children,el,depth+1);parent.append(el);}}
  async function image(file,placeholder,current){
    try{const res=await fetch(`${FILE}?id=${encodeURIComponent(file._id)}`,{headers:{'X-Payment-Share-Token':token},cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!res.ok){if(res.status===404&&current===generation)unavailable();throw Error('Image unavailable');}
      const blob=await res.blob();if(current!==generation||!placeholder.isConnected)return;
      if(performance.now()>=remainingUntil){unavailable();return;}
      const url=URL.createObjectURL(blob);urls.add(url);const figure=node('figure'),preview=node('button'),img=node('img');preview.type='button';preview.setAttribute('aria-label',`Enlarge ${file.name}`);img.src=url;img.alt=file.name;preview.append(img);preview.onclick=()=>{if(performance.now()>=remainingUntil){unavailable();return;}$('full-image').src=url;$('image-dialog').showModal();};figure.append(preview,node('figcaption',file.name));placeholder.replaceWith(figure);
    }catch{if(current===generation&&placeholder.isConnected){const retry=node('button','Retry screenshot');retry.type='button';retry.onclick=()=>void image(file,placeholder,current);placeholder.replaceChildren(retry);}}
  }
  function render(data){
    urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();$('image-dialog').close();$('full-image').removeAttribute('src');const current=++generation,item=data.item;
    $('title').textContent=item.title;document.title=`${item.title} — Shared payment question`;$('stage').textContent=stages[item.status]||'Note';$('updated').textContent=`Updated ${new Date(item.updatedAt).toLocaleString()}`;
    $('body').replaceChildren();if(Array.isArray(item.richText))rich(item.richText,$('body'));else $('body').textContent=item.context||'';
    $('screenshots').replaceChildren();for(const file of data.files){const placeholder=node('div','Loading screenshot…');placeholder.className='image-loading';$('screenshots').append(placeholder);void image(file,placeholder,current);}
    const money=n=>(n/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
    const fields=[['Charge',item.amountCents==null?'':money(item.amountCents)],['Transaction date',item.transactionDate],['Cardholder',item.cardholder],['Card',item.card],['Who owes',item.payer],['Who gets paid',item.payee],['Expected',item.expectedCents==null?'':money(item.expectedCents)],['Received',item.receivedCents?money(item.receivedCents):''],['Follow-up',item.followUp]].filter(([,v])=>v);
    $('details').hidden=!fields.length;$('fields').replaceChildren();for(const [k,v]of fields)$('fields').append(node('dt',k),node('dd',v));
    $('question').hidden=false;$('footer').hidden=false;
  }
  async function load(){
    if(loading)return;if(!/^[A-Za-z0-9_-]{43}$/.test(token)){unavailable();return;}loading=true;const current=generation;
    try{const res=await fetch(API,{cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'X-Payment-Share-Token':token}});const result=await res.json();if(current!==generation)return;if(!res.ok||result.status!=='success'){unavailable();return;}
      const data=result.value,remaining=data.expiresAt-data.serverNow;if(!Number.isFinite(remaining)||remaining<=0){unavailable();return;}remainingUntil=performance.now()+remaining;clearTimeout(expireTimer);expireTimer=setTimeout(()=>unavailable(),remaining);
      const content=JSON.stringify([data.item,data.files]);if(content!==lastContent){render(data);lastContent=content;}$('expires').textContent=`Link expires ${new Date(data.expiresAt).toLocaleString()}`;$('status').textContent='';$('retry').hidden=true;
    }catch{if(current===generation)unavailable('Couldn’t load this shared question. Check your connection and try again.');}
    finally{loading=false;}
  }
  $('close-image').onclick=()=>$('image-dialog').close();$('retry').onclick=()=>void load();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(remainingUntil&&performance.now()>=remainingUntil)unavailable();void load();}});
  window.addEventListener('pageshow',e=>{if(e.persisted){clear();void load();}});
  setInterval(()=>{if(!document.hidden)void load();},30000);void load();
})();
