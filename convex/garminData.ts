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
  return {configured:configured(),connected:!!connection,lastSyncedAt:connection?.lastSyncedAt,lastSyncCount:connection?.lastSyncCount,complete:connection?.lastSyncComplete??true,warnings:connection?.lastWarnings??[],activityReady:connection?.activitySyncVersion===1,syncDays:connection?.lastSyncDays??7};
}});
export const connection = internalQuery({args:{ownerSubject:v.string()},handler:(ctx,args)=>ctx.db.query("garminConnections").withIndex("by_owner",q=>q.eq("ownerSubject",args.ownerSubject)).unique()});
export const save = internalMutation({args:{ownerSubject:v.string(),expectedRevision:v.union(v.string(),v.null()),revision:v.string(),encryptedKey:v.string(),nights:v.array(v.object(garminNightFields)),coverage:v.optional(v.object({sleep:v.array(v.string()),hrv:v.array(v.string()),restingHeartRate:v.array(v.string()),workouts:v.optional(v.array(v.string()))})),activitySyncVersion:v.optional(v.number()),warnings:v.optional(v.array(v.string())),complete:v.optional(v.boolean()),days:v.optional(v.number())},handler:async(ctx,args)=>{
  const existing = await ctx.db.query("garminConnections").withIndex("by_owner",q=>q.eq("ownerSubject",args.ownerSubject)).unique();
  if ((existing?.revision ?? null) !== args.expectedRevision) throw new Error("Garmin connection changed during sync. Try again.");
  const now=Date.now();
  const incoming=new Map(args.nights.map(n=>[n.sleepDate,n]));
  const coverage=args.coverage;
  const dates=new Set([...incoming.keys(),...(coverage?[...coverage.sleep,...coverage.hrv,...coverage.restingHeartRate,...(coverage.workouts??[])]:[])]);
  const sleepFields=["score","durationMinutes","lightMinutes","deepMinutes","remMinutes","asleepAt","wokeAt"];
  for(const date of dates) {
    const old = await ctx.db.query("garminNights").withIndex("by_owner_date",q=>q.eq("ownerSubject",args.ownerSubject).eq("sleepDate",date)).unique();
    const night=incoming.get(date);
    // Only a successful stream can replace its fields. Failed requests never erase older measurements.
    const value:any=coverage&&old?Object.fromEntries(Object.entries(old).filter(([key])=>!key.startsWith("_"))):{};
    if(coverage){
      if(coverage.sleep.includes(date))for(const field of sleepFields)delete value[field];
      if(coverage.hrv.includes(date))delete value.hrv;
      if(coverage.restingHeartRate.includes(date))delete value.restingHeartRate;
      if(coverage.workouts?.includes(date)){delete value.workoutMinutes;delete value.workoutCount;}
    }
    Object.assign(value,{sleepDate:date,source:"garmin",scoreKind:"native",...night,ownerSubject:args.ownerSubject,updatedAt:now});
    if(old)await ctx.db.replace(old._id,value);
    else if(night)await ctx.db.insert("garminNights",value);
  }
  const value={ownerSubject:args.ownerSubject,encryptedKey:args.encryptedKey,revision:args.revision,lastSyncedAt:now,lastSyncCount:args.nights.length,lastSyncDays:args.days??7,lastSyncComplete:args.complete??true,lastWarnings:args.warnings??[],...(args.activitySyncVersion || existing?.activitySyncVersion ? {activitySyncVersion:args.activitySyncVersion??existing?.activitySyncVersion} : {})};
  if(existing)await ctx.db.replace(existing._id,value);else await ctx.db.insert("garminConnections",value);
  return {synced:args.nights.length,warnings:args.warnings??[],complete:args.complete??true};
}});
export const disconnect = mutation({args:{},handler:async ctx=>{
  const user=await requireSleepUser(ctx);
  const connection=await ctx.db.query("garminConnections").withIndex("by_owner",q=>q.eq("ownerSubject",user.subject)).unique();
  if(connection)await ctx.db.delete(connection._id);
  // Keep historical readings, as with WHOOP disconnect. Delete the key in Garmin to revoke it there too.
}});
