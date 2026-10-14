// Artist discovery and shareable posters. Public song previews stream directly
// from Apple: never download, persist, or service-worker-cache their audio.
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/æ/gi,'ae').toLowerCase().replace(/[^a-z0-9]/g,'');
  function artistNames(label) {
    return [...new Set(String(label || '').replace(/\((?:[^)]*set|detox|throwback)\)/gi,'').replace(/\s+H\.?C\.?D\.?$/i,'').replace(/\s*&\s*Friends$/i,'').split(/\s+(?:b2b(?:2b)*|\+)\s+/i).map(s=>s.trim()).filter(Boolean))].slice(0,6);
  }
  function storeUrl(track) {
    try { const url=new URL(track.trackViewUrl); return ['music.apple.com','itunes.apple.com'].includes(url.hostname)&&url.protocol==='https:'&&!url.username&&!url.password?url.href:null; } catch { return null; }
  }
  function purchaseUrl(track) {const source=storeUrl(track);if(!source)return null;const url=new URL(source);url.searchParams.set('app','itunes');return url.href;}
  function mediaUrl(value) {
    try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname.endsWith('.mzstatic.com')||url.hostname.endsWith('.itunes.apple.com'))?url.href:null;}catch{return null;}
  }
  const previewUrl=track=>mediaUrl(track?.previewUrl);
  function matchTracks(name, results) {
    const target=normalize(name), seen=new Set();
    return (Array.isArray(results)?results:[]).filter(track=>{
      const parts=String(track.artistName||'').split(/\s*(?:,|&|\bfeat\.?|\band\b)\s*/i);
      const matches=normalize(track.artistName)===target || parts.some(part=>normalize(part)===target);
      if(!target||!matches||track.kind!=='song'||!storeUrl(track)||!Number.isSafeInteger(track.trackId)||seen.has(track.trackId))return false;
      seen.add(track.trackId); return true;
    }).sort((a,b)=>Number(normalize(b.artistName)===target)-Number(normalize(a.artistName)===target)).slice(0,3);
  }
  function embedUrl(track, dark=false) {
    const source=storeUrl(track); if(!source)return null;
    const url=new URL(source);
    if(!/^\/[a-z]{2}\/(album|song)\//.test(url.pathname))return null;
    url.hostname='embed.music.apple.com'; const song=url.searchParams.get('i');url.search='';
    if(song&&/^\d+$/.test(song))url.searchParams.set('i',song);
    url.searchParams.set('theme',dark?'dark':'light'); return url.href;
  }
  // Shared across project switches. Only small public catalog responses live in
  // memory; failed requests are not cached. Limit requests below Apple's quota.
  const catalog=new Map(); let nextRequest=0;
  async function search(name, signal) {
    if(navigator.onLine===false)throw new Error('offline');
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    const key=normalize(name), cached=catalog.get(key);
    if(cached&&Date.now()-cached.time<3600000)return cached.tracks;
    const wait=Math.max(0,nextRequest-Date.now());
    if(wait>12000)throw new Error('busy');
    nextRequest=Math.max(Date.now(),nextRequest)+3100;
    if(wait)await new Promise((resolve,reject)=>{
      const id=setTimeout(done,wait);function done(){signal.removeEventListener('abort',abort);resolve();}
      function abort(){clearTimeout(id);reject(new DOMException('Cancelled','AbortError'));}signal.addEventListener('abort',abort,{once:true});
    });
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    const url=new URL('https://itunes.apple.com/search');
    url.search=new URLSearchParams({term:name,entity:'song',media:'music',attribute:'artistTerm',country:'US',limit:'20'}).toString();
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),10000);
    const abort=()=>controller.abort(); signal.addEventListener('abort',abort,{once:true});
    try {
      const response=await fetch(url.href,{credentials:'omit',signal:controller.signal});
      if(!response.ok)throw new Error('catalog');
      const tracks=matchTracks(name,(await response.json()).results).filter(track=>previewUrl(track));
      if(catalog.size>=150)catalog.delete(catalog.keys().next().value);
      catalog.set(key,{time:Date.now(),tracks});return tracks;
    } finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  function create({root,container,poster,artwork,eventName,dateLabel,timeLabel,getFavorites,getPeople,onFavorite,showToast}) {
    let dialog=null, request=null, selectedEntry=null, revision=0, posterEntries=[], posterMode='mine', posterZoom=1;
    let audio=null, activeTrack=null, mediaRevision=0, pendingPlay=false, blocked=false, failed=false;
    const lifetime=new AbortController();
    const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';
    const pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    function haltAudio() {
      mediaRevision++;activeTrack=null;pendingPlay=false;blocked=false;failed=false;
      if(audio){audio.pause();audio.removeAttribute('src');audio.load();}
    }
    const stop = () => { revision++;request?.abort();request=null;haltAudio(); };
    const close = () => { stop();dialog?.close(); };
    function getAudio() {
      if(audio)return audio;
      audio=document.createElement('audio');audio.hidden=true;audio.preload='none';audio.setAttribute('playsinline','');audio.disableRemotePlayback=true;
      for(const event of ['playing','pause','waiting','ended','timeupdate','loadedmetadata','durationchange'])audio.addEventListener(event,()=>{
        if(event==='playing'||event==='ended')pendingPlay=false;
        updatePlayer();
      });
      audio.addEventListener('error',()=>{if(activeTrack&&audio.error){pendingPlay=false;failed=true;updatePlayer();}});
      return audio;
    }
    // The artist tap is the playback gesture. Keep one media element for its
    // lifetime (Safari grants playback per element), even during a cold lookup.
    // This tiny local silent buffer carries that tap's intent, not music data.
    function beginPlaybackGesture() {
      if(navigator.onLine===false)return;
      const element=getAudio(),buffer=new Uint8Array(844),view=new DataView(buffer.buffer);
      const label=(offset,text)=>[...text].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
      label(0,'RIFF');view.setUint32(4,836,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,800,true);
      element.src='data:audio/wav;base64,'+btoa(String.fromCharCode(...buffer));
      try{element.play()?.catch(()=>{});}catch{/* A browser may require a manual play tap; show it only if the real preview is blocked. */}
    }
    const clock=seconds=>`${Math.floor(Math.max(0,seconds)/60)}:${String(Math.floor(Math.max(0,seconds)%60)).padStart(2,'0')}`;
    function updatePlayer() {
      if(!activeTrack||!dialog?.open)return;
      const button=dialog.querySelector('[data-preview-toggle]'),status=dialog.querySelector('[data-playback-status]');if(!button)return;
      const playing=!audio.paused&&!audio.ended&&!blocked&&!failed;
      button.innerHTML=playing?pauseIcon:playIcon;
      button.setAttribute('aria-label',(playing?'Pause':'Play')+' preview');button.setAttribute('aria-pressed',String(playing));
      const text=failed?'Preview unavailable. Try play again.':blocked?'Tap play to start the preview.':audio.ended?'Preview finished':pendingPlay||(!audio.paused&&audio.readyState<3)?'Loading preview…':playing?'Playing preview':'Paused';
      if(status.textContent!==text)status.textContent=text;
      const duration=Number.isFinite(audio.duration)?audio.duration:0,elapsed=Number.isFinite(audio.currentTime)?audio.currentTime:0;
      dialog.querySelector('.artist-preview-progress').value=duration?Math.min(1,elapsed/duration):0;
      dialog.querySelector('[data-preview-elapsed]').textContent=clock(elapsed);
      dialog.querySelector('[data-preview-duration]').textContent=duration?clock(duration):'—';
    }
    function playPreview() {
      if(!activeTrack||!dialog?.open)return;
      const current=mediaRevision;pendingPlay=true;blocked=false;failed=false;
      if(audio.ended)audio.currentTime=0;
      if(audio.error){audio.src=previewUrl(activeTrack);audio.load();}
      try{Promise.resolve(audio.play()).then(()=>{if(current!==mediaRevision||!activeTrack)return;pendingPlay=false;updatePlayer();},error=>{
        if(current!==mediaRevision||!activeTrack)return;
        pendingPlay=false;blocked=error.name==='NotAllowedError';failed=!blocked;updatePlayer();
      });}catch{pendingPlay=false;failed=true;}
      updatePlayer();
    }
    function updateArtist() {
      if(!dialog||!selectedEntry)return;
      const saved=getFavorites().has(selectedEntry.id), people=getPeople(selectedEntry.id);
      const button=dialog.querySelector('[data-artist-favorite]');
      button.textContent=saved?'★ Liked':'☆ Like this set';button.setAttribute('aria-pressed',String(saved));
      dialog.querySelector('.artist-crew').textContent=people.length?`${people.length} interested · ${people.map(p=>p.name).join(' · ')}`:'No crew likes yet';
    }
    function drawTrack(track, tracks) {
      const src=previewUrl(track);if(!src)return;
      // Replacing a track cancels its pending play promise before starting the next.
      haltAudio();activeTrack=track;const element=getAudio(),player=dialog.querySelector('.artist-player');
      const cover=mediaUrl(track.artworkUrl100);
      player.innerHTML=`<div class="artist-preview-card">${cover?`<img class="artist-preview-cover" src="${escape(cover)}" width="52" height="52" alt="" referrerpolicy="no-referrer">`:'<span class="artist-preview-cover artist-preview-cover-empty" aria-hidden="true">♫</span>'}<div class="artist-preview-title"><strong>${escape(track.trackName)}</strong><span>${escape(track.artistName)}</span></div><button type="button" class="artist-preview-toggle" data-preview-toggle aria-label="Play preview" aria-pressed="false">${playIcon}</button><div class="artist-preview-timing"><progress class="artist-preview-progress" max="1" value="0" aria-label="Music preview progress"></progress><div><span data-preview-elapsed>0:00</span><span data-preview-duration>—</span></div></div><p class="artist-playback-status" data-playback-status role="status">Loading preview…</p></div><a class="artist-store-link" href="${escape(purchaseUrl(track))}" target="_blank" rel="noopener noreferrer" aria-label="Get ${escape(track.trackName)} on the iTunes Store"><img src="/tools/rally/assets/get-it-on-itunes.svg" width="114" height="40" alt="Get it on iTunes Store"></a>`;
      player.append(element);element.src=src;
      player.querySelector('[data-preview-toggle]').onclick=()=>{if(!element.paused&&!element.ended){pendingPlay=false;element.pause();updatePlayer();}else playPreview();};
      dialog.querySelector('.artist-tracks').innerHTML=tracks.map(t=>`<button type="button" data-track="${t.trackId}" aria-pressed="${t.trackId===track.trackId}"><span>${escape(t.trackName)}</span><small>${escape(t.artistName)}</small></button>`).join('');
      dialog.querySelectorAll('[data-track]').forEach(button=>button.onclick=()=>drawTrack(tracks.find(t=>String(t.trackId)===button.dataset.track),tracks));
      playPreview();
    }
    async function loadArtist(name) {
      stop(); const current=revision;request=new AbortController();
      const player=dialog.querySelector('.artist-player'), list=dialog.querySelector('.artist-tracks');list.innerHTML='';
      player.innerHTML='<p class="artist-preview-status" role="status">Finding music previews…</p>';
      dialog.querySelectorAll('[data-preview-artist]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.previewArtist===name)));
      const cached=catalog.get(normalize(name));
      if(navigator.onLine!==false&&cached&&Date.now()-cached.time<3600000&&cached.tracks.length){drawTrack(cached.tracks[0],cached.tracks);return;}
      beginPlaybackGesture();if(audio)player.append(audio);
      try {
        const tracks=await search(name,request.signal);
        if(current!==revision||!dialog?.open)return;
        if(!tracks.length){haltAudio();player.innerHTML='<p class="artist-preview-status" role="status">No matching preview found for this artist.</p>';return;}
        drawTrack(tracks[0],tracks);
      }catch(error){
        if(current!==revision||!dialog?.open)return;
        haltAudio();
        player.innerHTML=`<p class="artist-preview-status" role="status">${navigator.onLine===false?'Music previews need an internet connection. Your likes still work offline.':'Music previews are unavailable right now.'}</p><button type="button" class="discovery-action" data-preview-retry>Try again</button>`;
        player.querySelector('[data-preview-retry]').onclick=()=>loadArtist(name);
      }
    }
    function openArtist(entry, trigger, related=[]) {
      if(!entry)return;
      close();dialog?.remove();selectedEntry=entry;
      const originId=trigger?.closest('#lineup-poster,#mobile-schedule,#table-body,#poster-content,#heat-content,#timeline-view')?.id;
      const names=artistNames(entry.artist), title='artist-title';
      dialog=document.createElement('dialog');dialog.className='artist-dialog';dialog.setAttribute('aria-labelledby',title);
      dialog.innerHTML=`<header class="artist-dialog-head"><div><p class="discovery-eyebrow">Discover the lineup</p><h2 id="${title}">${escape(entry.artist)}</h2></div><button type="button" class="artist-close" aria-label="Close artist">×</button></header><p class="artist-set-detail">${escape(entry.day)} · ${escape(timeLabel(entry))}${entry.stage==='Stage TBA'?'':' · '+escape(entry.stage)}</p>${entry.genre?`<p class="artist-genre">${escape(entry.genre)}</p>`:''}<div class="artist-like-row"><button type="button" class="discovery-action" data-artist-favorite aria-pressed="false"></button><p class="artist-crew"></p></div>${names.length>1?`<div class="artist-collaborators" role="group" aria-label="Preview artist">${names.map(n=>`<button type="button" data-preview-artist="${escape(n)}" aria-pressed="false">${escape(n)}</button>`).join('')}</div>`:''}<section class="artist-music" aria-label="Music previews"><div class="artist-player"></div><div class="artist-tracks" aria-label="Choose a song"></div><p class="artist-credit">Song previews provided courtesy of iTunes. Availability varies by artist and region. iTunes Store is a trademark of Apple Inc.</p></section>${entry.notes?`<p class="artist-notes">${escape(entry.notes)}</p>`:''}`;
      container.append(dialog);updateArtist();
      if(related.length>1){
        const choices=document.createElement('div');choices.className='artist-set-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label','Choose a performance to like');
        choices.innerHTML=related.map(set=>`<button type="button" data-performance="${escape(set.id)}" aria-pressed="${set.id===entry.id}"><strong>${escape(set.day)} · ${escape(timeLabel(set))}</strong><small>${escape(set.stage)}</small></button>`).join('');
        dialog.querySelector('.artist-like-row').before(choices);
        choices.querySelectorAll('button').forEach(b=>b.onclick=()=>openArtist(related.find(set=>set.id===b.dataset.performance),trigger,related));
      }
      dialog.querySelector('.artist-close').onclick=close;
      dialog.addEventListener('cancel',()=>stop());
      dialog.querySelector('[data-artist-favorite]').onclick=()=>{onFavorite(entry.id);updateArtist();};
      dialog.querySelectorAll('[data-preview-artist]').forEach(b=>b.onclick=()=>loadArtist(b.dataset.previewArtist));
      dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const box=dialog.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)close();});
      const ownedDialog=dialog;
      dialog.addEventListener('close',()=>{ownedDialog.remove();if(dialog!==ownedDialog)return;stop();dialog=null;selectedEntry=null;const replacement=[...(root.getElementById(originId)?.querySelectorAll('[data-artist-id]')||[])].find(b=>b.dataset.artistId===entry.id);const target=trigger?.isConnected?trigger:replacement||root.getElementById('lineup-poster-button');target?.focus({preventScroll:true});},{once:true});
      dialog.showModal();dialog.querySelector('.artist-close').focus({preventScroll:true});
      if(names[0])loadArtist(names[0]);
    }
    function highlighted(entry) { return posterMode==='crew'?getPeople(entry.id).length>0:getFavorites().has(entry.id); }
    function renderPoster(entries, {crew=false}={}) {
      posterEntries=entries;posterMode=crew?'crew':'mine';
      if(!artwork){poster.innerHTML='<p class="poster-empty">The original marketing poster hasn’t been added for this event yet. Schedule and artist previews are still available.</p>';updateArtist();return;}
      const scroll=poster.querySelector('.official-poster-viewport'),position={left:scroll?.scrollLeft||0,top:scroll?.scrollTop||0};
      const listOpen=poster.querySelector('.poster-artist-picker')?.open||false,query=poster.querySelector('.poster-artist-search')?.value||'';
      const spots=window.RallyLineupPosters?.resolve(artwork,entries)||[];
      const boxStyle=box=>`left:${box[0]*100}%;top:${box[1]*100}%;width:${box[2]*100}%;height:${box[3]*100}%`;
      poster.innerHTML=`<div class="poster-actions"><p>Official artwork · Tap an artist to preview.<br>${crew?'Crew':'Your'} likes are outlined on the original poster.</p><div><button type="button" class="discovery-action" data-poster-zoom>Zoom in</button><button type="button" class="discovery-action" data-poster-save disabled>Save image</button><button type="button" class="discovery-action" data-poster-share disabled>Share poster</button></div></div><div class="official-poster-viewport"><div class="official-poster-image" style="width:${posterZoom*100}%"><img src="${escape(artwork.src)}" alt="${escape(artwork.alt)}" width="${artwork.width}" height="${artwork.height}">${spots.map(s=>`<button type="button" class="poster-hotspot${s.entries.some(highlighted)?' is-liked':''}" data-poster-spot="${s.index}" style="${boxStyle(s.box)}" aria-label="Preview ${escape(s.artist)}${s.entries.some(highlighted)?' · Liked':''}"><span>${escape(s.artist)}</span></button>`).join('')}</div></div><p class="poster-filter-note">The original artwork stays intact when filtering. Schedule has the latest set details.</p><details class="poster-artist-picker" ${listOpen?'open':''}><summary>Find an artist <span>${entries.length} sets</span></summary><label><span class="discovery-sr-only">Find artist on poster</span><input type="search" class="poster-artist-search" placeholder="Find an artist…" value="${escape(query)}"></label><div class="poster-artist-options">${entries.map(e=>`<button type="button" data-artist-id="${escape(e.id)}"><strong>${escape(e.artist)}</strong><small>${escape(e.day)} · ${escape(e.stage)}${highlighted(e)?' · ★ Liked':''}</small></button>`).join('')}</div><p class="poster-search-empty" hidden>No matching artists.</p></details>${entries.length?'':'<p class="poster-empty">No matching sets. Try different filters.</p>'}`;
      const viewport=poster.querySelector('.official-poster-viewport'),image=poster.querySelector('img');
      const zoom=()=>{viewport.classList.toggle('is-zoomed',posterZoom>1);poster.querySelector('.official-poster-image').style.width=posterZoom*100+'%';poster.querySelector('[data-poster-zoom]').textContent=posterZoom===1?'Zoom in':posterZoom===2?'Zoom 3×':'Fit poster';};zoom();
      poster.querySelector('[data-poster-zoom]').onclick=()=>{posterZoom=posterZoom===3?1:posterZoom+1;zoom();};
      viewport.scrollLeft=position.left;viewport.scrollTop=position.top;
      image.onload=()=>poster.querySelectorAll('[data-poster-save],[data-poster-share]').forEach(b=>b.disabled=!entries.length);
      image.onerror=()=>{poster.querySelector('.poster-filter-note').textContent='The original poster could not load. Reconnect and try again; artist previews are still listed below.';};
      if(image.complete&&image.naturalWidth)image.onload();
      poster.querySelectorAll('[data-poster-spot]').forEach(b=>b.onclick=()=>{const s=spots.find(s=>String(s.index)===b.dataset.posterSpot);if(s)openArtist(s.entries[0],b,s.entries);});
      const search=poster.querySelector('.poster-artist-search');
      search.oninput=()=>{let count=0;poster.querySelectorAll('.poster-artist-options button').forEach(b=>{b.hidden=!normalize(b.textContent).includes(normalize(search.value));if(!b.hidden)count++;});poster.querySelector('.poster-search-empty').hidden=count>0;};search.oninput();
      poster.querySelector('[data-poster-save]').onclick=()=>exportPoster(false);
      poster.querySelector('[data-poster-share]').onclick=()=>exportPoster(true);
      updateArtist();
    }
    // Export the original pixels with only like outlines. No rebuilt typography,
    // crew identities, private notes, or provider album artwork are included.
    async function posterCanvas() {
      if(!artwork)throw new Error('No original poster has been added for this event.');
      const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
      const image=await new Promise((resolve,reject)=>{const img=new Image(),timer=setTimeout(()=>reject(new Error('The original poster could not load. Reconnect and try again.')),10000);img.onload=()=>{clearTimeout(timer);resolve(img);};img.onerror=()=>{clearTimeout(timer);reject(new Error('The original poster could not load.'));};img.src=artwork.src;});
      canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;ctx.drawImage(image,0,0);
      ctx.strokeStyle='#ffe17a';ctx.lineWidth=Math.max(2,image.naturalWidth/300);
      const spots=window.RallyLineupPosters?.resolve(artwork,posterEntries)||[];
      for(const s of spots.filter(s=>s.entries.some(highlighted))){const [x,y,w,h]=s.box;ctx.strokeRect(x*canvas.width,y*canvas.height,w*canvas.width,h*canvas.height);}
      return canvas;
    }
    async function exportPoster(share) {
      const buttons=[...poster.querySelectorAll('[data-poster-save],[data-poster-share]')];buttons.forEach(b=>b.disabled=true);
      try {
        const canvas=await posterCanvas(), blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not create the image.');
        const slug=eventName.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,70),days=[...new Set(posterEntries.map(e=>e.day))].join('-').toLowerCase().replace(/[^a-z0-9-]+/g,'-').slice(0,45),file=new File([blob],`${slug}-${days}-${posterMode}-picks.png`,{type:'image/png'});
        if(share&&navigator.canShare?.({files:[file]})){
          try{await navigator.share({files:[file],title:eventName});return;}
          catch(error){if(error.name==='AbortError')return;/* Fall back to a download if file sharing is blocked. */}
        }
        const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=file.name;container.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
        showToast(share?'Poster downloaded—send the image to your crew.':'Poster image saved.');
      }catch(error){if(error.name!=='AbortError')showToast(error.message||'Could not export the poster.');}
      finally{buttons.forEach(b=>b.disabled=!posterEntries.length);}
    }
    document.addEventListener('visibilitychange',()=>{if(document.hidden)close();},{signal:lifetime.signal});
    window.addEventListener('pagehide',close,{signal:lifetime.signal});
    return {openArtist,renderPoster,updateArtist,close,destroy(){close();dialog?.remove();lifetime.abort();}};
  }
  window.RallyLineupDiscovery={artistNames,matchTracks,embedUrl,previewUrl,create};
})();
