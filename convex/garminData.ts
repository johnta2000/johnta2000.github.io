import {query, mutation, internalQuery, internalMutation} from "./_generated/server";
import {v} from "convex/values";
import {requireSleepUser} from "./sleepAccess";
import {garminNightFields} from "./garminTables";
const configured = () => process.env.GARMIN_PERSONAL_ENABLED === "true" && !!process.env.GARMIN_TOKEN_ENCRYPTION_KEY;
export const authorize = internalQuery({args:{},handler:async ctx => {
  const user = await requireSleepUser(ctx); if (!configured()) throw new Error("Garmin setup is not enabled yet."); return {subject:user.subject};
}});
export const status = query({args:{},handler:async ctx => {
  const user = await requireSleepUser(ctx);
  const connection = await ctx.db.query("garminConnections").withIndex("by_owner",q=>q.eq("ownerSubject",user.subject)).unique();
  return {configured:configured(),connected:!!connection,lastSyncedAt:connection?.lastSyncedAt,lastSyncCount:connection?.lastSyncCount};
}});
export const connection = internalQuery({args:{ownerSubject:v.string()},handler:(ctx,args)=>ctx.db.query("garminConnections").withIndex("by_owner",q=>q.eq("ownerSubject",args.ownerSubject)).unique()});
export const save = internalMutation({args:{ownerSubject:v.string(),expectedRevision:v.union(v.string(),v.null()),revision:v.string(),encryptedKey:v.string(),nights:v.array(v.object(garminNightFields))},handler:async(ctx,args)=>{
  const existing = await ctx.db.query("garminConnections").withIndex("by_owner",q=>q.eq("ownerSubject",args.ownerSubject)).unique();
  if ((existing?.revision ?? null) !== args.expectedRevision) throw new Error("Garmin connection changed during sync. Try again.");
  const now=Date.now();
  for(const night of args.nights) {
    const old = await ctx.db.query("garminNights").withIndex("by_owner_date",q=>q.eq("ownerSubject",args.ownerSubject).eq("sleepDate",night.sleepDate)).unique();
    // Replace this provider/date only; removed/invalid measurements must not remain as stale values.
    const value={...night,ownerSubject:args.ownerSubject,updatedAt:now};
    if(old) await ctx.db.replace(old._id,value); else await ctx.db.insert("garminNights",value);
  }
  const value={ownerSubject:args.ownerSubject,encryptedKey:args.encryptedKey,revision:args.revision,lastSyncedAt:now,lastSyncCount:args.nights.length};
  if(existing)await ctx.db.replace(existing._id,value);else await ctx.db.insert("garminConnections",value);
  return {synced:args.nights.length};
}});
export const disconnect = mutation({args:{},handler:async ctx=>{
  const user=await requireSleepUser(ctx);
  const connection=await ctx.db.query("garminConnections").withIndex("by_owner",q=>q.eq("ownerSubject",user.subject)).unique();
  if(connection)await ctx.db.delete(connection._id);
  // Keep historical readings, as with WHOOP disconnect. Delete the key in Garmin to revoke it there too.
}});
