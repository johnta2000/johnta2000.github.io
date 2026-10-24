// A collection is personal to the signed-in account; a project room only supplies a draft.
window.RallyCollection={
  url(eventId=''){return '/tools/rally/collection/'+(eventId?'?from='+encodeURIComponent(eventId):'');},
  mount(room,{offline=()=>false,loadExperience}={}){
    document.getElementById('personalExperience')?.remove();
    const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    if(!room?.id||room.startsAt>today)return;
    const section=document.createElement('section');section.id='personalExperience';section.className='personal-experience';
    const copy=document.createElement('div'),title=document.createElement('strong'),description=document.createElement('p'),link=document.createElement('a');
    title.textContent='Keep your experience';description.textContent='Artists you saw, who you went with, your costs, and your memories — private to your account.';
    copy.append(title,description);link.href=this.url(room.id);link.className='primary';link.textContent='Open my experience ↗';link.dataset.rallyCollection='';
    link.addEventListener('click',event=>{if(offline()){event.preventDefault();showToast('Reconnect to open your personal collection.');}});
    section.append(copy,link);const overview=document.querySelector('.overview-grid');if(overview)overview.after(section);else document.getElementById('page')?.prepend(section);
    const owner=window.Clerk?.user?.id;
    if(loadExperience&&!offline())Promise.resolve().then(loadExperience).then(result=>{
      if(!section.isConnected||window.Clerk?.user?.id!==owner)return;
      link.textContent=result.existing?'View my experience ↗':'Log my experience ↗';
      title.textContent=result.existing?'Your experience is in your diary':'Keep your experience';
    }).catch(()=>{ /* Opening the collection retries the account-bound lookup. */ });
  }
};
