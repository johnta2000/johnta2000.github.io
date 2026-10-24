(() => {
  'use strict';
  window.PaymentQuestionShareLinks = { create({ call, prepare }) {
    const $=id=>document.getElementById(id),dialog=$('share-dialog');
    let target=null,generation=0,opening=false,pendingToken=null;
    const date=value=>new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    const url=token=>`${location.origin}/tools/payment/questions/shared/#${token}`;
    function reset(){generation++;target=null;opening=false;pendingToken=null;$('share-links').replaceChildren();$('share-note-title').textContent='';$('share-error').textContent='';$('share-create').disabled=false;if(dialog.open)dialog.close();}
    function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
    function button(text,fn){const b=node('button',text);b.type='button';b.onclick=fn;return b;}
    async function copy(input,b){
      try{await navigator.clipboard.writeText(input.value);b.textContent='Copied';}
      catch{input.focus();input.select();$('share-error').textContent='Select and copy the link above.';}
    }
    function render(links){
      $('share-links').replaceChildren();
      for(const link of links){
        const card=node('article');card.className='share-link';
        card.append(node('strong',`Expires ${date(link.expiresAt)}`));
        const input=node('input');input.type='text';input.readOnly=true;input.value=url(link.token);input.setAttribute('aria-label','Shared question link');input.addEventListener('focus',()=>input.select());card.append(input);
        const actions=node('div');actions.className='share-link-actions';
        const copyButton=button('Copy link',()=>void copy(input,copyButton));
        const preview=node('a','Open preview ↗');preview.href=input.value;preview.target='_blank';preview.rel='noopener noreferrer';
        const revoke=button('Disable link',async()=>{const current=generation;revoke.disabled=true;try{await call('mutation','revoke',{id:link._id});if(current!==generation)return;await load(current);$('share-error').textContent='Link disabled.';}catch{if(current===generation){revoke.disabled=false;$('share-error').textContent='Couldn’t disable this link. Try again.';}}});
        actions.append(copyButton,preview,revoke);card.append(actions);$('share-links').append(card);
      }
      if(!links.length)$('share-links').append(node('p','No active share links for this question.'));
    }
    async function load(current){const links=await call('query','list',{id:target});if(current===generation)render(links);}
    $('share-note').onclick=async()=>{
      if(opening)return;opening=true;const current=generation;
      try{const item=await prepare();if(!item||current!==generation)return;target=item._id;$('share-note-title').textContent=item.title;$('share-error').textContent='';dialog.showModal();$('share-create').disabled=true;await load(current);}
      catch{if(current===generation)$('share-error').textContent='Couldn’t load share links. Close and try again.';}
      finally{if(current===generation){opening=false;$('share-create').disabled=false;}}
    };
    $('share-create').onclick=async()=>{
      if(!target)return;const current=generation;$('share-create').disabled=true;$('share-error').textContent='Creating link…';
      if(!pendingToken){const bytes=crypto.getRandomValues(new Uint8Array(32));pendingToken=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
      try{await call('mutation','create',{id:target,token:pendingToken});if(current!==generation)return;await load(current);pendingToken=null;$('share-error').textContent='Link ready. Copy it below.';}
      catch{if(current===generation)$('share-error').textContent='Couldn’t create the link. Try again.';}
      finally{if(current===generation)$('share-create').disabled=false;}
    };
    $('share-close').onclick=reset;dialog.addEventListener('cancel',event=>{event.preventDefault();reset();});
    return {reset};
  } };
})();
