import {parseDate} from './dates';
import { totalCost, type Rave } from './raves.ts';
export type Filters = { year: string; kind: string; city: string; artist: string; crew: string; from: string; to: string; minCost: string; maxCost: string; rating: number; photosOnly: boolean; costStatus: ''|'unlogged'|'partial'|'complete' };
export type SortKey = 'name'|'date'|'city'|'kind'|'artists'|'crew'|'cost'|'rating'|'venue'|'favorite'|'ticket'|'travel'|'stay'|'other'|'notes';
export type Sort = {key:SortKey;direction:'asc'|'desc'};
export const emptyFilters=():Filters=>({year:'all',kind:'',city:'',artist:'',crew:'',from:'',to:'',minCost:'',maxCost:'',rating:0,photosOnly:false,costStatus:''});
const same=(a:string,b:string)=>a.toLocaleLowerCase()===b.toLocaleLowerCase();
export function filterRaves(raves:Rave[],filters:Filters,query:string) {
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const from=parseDate(filters.from),to=parseDate(filters.to);
  return raves.filter(r=>{
    if(filters.year!=='all' && !r.startDate.startsWith(filters.year))return false;
    if(filters.kind && r.kind!==filters.kind)return false;
    if(filters.city && !same(r.city,filters.city))return false;
    if(filters.artist && !r.artists.some(n=>same(n,filters.artist)))return false;
    if(filters.crew && !r.crew.some(n=>same(n,filters.crew)))return false;
    if(from && r.startDate<from)return false;
    if(to && r.startDate>to)return false;
    if(filters.rating && r.rating<filters.rating)return false;
    if(filters.photosOnly && !r.albumUrl)return false;
    const logged = Object.values(r.costs).filter(v => v !== null).length;
    if(filters.costStatus === 'unlogged' && logged !== 0)return false;
    if(filters.costStatus === 'partial' && (logged === 0 || logged === 4))return false;
    if(filters.costStatus === 'complete' && logged !== 4)return false;
    const cost=totalCost(r);
    if(filters.minCost!=='' && (cost===null || cost<Number(filters.minCost)))return false;
    if(filters.maxCost!=='' && (cost===null || cost>Number(filters.maxCost)))return false;
    const text=[r.name,r.startDate,r.endDate,r.city,r.venue,r.kind,...r.artists,...r.crew,r.favoriteArtist,r.notes].join(' ').toLocaleLowerCase();
    return words.every(word=>text.includes(word));
  });
}
export function sortRaves(raves:Rave[],sort:Sort) {
  const value=(r:Rave):string|number|null=>{
    switch(sort.key){case 'date':return r.startDate;case 'artists':return r.artists.length;case 'crew':return r.crew.length;case 'cost':return totalCost(r);case 'favorite':return r.favoriteArtist || null;case 'rating':return r.rating||null;case 'ticket':case 'travel':case 'stay':case 'other':return r.costs[sort.key];default:return r[sort.key] || null;}
  };
  return [...raves].sort((a,b)=>{const av=value(a),bv=value(b);if(av===null && bv!==null)return 1;if(bv===null && av!==null)return -1;const compared=av===null||bv===null?0:typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});return (sort.direction==='asc'?compared:-compared) || b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);});
}
