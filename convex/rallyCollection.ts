import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server';
import {v,ConvexError} from 'convex/values';
import {festivalForRave, festivalEditions} from '../tools/rally/collection-src/lib/festivals';
import {emptyRave,uniqueNames,validateRave,diaryToday,type Rave,type CrewConnection} from '../tools/rally/collection-src/lib/raves';
async function requireUser(ctx:Pick<QueryCtx|MutationCtx,'auth'>){
  const user=await ctx.auth.getUserIdentity();
  const verified=user?.emailVerified===true || (user?.emailVerified===undefined && user?.issuer==='https://clerk.john-ta.com');
  if(!user?.subject||!user.email||!verified)throw new ConvexError('Sign in with your verified Rally account to open your collection.');
  return {ownerToken:user.tokenIdentifier,subject:user.subject,email:user.email.trim().toLowerCase(),name:user.name||user.email.split('@')[0]};
}
function memberFor(room:any,user:{subject:string;email:string}){
  return (room?.members||[]).find((m:any)=>m.clerkSubject===user.subject || (!m.clerkSubject && m.email&&m.email.trim().toLowerCase()===user.email));
}
function roomRave(room:any,eventId:string):Rave {
  return {...emptyRave(),sourceEventId:eventId,...(room.catalogEventId!==undefined?{catalogEventId:room.catalogEventId}:{}),name:room.name||'',startDate:room.startsAt||'',endDate:room.endsAt||room.startsAt||'',city:room.location||'',venue:room.venue||'',kind:room.raveKind|| (room.templateId==='local-show'?'Show':'Festival')};
}
async function accountPersonId(subject:string){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('rally-person-v1:'+subject));
 return 'account:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function roomPeople(room:any,eventId:string,user:Awaited<ReturnType<typeof requireUser>>):Promise<CrewConnection[]>{
 const self=memberFor(room,user);
 return Promise.all((room.members||[]).filter((m:any)=>m.id && m.name && m.id!==self?.id).map(async(m:any)=>({id:m.clerkSubject?await accountPersonId(m.clerkSubject):'guest:'+encodeURIComponent(eventId)+':'+encodeURIComponent(m.id),name:String(m.name),kind:m.clerkSubject?'account' as const:'guest' as const,projectId:eventId,memberId:String(m.id)})));
}
function catalogIdentity(rave:Rave):Rave {
 const {catalogEventId:_old,...rest}=rave;const edition=festivalForRave(rave);
 return edition?{...rest,catalogEventId:edition.id}:rave.catalogEventId===null?{...rest,catalogEventId:null}:rest;
}
async function visibleMemories(room:any){
 const members=new Map(await Promise.all((room.members||[]).map(async(m:any)=>[m.id,{...m,personId:m.clerkSubject?await accountPersonId(m.clerkSubject):null}])));
 return (Array.isArray(room.diaryMemories)?room.diaryMemories:[]).filter((m:any)=>{const member=members.get(m.memberId) as any;return member&&(!m.authorId||!member.clerkSubject||m.authorId===member.personId);}).map((m:any)=>({memberId:m.memberId,name:m.name,note:m.note,albumUrl:m.albumUrl,updatedAt:m.updatedAt}));
}

async function ownEntry(ctx:QueryCtx|MutationCtx,ownerToken:string,entryId:string){
  return ctx.db.query('rallyCollections').withIndex('by_owner_entry',q=>q.eq('ownerToken',ownerToken).eq('entryId',entryId)).unique();
}
async function accessibleRoom(ctx:QueryCtx|MutationCtx,user:Awaited<ReturnType<typeof requireUser>>,eventId:string){
  const room=await ctx.db.query('warRoomState').withIndex('by_board',q=>q.eq('boardId',`rally:${eventId}`)).unique();
  if(!room?.buckets || !memberFor(room.buckets,user))throw new ConvexError('You do not have access to that Rally event.');
  return room.buckets;
}
// Freeze legacy intent against the entry's original creation date. A legacy
// future entry must not turn into attended history when the calendar advances.
function storedRave(row:any):Rave {
  const r=row.rave as Rave;
  if(r.attendance)return r;
  const created=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.createdAt));
  const planned=r.startDate>created;
  return {...r,attendance:planned?'planned':'attended',plannedArtists:planned?r.artists:[],plannedCrew:planned?r.crew:[],...(planned?{artists:[],crew:[],favoriteArtist:'',rating:0}:{})};
}
export const list=query({args:{},handler:async ctx=>{
  const user=await requireUser(ctx);
  const rows=await ctx.db.query('rallyCollections').withIndex('by_owner',q=>q.eq('ownerToken',user.ownerToken)).collect();
  return {raves:rows.map(storedRave).sort((a,b)=>b.startDate.localeCompare(a.startDate)),viewer:{name:user.name,subject:user.subject}};
}});
export const draftFromEvent=query({args:{eventId:v.string()},handler:async(ctx,{eventId})=>{
  const user=await requireUser(ctx),room=await accessibleRoom(ctx,user,eventId);
  const existing=await ctx.db.query('rallyCollections').withIndex('by_owner_event',q=>q.eq('ownerToken',user.ownerToken).eq('sourceEventId',eventId)).unique();
  // Planning interests and shared purchases are suggestions, never proof of attendance or personal spend.
  const self=memberFor(room,user);
  const crewSuggestions=uniqueNames((room.members||[]).filter((m:any)=>m.id!==self?.id).map((m:any)=>String(m.name||'')));
  const artistSuggestions=uniqueNames((room.lineup||[]).map((a:any)=>String(a.artist||a.name||'')));
  const rave=catalogIdentity({...roomRave(room,eventId),attendance:'planned'});
  return {rave:existing?storedRave(existing):rave,existing:!!existing,crewSuggestions,artistSuggestions,crewPeople:await roomPeople(room,eventId,user),eventName:room.name,sharedMemories:await visibleMemories(room)};
}});
async function saveOne(ctx:MutationCtx,user:Awaited<ReturnType<typeof requireUser>>,rave:Rave){
  const existing=await ownEntry(ctx,user.ownerToken,rave.id);
  if(rave.sourceEventId){
    if(existing?.sourceEventId!==rave.sourceEventId)await accessibleRoom(ctx,user,rave.sourceEventId);
    const linked=await ctx.db.query('rallyCollections').withIndex('by_owner_event',q=>q.eq('ownerToken',user.ownerToken).eq('sourceEventId',rave.sourceEventId)).unique();
    if(linked && linked.entryId!==rave.id)throw new ConvexError('This Rally event is already in your collection. Open its existing entry to edit it.');
  }
  rave=catalogIdentity(rave);
  if(rave.crewConnections?.length || rave.plannedCrewConnections?.length){
    const saved=await ctx.db.query('rallyCollections').withIndex('by_owner',q=>q.eq('ownerToken',user.ownerToken)).collect();
    const known=saved.flatMap(row=>[...(row.rave?.crewConnections||[]),...(row.rave?.plannedCrewConnections||[])]);
    let available:CrewConnection[]=[];
    if(rave.sourceEventId){try{available=await roomPeople(await accessibleRoom(ctx,user,rave.sourceEventId),rave.sourceEventId,user);}catch{/* Existing personal history survives leaving a crew. */}}
    const verify=(links:CrewConnection[])=>links.map(p=>{
      const person=available.find(a=>a.projectId===p.projectId&&a.memberId===p.memberId&&(a.id===p.id||p.kind==='guest'&&a.kind==='account'))||known.find(a=>a.id===p.id&&a.projectId===p.projectId&&a.memberId===p.memberId);
      if(!person)throw new ConvexError('Choose a friend from your Rally crew or existing diary connections.');
      return {...person,name:p.name};
    });
    if(rave.crewConnections)rave.crewConnections=verify(rave.crewConnections);
    if(rave.plannedCrewConnections)rave.plannedCrewConnections=verify(rave.plannedCrewConnections);
  }
  const updatedAt=Date.now();
  if(existing)await ctx.db.patch(existing._id,{rave,sourceEventId:rave.sourceEventId,updatedAt});
  else await ctx.db.insert('rallyCollections',{ownerToken:user.ownerToken,entryId:rave.id,...(rave.sourceEventId?{sourceEventId:rave.sourceEventId}:{}),rave,createdAt:updatedAt,updatedAt});
  return rave;
}
export const save=mutation({args:{rave:v.any()},handler:async(ctx,{rave})=>{
  const user=await requireUser(ctx);
  const existing=typeof rave?.id==='string'?await ownEntry(ctx,user.ownerToken,rave.id):null;
  const prior=existing?storedRave(existing):null;
  const clean=validateRave({...rave,...(prior&&rave.attendance===undefined?{attendance:prior.attendance}:{}),...(prior&&rave.plannedArtists===undefined?{plannedArtists:prior.plannedArtists}:{}),...(prior&&rave.plannedCrew===undefined?{plannedCrew:prior.plannedCrew}:{}),...Object.fromEntries(['catalogEventId','crewConnections','plannedCrewConnections'].filter(key=>prior&&rave[key]===undefined&&prior[key as keyof Rave]!==undefined).map(key=>[key,prior![key as keyof Rave]]))});
  if(JSON.stringify(clean).length>65000)throw new ConvexError('This entry is too large. Shorten its notes or names.');
  return saveOne(ctx,user,clean);
}});
export const importEntries=mutation({args:{raves:v.array(v.any())},handler:async(ctx,{raves})=>{
  const user=await requireUser(ctx);
  if(!raves.length||raves.length>200)throw new ConvexError('Import between 1 and 200 raves at a time.');
  const clean=raves.map(validateRave);
  if(new Set(clean.map(r=>r.id)).size!==clean.length)throw new ConvexError('This backup contains duplicate entry IDs.');
  if(JSON.stringify(clean).length>900000)throw new ConvexError('Import a smaller backup, up to 900 KB at a time.');
  for(const rave of clean){if(JSON.stringify(rave).length>65000)throw new ConvexError('One entry is too large.');await saveOne(ctx,user,rave);}
  return clean;
}});
export const remove=mutation({args:{id:v.string()},handler:async(ctx,{id})=>{
  const user=await requireUser(ctx),entry=await ownEntry(ctx,user.ownerToken,id);
  if(entry)await ctx.db.delete(entry._id);
  return {ok:true};
}});


// Create a real Rally room and link it in the same transaction. Repeat clicks
// return the linked room. No personal spending, guests, notes, or photos copy.
export const createPlan=mutation({args:{id:v.string(),timeZone:v.string()},handler:async(ctx,{id,timeZone})=>{
  const user=await requireUser(ctx),entry=await ownEntry(ctx,user.ownerToken,id);
  if(!entry)throw new ConvexError('Save this diary entry before creating its Rally plan.');
  const rave=storedRave(entry);
  if(rave.sourceEventId){await accessibleRoom(ctx,user,rave.sourceEventId);return rave;}
  try{new Intl.DateTimeFormat('en-US',{timeZone}).format();}catch{throw new ConvexError('Choose a valid event timezone.');}
  const eventId='rave-'+crypto.randomUUID(),memberId=eventId+'-admin';
  const edition=festivalForRave(rave);
  const room={id:eventId,leaderId:memberId,name:rave.name,location:rave.city,venue:rave.venue,startsAt:rave.startDate,endsAt:rave.endDate,
    ...(edition?{catalogEventId:edition.id}:rave.catalogEventId===null?{catalogEventId:null}:{}),raveKind:rave.kind,eventTimeZone:timeZone,eventVisibility:'auto',projectTheme:'warm',templateId:rave.kind==='Festival'?'festival-weekend':'local-show',createdFromTemplate:'blank',
    members:[{id:memberId,name:user.name,email:user.email,clerkSubject:user.subject,origin:'TBD',initials:user.name.slice(0,2).toUpperCase(),color:'purple',role:'admin',status:'confirmed'}],
    rooms:[],travel:[],cars:[],tasks:[],passes:[],notes:[],meetups:[],lineupFavorites:{},
    lineup:(edition?.artists||[]).map((name,index)=>({id:eventId+'-set-'+index,name,artist:name,stage:'',date:'',start:'',end:''}))};
  await ctx.db.insert('warRoomState',{boardId:'rally:'+eventId,completed:{},linearLinks:{},docLinks:{},buckets:room,updatedAt:Date.now()});
  return saveOne(ctx,user,{...rave,sourceEventId:eventId});
}});


// Read only the caller's entry and its authorized project. Never scan other
// diaries or infer that another person attended from room membership.
async function connectionState(ctx:QueryCtx|MutationCtx,user:Awaited<ReturnType<typeof requireUser>>,id:string){
 const entry=await ownEntry(ctx,user.ownerToken,id);
 if(!entry)throw new ConvexError('Save this diary entry first.');
 const rave=storedRave(entry);
 if(!rave.sourceEventId)throw new ConvexError('Connect a Rally plan first.');
 const room=await accessibleRoom(ctx,user,rave.sourceEventId),self=memberFor(room,user);
 const details=catalogIdentity(roomRave(room,rave.sourceEventId));
 const lineup=uniqueNames((room.lineup||[]).map((a:any)=>String(a.artist||a.name||'')));
 const favorites=new Set(room.lineupFavorites?.[self.id]||[]);
 const wishlist=uniqueNames((room.lineup||[]).filter((a:any)=>favorites.has(a.id)).map((a:any)=>String(a.artist||a.name||'')));
 const people=await roomPeople(room,rave.sourceEventId,user);
 const snapshot=JSON.stringify({updatedAt:entry.updatedAt,entry:entry.rave,details,lineup,people,wishlist,myMemory:(room.diaryMemories||[]).find((m:any)=>m.memberId===self.id)||null});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot));
 const revision=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return {entry,rave,room,self,details,lineup,wishlist,people,revision};
}
export const connection=query({args:{id:v.string()},handler:async(ctx,{id})=>{
 const user=await requireUser(ctx),state=await connectionState(ctx,user,id),memories=await visibleMemories(state.room);
 return {details:state.details,people:state.people,lineup:state.lineup,wishlist:state.wishlist,revision:state.revision,canUpdatePlan:['admin','leader'].includes(state.self.role),sharedMemories:memories,myMemory:memories.find((m:any)=>m.memberId===state.self.id)||null};
}});
export const syncPlan=mutation({args:{id:v.string(),direction:v.union(v.literal('toDiary'),v.literal('toPlan')),fields:v.array(v.string()),revision:v.string()},handler:async(ctx,{id,direction,fields,revision})=>{
 const user=await requireUser(ctx),state=await connectionState(ctx,user,id);
 if(revision!==state.revision)throw new ConvexError('The plan or diary changed. Refresh the preview and review it again.');
 const allowed=direction==='toDiary'?['details','wishlist','crew']:['details','catalog','wishlist'];
 if(!fields.length||fields.some(f=>!allowed.includes(f))||new Set(fields).size!==fields.length)throw new ConvexError('Choose which updates to apply.');
 const {rave,room,self}=state;
 if(direction==='toDiary'){
   let next={...rave};
   if(fields.includes('details')){
     if(rave.attendance==='attended'&&state.details.startDate>diaryToday())throw new ConvexError('This plan is now in the future. Change your diary entry to planned before applying these dates.');
     const d=state.details;next={...next,name:d.name,startDate:d.startDate,endDate:d.endDate,city:d.city,venue:d.venue,kind:d.kind,catalogEventId:d.catalogEventId};
   }
   if(fields.includes('wishlist')||fields.includes('crew')){
     if(rave.attendance!=='planned')throw new ConvexError('Wishlist and planned crew updates apply only to upcoming or unconfirmed diary plans. Select actual sets and crew yourself after attending.');
     if(fields.includes('wishlist'))next.plannedArtists=uniqueNames([...(rave.plannedArtists||[]),...state.wishlist]);
     if(fields.includes('crew')){
       next.plannedCrew=uniqueNames([...(rave.plannedCrew||[]),...state.people.map(p=>p.name)]);
       next.plannedCrewConnections=[...new Map([...(rave.plannedCrewConnections||[]),...state.people].map(p=>[p.id,p])).values()];
     }
   }
   return saveOne(ctx,user,validateRave(next));
 }
 if((fields.includes('details')||fields.includes('catalog'))&&!['admin','leader'].includes(self.role))throw new ConvexError('Only a Rally project admin can update shared event details or its catalog lineup.');
 const ownEdition=festivalForRave(rave),planEdition=festivalForRave(state.details);
 if(ownEdition&&planEdition&&ownEdition.id!==planEdition.id)throw new ConvexError('The diary and plan describe different event editions. Review event details or connect the matching plan first.');
 if(fields.includes('catalog')&&!fields.includes('details')&&ownEdition&&(state.details.kind!==(ownEdition.kind||'Festival')||state.details.startDate<ownEdition.startDate||state.details.endDate>ownEdition.endDate))throw new ConvexError('The catalog lineup has different dates from this plan. Review event details before adding it.');
 const next={...room,members:room.members.map((m:any)=>m.id===self.id?{...m,clerkSubject:user.subject}:m),lineup:[...(room.lineup||[])],lineupFavorites:{...(room.lineupFavorites||{})}};
 if(fields.includes('details')){
   next.name=rave.name;next.startsAt=rave.startDate;next.endsAt=rave.endDate;next.location=rave.city;next.venue=rave.venue;next.raveKind=rave.kind;next.templateId=rave.kind==='Festival'?'festival-weekend':'local-show';
   const edition=festivalForRave(rave);if(edition)next.catalogEventId=edition.id;else if(rave.catalogEventId===null)next.catalogEventId=null;else delete next.catalogEventId;
 }
 if(fields.includes('catalog')&&ownEdition)next.catalogEventId=ownEdition.id;
 const labels=fields.includes('catalog')?[...(festivalForRave(rave)?.artists||[])]:[];
 if(fields.includes('wishlist'))labels.push(...(rave.plannedArtists||[]));
 const addedIds:string[]=[];
 for(const label of uniqueNames(labels)){
   let set=next.lineup.find((a:any)=>String(a.artist||a.name||'').toLowerCase()===label.toLowerCase());
   if(!set){set={id:'diary-set-'+crypto.randomUUID(),name:label,artist:label,stage:'',date:'',start:'',end:''};next.lineup.push(set);}
   if((rave.plannedArtists||[]).some(n=>n.toLowerCase()===label.toLowerCase()))addedIds.push(set.id);
 }
 if(fields.includes('wishlist'))next.lineupFavorites[self.id]=uniqueNames([...(room.lineupFavorites?.[self.id]||[]),...addedIds]);
 const doc=await ctx.db.query('warRoomState').withIndex('by_board',q=>q.eq('boardId','rally:'+rave.sourceEventId)).unique();
 await ctx.db.patch(doc!._id,{buckets:next,updatedAt:Date.now()});
 return rave;
}});
export const shareMemory=mutation({args:{id:v.string(),note:v.string(),albumUrl:v.string(),revision:v.string()},handler:async(ctx,{id,note,albumUrl,revision})=>{
 const user=await requireUser(ctx),state=await connectionState(ctx,user,id);
 if(revision!==state.revision)throw new ConvexError('The plan or diary changed. Refresh the preview before sharing.');
 if(note.length>2000||albumUrl.length>2000)throw new ConvexError('Keep a shared memory under 2,000 characters.');
 if(albumUrl){try{if(!['https:','http:'].includes(new URL(albumUrl).protocol))throw new Error();}catch{throw new ConvexError('Use a full https:// or http:// album link.');}}
 const memories=(Array.isArray(state.room.diaryMemories)?state.room.diaryMemories:[]).filter((m:any)=>m.memberId!==state.self.id);
 if(note.trim()||albumUrl.trim())memories.push({memberId:state.self.id,authorId:await accountPersonId(user.subject),name:state.self.name,note:note.trim(),albumUrl:albumUrl.trim(),updatedAt:Date.now()});
 const doc=await ctx.db.query('warRoomState').withIndex('by_board',q=>q.eq('boardId','rally:'+state.rave.sourceEventId)).unique();
 await ctx.db.patch(doc!._id,{buckets:{...state.room,members:state.room.members.map((m:any)=>m.id===state.self.id?{...m,clerkSubject:user.subject}:m),diaryMemories:memories},updatedAt:Date.now()});
 return {ok:true};
}});
