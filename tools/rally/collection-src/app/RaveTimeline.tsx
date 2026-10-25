import {ArrowUpRight,Link2,Star} from 'lucide-react';
import {attendanceOf,raveStatus,displaySets,displayCrew,totalCost,type Rave} from '../lib/raves';
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const day=(s:string)=>new Date(s+'T12:00:00');
export default function RaveTimeline({rows,onOpen}:{rows:Rave[];onOpen:(r:Rave)=>void}) {
  return <div className="rave-timeline" aria-label="Rave timeline">{rows.map((r,i)=>{
    const sets=displaySets(r),crew=displayCrew(r);
    const month=r.startDate.slice(0,7),start=day(r.startDate),cost=totalCost(r);
    const range=r.startDate===r.endDate?start.toLocaleDateString('en-US',{month:'short',day:'numeric'}):`${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${day(r.endDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
    return <article key={r.id}>
      {(i===0||rows[i-1].startDate.slice(0,7)!==month)&&<h2 className="timeline-month">{start.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h2>}
      <button className="timeline-card" aria-label={`View ${r.name}`} onClick={()=>onOpen(r)}>
        <span className="timeline-card-head"><span className="timeline-date" aria-hidden="true">{start.toLocaleDateString('en-US',{month:'short'})}<strong>{start.getDate()}</strong></span><span className="timeline-title"><strong>{r.name}</strong><small className="rave-status">{raveStatus(r)}</small><span>{r.city||r.venue||'Location not logged'} · {range}</span></span>{attendanceOf(r)==='attended'&&r.rating>0&&<span className="timeline-rating" aria-label={`${r.rating} out of 5 stars`}><Star size={13} fill={r.rating===5?'currentColor':'none'}/>{r.rating<5?r.rating:''}</span>}</span>
        <span className="timeline-artists">{sets.length?sets.slice(0,2).join(' · '):attendanceOf(r)==='attended'?'Artists not logged':'Add artists to your wishlist'}{sets.length>2&&<small> +{sets.length-2}</small>}</span>
        <span className="timeline-card-bottom"><span className="timeline-crew"><span className="timeline-avatars" aria-hidden="true">{crew.slice(0,3).map(n=><i key={n}>{n.slice(0,1).toUpperCase()}</i>)}</span><span>{crew.length?`${crew[0]}${crew.length>1?` + ${crew.length-1}`:''}`:'Crew not logged'}</span></span><span className="timeline-cost">{cost===null?'Cost unlogged':money(cost)}{cost!==null&&Object.values(r.costs).some(v=>v===null)&&<small>partial</small>}</span></span>
        {(r.albumUrl||r.sourceEventId)&&<span className="timeline-links">{r.albumUrl&&<span><Link2 size={12}/>Photo album</span>}{r.sourceEventId&&<span><ArrowUpRight size={12}/>Linked rave plan</span>}</span>}
      </button>
    </article>;
  })}</div>;
}
