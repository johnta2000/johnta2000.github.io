import data from '../data/festivals.json';
import type {Rave} from './raves';

export type FestivalEdition = {
  id: string; festival: string; year: number; weekend?: number; kind?: Rave['kind']; name: string; aliases?: string[];
  startDate: string; endDate: string; city: string; venue: string; artists: string[];
  coverage: string; note: string; verifiedOn: string; sources: {label: string; url: string}[];
};
export const festivalEditions: FestivalEdition[] = [...data as FestivalEdition[]].sort((a, b) => a.festival.localeCompare(b.festival) || b.year - a.year || (a.weekend || 0) - (b.weekend || 0));
const key = (s: string) => s.trim().toLocaleLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');

// Match explicit event identities or known title/year spellings, with dates inside
// the edition. Never fuzzy-match titles or merge years/weekends.
export function festivalForRave(rave: Pick<Rave, 'name' | 'startDate' | 'endDate' | 'kind' | 'sourceEventId'>) {
  if (!rave.startDate) return undefined;
  const dated = festivalEditions.filter(e => rave.kind === (e.kind || 'Festival') && rave.startDate >= e.startDate && rave.startDate <= e.endDate &&
    (!rave.endDate || (rave.endDate >= rave.startDate && rave.endDate <= e.endDate)));
  const titled = dated.find(e => [e.name, ...[e.festival, ...(e.aliases || [])].flatMap(name => [name, ...(!e.weekend ? [`${name} ${e.year}`, `${name} '${String(e.year).slice(-2)}`] : [])])].some(n => key(n) === key(rave.name)));
  return titled || dated.find(e => e.id === rave.sourceEventId);
}
export function applyFestival(rave: Rave, edition: FestivalEdition): Rave {
  return {...rave, name: edition.name, startDate: edition.startDate, endDate: edition.endDate,
    city: edition.city, venue: edition.venue, kind: edition.kind || 'Festival'};
}
const date = (value: string) => new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'}).format(new Date(value + 'T12:00:00Z'));
export const festivalDates = (edition: FestivalEdition) => `${date(edition.startDate)}${edition.endDate !== edition.startDate ? ' – ' + date(edition.endDate) : ''}, ${edition.year}`;
