import {festivalEditions} from './festivals';
import {locationSearchText,searchDocument,scoreSearch} from './search';

const catalogIndex=festivalEditions.map(e=>({id:e.id,document:searchDocument([e.name,e.festival,...(e.aliases||[])],[e.city,locationSearchText(e.city),e.venue,String(e.year),e.startDate,e.endDate],e.artists)}));
let lastSearch='',scores=new Map<string,number>();
export function scoreCatalogEvent(query:string,id:string){
  if(query!==lastSearch){
    lastSearch=query;const cache=new Map<string,number>();
    scores=new Map(catalogIndex.map(e=>[e.id,scoreSearch(query,e.document,cache,false)]));
    if(![...scores.values()].some(score=>score>=0)){
      scores=new Map(catalogIndex.map(e=>[e.id,scoreSearch(query,{...e.document,parts:e.document.parts.filter(p=>p.weight>0)},cache)]));
      if(![...scores.values()].some(score=>score>=0))scores=new Map(catalogIndex.map(e=>[e.id,scoreSearch(query,e.document,cache)]));
    }
  }
  return scores.get(id)??-1;
}
