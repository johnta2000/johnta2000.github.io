import {useMemo, useState} from 'react';
import type {RallyEvent} from './Journal';
import type {Rave} from '../lib/raves';
import {festivalForRave} from '../lib/festivals';
import {searchDocument, scoreSearch, locationSearchText} from '../lib/search';
import {CalendarDays, Check, MapPin, Search} from 'lucide-react';
import SharedPicker from './SharedPicker';
import {festivalDates, festivalEditions, catalogYearRange, catalogSearchText, type FestivalEdition} from '../lib/festivals';
import {diaryToday} from '../lib/raves';
import {scoreCatalogEvent} from '../lib/catalogSearch';
import './festival-picker.css';

export function FestivalSources({edition}: {edition: FestivalEdition}) {
  const archived=edition.endDate<diaryToday();
  return <details className="festival-sources"><summary>{archived?'Archived lineup & sources':'Event lineup & sources'} <span>For reference</span></summary>
    <strong>{edition.name} · {edition.artists.length} {edition.artists.length===1?'set':'sets'} listed</strong>
    <p>{!edition.artists.length?'No verified lineup is available for this event yet.':edition.coverage==='partial'?'Partial lineup — only verified artists are listed here.':archived?'Archived lineup for this event edition.':'Published lineup for this event edition; it may change.'}</p>
    <p>{edition.note || 'Published lineup archive. Last-minute changes may differ.'}</p>
    <ul>{edition.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a></li>)}</ul>
    <small>Checked {edition.verifiedOn}. Use these sources as a reference when logging your own experience.</small>
  </details>;
}

export default function FestivalPicker({current, hasDetails, onChoose, focusOnOpen = false, linked = false, onClear, unavailableIds = [], rallyEvents = [], diary = [], onChooseRally, hasDraft = false, eventsLoading = false, eventsError = '', onRetryEvents}: {
  rallyEvents?: RallyEvent[]; diary?: Rave[]; onChooseRally?:(id:string)=>Promise<void>; hasDraft?:boolean; eventsLoading?:boolean; eventsError?:string; onRetryEvents?:()=>void;
  unavailableIds?: string[]; onClear?:()=>void; current?: FestivalEdition; hasDetails: boolean; onChoose: (edition: FestivalEdition) => void; focusOnOpen?: boolean; linked?: boolean;
}) {
  const [pending, setPending] = useState<FestivalEdition>();
  const [pendingRally,setPendingRally]=useState<RallyEvent>();
  const plans=useMemo(()=>rallyEvents.map(event=>{
    const entry=diary.find(r=>r.sourceEventId===event.id),edition=entry&&festivalForRave(entry);
    const date=event.startsAt.slice(0,10),end=(event.endsAt||event.startsAt).slice(0,10);
    const dates=[date,end].filter((value,index,values)=>values.indexOf(value)===index).map(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):value).join(' – ');
    return {event,entry,label:`Raveington · ${event.name} — ${dates} · ${entry?'Open diary entry':'Open Raveington rave'}`,document:searchDocument([event.name,entry?.name||'',edition?.name||'',...(edition?.aliases||[])],[event.location||'',entry?.city||'',entry?.venue||'',locationSearchText(event.location||entry?.city||''),date,end,'Raveington'],edition?.artists||[])};
  }).sort((a,b)=>b.event.startsAt.localeCompare(a.event.startsAt)),[rallyEvents,diary]);
  const searchScore=(query:string,value:string)=>{
    if(!value.startsWith('rally:'))return scoreCatalogEvent(query,value);
    const plan=plans.find(p=>`rally:${p.event.id}`===value);
    return plan?scoreSearch(query,plan.document):-1;
  };
  const choose = (id: string) => {
    setPendingRally(undefined);
    if(id.startsWith('rally:')){
      const event=rallyEvents.find(e=>`rally:${e.id}`===id);setPending(undefined);
      if(event&&onChooseRally){if(hasDraft)setPendingRally(event);else void onChooseRally(event.id);}
      return;
    }
    const edition = festivalEditions.find(e => e.id === id);
    if (!edition || unavailableIds.includes(id) || edition.id === current?.id) { setPending(undefined); return; }
    if (hasDetails) setPending(edition);
    else { onChoose(edition); setPending(undefined); }
  };
  return <section className="festival-picker" aria-label="Event catalog" tabIndex={-1} data-autofocus={focusOnOpen || undefined}>
    <div className="festival-picker-heading"><Search size={18}/><div><h3>{linked ? 'Event lineup' : 'Find a rave'}</h3><p>{linked ? 'Choose the event and date to load its sets.' : onChooseRally ? 'Your Raveington raves and the event catalog, together.' : 'Dates, venue, and lineup — ready to fill in.'}</p></div><span>{catalogYearRange}</span></div>
    <SharedPicker label="Event and year" searchTokens searchScore={searchScore} value={pendingRally ? `rally:${pendingRally.id}` : pending?.id || current?.id || ''} onChange={choose}
      options={[{value: '', label: 'Search events and years…'}, ...(onChooseRally ? plans.map(p=>({value:`rally:${p.event.id}`,label:p.label})) : []), ...festivalEditions.map(e => ({value: e.id, label: `${e.name} — ${festivalDates(e)}${unavailableIds.includes(e.id) ? ' · Already in your diary' : ''}`, disabled: unavailableIds.includes(e.id), searchText: catalogSearchText(e)}))]}/>
    {eventsLoading&&<p className="festival-picker-hint" role="status">Loading your Raveington raves…</p>}
    {eventsError&&<p className="festival-picker-hint" role="alert">Your Raveington raves couldn’t load. <button type="button" className="text-button" onClick={onRetryEvents}>Retry Raveington raves</button></p>}
    {pendingRally&&<div className="festival-preview" role="status"><strong>{pendingRally.name}</strong><p>Open this Raveington rave’s diary entry? Your unsaved changes to this form will be discarded. Its saved memories stay intact.</p><div className="festival-preview-actions"><button type="button" className="primary" onClick={()=>{void onChooseRally?.(pendingRally.id);setPendingRally(undefined);}}>Open Raveington rave</button><button type="button" className="secondary" onClick={()=>setPendingRally(undefined)}>Keep editing</button></div></div>}
    {current&&onClear&&<button type="button" className="catalog-disconnect" onClick={()=>{setPending(undefined);onClear();}}>Use a custom event instead</button>}
    {pending ? <div className="festival-preview" role="status">
      <strong>{pending.name}</strong>
      <span><CalendarDays size={14}/>{festivalDates(pending)}</span>
      <span><MapPin size={14}/>{pending.venue} · {pending.city}</span>
      <p>This replaces this diary entry’s event name, dates, city, and venue.{linked && ' Your shared Raveington plan stays unchanged.'} Your selected sets, crew, costs, and memories stay as they are. Review your sets for this edition.</p>
      <div className="festival-preview-actions"><button type="button" className="primary" disabled={unavailableIds.includes(pending.id)} onClick={() => {if(unavailableIds.includes(pending.id))return;onChoose(pending); setPending(undefined);}}>Use these event details</button><button type="button" className="secondary" onClick={() => setPending(undefined)}>Keep current details</button></div>
    </div> : current ? !linked && <p className="festival-applied" role="status"><Check size={15}/>{current.name} {current.artists.length ? (current.endDate<diaryToday()?'archived lineup loaded.':'lineup loaded.') : 'event details loaded. Lineup not available yet.'} {current.startDate > diaryToday() ? 'Choose the sets you want to see below.' : 'Choose the sets you saw below.'}</p> : <p className="festival-picker-hint">{onChooseRally ? 'Raveington results open your existing entry, without adding a duplicate. ' : ''}{festivalEditions.length} catalog events. Search a name, artist, year, city, or venue. Typos are okay. You can also enter your own event below.</p>}
  </section>;
}
