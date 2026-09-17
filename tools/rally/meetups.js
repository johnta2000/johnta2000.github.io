/* Shared map UI for the website and the bundled iPhone app. No GPS or tracking. */
(() => {
  const MAP = '/tools/rally/assets/lost-lands-2026-map.png';
  const LANDMARKS = [
    {name:'Festival entrance',x:.472,y:.736},
    {name:'Official merch near entrance',x:.504,y:.773},
    {name:'Water refill near The Crater',x:.555,y:.565},
    {name:'Water refill near Wompy Woods',x:.780,y:.488},
    {name:'Safe Haven',x:.401,y:.463},
    {name:'Water refill near Forest Stage',x:.552,y:.262},
  ];
  let cleanup = () => {};
  const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const coordinates = (x,y,rect) => ({x:Math.max(0,Math.min(1,(x-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(y-rect.top)/rect.height))});
  const eventNow = () => {
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  function timeLabel(when) {
    const [date,time]=when.split('T'),[hour,minute]=time.split(':').map(Number);
    const day=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00Z`));
    return `${day} · ${hour%12||12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'} EDT`;
  }
  const meetupUrl = (eventId,id) => `/tools/rally/?view=meetups&event=${encodeURIComponent(eventId)}&focus=${encodeURIComponent(id)}`;
  function mapMarkup(picker=false) {
    return `<div class="meetup-map"><div class="map-toolbar"><span>${picker?'Tap the map to place your pin':'2026 festival map'}</span><div><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="reset">Fit</button><button type="button" data-zoom="in" aria-label="Zoom in">＋</button></div></div><div class="map-viewport" tabindex="0" aria-label="Festival map. Use zoom buttons and scroll to explore."><div class="map-stage"><img src="${MAP}" alt="Lost Lands 2026 festival map with stages, entrance, water refills and amenities" width="1080" height="1266" draggable="false"><div class="map-pins"></div></div></div><p class="map-error" role="status" hidden>Map unavailable. Reconnect to load it. Saved meetup descriptions are still below.</p><p class="map-caption">User-provided festival map · Pins are approximate, not GPS. ${picker?'Name the exact side or landmark below.':'Use the written meeting instructions too.'}</p></div>`;
  }
  function setupMap(root, onPick) {
    const viewport=root.querySelector('.map-viewport'), stage=root.querySelector('.map-stage');
    let zoom=1,down=null;
    root.querySelectorAll('[data-zoom]').forEach(button=>button.onclick=()=>{
      const before=stage.getBoundingClientRect(), cx=(viewport.scrollLeft+viewport.clientWidth/2)/before.width,cy=(viewport.scrollTop+viewport.clientHeight/2)/before.height;
      zoom=button.dataset.zoom==='reset'?1:Math.max(1,Math.min(3,zoom+(button.dataset.zoom==='in'?.5:-.5)));
      stage.style.width=`${zoom*100}%`;
      const after=stage.getBoundingClientRect();
      viewport.scrollLeft=zoom===1?0:cx*after.width-viewport.clientWidth/2;
      viewport.scrollTop=zoom===1?0:cy*after.height-viewport.clientHeight/2;
      root.querySelector('[data-zoom="out"]').disabled=zoom===1;root.querySelector('[data-zoom="in"]').disabled=zoom===3;
    });
    root.querySelector('[data-zoom="out"]').disabled=true;
    const img=root.querySelector('img');img.ondragstart=event=>event.preventDefault();
    img.onerror=()=>{root.querySelector('.map-error').hidden=false;stage.classList.add('map-unavailable');};
    img.onload=()=>{root.querySelector('.map-error').hidden=true;stage.classList.remove('map-unavailable');};
    if(img.complete&&!img.naturalWidth)img.onerror();
    if(onPick){
      stage.addEventListener('pointerdown',event=>{down=event.isPrimary&&event.button===0?{x:event.clientX,y:event.clientY,id:event.pointerId}:null;});
      stage.addEventListener('pointercancel',()=>down=null);
      stage.addEventListener('pointerup',event=>{
        if(down&&down.id===event.pointerId&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<8&&img.naturalWidth&&!event.target.closest('button'))onPick(coordinates(event.clientX,event.clientY,stage.getBoundingClientRect()));
        down=null;
      });
    }
  }
  function cards(room,selected,offline) {
    const members=Object.fromEntries(room.members.map(member=>[member.id,member]));
    const plans=[...(room.meetups||[])].sort((a,b)=>(a.status==='cancelled')-(b.status==='cancelled')||a.when.localeCompare(b.when));
    return plans.map(meetup=>{
      const own=meetup.authorId===room.currentMemberId,canEdit=own||room.isAdmin,joined=meetup.goingIds.includes(room.currentMemberId),cancelled=meetup.status==='cancelled';
      const people=meetup.goingIds.filter(id=>members[id]).map(id=>members[id].name);
      const number=(room.meetups||[]).indexOf(meetup)+1;
      return `<article class="meetup-card${selected===meetup.id?' selected':''}${cancelled?' cancelled':''}" data-meetup-id="${esc(meetup.id)}"><header><span class="meetup-number">${number}</span><div><p class="meetup-time">${esc(timeLabel(meetup.when))}</p><h3>${esc(meetup.title)}</h3></div>${cancelled?'<span class="meetup-status">Cancelled</span>':meetup.when<eventNow()?'<span class="meetup-status">Past</span>':''}</header><p class="meetup-spot">⌖ ${esc(meetup.spot)}</p>${meetup.instructions?`<p class="meetup-instructions">${esc(meetup.instructions)}</p>`:''}<p class="meetup-organizer">Organized by ${esc(members[meetup.authorId]?.name||meetup.authorName)}</p><p class="meetup-going"><strong>${people.length} joining</strong>${people.length?` · ${people.map(esc).join(', ')}`:''}</p><footer><button type="button" data-meetup-map="${esc(meetup.id)}">Show pin</button><a href="${meetupUrl(room.id,meetup.id)}" data-meetup-copy="${esc(meetup.id)}">Copy link</a>${!cancelled?`<button type="button" data-meetup-join="${esc(meetup.id)}" aria-pressed="${joined}" ${offline?'disabled':''}>${joined?'✓ Joining':'I’m joining'}</button>`:''}${canEdit?`<button type="button" data-meetup-edit="${esc(meetup.id)}" ${offline?'disabled':''}>Edit</button>`:''}</footer></article>`;
    }).join('')||'<div class="meetups-empty"><h2>Pick a spot. Find your crew.</h2><p>Create your first meetup with a map pin, a time, and a landmark everyone can recognize.</p></div>';
  }
  function mount(ctx) {
    cleanup();
    let room=ctx.room,selected=new URLSearchParams(location.search).get('focus'),editor=null,alive=true,busy=false;
    const host=ctx.root,eventId=room.id;
    const current=()=>alive&&host.querySelector('#meetupList');
    cleanup=()=>{alive=false;editor?.close();window.removeEventListener('offline',connectivity);window.removeEventListener('online',connectivity);};
    host.innerHTML=`<header class="page-heading"><div><span class="eyebrow">Find your crew</span><h1>Meetups</h1><p>A place, a time, and a plan. All times are Eastern.</p></div><button class="primary" id="newMeetup">＋ New meetup</button></header><div class="meetups-layout"><section class="meetup-map-panel" aria-label="Meeting locations">${mapMarkup()}</section><section class="meetups-plans"><div class="meetups-list-heading"><h2>The plan</h2><button type="button" id="refreshMeetups">Refresh</button></div><p id="meetupSync" class="meetup-sync" role="status"></p><div id="meetupList"></div></section></div>`;
    if(eventId!=='lost-lands-2026'){host.innerHTML='<div class="empty">Meetups with a festival map are available in the Lost Lands 2026 project.</div>';return;}
    setupMap(host.querySelector('.meetup-map'));
    function connectivity(){
      if(!current())return;
      host.querySelector('#newMeetup').disabled=ctx.offline()||busy;host.querySelector('#refreshMeetups').disabled=ctx.offline()||busy;
      host.querySelectorAll('[data-meetup-join],[data-meetup-edit]').forEach(button=>button.disabled=ctx.offline()||busy);
      host.querySelector('#meetupSync').textContent=ctx.offline()?'Offline · Saved plans only. Changes and joining need internet.':'Refresh for the latest plan. This is not live location or a notification service.';
      if(editor)editor.querySelector('[type="submit"]').disabled=ctx.offline()||busy;
    }
    window.addEventListener('offline',connectivity);
    window.addEventListener('online',connectivity);
    function select(id,fromMap=false){
      selected=id;draw();
      const meetup=(room.meetups||[]).find(item=>item.id===id);if(!meetup)return;
      const viewport=host.querySelector('.map-viewport'),stage=host.querySelector('.map-stage');
      viewport.scrollLeft=meetup.x*stage.clientWidth-viewport.clientWidth/2;viewport.scrollTop=meetup.y*stage.clientHeight-viewport.clientHeight/2;
      const target=fromMap?[...host.querySelectorAll('[data-meetup-id]')].find(node=>node.dataset.meetupId===id):host.querySelector('.meetup-map-panel');
      target?.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
    function draw(){
      if(!current())return;
      host.querySelector('#meetupList').innerHTML=cards(room,selected,ctx.offline());
      host.querySelector('.map-pins').innerHTML=(room.meetups||[]).map((meetup,index)=>meetup.status==='cancelled'&&selected!==meetup.id?'':`<button class="meetup-pin${selected===meetup.id?' selected':''}${meetup.status==='cancelled'?' cancelled':''}" type="button" data-map-pin="${esc(meetup.id)}" style="left:${meetup.x*100}%;top:${meetup.y*100}%" aria-label="${esc(meetup.title)} at ${esc(meetup.spot)}">${index+1}</button>`).join('');
      host.querySelectorAll('[data-map-pin]').forEach(button=>button.onclick=()=>select(button.dataset.mapPin,true));
      host.querySelectorAll('[data-meetup-map]').forEach(button=>button.onclick=()=>select(button.dataset.meetupMap));
      host.querySelectorAll('[data-meetup-edit]').forEach(button=>button.onclick=()=>openEditor((room.meetups||[]).find(item=>item.id===button.dataset.meetupEdit)));
      host.querySelectorAll('[data-meetup-join]').forEach(button=>button.onclick=async()=>{
        const meetup=room.meetups.find(item=>item.id===button.dataset.meetupJoin);
        try{await mutate('join-meetup',{id:meetup.id,going:!meetup.goingIds.includes(room.currentMemberId)});}catch(error){ctx.toast(error.message);}
      });
      host.querySelectorAll('[data-meetup-copy]').forEach(link=>link.onclick=async event=>{
        if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
        event.preventDefault();const url=`https://www.john-ta.com${meetupUrl(eventId,link.dataset.meetupCopy)}`;
        try{await navigator.clipboard.writeText(url);ctx.toast('Meetup link copied. Only project members can open it.');}
        catch{
          const footer=link.parentElement,input=footer.querySelector('.meetup-copy-input')||document.createElement('input');
          input.className='meetup-copy-input';input.value=url;input.readOnly=true;input.setAttribute('aria-label','Meetup link. Only project members can open it.');
          footer.append(input);input.focus();input.select();ctx.toast('Select and copy this link to share with your crew.');
        }
      });
      connectivity();
    }
    async function mutate(action,payload){
      if(ctx.offline())throw new Error('Reconnect to change this meetup.');
      if(busy)throw new Error('A change is already saving.');
      busy=true;connectivity();
      try{const updated=await ctx.mutate(action,payload);if(current()){room=updated;draw();}return updated;}
      finally{busy=false;connectivity();}
    }
    async function refresh(){
      if(busy||ctx.offline())return;
      let failed=false;
      busy=true;connectivity();host.querySelector('#refreshMeetups').disabled=true;
      host.querySelector('#meetupSync').textContent='Refreshing meetups…';
      try{const updated=await ctx.query();if(current()){room=updated;draw();}}
      catch{failed=true;}
      finally{busy=false;connectivity();if(failed&&current())host.querySelector('#meetupSync').textContent='Could not refresh. These plans may be out of date.';}
    }
    function openEditor(meetup){
      if(ctx.offline())return ctx.toast('Reconnect to create or edit meetups.');
      let point=meetup?{x:meetup.x,y:meetup.y}:null;
      const date=eventNow().slice(0,10),initialDate=date>='2026-09-16'&&date<='2026-09-21'?date:'2026-09-18';
      editor=document.createElement('dialog');const dialog=editor;
      dialog.className='meetup-dialog';dialog.setAttribute('aria-labelledby','meetupEditorTitle');
      dialog.innerHTML=`<header><div><span class="eyebrow">Lost Lands 2026</span><h2 id="meetupEditorTitle">${meetup?'Edit meetup':'New meetup'}</h2></div><button type="button" data-close aria-label="Close meetup editor">×</button></header><form><div class="meetup-editor-layout"><div>${mapMarkup(true)}<fieldset class="meetup-landmarks"><legend>Start near a landmark</legend>${LANDMARKS.map((landmark,index)=>`<button type="button" data-landmark="${index}">${esc(landmark.name)}</button>`).join('')}</fieldset><p class="pin-status" role="status">${point?'Pin saved · tap map to move it':'Choose a landmark or tap the map'}</p></div><div class="meetup-fields"><label>Meetup name<input name="title" maxlength="100" required placeholder="Regroup before Excision" value="${esc(meetup?.title||'')}"></label><label>When · Eastern time (EDT)<input name="when" type="datetime-local" min="2026-09-16T00:00" max="2026-09-21T23:59" required value="${esc(meetup?.when||initialDate+'T18:00')}"></label><small>After midnight? Use the next calendar date.</small><label>Meeting spot<input name="spot" maxlength="160" required placeholder="Left side of the water refill station" value="${esc(meetup?.spot||'')}"></label><label>How to find us<textarea name="instructions" maxlength="1200" rows="4" placeholder="Look for our totem. Wait 10 minutes if someone is late.">${esc(meetup?.instructions||'')}</textarea></label>${meetup?`<fieldset class="meetup-status-picker"><legend>Plan status</legend><label><input type="radio" name="status" value="planned" ${meetup.status==='planned'?'checked':''}> Planned</label><label><input type="radio" name="status" value="cancelled" ${meetup.status==='cancelled'?'checked':''}> Cancelled</label></fieldset>`:''}<p class="meetup-editor-help">Shared with this project’s crew. Your pin is approximate—agree on an unmistakable landmark. Updates won’t reach people who are offline.</p><p class="meetup-form-error" role="alert" hidden></p><footer><button type="submit" class="primary">${meetup?'Save changes':'Create meetup'}</button>${meetup?'<button type="button" class="danger-button" data-delete>Delete meetup</button>':''}</footer></div></div></form>`;
      document.body.append(dialog);dialog.showModal();
      const form=dialog.querySelector('form'),map=dialog.querySelector('.meetup-map');
      const setPin=value=>{point=value;map.querySelector('.map-pins').innerHTML=`<span class="meetup-pin draft-pin" style="left:${point.x*100}%;top:${point.y*100}%" aria-label="Selected meeting point">●</span>`;dialog.querySelector('.pin-status').textContent='Pin selected · tap map to adjust';};
      setupMap(map,setPin);if(point)setPin(point);
      dialog.querySelectorAll('[data-landmark]').forEach(button=>button.onclick=()=>{const landmark=LANDMARKS[Number(button.dataset.landmark)];setPin({x:landmark.x,y:landmark.y});form.elements.spot.value=`Near ${landmark.name}`;});
      dialog.querySelector('[data-close]').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>{dialog.remove();if(editor===dialog)editor=null;},{once:true});
      const error=dialog.querySelector('.meetup-form-error'),submit=dialog.querySelector('[type="submit"]');
      form.onsubmit=async event=>{
        event.preventDefault();error.hidden=true;
        if(!point){error.textContent='Choose a landmark or tap the map to add a pin.';error.hidden=false;return;}
        const values=Object.fromEntries(new FormData(form));submit.disabled=true;
        try{await mutate(meetup?'edit-meetup':'add-meetup',{...values,...point,...(meetup?{id:meetup.id,expectedUpdatedAt:meetup.updatedAt}:{})});dialog.close();ctx.toast(meetup?'Meetup updated':'Meetup created. You’re marked as joining.');}
        catch(reason){error.textContent=reason.message||'Could not save. Your draft is still here.';error.hidden=false;}
        finally{submit.disabled=ctx.offline();}
      };
      const remove=dialog.querySelector('[data-delete]');
      if(remove)remove.onclick=async()=>{
        if(!confirm('Delete this meetup for everyone? This cannot be undone.'))return;
        remove.disabled=true;
        try{await mutate('delete-meetup',{id:meetup.id,expectedUpdatedAt:meetup.updatedAt});dialog.close();ctx.toast('Meetup deleted');}
        catch(reason){error.textContent=reason.message;error.hidden=false;}finally{remove.disabled=ctx.offline();}
      };
    }
    host.querySelector('#newMeetup').onclick=()=>openEditor();host.querySelector('#refreshMeetups').onclick=refresh;
    draw();if(selected)select(selected,true);if(!ctx.offline())void refresh();
  }
  window.RallyMeetups={mount,unmount:()=>cleanup(),coordinates,timeLabel,cards,mapMarkup,LANDMARKS,MAP};
})();
