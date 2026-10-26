import {useState} from 'react';
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

export default function FestivalPicker({current, hasDetails, onChoose, focusOnOpen = false, linked = false, onClear, unavailableIds = []}: {
  unavailableIds?: string[]; onClear?:()=>void; current?: FestivalEdition; hasDetails: boolean; onChoose: (edition: FestivalEdition) => void; focusOnOpen?: boolean; linked?: boolean;
}) {
  const [pending, setPending] = useState<FestivalEdition>();
  const choose = (id: string) => {
    const edition = festivalEditions.find(e => e.id === id);
    if (!edition || unavailableIds.includes(id) || edition.id === current?.id) { setPending(undefined); return; }
    if (hasDetails) setPending(edition);
    else { onChoose(edition); setPending(undefined); }
  };
  return <section className="festival-picker" aria-label="Event catalog" tabIndex={-1} data-autofocus={focusOnOpen || undefined}>
    <div className="festival-picker-heading"><Search size={18}/><div><h3>{linked ? 'Event lineup' : 'Find a festival or show'}</h3><p>{linked ? 'Choose the event and date to load its sets.' : 'Dates, venue, and lineup — ready to fill in.'}</p></div><span>{catalogYearRange}</span></div>
    <SharedPicker label="Event and year" searchTokens searchScore={scoreCatalogEvent} value={pending?.id || current?.id || ''} onChange={choose}
      options={[{value: '', label: 'Search events and years…'}, ...festivalEditions.map(e => ({value: e.id, label: `${e.name} — ${festivalDates(e)}${unavailableIds.includes(e.id) ? ' · Already in your diary' : ''}`, disabled: unavailableIds.includes(e.id), searchText: catalogSearchText(e)}))]}/>
    {current&&onClear&&<button type="button" className="catalog-disconnect" onClick={()=>{setPending(undefined);onClear();}}>Use a custom event instead</button>}
    {pending ? <div className="festival-preview" role="status">
      <strong>{pending.name}</strong>
      <span><CalendarDays size={14}/>{festivalDates(pending)}</span>
      <span><MapPin size={14}/>{pending.venue} · {pending.city}</span>
      <p>This replaces this diary entry’s event name, dates, city, and venue.{linked && ' Your shared Rally plan stays unchanged.'} Your selected sets, crew, costs, and memories stay as they are. Review your sets for this edition.</p>
      <div className="festival-preview-actions"><button type="button" className="primary" disabled={unavailableIds.includes(pending.id)} onClick={() => {if(unavailableIds.includes(pending.id))return;onChoose(pending); setPending(undefined);}}>Use these event details</button><button type="button" className="secondary" onClick={() => setPending(undefined)}>Keep current details</button></div>
    </div> : current ? !linked && <p className="festival-applied" role="status"><Check size={15}/>{current.name} {current.artists.length ? (current.endDate<diaryToday()?'archived lineup loaded.':'lineup loaded.') : 'event details loaded. Lineup not available yet.'} {current.startDate > diaryToday() ? 'Choose the sets you want to see below.' : 'Choose the sets you saw below.'}</p> : <p className="festival-picker-hint">{festivalEditions.length} events in the catalog. Events already in your diary are unavailable. Try part of a name, artist, year, city, or venue. Small spelling mistakes are okay. For another show or club night, enter its details below.</p>}
  </section>;
}
