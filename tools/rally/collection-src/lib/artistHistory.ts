import {artistId, artistsForSet, performanceKey} from './artists';
import {isAttended, type Rave} from './raves';
export type ArtistHistory = {id:string;name:string;raves:Rave[];sets:{rave:Rave;label:string}[];favorites:number;first:string;last:string;debut:string;cities:string[]};
export function artistHistory(raves:Rave[],year='all') {
  const attended=raves.filter(r=>isAttended(r)).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id));
  const debuts=new Map<string,string>(),artists=new Map<string,ArtistHistory>();
  let performances=0;
  const scope=attended.filter(r=>year==='all'||r.startDate.startsWith(year));
  for(const rave of attended){
    const labels=[...new Map(rave.artists.map(label=>[performanceKey(label),label])).values()];
    const inScope=year==='all'||rave.startDate.startsWith(year);
    if(inScope)performances+=labels.length;
    for(const label of labels)for(const name of artistsForSet(label)){
      const id=artistId(name);if(!debuts.has(id))debuts.set(id,rave.startDate);
      if(!inScope)continue;
      let artist=artists.get(id);
      if(!artist){artist={id,name,raves:[],sets:[],favorites:0,first:rave.startDate,last:rave.startDate,debut:debuts.get(id)!,cities:[]};artists.set(id,artist);}
      artist.sets.push({rave,label});artist.last=rave.startDate;
      if(!artist.raves.some(r=>r.id===rave.id))artist.raves.push(rave);
      if(rave.city&&!artist.cities.some(city=>city.toLowerCase()===rave.city.toLowerCase()))artist.cities.push(rave.city);
    }
  }
  for(const artist of artists.values())artist.favorites=artist.raves.filter(r=>artist.sets.some(set=>set.rave.id===r.id&&performanceKey(set.label)===performanceKey(r.favoriteArtist))).length;
  const rows=[...artists.values()].sort((a,b)=>b.raves.length-a.raves.length||b.sets.length-a.sets.length||a.name.localeCompare(b.name));
  const years=[...new Set(attended.map(r=>r.startDate.slice(0,4)))].sort();
  const timeline=years.map(value=>{
    const seen=new Set(attended.filter(r=>r.startDate.startsWith(value)).flatMap(r=>r.artists.flatMap(label=>artistsForSet(label).map(artistId))));
    const fresh=[...seen].filter(id=>debuts.get(id)?.startsWith(value)).length;
    return {year:value,fresh,returning:seen.size-fresh,total:seen.size};
  });
  return {rows,performances,repeat:rows.filter(a=>a.raves.length>1).length,newArtists:rows.filter(a=>year==='all'||a.debut.startsWith(year)).length,scope,logged:scope.filter(r=>r.artists.length).length,timeline};
}
