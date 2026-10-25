import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Link2,Plus} from 'lucide-react';
import SharedPicker from './SharedPicker';
import type {Rave} from '../lib/raves';
import type {CollectionBackend,RallyEvent} from './Journal';
const zones=['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','Europe/London','Europe/Brussels','Europe/Amsterdam','Europe/Berlin','Asia/Tokyo','Australia/Sydney'];
export default function PlanConnection({rave,backend,events,onUpdated}:{rave:Rave;backend:CollectionBackend;events:RallyEvent[];onUpdated:(r:Rave)=>void}) {
  const [mode,setMode]=useState(''),[eventId,setEventId]=useState(''),[timeZone,setTimeZone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Los_Angeles');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const connect=async()=>{
    if(busy)return;setBusy(true);setError('');
    try {const saved=mode==='create'?await backend.createPlan(rave.id,timeZone):await backend.save({...rave,sourceEventId:eventId});if(active.current){onUpdated(saved);setMode('');}}
    catch(e){if(active.current)setError(e instanceof Error?e.message:'Could not connect your plan. Try again.');}
    finally{if(active.current)setBusy(false);}
  };
  return <section className="diary-plan-link" aria-label="Rally plan connection">
    <h3><Link2 size={17}/>Rally plan</h3>
    {rave.sourceEventId?<><p>This private diary entry is linked to your crew’s shared plan. Use Rally for tickets, travel, and planning together.</p><a className="secondary" href={`/tools/rally/?event=${encodeURIComponent(rave.sourceEventId)}`}>Open rave plan<ArrowUpRight size={16}/></a></>:<>
      <p>Keep this rave just for you, or connect a Rally plan to organize it with friends.</p>
      {mode==='create'?<><strong>{rave.name}</strong><p>{rave.startDate} – {rave.endDate}<br/>{[rave.venue,rave.city].filter(Boolean).join(' · ')}</p>
        <p>The new plan starts with you as its admin. It copies the event details and any catalog lineup. Invite friends from Rally. Your costs, notes, photos, wishlist, and diary crew stay private.</p>
        <SharedPicker label="Event timezone" value={timeZone} onChange={setTimeZone} allowCustom searchTokens options={[...new Set([timeZone,...zones])].map(zone=>({value:zone,label:zone.replaceAll('_',' ')}))}/>
      </>:mode==='link'?<><SharedPicker label="Link an existing Rally plan" value={eventId} onChange={setEventId} searchTokens options={[{value:'',label:'Choose your Rally plan…'},...events.map(e=>({value:e.id,label:`${e.name} · ${e.startsAt}`}))]}/><p>Your diary details stay as they are. The shared plan won’t receive your personal notes or spending.</p></>:null}
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="diary-plan-actions">{mode?<><button className="primary" disabled={busy||mode==='link'&&!eventId} onClick={()=>void connect()}>{busy?'Connecting…':mode==='create'?'Create and link plan':'Link this plan'}</button><button className="secondary" disabled={busy} onClick={()=>{setMode('');setError('');}}>Cancel</button></>:<><button className="secondary" onClick={()=>setMode('create')}><Plus size={15}/>Create a Rally plan</button>{events.length>0&&<button className="secondary" onClick={()=>setMode('link')}>Link existing plan</button>}</>}</div>
    </>}
  </section>;
}
