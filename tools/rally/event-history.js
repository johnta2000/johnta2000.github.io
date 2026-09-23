window.RallyHistory={
 menu(events,current){
  const rows=list=>list.map(event=>`<button data-event="${escapeAttr(event.id)}"><strong>${escapeHtml(event.name)}</strong><small class="event-menu-date">${dateRange(event.startsAt,event.endsAt)}</small><small>${escapeHtml(event.location)}</small></button>`).join('');
  const all=events.map(e=>e.id===current.id?{...e,...current}:e),past=all.filter(e=>RallyEvents.lifecycle(e).past).sort((a,b)=>b.endsAt.localeCompare(a.endsAt)),active=all.filter(e=>!RallyEvents.lifecycle(e).past).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  return `<small class="event-group-label">Upcoming & ongoing</small>${rows(active)||'<p class="event-group-label">No upcoming raves</p>'}${past.length?`<details class="past-raves"><summary>Past raves <span>${past.length}</span></summary>${rows(past)}</details>`:''}`;
 },
 mount(data){
  document.getElementById('eventHistoryBanner')?.remove();
  const status=RallyEvents.lifecycle(data);
  if(!status.finished&&!status.past&&!data.isAdmin)return;
  const banner=document.createElement('div');banner.id='eventHistoryBanner';banner.className='event-history-banner';
  banner.innerHTML=`<span>${status.finished?'Event finished · ':status.past?'Past rave · ':''}${status.finished||status.past?'Your plans, likes, and notes are still here.':'Moves to Past raves 48 hours after it ends.'}</span>${data.isAdmin?'<button type="button" class="secondary">Event settings</button>':''}`;
  document.getElementById('offlineStatus')?.after(banner);
  banner.querySelector('button')?.addEventListener('click',()=>{
    openDialog('Event history','Past raves stay editable and old links keep working. Restoring keeps a rave in the main list until you switch back to Automatic.',
      `<label class="field"><span>Show this rave</span><select name="visibility">${[['auto','Automatic · 48 hours after ending'],['past','Past raves · move now'],['active','Main list · keep restored']].map(([value,label])=>`<option value="${value}" ${value===(data.eventVisibility||'auto')?'selected':''}>${label}</option>`).join('')}</select></label>`+
      field('Final event day','endsAt',data.endsAt,'date')+field('Event timezone','timeZone',status.timeZone||'','text')+'<p>Use an IANA timezone, e.g. America/New_York. Overnight sets are included. Without final-day set times, the end is 6 AM the following morning.</p>',
      async values=>{await act('configure-event-history',values,'Event history updated');closeDialog();});
  });
 }
};
