import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Check, ChevronDown, Heart, LoaderCircle, LockKeyhole, Music2, Star, Wallet} from 'lucide-react';
import Modal from './Modal';
import DateField from './DateField';
import NamePicker from './NamePicker';
import {costKeys, emptyRave, leaderboard, totalCost, uniqueNames, validateRave, type Rave} from '../lib/raves';

const costLabels = {ticket: 'Tickets', travel: 'Travel', stay: 'Stay', other: 'Food & other'};
const money = (n: number) => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(n);

export default function RaveForm({initial, all, onSave, onClose, suggestedArtists = [], suggestedCrew = [], focusSection}: {
  initial?: Rave; all: Rave[]; onSave: (r: Rave) => Promise<void>; onClose: () => void;
  suggestedArtists?: string[]; suggestedCrew?: string[]; focusSection?: 'photos';
}) {
  const [r, setR] = useState<Rave>(() => ({...structuredClone(initial || emptyRave()), id: initial?.id || crypto.randomUUID()}));
  const baseline = useRef(JSON.stringify(r));
  const [artistText, setArtistText] = useState(''), [crewText, setCrewText] = useState('');
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false);
  const isEdit = all.some(n => n.id === r.id);
  const dirty = JSON.stringify(r) !== baseline.current || !!artistText.trim() || !!crewText.trim();
  const close = () => { if (saving) return; if (dirty) setDiscard(true); else onClose(); };
  const field = <K extends keyof Rave>(key: K, value: Rave[K]) => setR(prev => ({...prev, [key]: value}));
  const duplicate = all.find(n => n.id !== r.id && n.startDate === r.startDate && n.name.toLowerCase().trim() === r.name.toLowerCase().trim());
  const sum = totalCost(r);
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return;
    setError(''); setSaving(true); setDiscard(false);
    try {
      const clean = validateRave({...r, endDate: r.endDate || r.startDate,
        artists: uniqueNames([...r.artists, ...artistText.split(',')]), crew: uniqueNames([...r.crew, ...crewText.split(',')])});
      await onSave(clean); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your changes are still here.'); }
    finally { setSaving(false); }
  };
  return <Modal title={isEdit ? 'Edit your experience' : 'Add a rave'} onClose={close} wide>
    <form onSubmit={submit} className="rave-form collection-form" aria-busy={saving} onInvalidCapture={event => {
      const input = event.target as HTMLInputElement;
      const section = input.closest('details');
      if (section) section.open = true;
    }}>
      <p className="form-intro">{r.sourceEventId ? 'Started from your rave plan. Add the artists you actually saw and your own share of the costs.' : 'Start with a name and date. You can fill in the rest anytime.'}</p>
      <fieldset disabled={saving} className="form-fields">
        <label className="field">Rave / event name <span className="required-label">Required</span><input data-autofocus={!focusSection || undefined} autoFocus={!focusSection} required maxLength={160} placeholder="The festival, show, or club night" value={r.name} onChange={e => field('name', e.target.value)}/></label>
        <div className="form-grid">
          <DateField label="Start date" required value={r.startDate} onChange={next => {
            setR(prev => ({...prev, startDate: next, endDate: prev.endDate === prev.startDate ? next : prev.endDate}));
          }}/>
          <DateField label="End date" hint="For multiple days" min={r.startDate} value={r.endDate} onChange={value => field('endDate', value)}/>
          <label className="field">City<input maxLength={150} placeholder="San Francisco, CA" value={r.city} onChange={e => field('city', e.target.value)}/></label>
          <label className="field">Venue<input maxLength={150} placeholder="The Midway" value={r.venue} onChange={e => field('venue', e.target.value)}/></label>
        </div>
        <div className="field"><span className="field-label">Type of night</span><div className="segmented">{(['Festival', 'Club night', 'Show'] as const).map(k => <button type="button" key={k} aria-pressed={r.kind === k} className={r.kind === k ? 'active' : ''} onClick={() => field('kind', k)}>{k}</button>)}</div></div>
        {duplicate && <p className="form-notice">You already have “{duplicate.name}” on this date. Saving will add a separate entry.</p>}
        <details className="form-disclosure" open>
          <summary><Music2 size={17}/><span>Artists & crew<small>Who made the night</small></span><ChevronDown size={16}/></summary>
          <div className="disclosure-body">
            {r.sourceEventId && <p className="form-help">Your plan is a starting point. Check the artists you saw and the people you went with.</p>}
            <NamePicker label="Artists you actually saw" noun="artist" planSuggestions={suggestedArtists} values={r.artists} text={artistText} onText={setArtistText}
              onChange={artists => setR(prev => ({...prev, artists, favoriteArtist: artists.some(a => a.toLowerCase() === prev.favoriteArtist.toLowerCase()) ? prev.favoriteArtist : ''}))}
              suggestions={uniqueNames(all.flatMap(rave => rave.artists))}/>
            <NamePicker label="Who did you go with?" noun="friend" planSuggestions={suggestedCrew} values={r.crew} text={crewText} onText={setCrewText} onChange={v => field('crew', v)}
              suggestions={leaderboard(all, 'crew').map(a => a.name)}/>
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
            {!!r.artists.length && <div className="field"><span className="field-label">Favorite set</span><div className="choice-chips">{r.artists.map(a => <button type="button" key={a} aria-pressed={r.favoriteArtist === a} className={r.favoriteArtist === a ? 'chosen' : ''} onClick={() => field('favoriteArtist', r.favoriteArtist === a ? '' : a)}><Star size={13}/>{a}</button>)}</div></div>}
            <div className="field"><span className="field-label">How was the night?</span><div className="rating">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={r.rating === n} onClick={() => field('rating', r.rating === n ? 0 : n)}><Star size={24} fill={n <= r.rating ? 'currentColor' : 'none'}/></button>)}<span>{r.rating ? `${r.rating} / 5` : 'Unrated'}</span></div></div>
            <label className="field">A note to future you<textarea maxLength={10000} rows={3} placeholder="The set you loved, the funniest moment, the afters…" value={r.notes} onChange={e => field('notes', e.target.value)}/></label>
          </div>
        </details>
      </fieldset>
      {error && <p role="alert" className="error form-feedback">{error} Your changes are still here.</p>}
      <div className="form-footer">
        {discard ? <div className="discard-confirm" role="alert"><span>Discard your unsaved changes?</span><button type="button" className="secondary" autoFocus onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className="danger" onClick={onClose}>Discard changes</button></div>
          : <><span className="form-private"><LockKeyhole size={13}/>Only you</span><button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save to rave diary'}</button></>}
      </div>
    </form>
  </Modal>;
}
