import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,CalendarDays,Users} from 'lucide-react';
import SharedPicker from './SharedPicker';
import {diaryToday,type Rave} from '../lib/raves';
import type {CollectionBackend,RallyEvent,PlanConnectionState} from './Journal';
const zones=['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','Europe/London','Europe/Brussels','Europe/Amsterdam','Europe/Berlin','Asia/Tokyo','Australia/Sydney'];
export default function PlanConnection({rave,backend,onUpdated}:{rave:Rave;raves:Rave[];backend:CollectionBackend;events:RallyEvent[];onUpdated:(r:Rave)=>void}) {
 const [creating,setCreating]=useState(false),[sharing,setSharing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [preview,setPreview]=useState<PlanConnectionState|null>(null),[note,setNote]=useState(''),[album,setAlbum]=useState('');
 const [timeZone,setTimeZone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Los_Angeles');
 const active=useRef(true),version=useRef(0);
 useEffect(()=>{active.current=true;return()=>{active.current=false;version.current++;};},[]);
 const refresh=async()=>{const v=++version.current;try{const result=await backend.connection(rave.id);if(active.current&&version.current===v){setPreview(result);setError('');}}catch(e){if(active.current&&version.current===v){setPreview(null);setError(e instanceof Error?e.message:'Could not load your crew.');}}};
 useEffect(()=>{setPreview(null);if(rave.sourceEventId)void refresh();return()=>{version.current++;};},[rave.id,rave.sourceEventId,backend]);
 const create=async()=>{if(busy)return;setBusy(true);setError('');try{const saved=await backend.createPlan(rave.id,timeZone);if(active.current){onUpdated(saved);setCreating(false);}}catch(e){if(active.current)setError(e instanceof Error?e.message:'Could not start planning.');}finally{if(active.current)setBusy(false);}};
 const publish=async()=>{if(!preview||busy)return;setBusy(true);setError('');try{await backend.shareMemory(rave.id,note,album,preview.revision);if(active.current){setSharing(false);setNotice('Crew memory updated.');await refresh();}}catch(e){if(active.current)setError(e instanceof Error?e.message:'Could not share your memory.');}finally{if(active.current)setBusy(false);}};
 // A past personal memory has no need for an empty planning project.
 if(!rave.sourceEventId&&(rave.startDate<diaryToday()||rave.attendance!=='planned'))return null;
 return <section className="diary-plan-link" aria-label={rave.sourceEventId?'Your Raveington rave':'Plan with friends'}>
  {rave.sourceEventId?<>
   <h3><Users size={17}/>Your Raveington rave</h3>
   <p>Already in your diary because you’re in this rave’s crew. Event details stay up to date from Raveington.</p>
   <a className="secondary" href={`/tools/rally/?event=${encodeURIComponent(rave.sourceEventId)}`}>Open crew plan<ArrowUpRight size={16}/></a>
   {preview&&<>
    <small className="detail-caption">{preview.people.length} other crew {preview.people.length===1?'member':'members'} · {preview.lineup.length} billed sets</small>
    {preview.sharedMemories.length>0&&<details className="shared-crew-memories"><summary>Memories from the crew ({preview.sharedMemories.length})</summary>{preview.sharedMemories.map(m=><article key={m.memberId}><strong>{m.name}</strong>{m.note&&<p>{m.note}</p>}{m.albumUrl&&<a href={m.albumUrl} target="_blank" rel="noopener noreferrer">Open shared album ↗</a>}</article>)}</details>}
    {!sharing?<button className="connection-refresh" disabled={busy} onClick={()=>{setNote(preview.myMemory?.note||'');setAlbum(preview.myMemory?.albumUrl||'');setSharing(true);setNotice('');}}>Share a memory with this crew</button>:<div className="plan-sync-review">
     <h4>A memory for your crew</h4><p>Everyone in this Raveington rave can read what you publish here. Your private diary note and album stay personal.</p>
     <label className="field">A shared memory<textarea rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Write something for this crew…"/></label>
     <label className="field">Shared album link<input type="url" value={album} maxLength={2000} onChange={e=>setAlbum(e.target.value)} placeholder="https://photos.app.goo.gl/…"/></label>
     <small>Clear both fields to remove your shared memory. Album permissions still apply.</small>
     <div className="diary-plan-actions"><button className="primary" disabled={busy||(!note.trim()&&!album.trim()&&!preview.myMemory)} onClick={()=>void publish()}>{busy?'Publishing…':note.trim()||album.trim()||!preview.myMemory?'Publish to this crew':'Remove my shared memory'}</button><button className="secondary" disabled={busy} onClick={()=>setSharing(false)}>Cancel sharing</button></div>
    </div>}
   </>}
   {error&&<button className="secondary" disabled={busy} onClick={()=>void refresh()}>Reload crew</button>}
  </>:<>
   <h3><CalendarDays size={17}/>Going with friends?</h3>
   <p>Start a crew plan for tickets, travel, and the lineup. This same rave stays in your diary.</p>
   {creating?<><SharedPicker label="Event timezone" value={timeZone} onChange={setTimeZone} allowCustom searchTokens options={[...new Set([timeZone,...zones])].map(zone=>({value:zone,label:zone.replaceAll('_',' ')}))}/><p>Your costs, notes, photos, wishlist, and diary crew stay private.</p><div className="diary-plan-actions"><button className="primary" disabled={busy} onClick={()=>void create()}>{busy?'Starting…':'Start crew plan'}</button><button className="secondary" disabled={busy} onClick={()=>setCreating(false)}>Cancel</button></div></>:<button className="secondary" onClick={()=>setCreating(true)}>Plan with friends<ArrowUpRight size={16}/></button>}
  </>}
  {notice&&<p role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
