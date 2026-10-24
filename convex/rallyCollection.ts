import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server';
import {v,ConvexError} from 'convex/values';
import {emptyRave,uniqueNames,validateRave,type Rave} from '../tools/rally/collection-src/lib/raves';
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
export const list=query({args:{},handler:async ctx=>{
  const user=await requireUser(ctx);
  const rows=await ctx.db.query('rallyCollections').withIndex('by_owner',q=>q.eq('ownerToken',user.ownerToken)).collect();
  return {raves:rows.map(row=>row.rave).sort((a,b)=>b.startDate.localeCompare(a.startDate)),viewer:{name:user.name,subject:user.subject}};
}});
export const draftFromEvent=query({args:{eventId:v.string()},handler:async(ctx,{eventId})=>{
  const user=await requireUser(ctx),room=await accessibleRoom(ctx,user,eventId);
  const existing=await ctx.db.query('rallyCollections').withIndex('by_owner_event',q=>q.eq('ownerToken',user.ownerToken).eq('sourceEventId',eventId)).unique();
  // Planning interests and shared purchases are suggestions, never proof of attendance or personal spend.
  const self=memberFor(room,user);
  const crewSuggestions=uniqueNames((room.members||[]).filter((m:any)=>m.id!==self?.id).map((m:any)=>String(m.name||'')));
  const artistSuggestions=uniqueNames((room.lineup||[]).map((a:any)=>String(a.artist||a.name||'')));
  const kind=room.templateId==='local-show'?'Show':'Festival';
  const rave={...emptyRave(),sourceEventId:eventId,name:room.name||'',startDate:room.startsAt||'',endDate:room.endsAt||'',city:room.location||'',venue:room.venue||'',kind};
  return {rave:existing?.rave||rave,existing:!!existing,crewSuggestions,artistSuggestions,eventName:room.name};
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
  const user=await requireUser(ctx),clean=validateRave(rave);
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
