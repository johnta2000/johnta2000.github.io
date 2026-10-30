import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Check, ChevronDown, Heart, LoaderCircle, LockKeyhole, Music2, Star, Wallet} from 'lucide-react';
import Modal from './Modal';
import type {RallyEvent} from './Journal';
import DateField from './DateField';
import NamePicker from './NamePicker';
import CrewPicker from './CrewPicker';
import CityPicker from './CityPicker';
import FestivalPicker, {FestivalSources} from './FestivalPicker';
import {applyFestival, festivalForRave} from '../lib/festivals';
import {diaryToday, costKeys, emptyRave, leaderboard, totalCost, uniqueNames, validateRave, type Rave, type CrewConnection} from '../lib/raves';

const costLabels = {ticket: 'Tickets', travel: 'Travel', stay: 'Stay', other: 'Food & other'};
const eventDate = (s:string)=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const money = (n: number) => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(n);

export default function RaveForm({initial, all, onSave, onClose, suggestedArtists = [], suggestedCrew = [], focusSection, loadPlan, onOpenExisting, rallyEvents = [], eventsLoading = false, eventsError = '', onRetryEvents}: {
  rallyEvents?: RallyEvent[]; eventsLoading?: boolean; eventsError?: string; onRetryEvents?:()=>void;
  initial?: Rave; all: Rave[]; onSave: (r: Rave) => Promise<void>; onClose: () => void;
  onOpenExisting?: (r:Rave)=>void;
  suggestedArtists?: string[]; suggestedCrew?: string[]; focusSection?: 'photos';
  loadPlan?: (eventId: string) => Promise<{rave: Rave; artistSuggestions: string[]; crewSuggestions: string[];crewPeople?:CrewConnection[]}>;
}) {
  const [r, setR] = useState<Rave>(() => ({...structuredClone(initial || emptyRave()), id: initial?.id || crypto.randomUUID()}));
  const [plan, setPlan] = useState({artists: suggestedArtists, crew: suggestedCrew});
  const [people,setPeople]=useState<CrewConnection[]>([]);
  const [planStatus, setPlanStatus] = useState(''), [planAttempt, setPlanAttempt] = useState(0);
  useEffect(() => {
    if (!r.sourceEventId || !loadPlan) return;
    let active = true;
    setPlanStatus('loading');
    loadPlan(r.sourceEventId).then(result => {
      if (active) {setPlan({artists: result.artistSuggestions, crew: result.crewSuggestions});setPeople(result.crewPeople||[]); setPlanStatus('');}
    }).catch(() => {if (active) setPlanStatus('error');});
    return () => {active = false;};
  }, [r.sourceEventId, loadPlan, planAttempt]);
  const sharedSummary=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(r.sourceEventId && r.sourceEventId!==initial?.sourceEventId)sharedSummary.current?.focus();},[r.sourceEventId,initial?.sourceEventId]);
  const baseline = useRef(JSON.stringify(r));
  const [artistText, setArtistText] = useState(''), [crewText, setCrewText] = useState('');
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false);
  const isEdit = all.some(n => n.id === r.id);
  const dirty = JSON.stringify(r) !== baseline.current || !!artistText.trim() || !!crewText.trim();
  const openRallyEvent = async (eventId:string) => {
    if (!loadPlan || saving) return;
    setSaving(true); setError('');
    try {
      const draft = await loadPlan(eventId);
      setR(structuredClone(draft.rave)); baseline.current=JSON.stringify(draft.rave);
      setPlan({artists:draft.artistSuggestions,crew:draft.crewSuggestions});setPeople(draft.crewPeople||[]);
      setArtistText('');setCrewText('');setDiscard(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this Raveington rave. Please try again.'); }
    finally { setSaving(false); }
  };
  const close = () => { if (saving) return; if (dirty) setDiscard(true); else onClose(); };
  const field = <K extends keyof Rave>(key: K, value: Rave[K]) => setR(prev => ({...prev, [key]: value}));
  const festival = festivalForRave(r);
  const archivedLineup=!!r.startDate&&(r.endDate||r.startDate)<diaryToday();
  const originalEdition = initial && festivalForRave(initial);
  const unavailableIds = all.filter(n=>n.id!==r.id).map(n=>festivalForRave(n)?.id).filter((id):id is string=>!!id && id!==originalEdition?.id);
  const duplicate = all.find(n => n.id !== r.id && ((!!festival && festivalForRave(n)?.id === festival.id) ||
    (n.startDate === r.startDate && n.name.toLowerCase().trim() === r.name.toLowerCase().trim())));
  const blockedDuplicate = !!duplicate && (!!festival || !!duplicate.sourceEventId) && !(isEdit && festival && festival.id===originalEdition?.id);
  const sum = totalCost(r);
  const planning=!!r.startDate&&r.startDate>diaryToday();
  const attendance=planning?'planned':'attended';
  const artistField=planning?'plannedArtists':'artists', crewField=planning?'plannedCrew':'crew';
  const selectedArtists=r[artistField]||[], selectedCrew=r[crewField]||[];
  const changeEventDetails=(update:(previous:Rave)=>Rave)=>{
    const next=update(r);
    if((r.startDate>diaryToday())!==(next.startDate>diaryToday())){
      setR({...next,[artistField]:uniqueNames([...selectedArtists,...artistText.split(',')]),[crewField]:uniqueNames([...selectedCrew,...crewText.split(',')])});
      setArtistText('');setCrewText('');
    }else setR(next);
  };
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving||blockedDuplicate) return;
    setError(''); setSaving(true); setDiscard(false);
    try {
      const clean = validateRave({...r, endDate: r.endDate || r.startDate,
        attendance, [artistField]: uniqueNames([...selectedArtists, ...artistText.split(',')]), [crewField]: uniqueNames([...selectedCrew, ...crewText.split(',')])});
      await onSave(clean); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your changes are still here.'); }
    finally { setSaving(false); }
  };
  return <Modal title={isEdit ? planning ? 'Edit your rave plan' : 'Edit your experience' : 'Add a rave'} onClose={close} wide>
    <form onSubmit={submit} className="rave-form collection-form" aria-busy={saving} onInvalidCapture={event => {
      const input = event.target as HTMLInputElement;
      const section = input.closest('details');
      if (section) section.open = true;
    }}>
      <p className="form-intro">{planning ? 'Keep your plans, artists to see, and costs together.' : r.sourceEventId ? 'This rave is already in your diary. Add the artists you actually saw and your own share of the costs.' : 'Add a past night or an upcoming rave. Start with a name and date.'}</p>
      <fieldset disabled={saving} className="form-fields">
        <div className="rave-event-fields">
        {!r.sourceEventId && <FestivalPicker rallyEvents={initial ? [] : rallyEvents} diary={all} eventsLoading={!initial && eventsLoading} eventsError={initial ? '' : eventsError} onRetryEvents={onRetryEvents} onChooseRally={loadPlan && !initial ? openRallyEvent : undefined} hasDraft={dirty} unavailableIds={unavailableIds} onClear={()=>setR(prev=>({...prev,catalogEventId:null}))} current={festival} focusOnOpen={!isEdit && !focusSection} hasDetails={!!(r.name || r.startDate || r.city || r.venue)} onChoose={edition => changeEventDetails(prev => applyFestival(prev, edition))}/>}
        {r.sourceEventId?<div ref={sharedSummary} tabIndex={-1} className="shared-event-summary"><strong>{r.name}</strong><span>{eventDate(r.startDate)}{r.endDate!==r.startDate?' – '+eventDate(r.endDate):''} · {[r.venue,r.city].filter(Boolean).join(' · ')}</span><p>Event details are shared with your crew and stay up to date in Raveington.</p><a href={`/tools/rally/?event=${encodeURIComponent(r.sourceEventId)}`}>View event details in Raveington ↗</a></div>:<>
        <label className="field">Rave / event name <span className="required-label">Required</span><input data-autofocus={!focusSection && (isEdit || !!r.sourceEventId) || undefined} autoFocus={!focusSection && (isEdit || !!r.sourceEventId)} required maxLength={160} placeholder="The festival, show, or club night" value={r.name} onChange={e => field('name', e.target.value)}/></label>
        <div className="form-grid">
          <DateField label="Start date" required value={r.startDate} onChange={next => {
            changeEventDetails(prev => ({...prev, startDate: next, endDate: prev.endDate === prev.startDate ? next : prev.endDate}));
          }}/>
          <DateField label="End date" hint="For multiple days" min={r.startDate} value={r.endDate} onChange={value => field('endDate', value)}/>
          <CityPicker value={r.city} cities={all.map(rave => rave.city)} onChange={city => field('city', city)}/>
          <label className="field">Venue<input maxLength={150} placeholder="The Midway" value={r.venue} onChange={e => field('venue', e.target.value)}/></label>
        </div>
        </>}
        {!r.sourceEventId&&<div className="field"><span className="field-label">Type of night</span><div className="segmented">{(['Festival', 'Club night', 'Show'] as const).map(k => <button type="button" key={k} aria-pressed={r.kind === k} className={r.kind === k ? 'active' : ''} onClick={() => field('kind', k)}>{k}</button>)}</div></div>}
        {duplicate && <div className="form-notice">{blockedDuplicate?<>This rave is already in your diary. <button type="button" className="secondary" onClick={()=>onOpenExisting?.(duplicate)}>Open existing entry</button></>:<>You already have “{duplicate.name}” on this date. Saving will add a separate entry.</>}</div>}
        </div>
        <div className="rave-log-fields">
        <details className="form-disclosure" open>
          <summary><Music2 size={17}/><span>Artists & crew<small>{planning?'Your wishlist and possible crew':'Who made the night'}</small></span><ChevronDown size={16}/></summary>
          <div className="disclosure-body">

            {r.sourceEventId && planStatus === 'loading' && <p className="form-help" role="status">Loading the lineup and crew from Raveington…</p>}
            {r.sourceEventId && planStatus === 'error' && <p className="form-help" role="status">The lineup and crew from Raveington could not load.{festival ? ' The festival catalog lineup is available below.' : ' Choose a festival or add sets manually.'} <button type="button" className="text-button" onClick={() => setPlanAttempt(n => n + 1)}>Retry lineup and crew</button></p>}

            <div className="rave-people-grid"><div>
            {festival&&<p className="lineup-context">{festival.artists.length ? `${archivedLineup?'Archived lineup':'Published lineup'}${festival.coverage==='partial'?' · partial':''}. ${archivedLineup?'Select only the sets you saw.':'Choose the sets you want to see.'}` : 'No verified lineup is available for this event yet. Add artists below.'}</p>}
            <NamePicker archivedLineup={archivedLineup} label={planning?'Artists you want to see':'Artists you actually saw'} noun="artist" lineupOnly={!!festival || !!r.sourceEventId || !!plan.artists.length} planSuggestions={festival ? uniqueNames([...festival.artists,...plan.artists]) : uniqueNames([...plan.artists,...(r.plannedArtists||[])])} values={selectedArtists} text={artistText} onText={setArtistText}
              onChange={artists => setR(prev => ({...prev, [artistField]:artists, favoriteArtist: planning ? prev.favoriteArtist : artists.some(a => a.toLowerCase() === prev.favoriteArtist.toLowerCase()) ? prev.favoriteArtist : ''}))}
              suggestions={uniqueNames(all.flatMap(rave => rave.artists))}/>
            </div><div>
            <CrewPicker label={planning?'Who are you going with?':'Who did you go with?'} values={selectedCrew} connections={r[planning?'plannedCrewConnections':'crewConnections']||[]} people={[...all.flatMap(entry=>[...(entry.crewConnections||[]),...(entry.plannedCrewConnections||[])]),...people]}
              text={crewText} onText={setCrewText} planSuggestions={uniqueNames([...plan.crew,...(r.plannedCrew||[])])} suggestions={leaderboard(all,'crew').map(a=>a.name)}
              onChange={(names,connections)=>setR(prev=>({...prev,[crewField]:names,[planning?'plannedCrewConnections':'crewConnections']:connections}))}/>
            </div></div>
          </div>
        </details>
        <details className="form-disclosure" open={costKeys.some(k => initial?.costs[k] != null) || undefined}>
          <summary><Wallet size={17}/><span>Your costs<small>{sum === null ? 'Optional · your share in USD' : `${money(sum)} logged · your share in USD`}</small></span><ChevronDown size={16}/></summary>
          <div className="disclosure-body"><p className="form-help">Enter your share after reimbursements. Blank means unknown; 0 means free.</p>
            <div className="form-grid costs">{costKeys.map(k => <label className="field" key={k}>{costLabels[k]}<div className="money-input"><span>$</span><input type="number" min="0" max="10000000" step="0.01" placeholder="Unknown" value={r.costs[k] ?? ''} onChange={e => field('costs', {...r.costs, [k]: e.target.value === '' ? null : Number(e.target.value)})}/></div></label>)}</div>
          </div>
        </details>
        <details className="form-disclosure" open={focusSection === 'photos' || !!(initial?.albumUrl || initial?.notes || initial?.rating) || undefined}>
          <summary><Heart size={17}/><span>Photos & memories<small>Album link, favorite set, rating, and notes</small></span><ChevronDown size={16}/></summary>
          <div className="disclosure-body">
            <label className="field">Photo album link<input data-autofocus={focusSection === 'photos' || undefined} type="url" maxLength={2000} placeholder="https://photos.app.goo.gl/…" value={r.albumUrl} onChange={e => field('albumUrl', e.target.value)}/><small>Paste a Google Photos, iCloud, or other album link. Photos stay in that service; its sharing settings control who can open them.</small></label>
            {!planning && !!r.artists.length && <div className="field"><span className="field-label">Favorite set</span><div className="choice-chips">{r.artists.map(a => <button type="button" key={a} aria-pressed={r.favoriteArtist === a} className={r.favoriteArtist === a ? 'chosen' : ''} onClick={() => field('favoriteArtist', r.favoriteArtist === a ? '' : a)}><Star size={13}/>{a}</button>)}</div></div>}
            {!planning && <div className="field"><span className="field-label">How was the night?</span><div className="rating">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={r.rating === n} onClick={() => field('rating', r.rating === n ? 0 : n)}><Star size={24} fill={n <= r.rating ? 'currentColor' : 'none'}/></button>)}<span>{r.rating ? `${r.rating} / 5` : 'Unrated'}</span></div></div>}
            <label className="field">A note to future you<textarea maxLength={10000} rows={3} placeholder="The set you loved, the funniest moment, the afters…" value={r.notes} onChange={e => field('notes', e.target.value)}/></label>
          </div>
        </details>
        {festival&&<div className="festival-reference"><FestivalSources edition={festival}/></div>}
        </div>
      </fieldset>
      {error && <p role="alert" className="error form-feedback">{error} Your changes are still here.</p>}
      <div className="form-footer">
        {discard ? <div className="discard-confirm" role="alert"><span>Discard your unsaved changes?</span><button type="button" className="secondary" autoFocus onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className="danger" onClick={onClose}>Discard changes</button></div>
          : <><span className="form-private"><LockKeyhole size={13}/>Only you</span><button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button><button className="primary" disabled={saving||blockedDuplicate}>{saving ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} {saving ? 'Saving…' : isEdit ? 'Save changes' : planning ? 'Save upcoming rave' : 'Save to rave diary'}</button></>}
      </div>
    </form>
  </Modal>;
}
