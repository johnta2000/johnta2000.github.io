import {useEffect,useRef,useState} from 'react';
import {ArrowDownUp,ArrowUpRight,Link2,Plus,RefreshCw,Users} from 'lucide-react';
import SharedPicker from './SharedPicker';
import {festivalForRave} from '../lib/festivals';
import type {Rave} from '../lib/raves';
import type {CollectionBackend,RallyEvent,PlanConnectionState} from './Journal';
const zones=['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','Europe/London','Europe/Brussels','Europe/Amsterdam','Europe/Berlin','Asia/Tokyo','Australia/Sydney'];
const formatDate=(value:string)=>value?new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Date not set';
const dates=(r:Pick<Rave,'startDate'|'endDate'>)=>r.startDate===r.endDate?formatDate(r.startDate):`${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
type Mode=''|'create'|'link'|'toDiary'|'toPlan'|'memory'|'unlink';
export default function PlanConnection({rave,raves,backend,events,onUpdated}:{rave:Rave;raves:Rave[];backend:CollectionBackend;events:RallyEvent[];onUpdated:(r:Rave)=>void}) {
 const [mode,setMode]=useState<Mode>(''),[eventId,setEventId]=useState(''),[timeZone,setTimeZone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Los_Angeles');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [preview,setPreview]=useState<PlanConnectionState|null>(null),[fields,setFields]=useState<string[]>([]),[note,setNote]=useState(''),[album,setAlbum]=useState('');
 const active=useRef(true),version=useRef(0);const edition=festivalForRave(rave);
 useEffect(()=>{active.current=true;return()=>{active.current=false;version.current++;};},[]);
 const refresh=async()=>{const v=++version.current;setLoading(true);setFields([]);setError('');try{const result=await backend.connection(rave.id);if(active.current&&version.current===v)setPreview(result);}catch(e){if(active.current&&version.current===v){setPreview(null);setError(e instanceof Error?e.message:'Could not load plan updates.');}}finally{if(active.current&&version.current===v)setLoading(false);}};
 useEffect(()=>{setPreview(null);if(rave.sourceEventId)void refresh();return()=>{version.current++;};},[rave.id,rave.sourceEventId,backend]);
 const alreadyLinked=(id:string)=>raves.some(r=>r.id!==rave.id&&r.sourceEventId===id);
 const canLink=events.some(e=>e.id===eventId&&!alreadyLinked(e.id));
 const connect=async()=>{
  if(busy||(mode==='link'&&!canLink))return;setBusy(true);setError('');
  try{const saved=mode==='create'?await backend.createPlan(rave.id,timeZone):await backend.save({...rave,sourceEventId:eventId});if(active.current){onUpdated(saved);setMode('');}}
  catch(e){if(active.current)setError(e instanceof Error?e.message:'Could not connect your plan.');}finally{if(active.current)setBusy(false);}
 };
 const review=(next:Mode)=>{setFields([]);setError('');setNotice('');setMode(next);if(next==='memory'){setNote(preview?.myMemory?.note||'');setAlbum(preview?.myMemory?.albumUrl||'');}};
 const disconnect=async()=>{if(busy)return;setBusy(true);setError('');try{const saved=await backend.save({...rave,sourceEventId:undefined});if(active.current){onUpdated(saved);setMode('');setNotice('The diary link was removed.');}}catch(e){if(active.current)setError(e instanceof Error?e.message:'Could not disconnect.');}finally{if(active.current)setBusy(false);}};
 const apply=async()=>{
  if(!preview||busy)return;setBusy(true);setError('');
  try{
   if(mode==='memory'){await backend.shareMemory(rave.id,note,album,preview.revision);}
   else{const saved=await backend.syncPlan(rave.id,mode==='toDiary'?'toDiary':'toPlan',fields,preview.revision);if(active.current)onUpdated(saved);}
   if(active.current){setNotice(mode==='memory'?'Shared memory updated for this crew.':'Selected updates applied. Your attendance and private memories stay as you set them.');setMode('');await refresh();}
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Could not apply updates. Refresh the preview and try again.');}finally{if(active.current)setBusy(false);}
 };
 const choice=(id:string,title:string,help:string,disabled=false)=><label className="plan-sync-choice"><input type="checkbox" checked={fields.includes(id)} disabled={busy||disabled} onChange={()=>setFields(prev=>prev.includes(id)?prev.filter(f=>f!==id):[...prev,id])}/><span><strong>{title}</strong><small>{help}</small></span></label>;
 return <section className="diary-plan-link" aria-label="Rally plan connection">
  <h3><Link2 size={17}/>Rally plan</h3>
  {edition&&<p className="network-event"><span className="network-badge">Shared event</span><strong>{edition.name}</strong><span>{dates(edition)} · {edition.city}</span></p>}
  {rave.sourceEventId?<>
   <p>This private diary entry is linked to your crew’s shared plan. Review updates in either direction whenever you choose.</p>
   <a className="secondary" href={`/tools/rally/?event=${encodeURIComponent(rave.sourceEventId)}`}>Open rave plan<ArrowUpRight size={16}/></a>
   {loading&&<p role="status">Loading your plan connection…</p>}
   {preview&&<>
    <div className="connection-overview"><strong>{preview.details.name}</strong><span><Users size={14}/>{preview.people.length} other crew {preview.people.length===1?'member':'members'} · {preview.lineup.length} billed sets</span><small>Being in a plan never marks anyone as having attended.</small></div>
    {!mode&&<div className="diary-plan-actions"><button className="secondary" disabled={busy||loading} onClick={()=>review('toDiary')}><ArrowDownUp size={15}/>Review plan → diary</button><button className="secondary" disabled={busy||loading} onClick={()=>review('toPlan')}>Review diary → plan</button><button className="secondary" disabled={busy||loading} onClick={()=>review('memory')}>Share a memory with this crew</button></div>}
    {(mode==='toDiary'||mode==='toPlan')&&<div className="plan-sync-review">
     <h4>{mode==='toDiary'?'Bring updates into your diary':'Send selected updates to Rally'}</h4>
     <p>Choose exactly what to apply. Costs, ratings, private notes, and photo links are excluded.</p>
     {choice('details','Event details',mode==='toDiary'?`${preview.details.name} · ${dates(preview.details)} · ${preview.details.venue} · ${preview.details.city}`:`${rave.name} · ${dates(rave)} · ${rave.venue} · ${rave.city}`,mode==='toPlan'&&!preview.canUpdatePlan)}
     {mode==='toDiary'?<>
      {choice('wishlist','Add my Rally set interests to my wishlist',preview.wishlist.length?preview.wishlist.join(' · '):'No set interests selected in Rally.',rave.attendance!=='planned'||!preview.wishlist.length)}
      {choice('crew','Add the crew as planned companions',preview.people.map(p=>p.name).join(' · ')||'No other crew members yet.',rave.attendance!=='planned'||!preview.people.length)}
      {rave.attendance!=='planned'&&<p>For an attended rave, choose your actual sets and companions in the diary editor.</p>}
     </>:<>
      {choice('catalog','Add the public event lineup',edition?`${edition.artists.length} catalog sets. Existing times and sets are preserved.`:'Choose a catalog event in the diary editor first.',!preview.canUpdatePlan||!edition)}
      {choice('wishlist','Share my wishlist as Rally set interests',(rave.plannedArtists||[]).join(' · ')||'Your wishlist is empty.',!(rave.plannedArtists||[]).length)}
      {!preview.canUpdatePlan&&<p>A project admin can update shared event details and the catalog lineup. You can share your own set interests.</p>}
     </>}
     <div className="diary-plan-actions"><button className="primary" disabled={busy||!fields.length} onClick={()=>void apply()}>{busy?'Applying…':'Apply selected updates'}</button><button className="secondary" disabled={busy} onClick={()=>setMode('')}>Cancel updates</button></div>
    </div>}
    {mode==='memory'&&<div className="plan-sync-review">
     <h4>Share with {preview.details.name}</h4><p>Everyone in this Rally project can read what you publish here. Your private diary note and album are separate.</p>
     <label className="field">A shared memory<textarea rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Write something for this crew…"/></label>
     <label className="field">Shared album link<input type="url" value={album} maxLength={2000} onChange={e=>setAlbum(e.target.value)} placeholder="https://photos.app.goo.gl/…"/></label>
     <small>The album’s sharing settings still control who can open its photos. Clear both fields to remove your shared memory.</small>
     <div className="diary-plan-actions"><button className="primary" disabled={busy||(!note.trim()&&!album.trim()&&!preview.myMemory)} onClick={()=>void apply()}>{busy?'Publishing…':note.trim()||album.trim()||!preview.myMemory?'Publish to this crew':'Remove my shared memory'}</button><button className="secondary" disabled={busy} onClick={()=>setMode('')}>Cancel sharing</button></div>
    </div>}
    {preview.sharedMemories.length>0&&<details className="shared-crew-memories"><summary>Memories shared with this crew ({preview.sharedMemories.length})</summary>{preview.sharedMemories.map(m=><article key={m.memberId}><strong>{m.name}</strong>{m.note&&<p>{m.note}</p>}{m.albumUrl&&<a href={m.albumUrl} target="_blank" rel="noopener noreferrer">Open shared album ↗</a>}</article>)}</details>}
   </>}
   {mode==='unlink'&&<div className="plan-sync-review"><h4>Disconnect this diary entry?</h4><p>Your diary details stay intact. The Rally project and any memories you published to its crew stay in Rally.</p><div className="diary-plan-actions"><button className="secondary" disabled={busy} onClick={()=>void disconnect()}>{busy?'Disconnecting…':'Disconnect this plan'}</button><button className="secondary" disabled={busy} onClick={()=>setMode('')}>Keep the connection</button></div></div>}
   {!mode&&<button className="connection-refresh" disabled={busy||loading} onClick={()=>review('unlink')}>Disconnect plan</button>}
   {<button className="connection-refresh" disabled={busy||loading} onClick={()=>void refresh()}><RefreshCw size={14}/>Refresh plan updates</button>}
  </>:<>
   <p>Keep this rave just for you, or connect a Rally plan to organize it with friends.</p>
   {mode==='create'?<><strong>{rave.name}</strong><p>{dates(rave)}<br/>{[rave.venue,rave.city].filter(Boolean).join(' · ')}</p><p>The new plan starts with you as its admin. It copies the event details and any catalog lineup. Invite friends from Rally. Your costs, notes, photos, wishlist, and diary crew stay private.</p><SharedPicker label="Event timezone" value={timeZone} onChange={setTimeZone} allowCustom searchTokens options={[...new Set([timeZone,...zones])].map(zone=>({value:zone,label:zone.replaceAll('_',' ')}))}/></>
    :mode==='link'?<><SharedPicker label="Link an existing Rally plan" value={eventId} onChange={setEventId} searchTokens options={[{value:'',label:'Choose your Rally plan…'},...events.map(e=>({value:e.id,label:`${e.name} · ${e.startsAt}${alreadyLinked(e.id)?' · Already in your diary':''}`,disabled:alreadyLinked(e.id)}))]}/><p>Raves already linked to another diary entry cannot be selected again.</p><p>Your diary details stay as they are. The shared plan won’t receive your personal notes or spending.</p></>:null}
   <div className="diary-plan-actions">{mode?<><button className="primary" disabled={busy||mode==='link'&&!canLink} onClick={()=>void connect()}>{busy?'Connecting…':mode==='create'?'Create and link plan':'Link this plan'}</button><button className="secondary" disabled={busy} onClick={()=>setMode('')}>Cancel</button></>:<><button className="secondary" onClick={()=>setMode('create')}><Plus size={15}/>Create a Rally plan</button>{events.length>0&&<button className="secondary" onClick={()=>setMode('link')}>Link existing plan</button>}</>}</div>
  </>}
  {notice&&<p role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
