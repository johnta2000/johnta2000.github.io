// Artist discovery and shareable posters. No credentials or preview audio are
// persisted: Apple hosts its own player, and the poster uses only lineup text.
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/æ/gi,'ae').toLowerCase().replace(/[^a-z0-9]/g,'');
  function artistNames(label) {
    return [...new Set(String(label || '').replace(/\((?:[^)]*set|detox|throwback)\)/gi,'').replace(/\s+H\.?C\.?D\.?$/i,'').replace(/\s*&\s*Friends$/i,'').split(/\s+(?:b2b(?:2b)*|\+)\s+/i).map(s=>s.trim()).filter(Boolean))].slice(0,6);
  }
  function storeUrl(track) {
    try { const url=new URL(track.trackViewUrl); return ['music.apple.com','itunes.apple.com'].includes(url.hostname)&&url.protocol==='https:'?url.href:null; } catch { return null; }
  }
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
      const tracks=matchTracks(name,(await response.json()).results).filter(track=>embedUrl(track));
      if(catalog.size>=150)catalog.delete(catalog.keys().next().value);
      catalog.set(key,{time:Date.now(),tracks});return tracks;
    } finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  function create({root,container,poster,eventName,dateLabel,timeLabel,getFavorites,getPeople,onFavorite,showToast}) {
    let dialog=null, request=null, selectedEntry=null, revision=0, posterEntries=[], posterMode='mine';
    const stop = () => { revision++;request?.abort();request=null;dialog?.querySelectorAll('iframe').forEach(frame=>frame.remove()); };
    const close = () => { stop();dialog?.close(); };
    function updateArtist() {
      if(!dialog||!selectedEntry)return;
      const saved=getFavorites().has(selectedEntry.id), people=getPeople(selectedEntry.id);
      const button=dialog.querySelector('[data-artist-favorite]');
      button.textContent=saved?'★ Liked':'☆ Like this set';button.setAttribute('aria-pressed',String(saved));
      dialog.querySelector('.artist-crew').textContent=people.length?`${people.length} interested · ${people.map(p=>p.name).join(' · ')}`:'No crew likes yet';
    }
    function drawTrack(track, tracks) {
      const player=dialog.querySelector('.artist-player');
      const dark=getComputedStyle(root.host||document.documentElement).colorScheme.includes('dark');
      const src=embedUrl(track,dark); if(!src)return;
      player.innerHTML=`<iframe title="${escape(track.trackName)} by ${escape(track.artistName)} · Apple Music preview" src="${escape(src)}" height="175" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe><p class="artist-preview-hint">Tap play for a music preview.</p><a href="${escape(storeUrl(track))}" target="_blank" rel="noopener noreferrer">Open this song in Apple Music ↗</a>`;
      dialog.querySelector('.artist-tracks').innerHTML=tracks.map(t=>`<button type="button" data-track="${t.trackId}" aria-pressed="${t.trackId===track.trackId}"><span>${escape(t.trackName)}</span><small>${escape(t.artistName)}</small></button>`).join('');
      dialog.querySelectorAll('[data-track]').forEach(button=>button.onclick=()=>drawTrack(tracks.find(t=>String(t.trackId)===button.dataset.track),tracks));
    }
    async function loadArtist(name) {
      stop(); const current=revision;request=new AbortController();
      const player=dialog.querySelector('.artist-player'), list=dialog.querySelector('.artist-tracks');list.innerHTML='';
      player.innerHTML='<p class="artist-preview-status" role="status">Finding music previews…</p>';
      dialog.querySelectorAll('[data-preview-artist]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.previewArtist===name)));
      try {
        const tracks=await search(name,request.signal);
        if(current!==revision||!dialog?.open)return;
        if(!tracks.length){player.innerHTML='<p class="artist-preview-status" role="status">No matching preview found for this artist.</p>';return;}
        drawTrack(tracks[0],tracks);
      }catch(error){
        if(current!==revision||!dialog?.open)return;
        player.innerHTML=`<p class="artist-preview-status" role="status">${navigator.onLine===false?'Music previews need an internet connection. Your likes still work offline.':'Music previews are unavailable right now.'}</p><button type="button" class="discovery-action" data-preview-retry>Try again</button>`;
        player.querySelector('[data-preview-retry]').onclick=()=>loadArtist(name);
      }
    }
    function openArtist(entry, trigger) {
      if(!entry)return;
      close();dialog?.remove();selectedEntry=entry;
      const originId=trigger?.closest('#lineup-poster,#mobile-schedule,#table-body,#poster-content,#heat-content,#timeline-view')?.id;
      const names=artistNames(entry.artist), title='artist-title';
      dialog=document.createElement('dialog');dialog.className='artist-dialog';dialog.setAttribute('aria-labelledby',title);
      dialog.innerHTML=`<header class="artist-dialog-head"><div><p class="discovery-eyebrow">Discover the lineup</p><h2 id="${title}">${escape(entry.artist)}</h2></div><button type="button" class="artist-close" aria-label="Close artist">×</button></header><p class="artist-set-detail">${escape(entry.day)} · ${escape(timeLabel(entry))}${entry.stage==='Stage TBA'?'':' · '+escape(entry.stage)}</p>${entry.genre?`<p class="artist-genre">${escape(entry.genre)}</p>`:''}<div class="artist-like-row"><button type="button" class="discovery-action" data-artist-favorite aria-pressed="false"></button><p class="artist-crew"></p></div>${names.length>1?`<div class="artist-collaborators" role="group" aria-label="Preview artist">${names.map(n=>`<button type="button" data-preview-artist="${escape(n)}" aria-pressed="false">${escape(n)}</button>`).join('')}</div>`:''}<section class="artist-music" aria-label="Music previews"><div class="artist-player"></div><div class="artist-tracks" aria-label="Choose a song"></div><p class="artist-credit">Music previews provided by Apple Music. Availability varies by artist and region.</p></section>${entry.notes?`<p class="artist-notes">${escape(entry.notes)}</p>`:''}`;
      container.append(dialog);updateArtist();
      dialog.querySelector('.artist-close').onclick=close;
      dialog.querySelector('[data-artist-favorite]').onclick=()=>{onFavorite(entry.id);updateArtist();};
      dialog.querySelectorAll('[data-preview-artist]').forEach(b=>b.onclick=()=>loadArtist(b.dataset.previewArtist));
      dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const box=dialog.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)close();});
      const ownedDialog=dialog;
      dialog.addEventListener('close',()=>{ownedDialog.remove();if(dialog!==ownedDialog)return;stop();dialog=null;selectedEntry=null;const replacement=[...(root.getElementById(originId)?.querySelectorAll('[data-artist-id]')||[])].find(b=>b.dataset.artistId===entry.id);const target=trigger?.isConnected?trigger:replacement||root.getElementById('lineup-poster-button');target?.focus({preventScroll:true});},{once:true});
      dialog.showModal();dialog.querySelector('.artist-close').focus({preventScroll:true});
      if(names[0])loadArtist(names[0]);
    }
    function groups(entries) {
      const days=[...new Set(entries.map(e=>e.day))];
      return days.map(day=>({day,stages:[...new Set(entries.filter(e=>e.day===day).map(e=>e.stage))].map(stage=>({stage,entries:entries.filter(e=>e.day===day&&e.stage===stage).sort((a,b)=>(a.estimatedOrder??a.posterIndex)-(b.estimatedOrder??b.posterIndex))}))}));
    }
    function highlighted(entry) { return posterMode==='crew'?getPeople(entry.id).length>0:getFavorites().has(entry.id); }
    function renderPoster(entries, {crew=false}={}) {
      posterEntries=entries;posterMode=crew?'crew':'mine';
      const count=entries.filter(highlighted).length;
      poster.innerHTML=`<div class="poster-actions"><p>Tap an artist to preview. ${crew?'Crew':'Your'} likes are highlighted.</p><div><button type="button" class="discovery-action" data-poster-save ${entries.length?'':'disabled'}>Save image</button><button type="button" class="discovery-action" data-poster-share ${entries.length?'':'disabled'}>Share poster</button></div></div><article class="lineup-art" aria-label="Interactive lineup poster"><header><p class="discovery-eyebrow">Rally · ${crew?'Crew picks':'Your lineup'}</p><h2>${escape(eventName)}</h2><p>${escape(dateLabel)}</p><span>${count} liked ${count===1?'set':'sets'} · ${entries.length} shown</span></header><div class="lineup-art-days">${groups(entries).map(group=>`<section class="lineup-art-day"><h3>${escape(group.day)}</h3>${group.stages.map(({stage,entries})=>`<section class="lineup-art-stage">${stage==='Stage TBA'?'':`<h4>${escape(stage)}</h4>`}<div class="lineup-art-names">${entries.map(entry=>`<button type="button" class="poster-artist${highlighted(entry)?' is-liked':''}" data-artist-id="${escape(entry.id)}" aria-label="Preview ${escape(entry.artist)}${highlighted(entry)?' · Liked':''}"><span>${escape(entry.artist)}</span>${highlighted(entry)?'<i aria-hidden="true">★</i>':''}</button>`).join('')}</div></section>`).join('')}</section>`).join('')||'<p class="poster-empty">No matching sets. Try different filters.</p>'}</div><footer>★ ${crew?'Liked by your crew':'Liked by you'} · Set times and filters in Rally</footer></article>`;
      poster.querySelector('[data-poster-save]').onclick=()=>exportPoster(false);
      poster.querySelector('[data-poster-share]').onclick=()=>exportPoster(true);
      updateArtist();
    }
    // A generated text poster avoids cross-origin canvas taint and never
    // exports other people's names, private notes, or provider album artwork.
    function posterCanvas() {
      const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
      const style=getComputedStyle(root.host||document.documentElement), color=token=>style.getPropertyValue(token).trim();
      const colors={paper:color('--paper')||'#f7f7f2',ink:color('--ink')||'#202b25',muted:color('--muted')||'#5d6c61',accent:color('--rally-accent')||'#285f4a',soft:color('--rally-soft')||'#e8f0e9'};
      const width=1200, margin=72, max=width-margin*2, rows=[];
      function wrap(text,font,limit=max){ctx.font=font;const lines=[];let line='';for(const word of String(text).split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>limit&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;}
      function add(text,font,fill,height){for(const line of wrap(text,font))rows.push({line,font,fill,height});}
      add(`RALLY / ${posterMode==='crew'?'CREW PICKS':'MY LINEUP'}`,'700 22px system-ui',colors.accent,45);
      eventName.split(/\s+(?=ft\.|feat\.|featuring\b)/i).forEach((part,i)=>add(part,i?'700 42px system-ui':'800 60px system-ui',colors.ink,i?58:76));add(dateLabel,'400 26px system-ui',colors.muted,54);
      const picked=posterEntries.filter(highlighted).length;
      add(`★ ${picked} liked ${picked===1?'set':'sets'} · ${posterEntries.length} shown`,'500 24px system-ui',colors.accent,60);
      const days=groups(posterEntries), columns=Math.min(3,days.length), gap=32, columnWidth=(max-gap*(columns-1))/columns;
      const font=columns===1?'750 34px system-ui':'750 27px system-ui';
      function layoutDay(group) {
        const lines=[];
        for(const line of wrap(group.day.toUpperCase(),'800 32px system-ui',columnWidth))lines.push({text:line,font:'800 32px system-ui',color:colors.accent,height:64});
        for(const {stage,entries} of group.stages){
          if(stage!=='Stage TBA')for(const line of wrap(stage.toUpperCase(),'600 18px system-ui',columnWidth))lines.push({text:line,font:'600 18px system-ui',color:colors.muted,height:30});
          let items=[], used=0;ctx.font=font;
          for(const entry of entries){
            const text=(highlighted(entry)?'★ ':'')+entry.artist, itemWidth=Math.min(columnWidth,ctx.measureText(text).width+28);
            if(used+itemWidth>columnWidth&&items.length){lines.push({items,height:56});items=[];used=0;}
            items.push({text,width:itemWidth,liked:highlighted(entry)});used+=itemWidth;
          }
          if(items.length)lines.push({items,height:56});lines.push({height:26});
        }
        return lines;
      }
      const dayRows=[];
      for(let i=0;i<days.length;i+=columns){const cells=days.slice(i,i+columns).map(layoutDay);dayRows.push({cells,height:Math.max(...cells.map(lines=>lines.reduce((n,line)=>n+line.height,0)))+30});}
      const headingHeight=rows.reduce((n,row)=>n+row.height,0)+28;
      const height=margin*2+headingHeight+dayRows.reduce((n,row)=>n+row.height,0)+80;
      if(height>24000)throw new Error('Choose one day or stage to make a smaller poster.');
      canvas.width=width;canvas.height=height;ctx.fillStyle=colors.paper;ctx.fillRect(0,0,width,height);ctx.textBaseline='middle';
      ctx.textAlign='center';let y=margin;
      for(const row of rows){ctx.font=row.font;ctx.fillStyle=row.fill;ctx.fillText(row.line,width/2,y+row.height/2,max);y+=row.height;}
      y+=28;
      for(const row of dayRows){
        row.cells.forEach((lines,column)=>{
          const center=margin+column*(columnWidth+gap)+columnWidth/2;let top=y;
          for(const line of lines){
            if(line.text){ctx.font=line.font;ctx.fillStyle=line.color;ctx.fillText(line.text,center,top+line.height/2,columnWidth);}
            if(line.items){let x=center-line.items.reduce((n,item)=>n+item.width,0)/2;for(const item of line.items){
              if(item.liked){ctx.fillStyle=colors.soft;ctx.fillRect(x+3,top+4,item.width-6,line.height-8);}
              ctx.font=font;ctx.fillStyle=item.liked?colors.accent:colors.ink;ctx.fillText(item.text,x+item.width/2,top+line.height/2,item.width-22);x+=item.width;
            }}top+=line.height;
          }
        });y+=row.height;
      }
      ctx.font='500 22px system-ui';ctx.fillStyle=colors.muted;ctx.fillText('★ '+(posterMode==='crew'?'Liked by the crew':'My picks')+'  /  Made in Rally',width/2,y+40,max);
      return canvas;
    }
    async function exportPoster(share) {
      const buttons=[...poster.querySelectorAll('[data-poster-save],[data-poster-share]')];buttons.forEach(b=>b.disabled=true);
      try {
        const canvas=posterCanvas(), blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not create the image.');
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
    return {openArtist,renderPoster,updateArtist,close,destroy(){close();dialog?.remove();}};
  }
  window.RallyLineupDiscovery={artistNames,matchTracks,embedUrl,create};
})();
