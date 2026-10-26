import CollectionNavigation from './CollectionNavigation';
import useMobileLayout from './useMobileLayout';
import Modal from './Modal';
import RaveForm from './RaveForm';
import SharedPicker from './SharedPicker';
import PlanConnection from './PlanConnection';
import {raveNetwork} from '../lib/network';
import './upcoming.css';
'use client';
import { useEffect, useRef, useState } from 'react';
import { Menu, ChevronRight, MoreHorizontal, Settings, RefreshCw, LockKeyhole, AlertCircle, ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, Disc3, FileSpreadsheet, Heart, LoaderCircle, MapPin, Music2, Plus, Search, Sparkles, Star, Ticket, Trash2, Upload, Users, Wallet, X } from 'lucide-react';
import RaveExplorer from './RaveExplorer';
import {artistsForRave, creditDescription, setCreditsArtist} from '../lib/artists';
import { attendanceOf,diaryToday,isAttended,raveStatus,displaySets,displayCrew,costKeys, days, demoRaves, leaderboard, totalCost, validateRave, type Rave, type CrewConnection } from '../lib/raves';
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const exactMoney=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const date=(d:string,year=false)=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',...(year?{year:'numeric'}:{})});
const dateRange=(r:Rave)=>r.startDate===r.endDate ? date(r.startDate,true) : `${date(r.startDate)} – ${date(r.endDate,true)}`;
const initials=(s:string)=>s.split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase();
const nav=[{id:'raves',name:'Explore',icon:Ticket},{id:'artists',name:'Artists',icon:Music2},{id:'crew',name:'Crew',icon:Users},{id:'recap',name:'Recap',icon:Sparkles}] as const;
type Section=typeof nav[number]['id'];
function Glyph({className=''}:{className?:string}) {return <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 3v34M3 20h34M8 8l24 24M8 32L32 8" stroke="currentColor" strokeWidth="6"/><circle cx="20" cy="20" r="7" fill="currentColor"/></svg>;}
function RaveCard({r,onOpen}:{r:Rave;onOpen:()=>void}) {
  return <button className="favorite-rave" onClick={onOpen} aria-label={`View ${r.name}`}>
    <span className="favorite-rave-date"><CalendarDays size={18}/>{dateRange(r)}</span>
    <strong>{r.name}</strong>
    <span className="favorite-rave-location"><MapPin size={14}/>{r.city || r.venue || 'Location not logged'}</span>
    <span className="favorite-rave-artists">{r.artists.length?r.artists.slice(0,3).join(' · '):'No artists logged'}{r.artists.length>3?` +${r.artists.length-3}`:''}</span>
    <span className="favorite-rave-footer"><span><Star size={14} fill="currentColor"/>{r.rating} / 5</span><span>View night<ArrowUpRight size={15}/></span></span>
  </button>;
}
function Detail({r,demo,onClose,onEdit,onDelete,onUpdated,backend,events,raves,onCrew}:{onCrew:(name:string,id:string)=>void;raves:Rave[];onUpdated:(r:Rave)=>void;backend:CollectionBackend;events:RallyEvent[];r:Rave;demo:boolean;onClose:()=>void;onEdit:()=>void;onDelete:()=>Promise<void>}) {
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const cost=totalCost(r),planning=attendanceOf(r)!=='attended',sets=displaySets(r),crew=displayCrew(r),crewHistory=leaderboard(raves,'crew');
  return <Modal title={r.name} onClose={()=>{if(!busy)onClose();}}><div className="detail"><div className={`detail-ticket color-${r.color}`}><Glyph/><span>{r.kind}{!isAttended(r)&&` · ${raveStatus(r)}`}<strong>{dateRange(r)}</strong><small>{r.venue}{r.city ? ` · ${r.city}`:''}</small></span>{!planning&&<span className="ticket-rating">{r.rating ? <><Star size={16} fill="currentColor"/>{r.rating}/5</>:'Unrated'}</span>}</div>
    {!demo&&<PlanConnection rave={r} raves={raves} backend={backend} events={events} onUpdated={onUpdated}/>}
    <section><h3><Music2 size={16}/>{planning?'Artists you want to see':'The sets'}</h3><div className="choice-chips">{sets.length?sets.map(a=><span key={a} className={'logged-set '+(a===r.favoriteArtist?'chosen':'')}><span>{a===r.favoriteArtist && <Star size={12}/>} {a}</span>{creditDescription(a) && <small className="set-credit">{creditDescription(a)}</small>}</span>):<p className="muted">No sets selected yet.</p>}</div>{!planning&&r.favoriteArtist && <small className="detail-caption">The starred performance was your favorite set.</small>}</section>
    <section><h3><Users size={16}/>{planning?'Planned crew':'The crew'}</h3><div className="people">{crew.length?[...(r[planning?'plannedCrewConnections':'crewConnections']||[]).map(p=>({id:p.id,name:p.name,linked:p.kind==='account'})),...crew.filter(n=>!(r[planning?'plannedCrewConnections':'crewConnections']||[]).some(p=>p.name.toLowerCase()===n.toLowerCase())).map(n=>({id:'name:'+n.toLowerCase(),name:n,linked:false}))].map((p,i)=><button className="crew-history-person" key={p.id} onClick={()=>onCrew(p.name,p.id)} aria-label={`View your rave history with ${p.name}`}><i className={`avatar tone-${i%4}`}>{initials(p.name)}</i><span>{p.name}{p.linked&&<small className="network-badge">Rally friend</small>}<small>{crewHistory.find(n=>n.id===p.id)?.count||0} {crewHistory.find(n=>n.id===p.id)?.count===1?'rave':'raves'} in your diary</small></span><ArrowUpRight size={14}/></button>):<p className="muted">Solo, or still to be filled in.</p>}</div></section>
    <section><h3><Wallet size={16}/>Your costs <small>USD</small></h3><div className="expense-list">{costKeys.map(k=><div key={k}><span>{({ticket:'Tickets',travel:'Travel',stay:'Stay',other:'Food & other'})[k]}</span><strong>{r.costs[k]===null?'Unlogged':exactMoney(r.costs[k]!)}</strong></div>)}<div className="expense-total"><span>Logged total</span><strong>{cost===null?'Unlogged':exactMoney(cost)}</strong></div></div>{costKeys.some(k=>r.costs[k]===null) && <small className="detail-caption">Some costs are unlogged. This total includes only what you’ve entered.</small>}</section>
    {r.notes && <section><h3><Heart size={16}/>A note to future you</h3><p className="memory-note">{r.notes}</p></section>}

    {r.albumUrl && <a className="album-link" href={r.albumUrl} target="_blank" rel="noopener noreferrer"><span><Disc3 size={20}/>Relive the night</span>Open photo album<ArrowUpRight size={17}/></a>}
    {error && <p role="alert" className="error">{error}</p>}{demo?<p className="demo-note">This is an example entry. Add a rave to start your own journal.</p>:<div className="detail-actions">{confirm?<div className="delete-confirm"><span>{r.sourceEventId?'Remove your personal entry from the diary? You’ll stay in the Rally crew.':'Permanently delete this entry?'}</span><button className="danger" disabled={busy} onClick={async()=>{setBusy(true);try{await onDelete();onClose();}catch(e){setError(e instanceof Error?e.message:'Could not delete.');}finally{setBusy(false);}}}>{busy?'Deleting…':'Yes, delete'}</button><button className="text-button" disabled={busy} onClick={()=>setConfirm(false)}>Keep it</button></div>:<button className="text-button danger-text" onClick={()=>setConfirm(true)}><Trash2 size={15}/>Delete</button>}<button className="primary" disabled={busy} onClick={onEdit}>{planning?(r.startDate<=diaryToday()?'Log your experience':'Edit your diary'):'Edit this night'}<ArrowRight size={16}/></button></div>}
  </div></Modal>;
}
function YearPicker({value,years,onChange}:{value:string;years:string[];onChange:(v:string)=>void}) {
  return <SharedPicker label="Year" compact value={value} options={[{value:'all',label:'All years'},...years.map(y=>({value:y,label:y}))]} onChange={onChange}/>;
}
function Rankings({items,type,onFocus}:{items:ReturnType<typeof leaderboard>;type:'artists'|'crew';onFocus:(n:string,id?:string)=>void}) {
  const [ascending,setAscending]=useState(false);
  const sorted=ascending?[...items].reverse():items;
  const mobile=useMobileLayout();
  if(mobile)return <div className="timeline-directory">{sorted.map(a=><button key={a.id} onClick={()=>onFocus(a.name,type==='crew'?a.id:undefined)}><span className="directory-symbol">{type==='artists'?<Music2 size={18}/>:<Users size={18}/>}</span><span><strong>{a.name}</strong><small>{a.count} {a.count===1?'night':'nights'}{a.connected?' · Rally friend':''} · View history</small></span><ArrowUpRight size={16}/></button>)}</div>;
  return <div className="spreadsheet-scroll"><table className="rave-sheet ranking-sheet"><thead><tr><th>{type==='artists'?'Artist':'Friend'}</th><th><button onClick={()=>setAscending(!ascending)}>Raves {ascending?<ArrowUpRight size={12}/>:<ArrowDown size={12}/>}</button></th><th>First seen</th><th>Most recent</th><th>{type==='artists'?'Favorite sets':'Latest rave'}</th><th>History</th></tr></thead><tbody>{sorted.map(a=>{const nights=[...a.raves].sort((x,y)=>x.startDate.localeCompare(y.startDate));return <tr key={a.id}><td><button className="ranking-name" onClick={()=>onFocus(a.name,type==='crew'?a.id:undefined)}>{type==='artists'?<Music2 size={14}/>:<Users size={14}/>}<strong>{a.name}</strong>{a.connected&&<small className="network-badge">Rally friend</small>}</button></td><td><span className="count-pill">{a.count}</span></td><td>{date(nights[0].startDate,true)}</td><td>{date(nights[nights.length-1].startDate,true)}</td><td>{type==='artists'?a.raves.filter(r=>setCreditsArtist(r.favoriteArtist,a.name)).length:nights[nights.length-1].name}</td><td><button className="history-link" onClick={()=>onFocus(a.name,type==='crew'?a.id:undefined)}>View raves<ArrowUpRight size={13}/></button></td></tr>;})}</tbody></table></div>;
}
function Recap({raves,year,onOpen}:{raves:Rave[];year:string;onOpen:(r:Rave)=>void}) {
  const artists=leaderboard(raves,'artists'),crew=leaderboard(raves,'crew');const known=raves.filter(r=>totalCost(r)!==null),spent=known.reduce((s,r)=>s+totalCost(r)!,0);const favorite=raves.filter(r=>r.rating>0).sort((a,b)=>b.rating-a.rating || b.startDate.localeCompare(a.startDate)).slice(0,3);
  const monthly=Array.from({length:12},(_,m)=>raves.filter(r=>Number(r.startDate.slice(5,7))===m+1).length);const max=Math.max(1,...monthly);
  return <div className="recap"><div className="recap-poster"><span className="eyebrow">THE NIGHTS ADD UP</span><h2>{year==='all'?'Your rave diary, in numbers.':`${year}. What a year.`}</h2><p>{raves.length} {raves.length===1?'rave':'raves'}. {raves.reduce((s,r)=>s+days(r),0)} {raves.reduce((s,r)=>s+days(r),0)===1?'day':'days'} on the dance floor.<br/>The nights you chose to remember.</p><Glyph/><div className="poster-footer">RALLY / {year==='all'?'ALL TIME':year}<span>FOR THE MEMORIES</span></div></div><div className="recap-panels"><section className="panel"><h3>Your most-seen artist<Music2 size={17}/></h3><strong className="recap-big">{artists[0]?.name || 'Still to come'}</strong><p>{artists.length?`${artists[0].count} ${artists[0].count===1?'rave':'raves'} together · ${artists.length} unique artists overall`:'Log a set to start your artist history.'}</p></section><section className="panel"><h3>Your dance-floor partner<Users size={17}/></h3><strong className="recap-big">{crew[0]?.name || 'No crew logged'}</strong><p>{crew.length?`${crew[0].count} ${crew[0].count===1?'night':'nights'} together · ${crew.length} friends overall`:'Your crew’s story starts with a name.'}</p></section></div><section className="panel monthly"><h3>A year on the dance floor <span>{year==='all'?'All years combined':year}</span></h3><div className="month-chart">{monthly.map((n,i)=><div key={i} className="month-col" role="img" aria-label={`${['January','February','March','April','May','June','July','August','September','October','November','December'][i]}: ${n} ${n===1?'rave':'raves'}`}><span>{n||''}</span><div className="bar-space"><i style={{height:`${n/max*100}%`}}/></div><small>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</small></div>)}</div><p>Counts each rave once, in the month it started.</p></section><section className="panel recap-cost"><h3>The cost of a good time<Wallet size={17}/></h3><strong className="recap-big">{known.length?exactMoney(spent):'Unlogged'}</strong><p>{known.length?`${exactMoney(spent/known.length)} average across ${known.length} ${known.length===1?'rave':'raves'} with costs logged`:'Add costs whenever you have them.'}</p><div className="cost-breakdown">{costKeys.map(k=><div key={k}><span>{({ticket:'Tickets',travel:'Travel',stay:'Stay',other:'Other'})[k]}</span><strong>{raves.some(r=>r.costs[k]!==null)?money(raves.reduce((s,r)=>s+(r.costs[k]??0),0)):'—'}</strong></div>)}</div><small>Totals include only entered amounts. Missing costs are unknown, not zero. Your share · USD.</small></section>{favorite.length>0 && <section className="favorite-section"><div className="section-head"><h3>The ones that stayed with you</h3><Heart size={18}/></div><div className="card-grid">{favorite.map(r=><RaveCard key={r.id} r={r} onOpen={()=>onOpen(r)}/>)}</div></section>}</div>;
}
export type RallyEvent = {id: string; name: string; startsAt: string; endsAt?: string};
export type PlanConnectionState = {details:Rave;people:CrewConnection[];lineup:string[];wishlist:string[];revision:string;canUpdatePlan:boolean;sharedMemories:SharedMemory[];myMemory:SharedMemory|null};
export type SharedMemory = {memberId:string;name:string;note:string;albumUrl:string;updatedAt:number};
export type CollectionBackend = {
  connection: (id:string)=>Promise<PlanConnectionState>;
  shareMemory:(id:string,note:string,albumUrl:string,revision:string)=>Promise<unknown>;
  list: () => Promise<{raves: Rave[]}>;
  save: (r: Rave) => Promise<Rave>;
  remove: (id: string) => Promise<unknown>;
  importEntries: (raves: Rave[]) => Promise<Rave[]>;
  createPlan: (id: string,timeZone: string) => Promise<Rave>;
  draftFromEvent: (eventId: string) => Promise<{rave: Rave; existing: boolean; artistSuggestions: string[]; crewSuggestions: string[];crewPeople?:CrewConnection[]}>;
};
export default function Journal({backend, viewer, events = [], eventsError = '', eventsLoading = false, onRetryEvents = () => {}, onSignOut}: {
  backend: CollectionBackend; viewer: {name: string; subject: string}; events?: RallyEvent[];
  eventsError?: string; eventsLoading?: boolean; onRetryEvents?: () => void; onSignOut: () => Promise<void> | void;
}) {
  const mobile=useMobileLayout();
  const [navigationOpen,setNavigationOpen]=useState(false);
  useEffect(()=>{if(mobile)setNavigationOpen(false);},[mobile]);
  const [accountOpen,setAccountOpen]=useState(false),[toolsOpen,setToolsOpen]=useState(false);
  const [raves, setRaves] = useState<Rave[]>([]), [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [section, setSection] = useState<Section>('raves'), [year, setYear] = useState('all'), [query, setQuery] = useState('');
  useEffect(()=>{if(mobile)window.scrollTo({top:0});},[section,mobile]);
  const [formFocus, setFormFocus] = useState<'photos' | undefined>();
  const [detail, setDetail] = useState<Rave | null>(null), [form, setForm] = useState<Rave | true | null>(null);
  const [focus, setFocus] = useState<{type: 'artists' | 'crew'; name: string; identity?:string} | null>(null);
  const [suggestions, setSuggestions] = useState<{artists: string[]; crew: string[]}>({artists: [], crew: []});
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState(''), [retryEvent, setRetryEvent] = useState('');
  const [importRaves, setImportRaves] = useState<Rave[] | null>(null), [importBusy, setImportBusy] = useState(false), [importError, setImportError] = useState('');
  const [online, setOnline] = useState(navigator.onLine), [signingOut, setSigningOut] = useState(false), [tableVersion, setTableVersion] = useState(0);
  const importInput = useRef<HTMLInputElement>(null), alive = useRef(true), draftLock = useRef(false), loadVersion = useRef(0);
  const resetView = () => { setSection('raves'); setYear('all'); setFocus(null); setQuery(''); setTableVersion(n => n + 1); };
  const openEvent = async (eventId: string) => {
    if (draftLock.current) return;
    draftLock.current = true; setDraftBusy(true); setDraftError(''); setRetryEvent(eventId);
    try {
      const draft = await backend.draftFromEvent(eventId);
      if (!alive.current) return;
      setSuggestions({artists: draft.artistSuggestions, crew: draft.crewSuggestions});
      setDemo(false); setFormFocus(undefined); setRaves(prev=>[draft.rave,...prev.filter(r=>r.id!==draft.rave.id)]); setForm(null); setDetail(draft.rave); setRetryEvent('');
      const url = new URL(location.href); url.searchParams.delete('from'); history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch (e) { if (alive.current) setDraftError(e instanceof Error ? e.message : 'Could not open this plan.'); }
    finally { draftLock.current = false; if (alive.current) setDraftBusy(false); }
  };
  const load = async (quiet=false) => {
    const version = ++loadVersion.current;
    if(!quiet)setLoading(true); setError('');
    try {
      const body = await backend.list();
      if (!alive.current || version !== loadVersion.current) return;
      setRaves(body.raves); setLoaded(true);
      setDetail(current=>current?body.raves.find(r=>r.id===current.id)||null:null);
      const from = new URLSearchParams(location.search).get('from');
      if (from&&!quiet) await openEvent(from);
    } catch (e) { if (alive.current && version === loadVersion.current) setError(e instanceof Error ? e.message : 'Unable to load your diary.'); }
    finally { if (alive.current && version === loadVersion.current) setLoading(false); }
  };
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; loadVersion.current++; }; }, [backend]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState!=='hidden'&&!form&&!importRaves&&!draftBusy)void load(true);};
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[backend,form,importRaves,draftBusy]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6000); return () => clearTimeout(timer); }, [toast]);
  const data = demo ? demoRaves : raves;
  const years = [...new Set(data.map(r => r.startDate.slice(0, 4)))].sort().reverse();
  const scope = data.filter(r => isAttended(r) && (year === 'all' || r.startDate.startsWith(year)));
  const artists = leaderboard(scope, 'artists'), crew = leaderboard(scope, 'crew');
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const begin = () => { setFormFocus(undefined); setSuggestions({artists: [], crew: []}); setDemo(false); setForm(true); };
  const edit = (r: Rave, target?: 'photos') => { setFormFocus(target); setSuggestions({artists: [], crew: []}); setForm(r); };
  const switchSection = (next: Section) => { setSection(next); setQuery(''); setFocus(null); };
  const save = async (r: Rave) => {
    const saved = await backend.save(validateRave(r));
    if (!alive.current) return;
    loadVersion.current++; setLoading(false);
    const isNew = !raves.some(old => old.id === saved.id);
    setRaves(prev => [saved, ...prev.filter(a => a.id !== saved.id)]); setDemo(false);
    if (isNew) {resetView();if(attendanceOf(saved)==='planned')setDetail(saved);}
    setToast(isNew ? 'Added to your private diary.' : 'Experience updated.');
  };
  const remove = async (r: Rave) => { await backend.remove(r.id); if (!alive.current) return; loadVersion.current++; setLoading(false); setRaves(prev => prev.filter(a => a.id !== r.id)); setToast('Entry deleted.'); };
  const download = (text: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], {type})); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportJson = () => download(JSON.stringify({format: 'rally-collection-v1', exportedAt: new Date().toISOString(), raves}, null, 2), 'rally-collection.json', 'application/json');
  const exportCsv = (entries: Rave[] = raves) => {
    const quote = (value: unknown) => { let s = String(value ?? ''); if (/^\s*[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
    const headers = ['Attendance','Wishlist sets','Planned crew','Rave', 'Start date', 'End date', 'City', 'Venue', 'Type', 'Artists seen', 'Sets seen', 'Crew', 'Tickets USD', 'Travel USD', 'Stay USD', 'Other USD', 'Logged total USD', 'Rating', 'Favorite set', 'Album URL', 'Notes'];
    const rows = entries.map(r => [raveStatus(r),(r.plannedArtists||[]).join('; '),(r.plannedCrew||[]).join('; '),r.name, r.startDate, r.endDate, r.city, r.venue, r.kind, artistsForRave(r).join('; '), r.artists.join('; '), r.crew.join('; '), ...costKeys.map(k => r.costs[k]), totalCost(r), r.rating || '', r.favoriteArtist, r.albumUrl, r.notes]);
    download('\uFEFF' + [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n'), 'rally-collection.csv', 'text/csv;charset=utf-8');
  };
  const readImport = async (file: File) => {
    try {
      if (file.size > 2_000_000) throw new Error('Choose a JSON backup smaller than 2 MB.');
      const body = JSON.parse(await file.text());
      if (!['rally-collection-v1', 'afterglow-v1'].includes(body.format) || !Array.isArray(body.raves)) throw new Error('Choose a Rally collection or Afterglow JSON backup.');
      if (!body.raves.length || body.raves.length > 200) throw new Error('Import between 1 and 200 entries at a time.');
      const entries: Rave[] = body.raves.map(validateRave);
      if (new Set(entries.map(r => r.id)).size !== entries.length) throw new Error('The backup contains duplicate entry IDs.');
      if (JSON.stringify(entries).length > 900_000 || entries.some(r => JSON.stringify(r).length > 65_000)) throw new Error('This backup is too large. Import fewer entries or shorter notes.');
      setImportRaves(entries); setImportError('');
    } catch (e) { setToast(e instanceof SyntaxError ? 'That file is not a valid JSON backup.' : e instanceof Error ? e.message : 'Could not open this backup.'); }
    finally { if (importInput.current) importInput.current.value = ''; }
  };
  const toggleDemo = () => { setDemo(value => !value); resetView(); };
  const graph=raveNetwork(data);const linkedFriends=graph.nodes.filter(n=>n.kind==='person'&&n.id.startsWith('account:')).length;
  const directory = (section === 'artists' ? artists : crew).filter(a => a.name.toLowerCase().includes(query.toLowerCase()));
  const importUpdates = importRaves?.filter(r => raves.some(saved => saved.id === r.id)).length || 0;
  return <div className="app spreadsheet-app">
    <a className="skip-link" href="#collectionMain">Skip to collection</a>
    <header className="sheet-topbar">
      {!mobile&&<button className="desktop-menu-trigger" aria-label="Open navigation" aria-expanded={navigationOpen} aria-controls={navigationOpen?'collectionNavigation':undefined} onClick={()=>setNavigationOpen(true)}><Menu size={21}/></button>}
      <a className="sheet-brand" href="/tools/rally/collection/?view=projects" aria-label="My raves"><Glyph/><strong>Rally</strong></a>
      {!mobile&&<><div className="collection-breadcrumb"><ChevronRight size={15}/><span>Rave diary</span>{section!=='raves'&&<><ChevronRight size={15}/><strong>{nav.find(n=>n.id===section)?.name}</strong></>}</div>
      <div className="collection-account"><span><LockKeyhole size={13}/>{viewer.name}’s private diary</span><button className="collection-signout" disabled={signingOut} onClick={async () => {
        setSigningOut(true); try { await onSignOut(); } catch { setToast('Could not sign out. Please try again.'); } finally { if (alive.current) setSigningOut(false); }
      }}>{signingOut ? 'Signing out…' : 'Sign out'}</button></div></>}
      {mobile&&<><span className="mobile-workspace-label">Rave diary</span><button className="mobile-account-trigger" aria-label="Diary settings" title="Diary settings" onClick={()=>setAccountOpen(true)}><Settings size={21}/></button></>}
    </header>
    {mobile&&<nav className="collection-nav" aria-label="Collection views">{nav.map(n => <button key={n.id} aria-current={section === n.id ? 'page' : undefined} className={section === n.id ? 'active' : ''} onClick={() => switchSection(n.id)}><n.icon size={16}/>{n.id === 'raves' ? 'Raves' : n.name}</button>)}</nav>}
    <main id="collectionMain" tabIndex={-1}><div className="main-content">
      {!online && <div className="connection-banner" role="status"><AlertCircle size={16}/>You’re offline. Keep this page open; reconnect to load or save your diary.</div>}
      {error && <div className="error-banner" role="alert"><span><strong>{loaded ? 'Could not refresh your diary.' : 'Your rave diary couldn’t load.'}</strong> {error}</span><button disabled={loading} onClick={() => void load()}>Try again</button></div>}
      {draftError && <div className="error-banner" role="alert"><span>{draftError}</span><button disabled={draftBusy} onClick={() => void openEvent(retryEvent)}>Retry plan</button><button aria-label="Dismiss plan error" onClick={() => { setDraftError(''); const url = new URL(location.href); url.searchParams.delete('from'); history.replaceState({}, '', url.pathname + url.search + url.hash); }}><X size={16}/></button></div>}
      {demo && <div className="demo-banner"><span><Sparkles size={15}/><strong>Example data</strong> Fictional raves and costs. Nothing here belongs to your account.</span><button onClick={toggleDemo}>Back to my collection<ArrowRight size={14}/></button></div>}
      {!loaded ? <div className="collection-loading">{loading ? <><LoaderCircle size={24} className="spin"/><h1>Opening your diary…</h1></> : <><AlertCircle size={30}/><h1>Your history is still yours.</h1><p>Reconnect or retry above to see your saved nights.</p></>}</div> : <>
        {section === 'raves' && <>
          <div className="collection-heading"><div><span className="eyebrow">YOUR NIGHTS, PAST AND NEXT</span><h1>Rave diary</h1><p>Your raves, past and planned.</p></div><div className="collection-actions"><button className="primary" aria-label="Add a rave" onClick={begin}><Plus size={mobile?22:17}/>{!mobile&&'Add a rave'}</button></div></div>
          {!data.length ? <section className="collection-welcome"><div className="welcome-icon"><Ticket size={30}/></div><h2>Your first night starts here.</h2><p>Your Rally raves appear here automatically. Add other upcoming raves or past nights.<br/>A name and date are all you need.</p><div><button className="primary" onClick={begin}><Plus size={17}/>Add your first rave</button><button className="secondary" onClick={toggleDemo}>Explore an example</button></div><div className="welcome-columns"><span><Music2 size={16}/>Artists you saw</span><span><Users size={16}/>Your crew</span><span><Wallet size={16}/>Your costs</span><span><Heart size={16}/>Photos & memories</span></div><small>Past raves need no project. For an upcoming rave, you can plan with friends.</small></section>
            : <RaveExplorer key={`${demo}:${tableVersion}`} raves={data} demo={demo} year={year} onYearChange={setYear} focus={focus} onClearFocus={() => setFocus(null)} onOpen={setDetail} onEdit={edit} onAdd={begin} onSave={save} onExport={exportCsv}/>}
        </>}
        {section !== 'raves' && <>
          <div className="page-heading directory-heading"><div><h1>{section === 'artists' ? 'Artists you’ve seen' : section === 'crew' ? 'Your crew' : 'Year in review'}</h1><p>{section === 'artists' ? 'Solo sets, B2Bs, and special sets — one history per artist. Each rave counts once.' : section === 'crew' ? 'The people you shared the dance floor with.' : 'Your artists, crew, and logged costs, added up.'}</p></div><YearPicker value={year} years={years} onChange={setYear}/></div>
          {section === 'recap' && scope.length ? <Recap raves={scope} year={year} onOpen={setDetail}/> : section === 'recap' ? <div className="empty-state"><CalendarDays size={28}/><h3>No raves in this view yet.</h3><p>Log a night to start your recap, or choose another year.</p><button className="primary" onClick={begin}>Add a rave</button></div> : <>
            <p className="network-summary"><span><strong>{linkedFriends}</strong> connected Rally {linkedFriends===1?'friend':'friends'}</span><span><strong>{graph.nodes.filter(n=>n.kind==='project').length}</strong> linked crew {graph.nodes.filter(n=>n.kind==='project').length===1?'plan':'plans'}</span><span>History comes from your own diary.</span></p><div className="results-toolbar"><div className="results-label"><h2>{section === 'artists' ? 'Artist history' : 'Crew history'}</h2><span>{directory.length} results</span></div><label className="results-search"><Search size={15}/><input aria-label="Search directory" placeholder={section === 'artists' ? 'Search artists…' : 'Search friends…'} value={query} onChange={e => setQuery(e.target.value)}/></label></div>
            {directory.length ? <Rankings type={section} items={directory} onFocus={(name,identity) => { setSection('raves'); setFocus({type: section, name,identity}); setQuery(''); }}/>
              : <div className="empty-state"><Search size={28}/><h3>{query ? 'No matching names.' : 'No names logged in this view.'}</h3><p>{query ? 'Try another name or year.' : 'Add artists and friends to a rave whenever you remember them.'}</p><button className="secondary" onClick={() => { if (query) setQuery(''); else switchSection('raves'); }}>{query ? 'Clear search' : 'View my raves'}</button></div>}
          </>}
        </>}
        <footer className="sheet-data-footer">{mobile&&<button className="collection-tools-toggle" aria-expanded={toolsOpen} onClick={()=>setToolsOpen(!toolsOpen)}>Diary tools<MoreHorizontal size={17}/></button>}<span><LockKeyhole size={14}/>Private to your account · Saved to Rally</span><div hidden={mobile&&!toolsOpen}><button disabled={loading || demo} onClick={() => void load()}><RefreshCw size={14} className={loading ? 'spin' : ''}/>{loading ? 'Refreshing…' : 'Refresh'}</button><button onClick={toggleDemo}>{demo ? 'Rave diary' : 'Example data'}</button><button onClick={exportJson} disabled={!raves.length || demo}><ArrowDownToLine size={14}/>Back up JSON</button><button onClick={() => importInput.current?.click()} disabled={demo}><Upload size={14}/>Import backup</button><button onClick={() => exportCsv()} disabled={!raves.length || demo}><FileSpreadsheet size={14}/>Export all CSV</button></div></footer>
      </>}
    </div></main>
    <input ref={importInput} type="file" accept="application/json,.json" hidden aria-label="Import collection backup" onChange={e => { if (e.target.files?.[0]) void readImport(e.target.files[0]); }}/>
    {navigationOpen&&!mobile&&<CollectionNavigation section={section} name={viewer.name} onSelect={switchSection} onClose={()=>setNavigationOpen(false)}/>}
    {accountOpen&&<Modal title="Diary settings" onClose={()=>setAccountOpen(false)}><div className="timeline-choice"><p><LockKeyhole size={15}/> {viewer.name}’s private diary</p><a className="secondary" href="/tools/rally/collection/?view=projects">My raves<ArrowUpRight size={17}/></a><button className="secondary" disabled={signingOut} onClick={async()=>{setSigningOut(true);try{await onSignOut();}catch{setToast('Could not sign out. Please try again.');}finally{if(alive.current)setSigningOut(false);}}}>{signingOut?'Signing out…':'Sign out'}</button></div></Modal>}
    {form && <RaveForm onOpenExisting={r=>{setForm(null);setDetail(r);}} loadPlan={backend.draftFromEvent} focusSection={formFocus} initial={form === true ? undefined : form} all={raves} onSave={save} onClose={() => setForm(null)} suggestedArtists={suggestions.artists} suggestedCrew={suggestions.crew}/>}
    {detail && !form && <Detail onCrew={(name,identity)=>{setDetail(null);setSection('raves');setFocus({type:'crew',name,identity});setQuery('');}} r={detail} raves={raves} demo={demo} backend={backend} events={events} onUpdated={saved=>{setRaves(prev=>prev.map(r=>r.id===saved.id?saved:r));setDetail(saved);}} onClose={() => setDetail(null)} onEdit={() => { edit(detail); setDetail(null); }} onDelete={() => remove(detail)}/>}
    {importRaves && <Modal title="Import your backup" onClose={() => { if (!importBusy) setImportRaves(null); }}><div className="import-review"><p><strong>{importRaves.length - importUpdates} new raves</strong> will be added. <strong>{importUpdates} existing entries</strong> with matching IDs will be replaced by this backup. Your other entries stay as they are.</p><p className="form-help">Import only a backup of your own collection. Linked rave plans must be accessible to this account.</p><div className="import-list">{importRaves.map(r => <div key={r.id}><strong>{r.name}</strong><span>{date(r.startDate, true)}</span></div>)}</div>{importError && <p className="error" role="alert">{importError}</p>}<div className="form-footer"><button className="secondary" disabled={importBusy} onClick={() => setImportRaves(null)}>Cancel</button><button className="primary" disabled={importBusy} onClick={async () => {
      setImportBusy(true); setImportError('');
      try { const imported = await backend.importEntries(importRaves); if (!alive.current) return; loadVersion.current++; setLoading(false); setRaves(prev => [...imported, ...prev.filter(r => !imported.some(n => n.id === r.id))]); setDemo(false); resetView(); setImportRaves(null); setToast('Backup imported into your diary.'); }
      catch (e) { if (alive.current) setImportError(e instanceof Error ? e.message : 'Import failed. Try again.'); }
      finally { if (alive.current) setImportBusy(false); }
    }}>{importBusy ? 'Importing…' : 'Import backup'}<Upload size={15}/></button></div></div></Modal>}
    {toast && <div role="status" className="toast">{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16}/></button></div>}
  </div>;
}
