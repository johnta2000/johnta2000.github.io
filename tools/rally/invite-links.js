/* Shared invitations are saved by Raveington. Only unsent form drafts stay on-device,
   scoped to the signed-in account; URLs contain opaque record IDs, never drafts. */
(() => {
  let app, generation=0;
  const escape=value=>{const node=document.createElement('span');node.textContent=String(value??'');return node.innerHTML.replace(/"/g,'&quot;');};
  const route=()=>new URL(location.href);
  const owner=()=>window.Clerk?.user?.id;
  const root=()=>document.getElementById('dialogRoot');
  function editorUrl({method='link',memberId='',invitationId=''}={}){
    const url=route();url.searchParams.set('panel','invite');
    for(const key of ['method','member','invitation'])url.searchParams.delete(key);
    if(method==='email')url.searchParams.set('method','email');
    if(memberId)url.searchParams.set('member',memberId);
    if(invitationId)url.searchParams.set('invitation',invitationId);
    return url;
  }
  const href=url=>url.pathname+url.search+url.hash;
  function draftKey(method){return 'rally-invite-draft:'+owner()+':'+app.state()?.id+':'+method+':'+(route().searchParams.get('member')||'new');}
  function readDraft(method){try{return JSON.parse(localStorage.getItem(draftKey(method)))||{};}catch{return {};}}
  function writeDraft(method,value){try{localStorage.setItem(draftKey(method),JSON.stringify(value));}catch{app.toast('Device storage is unavailable. Keep this invitation open until you finish.');}}
  function clearDraft(method){try{localStorage.removeItem(draftKey(method));}catch{}}
  function tabs(method,memberId=''){
    return `<nav class="invite-methods" aria-label="Invitation method"><a href="${escape(href(editorUrl({memberId})))}" ${method==='link'?'aria-current="page"':''}>Share link</a><a href="${escape(href(editorUrl({method:'email',memberId})))}" ${method==='email'?'aria-current="page"':''}>Send email</a></nav>`;
  }
  function shareUrl(eventId,invitationId){
    const url=new URL('https://www.john-ta.com/tools/rally/');
    url.searchParams.set('event',eventId);url.searchParams.set('view','crew');url.searchParams.set('join',invitationId);return url.href;
  }
  function current(context){return owner()===context.owner&&app.state()?.id===context.eventId&&route().searchParams.get('event')===context.eventId&&route().searchParams.get('panel')==='invite'&&generation===context.generation;}
  async function open(member,{restore=false}={}){
    if(!app?.state()?.isAdmin)return app.toast('Only a project admin can invite crew.');
    if(app.offline())return app.toast('Reconnect to create or manage invitations.');
    if(!restore){const url=editorUrl({memberId:member?.id||''});history.pushState({},'',href(url));}
    const url=route(),context={owner:owner(),eventId:app.state().id,generation:++generation};
    const method=url.searchParams.get('method')==='email'?'email':'link',memberId=url.searchParams.get('member')||member?.id||'';
    const selected=app.state().members.find(person=>person.id===memberId);
    if(memberId&&!selected){app.dialog('Invite unavailable','This crew profile was removed. Refresh the crew list before inviting them.','',async()=>{});root().querySelector('[type=submit]').hidden=true;return;}
    if(method==='email'){
      await app.email(selected);
      if(!current(context))return;
      const form=root().querySelector('form');if(!form)return;
      form.insertAdjacentHTML('afterbegin',tabs('email',memberId));
      const draft=readDraft('email');
      if(!selected)for(const key of ['name','email','origin'])if(draft[key]&&!form.elements[key].value)form.elements[key].value=draft[key];
      form.addEventListener('input',()=>{history.replaceState({},'',href(editorUrl({method:'email',memberId:form.elements.memberId.value})));writeDraft('email',Object.fromEntries(new FormData(form)));});
      form.addEventListener('click',event=>{if(event.target.closest('[data-invite-profile],[data-invite-shared]')){history.pushState({},'',href(editorUrl({method:'email',memberId:form.elements.memberId.value})));writeDraft('email',Object.fromEntries(new FormData(form)));}});
      return;
    }
    const invitationId=url.searchParams.get('invitation');
    if(invitationId){
      app.dialog('Invite link','Loading your invitation…','',async()=>{});root().querySelector('[type=submit]').hidden=true;
      try{
        const invitations=await app.query('rallyInvites:list',{eventId:context.eventId});if(!current(context))return;
        const invitation=invitations.find(item=>item.id===invitationId);
        if(!invitation)throw Error('This invitation is not available.');
        const active=invitation.status==='active',url=shareUrl(context.eventId,invitation.id);
        app.dialog(invitation.name?'Invite '+escape(invitation.name):'Invite a friend',active?'Send this link by text, email, or DM. One friend can claim it after signing in.':'This invitation is '+invitation.status+'.',
          `<a class="invite-back" href="${escape(href(editorUrl()))}">← All invitations</a>${active?`<label class="field"><span>Invitation link</span><input class="invite-url" readonly aria-label="Invitation link" value="${escape(url)}"></label><div class="invite-share-actions"><button id="copyInviteLink" class="primary" type="button">Copy link</button><button id="shareInviteLink" class="secondary" type="button">Share…</button><a class="secondary" href="${escape('mailto:?subject='+encodeURIComponent('Join our Raveington crew')+'&body='+encodeURIComponent('Join our '+app.state().name+' crew on Raveington: '+url))}">Open email</a></div>`:''}<p class="invite-help">${active?'Expires '+escape(new Date(invitation.expiresAt).toLocaleString())+'. ':''}Revoking a link prevents future claims. It does not remove someone who has already joined.</p>${active?'<button id="revokeInviteLink" class="danger-button" type="button">Revoke link</button>':''}`,async()=>{});
        root().querySelector('[type=submit]').hidden=true;
        root().querySelector('.invite-url')?.addEventListener('click',event=>event.target.select());
        const copy=root().querySelector('#copyInviteLink');
        if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(url);if(copy.isConnected){copy.textContent='Copied';app.toast('Invite link copied');}}catch{root().querySelector('.invite-url')?.select();app.toast('Select and copy the invitation link above.');}};
        const share=root().querySelector('#shareInviteLink');
        if(share){share.hidden=!navigator.share;share.onclick=async()=>{try{await navigator.share({title:'Join our Raveington crew',text:'Join our '+app.state().name+' crew',url});}catch(error){if(error.name!=='AbortError')app.toast('Sharing is unavailable. Use Copy link instead.');}};}
        const revoke=root().querySelector('#revokeInviteLink');
        if(revoke)revoke.onclick=async()=>{if(revoke.disabled)return;revoke.disabled=true;try{await app.mutate('rallyInvites:revoke',{eventId:context.eventId,invitationId});if(!current(context))return;app.toast('Invite link revoked');await open(undefined,{restore:true});}catch(error){if(current(context)){app.toast(error.message||'Could not revoke this link.');revoke.disabled=false;}}};
      }catch(error){if(current(context)){app.dialog('Invite unavailable',escape(error.message||'Could not load the invitation.'),`<a class="secondary" href="${escape(href(editorUrl()))}">All invitations</a>`,async()=>{});root().querySelector('[type=submit]').hidden=true;}}
      return;
    }
    const draft=readDraft('link'),targetId=memberId,profiles=app.state().members.filter(person=>!['admin','leader'].includes(person.role)&&person.status!=='confirmed');
    const target=profiles.find(person=>person.id===targetId),draftOwner=owner(),draftEvent=app.state().id;
    app.dialog('Invite crew','Make a link for one friend. They’ll sign in to join, so you don’t need their email.',
      tabs('link',memberId)+app.select('Crew profile','memberId',[['','Someone new'],...profiles.map(person=>[person.id,person.name])],target?.id||'')+
      app.field('Friend’s name (optional)','name',target?.name||draft.name||'','text',false)+app.field('Home airport or city (optional)','origin',target?.origin==='TBD'?'':target?.origin||draft.origin||'','text',false)+
      '<p class="invite-help">One use · Expires in 7 days · You can revoke it anytime. Send each friend their own link.</p><section class="invite-recent" aria-label="Recent invitations"><h3>Recent invitations</h3><div id="inviteLinksList" aria-live="polite">Loading invitations…</div></section>',
      async values=>{
        const request=readDraft('link'),requestId=request.requestId||crypto.randomUUID();writeDraft('link',{...values,requestId});
        const result=await app.mutate('rallyInvites:create',{eventId:context.eventId,...values,requestId});
        if(!current(context))return;
        clearDraft('link');await app.navigate(editorUrl({invitationId:result.id}));
      });
    const form=root().querySelector('form');form.querySelector('[type=submit]').textContent='Create invite link';
    function syncProfile(){const person=profiles.find(person=>person.id===form.elements.memberId.value);form.elements.name.readOnly=!!person;if(person){form.elements.name.value=person.name;form.elements.origin.value=person.origin==='TBD'?'':person.origin||'';}}
    syncProfile();
    function saveDraft(){if(owner()!==draftOwner||app.state()?.id!==draftEvent)return;writeDraft('link',Object.fromEntries(new FormData(form)));}
    form.addEventListener('input',event=>{if(event.target!==form.elements.memberId)saveDraft();});form.elements.memberId.addEventListener('change',()=>{history.pushState({},'',href(editorUrl({memberId:form.elements.memberId.value})));if(!form.elements.memberId.value){const previous=readDraft('link');form.elements.name.value=previous.name||'';form.elements.origin.value=previous.origin||'';}syncProfile();saveDraft();});
    try{
      const invitations=await app.query('rallyInvites:list',{eventId:context.eventId});if(!current(context)||!form.isConnected)return;
      form.querySelector('#inviteLinksList').innerHTML=invitations.length?invitations.slice(0,20).map(invite=>`<a class="invite-list-item" href="${escape(href(editorUrl({invitationId:invite.id})))}"><strong>${escape(invite.name||'Friend invite')}</strong><span>${escape(invite.status)} · ${escape(new Date(invite.createdAt).toLocaleDateString())}</span></a>`).join(''):'No links yet. Your saved invitations will appear here.';
    }catch(error){if(current(context)&&form.isConnected)form.querySelector('#inviteLinksList').textContent='Could not load saved invitations. Refresh to try again.';}
  }
  async function join(){
    const url=route(),eventId=url.searchParams.get('event'),invitationId=url.searchParams.get('join'),signedInOwner=owner(),revision=++generation;
    const still=()=>owner()===signedInOwner&&route().searchParams.get('join')===invitationId&&route().searchParams.get('event')===eventId&&generation===revision;
    app.recovery('Join your crew','Checking your invitation…');
    const options=document.getElementById('authOptions');options.replaceChildren();
    try{
      if(!eventId||!invitationId)throw Error('This invitation is incomplete. Ask your friend to send it again.');
      const invitation=await app.query('rallyInvites:inspect',{eventId,invitationId});if(!still())return;
      document.getElementById('authTitle').textContent=invitation.alreadyMember?'You’re already in this crew':invitation.eventName;
      document.getElementById('authStatus').textContent=invitation.alreadyMember?'Open the project to see your crew’s plans.':`You’ve been invited${invitation.name?' as '+invitation.name:''}. Join to see the crew’s plans and add your own.`;
      const form=document.createElement('form');form.className='invite-claim';
      const nameKey='rally-join-draft:'+signedInOwner+':'+eventId+':'+invitationId;
      let fullName=window.Clerk?.user?.fullName||window.Clerk?.user?.firstName||invitation.name||'';
      try{fullName=localStorage.getItem(nameKey)||fullName;}catch{}
      form.innerHTML=(invitation.alreadyMember?'':app.field('Your name','name',fullName))+'<p class="invite-claim-error" role="alert" hidden></p><button class="primary" type="submit">'+(invitation.alreadyMember?'Open project':'Join crew')+'</button>';
      options.append(form);
      form.elements.name?.addEventListener('input',()=>{try{localStorage.setItem(nameKey,form.elements.name.value);}catch{}});
      form.onsubmit=async event=>{
        event.preventDefault();const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;
        const errorBox=form.querySelector('[role=alert]');errorBox.hidden=true;
        try{
          if(!invitation.alreadyMember)await app.action('rallyInvites:accept',{eventId,invitationId,name:form.elements.name.value});
          if(!still())return;
          try{localStorage.removeItem(nameKey);}catch{}
          const destination=route();destination.searchParams.delete('join');destination.searchParams.set('view','crew');
          await app.enter(destination);
        }catch(error){if(still()&&form.isConnected){errorBox.textContent=error.message||'Could not join. Please try again.';errorBox.hidden=false;button.disabled=false;}}
      };
    }catch(error){if(still()){document.getElementById('authTitle').textContent='Invitation unavailable';document.getElementById('authStatus').textContent=error.message||'Reconnect and open your invitation again.';options.innerHTML='<button class="secondary" type="button">Try again</button><a class="secondary" href="/tools/rally/">My Raveington rooms</a>';options.querySelector('button').onclick=()=>join();}}
  }
  window.RallyInvites={
    configure(hooks){app=hooks;},open,join,shareUrl,clearEmailDraft(){clearDraft('email');},
    restore(){if(route().searchParams.get('panel')==='invite')return open(undefined,{restore:true});},
    dismiss({preserveRoute=false}={}){if(preserveRoute)return;generation++;const url=route();if(url.searchParams.get('panel')!=='invite')return;for(const key of ['panel','method','member','invitation'])url.searchParams.delete(key);history.pushState({},'',href(url));},
  };
})();
