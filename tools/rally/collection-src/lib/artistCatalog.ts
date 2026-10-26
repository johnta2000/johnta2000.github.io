import {festivalEditions} from './festivals';
import {artistId,artistsForSet} from './artists';

const names=new Map<string,string>();
for(const edition of festivalEditions)for(const set of edition.artists)for(const artist of artistsForSet(set)){
  const id=artistId(artist);if(!names.has(id))names.set(id,artist);
}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim().replace(/\s+/g,' ');
// Reuse the loaded event catalog and index artist names once. Only a short
// result list is rendered; the full catalog never becomes thousands of inputs.
export const artistCatalog=[...names.values()].sort((a,b)=>a.localeCompare(b));
const indexed=artistCatalog.map(name=>({name,search:normalize(name)}));
export function searchArtistCatalog(query:string,context:string[]=[],limit=12):string[]{
  const q=normalize(query),terms=q.split(' ').filter(Boolean),seen=new Set<string>();
  const entries=[...context.map(name=>({name,search:normalize(name)})),...indexed].filter(entry=>{
    if(seen.has(entry.search))return false;seen.add(entry.search);return terms.every(term=>entry.search.includes(term));
  });
  if(!q)return entries.slice(0,limit).map(e=>e.name);
  return entries.sort((a,b)=>Number(b.search===q)-Number(a.search===q)||Number(b.search.startsWith(q))-Number(a.search.startsWith(q))).slice(0,limit).map(e=>e.name);
}
