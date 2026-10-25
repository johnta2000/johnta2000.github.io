import {useId, useRef, useState} from 'react';
import {Plus, Search, X} from 'lucide-react';
import {uniqueNames} from '../lib/raves';
import {artistsForRave, creditDescription, performanceKey} from '../lib/artists';
import './name-picker.css';

export default function NamePicker({label, noun, values, onChange, suggestions, planSuggestions = [], text, onText, lineupOnly = false}: {
  label: string; noun: 'artist' | 'friend'; values: string[]; onChange: (v: string[]) => void;
  suggestions: string[]; planSuggestions?: string[]; text: string; onText: (v: string) => void; lineupOnly?: boolean;
}) {
  const id = useId(), list = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''), [selectedOnly, setSelectedOnly] = useState(false);
  const key = (name: string) => noun === 'artist' ? performanceKey(name) : name.trim().toLocaleLowerCase();
  const selected = new Set(values.map(key)), planned = new Set(planSuggestions.map(key));
  const history = new Set(suggestions.map(key));
  const outsideLineup = values.filter(n => !planned.has(key(n)));
  const groups = (lineupOnly ? [
    {title: 'From this lineup', names: uniqueNames(planSuggestions)},
    {title: planSuggestions.length ? 'Other logged sets · not in this lineup' : 'Your logged sets', names: selectedOnly ? outsideLineup : []},
  ] : [
    {title: noun === 'artist' ? 'From this lineup' : 'From this crew', names: uniqueNames(planSuggestions)},
    {title: 'From your diary', names: uniqueNames(suggestions).filter(n => !planned.has(key(n)))},
    {title: 'Added by you', names: values.filter(n => !planned.has(key(n)) && !history.has(key(n)))},
  ]).map(group => ({...group, names: group.names.filter(n => (!selectedOnly || selected.has(key(n))) && n.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b) => a.localeCompare(b))}));
  const count = groups.reduce((sum, group) => sum + group.names.length, 0);
  const total = lineupOnly ? uniqueNames(planSuggestions).length : uniqueNames([...planSuggestions, ...suggestions, ...values]).length;
  const add = () => {
    if (!text.trim()) return;
    onChange(uniqueNames([...values, ...text.split(',')])); onText(''); setQuery(''); if (lineupOnly) setSelectedOnly(true);
  };
  return <section className="name-picker" aria-labelledby={`${id}-label`}>
    <div className="name-picker-heading"><h3 id={`${id}-label`}>{label}</h3><span aria-live="polite">{values.length} selected</span></div>
    {noun === 'artist' && <div className="name-picker-credit-summary"><p>Keep the set name. B2Bs and special sets count toward the artists behind them.</p><strong aria-live="polite">{values.length} {values.length === 1 ? 'set' : 'sets'} · {artistsForRave({artists:values}).length} unique {artistsForRave({artists:values}).length === 1 ? 'artist' : 'artists'}</strong></div>}
    <div className="name-picker-panel">
      <div className="name-picker-search"><Search size={17} aria-hidden="true"/>
        <input ref={search} aria-label={`Search ${noun === 'artist' ? 'artists' : 'friends'}`} placeholder={noun === 'artist' ? (lineupOnly ? (selectedOnly ? 'Search your selected sets…' : 'Search this event’s lineup…') : 'Search the lineup or your diary…') : 'Search your crew or diary…'} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => {
          if (e.key === 'Enter') e.preventDefault();
          if (e.key === 'ArrowDown') { e.preventDefault(); list.current?.querySelector<HTMLInputElement>('input')?.focus(); }
          if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); }
        }}/>
        {query && <button type="button" aria-label={`Clear ${noun} search`} onClick={() => { setQuery(''); search.current?.focus(); }}><X size={16}/></button>}
      </div>
      <div className="name-picker-filters" aria-label={`${label} filters`}>
        <button type="button" aria-pressed={!selectedOnly} onClick={() => setSelectedOnly(false)}>{lineupOnly ? 'Lineup' : 'All'} <span>{total}</span></button>
        <button type="button" aria-pressed={selectedOnly} onClick={() => setSelectedOnly(true)}>Selected <span>{values.length}</span></button>
        {query && <small role="status">{count} {count === 1 ? 'match' : 'matches'}</small>}
      </div>
      {lineupOnly && planSuggestions.length > 0 && outsideLineup.length > 0 && <p className="name-picker-review">{outsideLineup.length} logged {outsideLineup.length === 1 ? 'set is' : 'sets are'} not listed in this lineup. <button type="button" onClick={() => {setSelectedOnly(true); setQuery('');}}>Review selected sets</button></p>}
      <div ref={list} className="name-picker-options" aria-label={`${label} choices`}>
        {count ? groups.map(group => !!group.names.length && <div className="name-picker-group" key={group.title}>
          <h4>{group.title}<span>{group.names.length}</span></h4>
          {group.names.map(name => <label className={'name-picker-option' + (selected.has(key(name)) ? ' is-selected' : '')} key={key(name)}>
            <input type="checkbox" checked={selected.has(key(name))} onChange={() => onChange(selected.has(key(name)) ? values.filter(v => key(v) !== key(name)) : uniqueNames([...values, name]))}/>
            <span>{name}{noun === 'artist' && creditDescription(name) && <small className="set-credit">{creditDescription(name)}</small>}</span>
          </label>)}
        </div>) : <div className="name-picker-empty"><strong>{query ? 'No matching names' : selectedOnly ? 'No one selected yet' : lineupOnly ? 'No lineup loaded yet' : 'Start with a name'}</strong><p>{query ? 'Try another search or add a missing name below.' : selectedOnly ? `Choose names from ${lineupOnly ? 'Lineup' : 'All'} to build your list.` : lineupOnly ? 'Choose a festival above or add a set you saw below.' : `Add an ${noun === 'artist' ? 'artist' : 'attendee'} below. Names from your diary will appear here next time.`}</p></div>}
      </div>
      <div className="name-picker-add"><label htmlFor={`${id}-add`}>Missing {noun === 'artist' ? 'an artist' : 'someone'}?</label><div>
        <input id={`${id}-add`} aria-label={label} value={text} placeholder={noun === 'artist' ? 'Add an artist…' : 'Add a friend…'} onChange={e => onText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}/>
        <button type="button" aria-label={`Add ${noun}`} disabled={!text.trim()} onClick={add}><Plus size={16}/>Add</button>
      </div>{text.trim() && <small>{noun === 'artist' && <span className="set-credit">{text.split(',').map(creditDescription).filter(Boolean).join(' · ')}</span>}This name is also included when you save. Separate multiple names with commas.</small>}</div>
    </div>
  </section>;
}
