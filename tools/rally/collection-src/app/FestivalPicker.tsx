import {useState} from 'react';
import {CalendarDays, Check, MapPin, Search} from 'lucide-react';
import SharedPicker from './SharedPicker';
import {festivalDates, festivalEditions, type FestivalEdition} from '../lib/festivals';
import './festival-picker.css';

export function FestivalSources({edition}: {edition: FestivalEdition}) {
  return <details className="festival-sources"><summary>Sources & coverage</summary>
    <p>{edition.note || 'Published lineup archive. Last-minute changes may differ.'}</p>
    <ul>{edition.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a></li>)}</ul>
    <small>Checked {edition.verifiedOn}. Suggestions are not a record of attendance.</small>
  </details>;
}

export default function FestivalPicker({current, hasDetails, onChoose, focusOnOpen = false}: {
  current?: FestivalEdition; hasDetails: boolean; onChoose: (edition: FestivalEdition) => void; focusOnOpen?: boolean;
}) {
  const [pending, setPending] = useState<FestivalEdition>();
  const choose = (id: string) => {
    const edition = festivalEditions.find(e => e.id === id);
    if (!edition || edition.id === current?.id) { setPending(undefined); return; }
    if (hasDetails) setPending(edition);
    else { onChoose(edition); setPending(undefined); }
  };
  return <section className="festival-picker" aria-label="Festival catalog" tabIndex={-1} data-autofocus={focusOnOpen || undefined}>
    <div className="festival-picker-heading"><Search size={18}/><div><h3>Find a past festival</h3><p>Dates, venue, and lineup — ready to fill in.</p></div><span>2022–2026</span></div>
    <SharedPicker label="Festival and year" searchTokens value={pending?.id || current?.id || ''} onChange={choose}
      options={[{value: '', label: 'Search festivals and years…'}, ...festivalEditions.map(e => ({value: e.id, label: `${e.name} — ${festivalDates(e)}`}))]}/>
    {pending ? <div className="festival-preview" role="status">
      <strong>{pending.name}</strong>
      <span><CalendarDays size={14}/>{festivalDates(pending)}</span>
      <span><MapPin size={14}/>{pending.venue} · {pending.city}</span>
      <p>This replaces the event name, dates, city, and venue. Your selected sets, crew, costs, and memories stay as they are. Review your sets for this edition.</p>
      <div className="festival-preview-actions"><button type="button" className="primary" onClick={() => {onChoose(pending); setPending(undefined);}}>Use these event details</button><button type="button" className="secondary" onClick={() => setPending(undefined)}>Keep current details</button></div>
    </div> : current ? <p className="festival-applied" role="status"><Check size={15}/>Event details filled in. Choose the sets you saw below.</p> : <p className="festival-picker-hint">{festivalEditions.length} editions to explore. For another show or club night, enter its details below.</p>}
  </section>;
}
