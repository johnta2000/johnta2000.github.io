import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server';
import {v,ConvexError} from 'convex/values';
import {festivalForRave} from '../tools/rally/collection-src/lib/festivals';
import {emptyRave,uniqueNames,validateRave,diaryToday,type Rave} from '../tools/rally/collection-src/lib/raves';
async function requireUser(ctx:Pick<QueryCtx|MutationCtx,'auth'>){
  const user=await ctx.auth.getUserIdentity();
  const verified=user?.emailVerified===true || (user?.emailVerified===undefined && user?.issuer==='https://clerk.john-ta.com');
  if(!user?.subject||!user.email||!verified)throw new ConvexError('Sign in with your verified Rally account to open your collection.');
  return {ownerToken:user.tokenIdentifier,subject:user.subject,email:user.email.trim().toLowerCase(),name:user.name||user.email.split('@')[0]};
}
function memberFor(room:any,user:{subject:string;email:string}){
  return (room?.members||[]).find((m:any)=>m.clerkSubject===user.subject || (m.email&&m.email.trim().toLowerCase()===user.email));
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
  const kind=room.templateId==='local-show'?'Show':'Festival';
  const rave={...emptyRave(),attendance:(room.startsAt>diaryToday()?'planned':'attended') as Rave['attendance'],sourceEventId:eventId,name:room.name||'',startDate:room.startsAt||'',endDate:room.endsAt||'',city:room.location||'',venue:room.venue||'',kind};
  return {rave:existing?storedRave(existing):rave,existing:!!existing,crewSuggestions,artistSuggestions,eventName:room.name};
}});
async function saveOne(ctx:MutationCtx,user:Awaited<ReturnType<typeof requireUser>>,rave:Rave){
  const existing=await ownEntry(ctx,user.ownerToken,rave.id);
  if(rave.sourceEventId){
    if(existing?.sourceEventId!==rave.sourceEventId)await accessibleRoom(ctx,user,rave.sourceEventId);
    const linked=await ctx.db.query('rallyCollections').withIndex('by_owner_event',q=>q.eq('ownerToken',user.ownerToken).eq('sourceEventId',rave.sourceEventId)).unique();
    if(linked && linked.entryId!==rave.id)throw new ConvexError('This Rally event is already in your collection. Open its existing entry to edit it.');
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
  const clean=validateRave({...rave,...(prior&&rave.attendance===undefined?{attendance:prior.attendance}:{}),...(prior&&rave.plannedArtists===undefined?{plannedArtists:prior.plannedArtists}:{}),...(prior&&rave.plannedCrew===undefined?{plannedCrew:prior.plannedCrew}:{})});
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
    eventTimeZone:timeZone,eventVisibility:'auto',projectTheme:'warm',templateId:rave.kind==='Festival'?'festival-weekend':'local-show',createdFromTemplate:'blank',
    members:[{id:memberId,name:user.name,email:user.email,clerkSubject:user.subject,origin:'TBD',initials:user.name.slice(0,2).toUpperCase(),color:'purple',role:'admin',status:'confirmed'}],
    rooms:[],travel:[],cars:[],tasks:[],passes:[],notes:[],meetups:[],lineupFavorites:{},
    lineup:(edition?.artists||[]).map((name,index)=>({id:eventId+'-set-'+index,name,artist:name,stage:'',date:'',start:'',end:''}))};
  await ctx.db.insert('warRoomState',{boardId:'rally:'+eventId,completed:{},linearLinks:{},docLinks:{},buckets:room,updatedAt:Date.now()});
  return saveOne(ctx,user,{...rave,sourceEventId:eventId});
}});
