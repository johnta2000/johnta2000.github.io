/* Opt-in foreground GPS. No background tracking, Bluetooth or implied mesh. */
(() => {
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=p=>p&&[p.latitude,p.longitude,p.accuracy,p.observedAt].every(Number.isFinite)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180&&p.accuracy>=0;
  const fresh=(rows,now=Date.now())=>(Array.isArray(rows)?rows:[]).filter(p=>valid(p)&&p.expiresAt>now);
  function offset(a,b){const rad=Math.PI/180;return {x:(b.longitude-a.longitude)*Math.cos((a.latitude+b.latitude)/2*rad)*111320,y:(a.latitude-b.latitude)*111320};}
  function age(time){return `${Math.max(0,Math.floor((Date.now()-time)/60000))} min ago`;}
  function plot(rows,own){
    const points=[...(own?[{...own,memberId:'self',name:'You'}]:[]),...rows];
    if(!points.length)return '';
    const origin=own||points[0],xy=points.map(p=>({...p,...offset(origin,p)}));
    const span=Math.max(100,...xy.map(p=>Math.max(Math.abs(p.x),Math.abs(p.y))));
    return `<svg viewBox="0 0 360 280" role="img" aria-label="Approximate relative crew positions, north up. Not a route map."><path d="M180 25V255M25 140H335" stroke="currentColor" opacity=".15"/><text x="180" y="18" text-anchor="middle">N ↑</text>${xy.map((p,i)=>{const x=180+p.x/span*125,y=140+p.y/span*95;return `<g><title>${esc(p.name)} · ${age(p.observedAt)} · ±${Math.round(p.accuracy)} m</title><circle cx="${x}" cy="${y}" r="${Math.min(35,Math.max(9,p.accuracy/span*95))}" fill="${p.memberId==='self'?'#2877b8':'#60723f'}" opacity=".15"/><circle cx="${x}" cy="${y}" r="8" fill="${p.memberId==='self'?'#2877b8':'#60723f'}"/><text x="${x}" y="${y-13}" text-anchor="middle">${esc(p.memberId==='self'?'You':String(i+(own?0:1)))}</text></g>`;}).join('')}<text x="12" y="273">${Math.round(span)} m from center to horizontal scale edge</text></svg>`;
  }
  let release=()=>{};
  function mount(ctx){
    release();
    const host=ctx.root, key=`rally-crew-position:${ctx.owner}:${ctx.room.id}`, stopKey=key+':stop';
    let rows=[],own=null,watch=null,session=null,expiresAt=0,alive=true,busy=false,starting=false,latest=null,lastSent=0,wantsPosition=false,message='Locations are last received—not live tracking.',timer;
    try{rows=fresh(JSON.parse(localStorage.getItem(key)||'[]'));}catch{}
    const names=Object.fromEntries(ctx.room.members.map(m=>[m.id,m.name]));
    host.innerHTML=`<section class="crew-location"><header><h2>Find your crew</h2><span data-mode></span></header><p>Opt in to share GPS with this crew for 30 minutes while this screen is open. Updates pause in the background. Saved locations expire after 30 minutes; they may be wrong if someone has moved.</p><div class="crew-location-actions"><button type="button" data-locate>Find my position</button><button type="button" data-share>Share for 30 min</button><button type="button" data-stop hidden>Stop sharing</button></div><p role="status" data-status></p><div data-plot></div><ol data-people></ol><p class="crew-location-footnote">No signal? Only previously received locations are available. No Bluetooth relay or offline messaging. This diagram is north-up, not the festival map or walking directions.</p></section>`;
    if(ctx.room.id==='lost-lands-2026'){
      host.querySelector('.crew-location > p').textContent='Lost Lands: September 18–20 only, 7 PM–2 AM Eastern each night. Opt in while this screen is open; browser updates pause in the background. Locations may be stale if someone has moved.';
      host.querySelector('[data-share]').textContent='Share until 2 AM ET';
    }
    function draw(){
      if(!alive)return;
      rows=fresh(rows).filter(p=>names[p.memberId]);
      cache();
      const others=rows.filter(p=>p.memberId!==ctx.room.currentMemberId).map(p=>({...p,name:names[p.memberId]}));
      host.querySelector('[data-mode]').textContent=navigator.onLine?'Last received':'Offline · saved positions';
      host.querySelector('[data-status]').textContent=message;
      host.querySelector('[data-share]').hidden=!!session;host.querySelector('[data-share]').disabled=starting||!navigator.onLine;
      host.querySelector('[data-stop]').hidden=!session;
      host.querySelector('[data-plot]').innerHTML=plot(others,own);
      host.querySelector('[data-people]').innerHTML=others.map(p=>{
        const d=own?offset(own,p):null,meters=d?Math.round(Math.hypot(d.x,d.y)):null;
        return `<li><strong>${esc(p.name)}</strong><span>${age(p.observedAt)} · ±${Math.round(p.accuracy)} m${meters===null?'':` · about ${meters} m away`}</span><a href="https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}" target="_blank" rel="noopener noreferrer">Open saved position ↗</a></li>`;
      }).join('')||'<li>No saved crew positions yet. Friends must opt in on this screen.</li>';
    }
    let lastUploadedPosition=null;
    function cache(){try{localStorage.setItem(key,JSON.stringify(fresh(rows)));}catch{}}
    function clearWatch(){if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;latest=null;}
    async function revoke(){
      let pending;try{pending=localStorage.getItem(stopKey);}catch{}
      if(pending&&navigator.onLine){await ctx.mutate('stop',pending);try{localStorage.removeItem(stopKey);}catch{}}
    }
    function stop(){
      clearWatch();wantsPosition=false;const old=session;session=null;expiresAt=0;
      if(old){try{localStorage.setItem(stopKey,old);}catch{};void revoke().catch(()=>{});}
      message='Stopped on this device. If offline, removal waits for reconnection; saved copies expire at their sharing cutoff.';draw();
    }
    function locate(){
      if(!navigator.geolocation){message='Location is unavailable in this browser.';draw();return;}
      clearWatch();wantsPosition=true;
      watch=navigator.geolocation.watchPosition(p=>{
        if(!alive)return;
        if(session&&Date.now()>=expiresAt){stop();return;}
        own={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,observedAt:p.timestamp};
        if(!valid(own))return;
        latest=own;message=session?'Sharing while this screen is open. Updates retry when service returns.':'Your position is only on this device. It has not been shared.';draw();void sync();
      },error=>{if(error.code===1)stop();message=error.code===1?'Location permission denied. Allow location access in browser settings to try again.':'Could not get a GPS fix. Move outdoors and try again.';draw();},{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
    }
    async function sync(){
      if(!alive||busy||document.hidden)return;
      if(session&&Date.now()>=expiresAt)stop();
      if(!navigator.onLine){message='Offline. Your latest position stays on this device until service returns.';draw();return;}
      busy=true;
      try{
        await revoke();
        const delta=latest&&lastUploadedPosition?offset(lastUploadedPosition,latest):null;
        if(session&&latest&&Date.now()-latest.observedAt<120000&&Date.now()-lastSent>=30000&&(!delta||Math.hypot(delta.x,delta.y)>=25)){
          const position=latest;
          const sentSession=session;await ctx.mutate('update',sentSession,latest);lastSent=Date.now();
          lastUploadedPosition=position;
          if(sentSession!==session){try{localStorage.setItem(stopKey,sentSession);}catch{};await revoke();}
        }
        const result=await ctx.query();
        if(alive){rows=fresh(result);cache();draw();}
      }catch{if(alive){message='Connection unavailable. Showing saved positions; retrying automatically.';draw();}}
      finally{busy=false;}
    }
    host.querySelector('[data-locate]').onclick=locate;
    host.querySelector('[data-share]').onclick=async()=>{
      if(starting||session)return;starting=true;draw();
      const id=crypto.randomUUID();
      try{
        await revoke();const result=await ctx.mutate('start',id);
        if(!alive){try{localStorage.setItem(stopKey,id);}catch{};await revoke();return;}
        session=id;expiresAt=result.expiresAt;lastSent=0;lastUploadedPosition=null;locate();
      }catch{message='Could not start sharing. Reconnect and try again.';}
      finally{starting=false;draw();}
    };
    host.querySelector('[data-stop]').onclick=stop;
    const resume=()=>{if(document.hidden){clearWatch();return;}if(wantsPosition&&watch===null)locate();void sync();};
    window.addEventListener('online',resume);window.addEventListener('offline',draw);document.addEventListener('visibilitychange',resume);
    timer=setInterval(()=>{draw();void sync();},30000);
    window.addEventListener('pagehide',stop);
    release=()=>{stop();alive=false;clearInterval(timer);window.removeEventListener('online',resume);window.removeEventListener('offline',draw);window.removeEventListener('pagehide',stop);document.removeEventListener('visibilitychange',resume);};
    draw();void sync();
  }
  window.RallyCrewLocation={mount,unmount:()=>release(),clearCache:()=>{release();for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('rally-crew-position:')&&!key.endsWith(':stop'))localStorage.removeItem(key);}},fresh,offset,plot};
})();
