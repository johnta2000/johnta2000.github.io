import {artistsForRave, artistId} from './artists';
export type CrewConnection = {id: string; name: string; kind: 'account' | 'guest'; projectId: string; memberId: string};
export type Rave = {
  id: string; sourceEventId?: string; catalogEventId?: string | null; crewConnections?: CrewConnection[]; plannedCrewConnections?: CrewConnection[]; name: string; startDate: string; endDate: string; city: string; venue: string;
  attendance?: 'planned' | 'attended' | 'skipped'; plannedArtists?: string[]; plannedCrew?: string[];
  kind: 'Festival' | 'Club night' | 'Show'; artists: string[]; crew: string[];
  costs: { ticket: number | null; travel: number | null; stay: number | null; other: number | null };
  albumUrl: string; notes: string; rating: number; favoriteArtist: string; color: number;
};
export const costKeys = ['ticket', 'travel', 'stay', 'other'] as const;
export const emptyRave = (): Rave => ({id:'',name:'',startDate:'',endDate:'',city:'',venue:'',kind:'Festival',artists:[],crew:[],costs:{ticket:null,travel:null,stay:null,other:null},albumUrl:'',notes:'',rating:0,favoriteArtist:'',color:0});
export const totalCost = (r: Rave) => costKeys.some(k => r.costs[k] !== null) ? costKeys.reduce((n,k)=>n+(r.costs[k] ?? 0),0) : null;
export function days(r: Rave) { return Math.floor((Date.parse(r.endDate || r.startDate)-Date.parse(r.startDate))/86400000)+1; }
export function uniqueNames(names: string[]) { const seen = new Set<string>(); return names.map(n=>n.trim()).filter(n=>n && !seen.has(n.toLocaleLowerCase()) && !!seen.add(n.toLocaleLowerCase())); }
// Calendar boundaries are shared by browser and backend; plans never become
// attendance just because their dates pass.
export const diaryToday = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const attendanceOf = (r: Rave, today = diaryToday()) => r.attendance || (r.startDate > today ? 'planned' : 'attended');
export const isAttended = (r: Rave, today = diaryToday()) => attendanceOf(r,today) === 'attended' && r.startDate <= today;
export const raveStatus = (r: Rave, today = diaryToday()) => attendanceOf(r,today) === 'skipped' ? (r.startDate>today?'Not going':'Didn’t go') : isAttended(r,today) ? 'Attended' : r.startDate > today ? 'Upcoming' : 'To log';
export const displaySets = (r: Rave) => attendanceOf(r) === 'attended' ? r.artists : r.plannedArtists || [];
export const displayCrew = (r: Rave) => attendanceOf(r) === 'attended' ? r.crew : r.plannedCrew || [];
export function leaderboard(raves: Rave[], field: 'artists' | 'crew') {
  const map = new Map<string,{id:string;name:string;connected:boolean;count:number;raves:Rave[]}>();
  for (const r of raves.filter(r=>isAttended(r))) {
    const people = r.crewConnections || [];
    const entries = field === 'artists' ? artistsForRave(r).map(name=>({id:artistId(name),name,connected:false})) : [
      ...people.map(p=>({id:p.id,name:p.name,connected:p.kind==='account'})),
      ...uniqueNames(r.crew).filter(name=>!people.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase())).map(name=>({id:'name:'+name.toLocaleLowerCase(),name,connected:false})),
    ];
    const seen = new Set<string>();
    for (const entry of entries) {if(seen.has(entry.id))continue;seen.add(entry.id);const row=map.get(entry.id) ?? {...entry,count:0,raves:[]};row.count++;row.raves.push(r);map.set(entry.id,row);}
  }
  return [...map.values()].sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
}
const validDate = (v: unknown) => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
export function validateRave(input: unknown): Rave {
  if(!input || typeof input!=='object') throw new Error('Choose a rave to save.');
  const x = input as Record<string,unknown>;
  const str=(key:string,max:number)=>{if(typeof x[key]!=='string' || (x[key] as string).length>max) throw new Error(`Check the ${key} field.`);return (x[key] as string).trim();};
  const name=str('name',160); if(!name) throw new Error('Give this rave a name.');
  if(!validDate(x.startDate) || (x.endDate && !validDate(x.endDate))) throw new Error('Choose a valid date.');
  const startDate=x.startDate as string, endDate=(x.endDate as string) || startDate;
  if(endDate<startDate) throw new Error('The end date must be on or after the start date.');
  if(!['Festival','Club night','Show'].includes(String(x.kind))) throw new Error('Choose a rave type.');
  const list=(key:string)=>{const a=x[key];if(!Array.isArray(a) || a.length>150 || a.some(n=>typeof n!=='string' || n.length>120)) throw new Error(`Check your ${key} list.`);return uniqueNames(a);};
  if(!x.costs || typeof x.costs!=='object') throw new Error('Check your costs.');
  const costs={} as Rave['costs'];for(const k of costKeys){ const v=(x.costs as Record<string,unknown>)[k];if(v!==null && (typeof v!=='number' || !Number.isFinite(v) || v<0 || v>10000000))throw new Error('Costs must be positive amounts or left blank.');costs[k]=v===null?null:Math.round((v as number)*100)/100; }
  const albumUrl=str('albumUrl',2000);if(albumUrl){try{if(!['https:','http:'].includes(new URL(albumUrl).protocol))throw new Error();}catch{throw new Error('Use a full https:// or http:// album link.');}}
  const artists=list('artists'),crew=list('crew');
  const attendance=x.attendance ?? (startDate>diaryToday()?'planned':'attended');
  if(!['planned','attended','skipped'].includes(String(attendance)))throw new Error('Choose a valid attendance status.');
  if(attendance==='attended' && startDate>diaryToday())throw new Error('Save a future rave as a plan. Confirm attendance when it starts.');
  const plannedArtists=x.plannedArtists===undefined?[]:list('plannedArtists'),plannedCrew=x.plannedCrew===undefined?[]:list('plannedCrew');
  const favoriteArtist=str('favoriteArtist',120);if(favoriteArtist && !artists.some(n=>n.toLocaleLowerCase()===favoriteArtist.toLocaleLowerCase()))throw new Error('Your favorite set should be one of the artists you saw.');
  if(typeof x.rating!=='number' || !Number.isInteger(x.rating) || x.rating<0 || x.rating>5)throw new Error('Choose a rating from 1 to 5, or leave it unrated.');
  const color=typeof x.color==='number' && Number.isInteger(x.color) && x.color>=0 && x.color<4 ? x.color : 0;
  const id=typeof x.id==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(x.id) ? x.id : crypto.randomUUID();
  const sourceEventId=typeof x.sourceEventId==='string' && /^[a-zA-Z0-9_-]{1,120}$/.test(x.sourceEventId)?x.sourceEventId:undefined;
  if(x.sourceEventId!==undefined&&!sourceEventId)throw new Error('Invalid linked Raveington event.');
  const connections=(key:string,names:string[]):CrewConnection[]=>{
    if(x[key]===undefined)return [];
    if(!Array.isArray(x[key]) || x[key].length>150)throw new Error('Check your crew connections.');
    const seen=new Set<string>();
    return (x[key] as unknown[]).map(raw=>{
      const p=raw as CrewConnection;
      if(!p || typeof p!=='object' || typeof p.id!=='string' || p.id.length>300 || typeof p.name!=='string' || !p.name.trim() || p.name.length>120 || !['account','guest'].includes(p.kind) || !/^[a-zA-Z0-9_-]{1,120}$/.test(p.projectId) || !/^[a-zA-Z0-9_-]{1,160}$/.test(p.memberId))throw new Error('Check your crew connections.');
      return {id:p.id,name:p.name.trim(),kind:p.kind,projectId:p.projectId,memberId:p.memberId};
    }).filter(p=>names.some(n=>n.toLocaleLowerCase()===p.name.toLocaleLowerCase()) && !seen.has(p.id) && !!seen.add(p.id));
  };
  const crewConnections=connections('crewConnections',crew),plannedCrewConnections=connections('plannedCrewConnections',plannedCrew);
  const catalogEventId=x.catalogEventId;
  if(catalogEventId!==undefined && catalogEventId!==null && (typeof catalogEventId!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(catalogEventId)))throw new Error('Invalid catalog event.');
  return {id,...(catalogEventId!==undefined?{catalogEventId:catalogEventId as string|null}:{}),...(x.crewConnections!==undefined?{crewConnections}:{}),...(x.plannedCrewConnections!==undefined?{plannedCrewConnections}:{}),attendance:attendance as Rave['attendance'],plannedArtists,plannedCrew,...(sourceEventId?{sourceEventId}:{}),name,startDate,endDate,city:str('city',150),venue:str('venue',150),kind:x.kind as Rave['kind'],artists,crew,costs,albumUrl,notes:str('notes',10000),rating:x.rating,favoriteArtist,color};
}
export const demoRaves: Rave[] = [
  {id:'demo-1',name:'Lost Lands',startDate:'2026-09-18',endDate:'2026-09-20',city:'Thornville, OH',venue:'Legend Valley',kind:'Festival',artists:['Subtronics','Excision','Wooli','Sullivan King','Seven Lions','REZZ'],crew:['Alex','Maya','Sam','Jordan'],costs:{ticket:450,travel:190,stay:210,other:85},albumUrl:'',notes:'The sunset set. The walk back to camp. The kind of weekend you wish you could bottle up.',rating:5,favoriteArtist:'Subtronics',color:0},
  {id:'demo-2',name:'EDC Las Vegas',startDate:'2026-05-15',endDate:'2026-05-17',city:'Las Vegas, NV',venue:'Las Vegas Motor Speedway',kind:'Festival',artists:['Martin Garrix','Dom Dolla','ILLENIUM','John Summit','Subtronics','Seven Lions','Wooli','Above & Beyond'],crew:['Alex','Maya','Jordan','Chris','Taylor'],costs:{ticket:480,travel:140,stay:260,other:110},albumUrl:'',notes:'Danced until sunrise. Found our people under the electric sky.',rating:5,favoriteArtist:'Seven Lions',color:1},
  {id:'demo-3',name:'Dom Dolla',startDate:'2026-03-21',endDate:'2026-03-21',city:'San Francisco, CA',venue:'Bill Graham Civic Auditorium',kind:'Show',artists:['Dom Dolla','Torren Foot'],crew:['Maya','Sam'],costs:{ticket:85,travel:18,stay:0,other:24},albumUrl:'',notes:'A spontaneous Saturday that turned into one of my favorite nights.',rating:4,favoriteArtist:'Dom Dolla',color:2},
  {id:'demo-4',name:'Countdown NYE',startDate:'2025-12-31',endDate:'2025-12-31',city:'San Bernardino, CA',venue:'NOS Events Center',kind:'Festival',artists:['Subtronics','Zedd','Wooli','REZZ','Sullivan King'],crew:['Alex','Sam','Chris'],costs:{ticket:180,travel:65,stay:90,other:40},albumUrl:'',notes:'New year, same crew. Midnight in the middle of the crowd.',rating:4,favoriteArtist:'REZZ',color:3},
  {id:'demo-5',name:'Outside Lands',startDate:'2025-08-08',endDate:'2025-08-10',city:'San Francisco, CA',venue:'Golden Gate Park',kind:'Festival',artists:['RÜFÜS DU SOL','Chris Lake','John Summit'],crew:['Maya','Taylor'],costs:{ticket:390,travel:null,stay:0,other:75},albumUrl:'',notes:'Fog, friends, and the best dance floor in the park.',rating:5,favoriteArtist:'RÜFÜS DU SOL',color:2},
  {id:'demo-6',name:'Seven Lions',startDate:'2024-11-16',endDate:'2024-11-16',city:'San Francisco, CA',venue:'The Midway',kind:'Club night',artists:['Seven Lions','Jason Ross'],crew:['Alex','Jordan'],costs:{ticket:65,travel:20,stay:0,other:null},albumUrl:'',notes:'That one drop everyone sang together.',rating:5,favoriteArtist:'Seven Lions',color:1},
];
