// A collection is personal to the signed-in account; a project room only supplies a draft.
window.RallyCollection={
  url(eventId=''){return '/tools/rally/collection/'+(eventId?'?from='+encodeURIComponent(eventId):'');},
  mount(room,{offline=()=>false,loadExperience}={}){
    document.getElementById('personalExperience')?.remove();
    const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    if(!room?.id)return;
    const upcoming=room.startsAt>today;
    const section=document.createElement('section');section.id='personalExperience';section.className='personal-experience';
    const copy=document.createElement('div'),title=document.createElement('strong'),description=document.createElement('p'),link=document.createElement('a');
    title.textContent=upcoming?'Keep this rave in your diary':'Keep your experience';description.textContent=upcoming?'Save your wishlist and personal costs now. Confirm attendance after the rave.':'Artists you saw, who you went with, your costs, and your memories — private to your account.';
    copy.append(title,description);link.href=this.url(room.id);link.className='primary';link.textContent=upcoming?'Open my diary entry ↗':'Open my experience ↗';link.dataset.rallyCollection='';
    link.addEventListener('click',event=>{if(offline()){event.preventDefault();showToast('Reconnect to open your personal collection.');}});
    section.append(copy,link);const overview=document.querySelector('.overview-grid');if(overview)overview.after(section);else document.getElementById('page')?.prepend(section);
    const owner=window.Clerk?.user?.id;
    if(loadExperience&&!offline())Promise.resolve().then(loadExperience).then(result=>{
      if(!section.isConnected||window.Clerk?.user?.id!==owner)return;
      link.textContent=result.existing?'View diary entry ↗':upcoming?'Save to my diary ↗':'Log my experience ↗';
      if(Array.isArray(result.sharedMemories)&&result.sharedMemories.length){
        const memories=document.createElement('div');memories.className='project-shared-memories';
        const heading=document.createElement('h3');heading.textContent='Memories shared with this crew';memories.append(heading);
        result.sharedMemories.forEach(memory=>{
          const item=document.createElement('article'),name=document.createElement('strong');name.textContent=memory.name||'Crew member';item.append(name);
          if(memory.note){const note=document.createElement('p');note.textContent=memory.note;item.append(note);}
          if(memory.albumUrl){try{const url=new URL(memory.albumUrl);if(['https:','http:'].includes(url.protocol)){const album=document.createElement('a');album.href=url.href;album.target='_blank';album.rel='noopener noreferrer';album.textContent='Open shared album ↗';item.append(album);}}catch{}}
          memories.append(item);
        });section.classList.add('has-shared-memories');section.append(memories);
      }
      title.textContent=result.existing?'This rave is in your diary':upcoming?'Keep this rave in your diary':'Keep your experience';
    }).catch(()=>{ /* Opening the collection retries the account-bound lookup. */ });
  }
};
