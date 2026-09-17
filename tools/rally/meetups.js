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
  function linkedSetMarkup(meetup,eventId){
    if(!meetup.timing?.sets?.length)return '';
    return `<div class="meetup-linked-sets"><strong>${esc(meetup.timing.label)}</strong>${meetup.timing.sets.map(set=>`<a href="/tools/rally/?view=lineup&event=${encodeURIComponent(eventId)}&focus=${encodeURIComponent(set.id)}&find=${encodeURIComponent(set.artist)}&day=${encodeURIComponent(set.day)}">${esc(set.artist)}<span>${esc(set.stage)} · ${esc(timeLabel(set.start))}</span></a>`).join('')}</div>`;
  }
  function mapMarkup(picker=false) {
    return `<div class="meetup-map"><div class="map-toolbar"><span>${picker?'Explore, then place your pin':'2026 festival map'}</span><div><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="reset">Fit</button><button type="button" data-zoom="in" aria-label="Zoom in">＋</button></div></div>${picker?'<button type="button" class="map-place" aria-pressed="false">Place pin</button>':''}<div class="map-viewport" tabindex="0" aria-label="Festival map. Use zoom buttons and scroll to explore."><div class="map-stage"><img src="${MAP}" alt="Lost Lands 2026 festival map with stages, entrance, water refills and amenities" width="1080" height="1266" draggable="false"><div class="map-pins"></div></div></div><p class="map-error" role="status" hidden>Map unavailable. Reconnect to load it. Saved meetup descriptions are still below.</p><p class="map-caption">Pins are approximate, not GPS. ${picker?'Use Place pin, then tap once. Scrolling won’t move your pin.':'Use the written meeting instructions too.'}</p></div>`;
  }
  function setupMap(root, onPick) {
    const viewport=root.querySelector('.map-viewport'), stage=root.querySelector('.map-stage');
    let zoom=1,down=null,placing=false;
    const place=root.querySelector('.map-place');
    const placement=value=>{placing=value;if(place){place.setAttribute('aria-pressed',String(value));place.textContent=value?'Tap map to place · Cancel':'Place pin';}stage.classList.toggle('placing-pin',value);};
    if(place)place.onclick=()=>placement(!placing);
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
      stage.addEventListener('pointerdown',event=>{down=placing&&event.isPrimary&&event.button===0?{x:event.clientX,y:event.clientY,id:event.pointerId}:null;});
      stage.addEventListener('pointercancel',()=>down=null);
      stage.addEventListener('pointerup',event=>{
        if(down&&down.id===event.pointerId&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<8&&img.naturalWidth&&!event.target.closest('button')){onPick(coordinates(event.clientX,event.clientY,stage.getBoundingClientRect()));placement(false);}
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
      return `<article class="meetup-card${selected===meetup.id?' selected':''}${cancelled?' cancelled':''}" data-meetup-id="${esc(meetup.id)}"><header><span class="meetup-number">${number}</span><div><p class="meetup-time">${esc(timeLabel(meetup.when))}</p><h3>${esc(meetup.title)}</h3></div>${cancelled?'<span class="meetup-status">Cancelled</span>':meetup.when<eventNow()?'<span class="meetup-status">Past</span>':''}</header>${linkedSetMarkup(meetup,room.id)}<p class="meetup-spot">⌖ ${esc(meetup.spot)}</p>${meetup.instructions?`<p class="meetup-instructions">${esc(meetup.instructions)}</p>`:''}<p class="meetup-organizer">Organized by ${esc(members[meetup.authorId]?.name||meetup.authorName)}</p><p class="meetup-going"><strong>${people.length} joining</strong>${people.length?` · ${people.map(esc).join(', ')}`:''}</p><footer><button type="button" data-meetup-map="${esc(meetup.id)}">Show pin</button><a href="${meetupUrl(room.id,meetup.id)}" data-meetup-copy="${esc(meetup.id)}">Copy link</a>${!cancelled?`<button type="button" data-meetup-join="${esc(meetup.id)}" aria-pressed="${joined}" ${offline?'disabled':''}>${joined?'✓ Joining':'I’m joining'}</button>`:''}${canEdit?`<button type="button" data-meetup-edit="${esc(meetup.id)}" ${offline?'disabled':''}>Edit</button>`:''}</footer></article>`;
    }).join('')||'<div class="meetups-empty"><h2>Pick a spot. Find your crew.</h2><p>Create your first meetup with a map pin, a time, and a landmark everyone can recognize.</p></div>';
  }
  function mount(ctx) {
    cleanup();
    let room=ctx.room,selected=new URLSearchParams(location.search).get('focus'),editor=null,alive=true,busy=false,refreshing=false,revision=0;
    const host=ctx.root,eventId=room.id;
    const current=()=>alive&&host.querySelector('#meetupList');
    cleanup=()=>{alive=false;editor?.close();window.removeEventListener('offline',connectivity);window.removeEventListener('online',connectivity);};
    host.innerHTML=`<header class="page-heading"><div><span class="eyebrow">Find your crew</span><h1>Meetups</h1><p>A place, a time, and a plan. All times are Eastern.</p></div><button class="primary" id="newMeetup">＋ New meetup</button></header><div class="meetups-layout"><details class="meetup-map-panel" open><summary>Festival map <span>Explore meeting spots</span></summary>${mapMarkup()}</details><section class="meetups-plans"><div class="meetups-list-heading"><h2>The plan</h2><button type="button" id="refreshMeetups">Refresh</button></div><p id="meetupSync" class="meetup-sync" role="status"></p><div id="meetupList"></div></section></div>`;
    if(eventId!=='lost-lands-2026'){host.innerHTML='<div class="empty">Meetups with a festival map are available in the Lost Lands 2026 project.</div>';return;}
    setupMap(host.querySelector('.meetup-map'));
    if(matchMedia('(max-width:760px)').matches)host.querySelector('.meetup-map-panel').open=false;
    function connectivity(){
      if(!current())return;
      host.querySelector('#newMeetup').disabled=ctx.offline()||busy;host.querySelector('#refreshMeetups').disabled=ctx.offline()||busy||refreshing;
      host.querySelectorAll('[data-meetup-join],[data-meetup-edit]').forEach(button=>button.disabled=ctx.offline()||busy);
      host.querySelector('#meetupSync').textContent=ctx.offline()?'Offline · Saved plans only. Changes and joining need internet.':'Refresh for the latest plan. This is not live location or a notification service.';
      if(editor)editor.querySelector('[type="submit"]').disabled=ctx.offline()||busy;
    }
    window.addEventListener('offline',connectivity);
    window.addEventListener('online',connectivity);
    function select(id,fromMap=false){
      selected=id;
      host.querySelectorAll('[data-meetup-id]').forEach(card=>card.classList.toggle('selected',card.dataset.meetupId===id));
      host.querySelectorAll('[data-map-pin]').forEach(pin=>{pin.classList.toggle('selected',pin.dataset.mapPin===id);pin.hidden=pin.classList.contains('cancelled')&&pin.dataset.mapPin!==id;});
      const meetup=(room.meetups||[]).find(item=>item.id===id);if(!meetup)return;
      host.querySelector('.meetup-map-panel').open=true;
      const viewport=host.querySelector('.map-viewport'),stage=host.querySelector('.map-stage');
      viewport.scrollLeft=meetup.x*stage.clientWidth-viewport.clientWidth/2;viewport.scrollTop=meetup.y*stage.clientHeight-viewport.clientHeight/2;
      const target=fromMap?[...host.querySelectorAll('[data-meetup-id]')].find(node=>node.dataset.meetupId===id):host.querySelector('.meetup-map-panel');
      target?.scrollIntoView({block:'nearest',behavior:'instant'});
    }
    function draw(){
      if(!current())return;
      const focused=document.activeElement?.closest('[data-meetup-id]'),focusedId=focused?.dataset.meetupId;
      const focusedAction=focused?['data-meetup-join','data-meetup-edit','data-meetup-map','data-meetup-copy'].find(attr=>document.activeElement.hasAttribute(attr)):null;
      const beforeTop=focused?.getBoundingClientRect().top;
      host.querySelector('#meetupList').innerHTML=cards(room,selected,ctx.offline());
      host.querySelector('.map-pins').innerHTML=(room.meetups||[]).map((meetup,index)=>`<button class="meetup-pin${selected===meetup.id?' selected':''}${meetup.status==='cancelled'?' cancelled':''}" ${meetup.status==='cancelled'&&selected!==meetup.id?'hidden':''} type="button" data-map-pin="${esc(meetup.id)}" style="left:${meetup.x*100}%;top:${meetup.y*100}%" aria-label="${esc(meetup.title)} at ${esc(meetup.spot)}">${index+1}</button>`).join('');
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
      if(focusedId&&focusedAction){
        const replacement=[...host.querySelectorAll('[data-meetup-id]')].find(card=>card.dataset.meetupId===focusedId);
        replacement?.querySelector('['+focusedAction+']')?.focus({preventScroll:true});
        if(replacement)window.scrollBy(0,replacement.getBoundingClientRect().top-beforeTop);
      }
    }
    async function mutate(action,payload){
      if(ctx.offline())throw new Error('Reconnect to change this meetup.');
      if(busy)throw new Error('A change is already saving.');
      busy=true;revision++;connectivity();
      try{const updated=await ctx.mutate(action,payload);if(current()){room=updated;draw();}return updated;}
      finally{busy=false;connectivity();}
    }
    async function refresh(){
      if(busy||refreshing||ctx.offline())return;
      let failed=false;
      const requestedRevision=revision;
      refreshing=true;connectivity();host.querySelector('#refreshMeetups').disabled=true;
      host.querySelector('#meetupSync').textContent='Refreshing meetups…';
      try{const updated=await ctx.query();if(current()&&requestedRevision===revision&&!busy){room=updated;draw();}}
      catch{failed=true;}
      finally{refreshing=false;connectivity();if(failed&&current()&&requestedRevision===revision)host.querySelector('#meetupSync').textContent='Could not refresh. These plans may be out of date.';}
    }
    function openEditor(meetup){
      if(ctx.offline())return ctx.toast('Reconnect to create or edit meetups.');
      if(editor)return;
      let point=meetup?{x:meetup.x,y:meetup.y}:null,saving=false;
      const allSets=window.LOST_LANDS_SET_TIMES||[], hidden=room.lineupHiddenDays||[];
      const sets=allSets.filter(set=>!hidden.includes(set.day)||meetup?.timing?.sets?.some(saved=>saved.id===set.id));
      const choice={mode:meetup?.timing?.mode||(meetup?'custom':'before'),setId:meetup?.timing?.setId||'',nextSetId:meetup?.timing?.nextSetId||'',minutes:meetup?.timing?.minutes??15};
      const date=eventNow().slice(0,10),initialDate=date>='2026-09-16'&&date<='2026-09-21'?date:'2026-09-18';
      const modes=[['before','Before a set'],['after','After a set'],['between','Between sets'],['custom','Custom time']];
      const picker=which=>'<details class="meetup-set-picker" data-picker="'+which+'"><summary>Choose '+(which==='first'?'a set':'the next set')+'</summary><div class="set-picker-body"><label>Search artist or stage<input type="search" data-set-search placeholder="Find a performance" autocomplete="off"></label><div class="set-picker-filters"><label>Day<select data-set-day><option value="">All days</option>'+[...new Set(sets.map(set=>set.day))].map(day=>'<option>'+esc(day)+'</option>').join('')+'</select></label><label class="set-favorites"><input type="checkbox" data-set-favorites> My favorites</label></div><p data-set-count role="status"></p><div class="set-picker-results"></div></div></details>';
      editor=document.createElement('dialog');const dialog=editor;
      dialog.className='meetup-dialog';dialog.setAttribute('aria-labelledby','meetupEditorTitle');
      dialog.innerHTML='<header><div><span class="eyebrow">Lost Lands 2026</span><h2 id="meetupEditorTitle">'+(meetup?'Edit meetup':'New meetup')+'</h2></div><button type="button" data-close autofocus aria-label="Close meetup editor">×</button></header><form><div class="meetup-editor-scroll"><div class="meetup-fields">'+
        '<fieldset class="meetup-time-modes"><legend>When should we meet?</legend>'+modes.map(([value,label])=>'<label><input type="radio" name="timingMode" value="'+value+'" '+(choice.mode===value?'checked':'')+'><span>'+label+'</span></label>').join('')+'</fieldset>'+
        '<div data-linked-time>'+picker('first')+'<div data-between>'+picker('second')+'</div><label class="meetup-offset"><span data-offset-label>Minutes before the set starts</span><select name="minutes">'+[...new Set([0,5,10,15,20,30,45,60,90,120,choice.minutes])].sort((a,b)=>a-b).map(n=>'<option value="'+n+'" '+(n===choice.minutes?'selected':'')+'>'+n+' minutes</option>').join('')+'</select></label></div>'+
        '<label data-custom-time>When · Eastern time (EDT)<input name="when" type="datetime-local" min="2026-09-16T00:00" max="2026-09-21T23:59" value="'+esc(meetup?.when||initialDate+'T18:00')+'"><small>After midnight? Use the next calendar date.</small></label>'+
        '<div class="meetup-time-preview" role="status"></div>'+
        '<label>Meetup name<input name="title" maxlength="100" required placeholder="Pick a set to name this plan" value="'+esc(meetup?.title||'')+'"></label>'+
        '<details class="meetup-location-picker"><summary><span>Meeting spot</span><strong data-location-label>'+esc(meetup?.spot||'Choose a landmark or map pin')+'</strong></summary><div class="meetup-location-body"><fieldset class="meetup-landmarks"><legend>Start near a landmark</legend>'+LANDMARKS.map((landmark,index)=>'<button type="button" data-landmark="'+index+'">'+esc(landmark.name)+'</button>').join('')+'</fieldset>'+mapMarkup(true)+'<p class="pin-status" role="status">'+(point?'Saved pin · choose Place pin to move it':'Choose a landmark or place a pin')+'</p></div></details>'+
        '<label>Exact spot<input name="spot" maxlength="160" required placeholder="Left side of the water refill station" value="'+esc(meetup?.spot||'')+'"></label>'+
        '<label>How to find us<textarea name="instructions" maxlength="1200" rows="3" placeholder="Look for our totem. Wait 10 minutes if someone is late.">'+esc(meetup?.instructions||'')+'</textarea></label>'+
        (meetup?'<fieldset class="meetup-status-picker"><legend>Plan status</legend><label><input type="radio" name="status" value="planned" '+(meetup.status==='planned'?'checked':'')+'> Planned</label><label><input type="radio" name="status" value="cancelled" '+(meetup.status==='cancelled'?'checked':'')+'> Cancelled</label></fieldset>':'')+
        '<p class="meetup-editor-help">Pins are approximate. Updates need internet and won’t notify crew who are offline.</p><p class="meetup-form-error" role="alert" tabindex="-1" hidden></p>'+
        (meetup?'<div class="meetup-delete-confirm" hidden><p>Delete this meetup for everyone? This cannot be undone.</p><button type="button" class="danger-button" data-confirm-delete>Yes, delete</button><button type="button" data-keep>Keep meetup</button></div>':'')+
        '</div></div><footer class="meetup-editor-actions"><button type="submit" class="primary">'+(meetup?'Save changes':'Create meetup')+'</button>'+(meetup?'<button type="button" class="danger-button" data-delete>Delete</button>':'')+'</footer></form>';
      const previousOverflow=document.body.style.overflow;
      document.body.style.overflow='hidden';
      document.body.append(dialog);dialog.showModal();
      const form=dialog.querySelector('form'),map=dialog.querySelector('.meetup-map'),preview=dialog.querySelector('.meetup-time-preview');
      const error=dialog.querySelector('.meetup-form-error'),submit=dialog.querySelector('[type="submit"]');
      let generatedTitle='';
      function timing(){
        return choice.mode==='custom'?{when:form.elements.when.value,timing:null}:RallyMeetupTiming.resolveMeetupTiming(choice,allSets);
      }
      function updateTiming(){
        dialog.querySelector('[data-linked-time]').hidden=choice.mode==='custom';
        dialog.querySelector('[data-custom-time]').hidden=choice.mode!=='custom';
        form.elements.when.disabled=choice.mode!=='custom';form.elements.when.required=choice.mode==='custom';
        dialog.querySelector('[data-between]').hidden=choice.mode!=='between';
        dialog.querySelector('[data-offset-label]').textContent=choice.mode==='before'?'Minutes before the set starts':'Minutes after the first set ends';
        if(choice.mode==='after')dialog.querySelector('[data-offset-label]').textContent='Minutes after the set ends';
        dialog.querySelectorAll('[data-picker]').forEach(p=>{
          const set=allSets.find(s=>s.id===(p.dataset.picker==='first'?choice.setId:choice.nextSetId));
          p.querySelector('summary').textContent=set?set.artist+' · '+set.day+' · '+set.stage:'Choose '+(p.dataset.picker==='first'?'a set':'the next set');
        });
        try{
          const result=timing();
          preview.textContent=timeLabel(result.when)+(choice.mode==='between'?' · Check walking time between stages.':'');
          preview.classList.remove('invalid');
          if(choice.mode!=='custom'){
            form.elements.when.value=result.when;
            if(!form.elements.title.value||form.elements.title.value===generatedTitle){
              generatedTitle=result.timing.label.slice(0,100);form.elements.title.value=generatedTitle;
            }
          }
        }catch(reason){preview.textContent=reason.message;preview.classList.add('invalid');}
      }
      function renderPicker(p){
        const query=p.querySelector('[data-set-search]').value.trim().toLowerCase(),day=p.querySelector('[data-set-day]').value,favorites=p.querySelector('[data-set-favorites]').checked;
        const personal=new Set(room.currentLineupFavorites||[]);
        const candidates=p.dataset.picker==='second'?RallyMeetupTiming.availableNextSets(choice.setId,sets):sets;
        const matches=candidates.filter(set=>(!day||set.day===day)&&(!favorites||personal.has(set.id))&&query.split(/\s+/).every(word=>(set.artist+' '+set.stage).toLowerCase().includes(word))).sort((a,b)=>a.start.localeCompare(b.start)||a.artist.localeCompare(b.artist));
        p.querySelector('[data-set-count]').textContent=matches.length>30?'Showing 30 of '+matches.length+' sets. Search or choose a day.':matches.length+' matching sets';
        p.querySelector('.set-picker-results').innerHTML=matches.slice(0,30).map(set=>'<button type="button" data-choose-set="'+esc(set.id)+'"><strong>'+esc(set.artist)+'</strong><span>'+esc(timeLabel(set.start))+'</span><small>'+esc(set.stage)+' · ends '+esc(timeLabel(set.end).split(' · ')[1])+'</small></button>').join('')||'<p>No matching sets. '+(p.dataset.picker==='second'?'Choose a first set, then a later set on that festival day.':'Try another search or day.')+'</p>';
        p.querySelectorAll('[data-choose-set]').forEach(button=>button.onclick=()=>{
          if(p.dataset.picker==='first'){
            choice.setId=button.dataset.chooseSet;
            if(!RallyMeetupTiming.availableNextSets(choice.setId,allSets).some(s=>s.id===choice.nextSetId))choice.nextSetId='';
            dialog.querySelector('[data-picker="second"] [data-set-day]').value='';
            dialog.querySelector('[data-picker="second"] [data-set-search]').value='';
          }else choice.nextSetId=button.dataset.chooseSet;
          p.open=false;p.querySelector('summary').focus({preventScroll:true});
          updateTiming();dialog.querySelectorAll('[data-picker]').forEach(renderPicker);
        });
      }
      dialog.querySelectorAll('[data-picker]').forEach(p=>{
        p.addEventListener('toggle',()=>{if(p.open)renderPicker(p);});
        p.querySelector('[data-set-search]').oninput=()=>renderPicker(p);
        p.querySelector('[data-set-day]').onchange=()=>renderPicker(p);
        p.querySelector('[data-set-favorites]').onchange=()=>renderPicker(p);
      });
      form.elements.timingMode.forEach(radio=>radio.onchange=()=>{
        choice.mode=radio.value;choice.minutes=radio.value==='before'?15:radio.value==='after'?10:0;
        form.elements.minutes.value=String(choice.minutes);updateTiming();
      });
      form.elements.minutes.onchange=()=>{choice.minutes=Number(form.elements.minutes.value);updateTiming();};
      form.elements.when.oninput=updateTiming;
      updateTiming();
      const setPin=value=>{
        point=value;map.querySelector('.map-pins').innerHTML='<span class="meetup-pin draft-pin" style="left:'+point.x*100+'%;top:'+point.y*100+'%" aria-label="Selected meeting point">●</span>';
        dialog.querySelector('.pin-status').textContent='Pin selected · use Place pin to adjust';
      };
      setupMap(map,setPin);if(point)setPin(point);
      dialog.querySelectorAll('[data-landmark]').forEach(button=>button.onclick=()=>{
        const landmark=LANDMARKS[Number(button.dataset.landmark)];setPin({x:landmark.x,y:landmark.y});
        map.querySelector('.map-place[aria-pressed="true"]')?.click();
        form.elements.spot.value='Near '+landmark.name;
        dialog.querySelector('[data-location-label]').textContent=form.elements.spot.value;
        dialog.querySelector('.meetup-location-picker').open=false;
      });
      form.elements.spot.oninput=()=>{dialog.querySelector('[data-location-label]').textContent=form.elements.spot.value||'Choose a landmark or map pin';};
      dialog.querySelector('[data-close]').onclick=()=>{if(!saving)dialog.close();};
      dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
      dialog.addEventListener('close',()=>{
        document.body.style.overflow=previousOverflow;
        dialog.remove();if(editor===dialog)editor=null;
        if(current())host.querySelector('#newMeetup').focus({preventScroll:true});
      },{once:true});
      const failure=reason=>{error.textContent=reason.message||'Could not save. Your draft is still here.';error.hidden=false;error.focus();};
      function lock(value){
        saving=value;dialog.querySelectorAll('button,[data-close]').forEach(button=>button.disabled=value);
        submit.textContent=value?'Saving…':meetup?'Save changes':'Create meetup';
      }
      form.onsubmit=async event=>{
        event.preventDefault();error.hidden=true;
        if(!point){dialog.querySelector('.meetup-location-picker').open=true;failure(new Error('Choose a landmark or place a map pin.'));return;}
        let linked;
        try{linked=timing();}catch(reason){failure(reason);return;}
        const values={title:form.elements.title.value,spot:form.elements.spot.value,instructions:form.elements.instructions.value,status:meetup?form.elements.status.value:'planned'};
        lock(true);
        try{
          await mutate(meetup?'edit-meetup':'add-meetup',{...values,...point,when:linked.when,timing:linked.timing,...(meetup?{id:meetup.id,expectedUpdatedAt:meetup.updatedAt}:{})});
          dialog.close();ctx.toast(meetup?'Meetup updated':'Meetup created. You’re marked as joining.');
        }catch(reason){failure(reason);}finally{lock(false);submit.disabled=ctx.offline();}
      };
      const remove=dialog.querySelector('[data-delete]');
      if(remove){
        const confirmation=dialog.querySelector('.meetup-delete-confirm');
        remove.onclick=()=>{confirmation.hidden=false;confirmation.scrollIntoView({block:'nearest'});};
        dialog.querySelector('[data-keep]').onclick=()=>{confirmation.hidden=true;};
        dialog.querySelector('[data-confirm-delete]').onclick=async()=>{
          lock(true);
          try{await mutate('delete-meetup',{id:meetup.id,expectedUpdatedAt:meetup.updatedAt});dialog.close();ctx.toast('Meetup deleted');}
          catch(reason){failure(reason);}finally{lock(false);submit.disabled=ctx.offline();}
        };
      }
    }
    host.querySelector('#newMeetup').onclick=()=>openEditor();host.querySelector('#refreshMeetups').onclick=refresh;
    draw();if(selected)select(selected,true);if(!ctx.offline())void refresh();
  }
  window.RallyMeetups={mount,unmount:()=>cleanup(),coordinates,timeLabel,cards,mapMarkup,LANDMARKS,MAP};
})();
