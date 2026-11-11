import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { revenueNumber, revenueValues } from "./standupRevenueTables";
const TEAM = "johns-website-default";
const amountKeys=["compliance","chase","bofa","bofaMonthly","bilt","nextcard"] as const;
const countKeys=["chaseCount","bofaCount","biltCount","nextcardSubscriptions"] as const;
type Values={ [K in typeof amountKeys[number] | typeof countKeys[number]]: number|null };
function dateCheck(date:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)throw Error("Choose a valid date.");}
function numberCheck(n:number|null,count=false){if(n!==null&&(!Number.isSafeInteger(n)||n<0||n>(count?100000000:1000000000000)))throw Error(count?"Counts must be non-negative whole numbers.":"Amounts must be non-negative currency values.");}
function valuesCheck(values:Values){amountKeys.forEach(key=>numberCheck(values[key]));countKeys.forEach(key=>numberCheck(values[key],true));}
const total=(values:Values)=>amountKeys.reduce((sum,key)=>sum+(values[key]??0),0);
async function authorize(ctx:any,teamId:string){
 if(teamId!==TEAM)throw Error("Unknown standup team.");
 const identity=await ctx.auth.getUserIdentity();
 const allowed=new Set((process.env.STANDUPS_ALLOWED_EMAIL||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean));
 const email=identity?.email?.trim().toLowerCase();
 if(!identity||!email||identity.emailVerified===false||!allowed.has(email))throw Error("Sign in with an approved, verified standup email.");
 return {email,owner:identity.tokenIdentifier||identity.subject||email};
}
const snapshotFor=(ctx:any,teamId:string,date:string)=>ctx.db.query("standupRevenueSnapshots").withIndex("by_date",(q:any)=>q.eq("teamId",teamId).eq("date",date)).unique();
const targetFor=(ctx:any,teamId:string,month:string)=>ctx.db.query("standupRevenueTargets").withIndex("by_month",(q:any)=>q.eq("teamId",teamId).eq("month",month)).unique();
const draftFor=(ctx:any,teamId:string,owner:string,date:string)=>ctx.db.query("standupRevenueDrafts").withIndex("by_owner_date",(q:any)=>q.eq("teamId",teamId).eq("owner",owner).eq("date",date)).unique();
export const load = query({args:{teamId:v.string(),date:v.string()},handler:async(ctx,args)=>{
 const user=await authorize(ctx,args.teamId);dateCheck(args.date);const month=args.date.slice(0,7);
 const [history,target,draft]=await Promise.all([
  ctx.db.query("standupRevenueSnapshots").withIndex("by_month",q=>q.eq("teamId",args.teamId).eq("month",month)).collect(),
  targetFor(ctx,args.teamId,month),draftFor(ctx,args.teamId,user.owner,args.date),
 ]);
 history.sort((a,b)=>a.date.localeCompare(b.date));
 const selected=history.find(row=>row.date===args.date)||null;
 const previous=[...history].reverse().find(row=>row.date<args.date)||null;
 return {selected,previous,history,target,draft};
}});
const draftArgs={teamId:v.string(),date:v.string(),values:revenueValues,targetCents:revenueNumber,baseVersion:revenueNumber,baseTargetVersion:revenueNumber};
export const saveDraft = mutation({args:{...draftArgs,expectedDraftVersion:revenueNumber},handler:async(ctx,args)=>{
 const user=await authorize(ctx,args.teamId);dateCheck(args.date);valuesCheck(args.values);numberCheck(args.targetCents);
 const current=await draftFor(ctx,args.teamId,user.owner,args.date);
 if((current?.version??null)!==args.expectedDraftVersion)throw Error("This draft changed in another tab. Your current inputs are kept; reload the saved draft before retrying.");
 const data={teamId:args.teamId,date:args.date,owner:user.owner,values:args.values,targetCents:args.targetCents,baseVersion:args.baseVersion,baseTargetVersion:args.baseTargetVersion,updatedAt:Date.now(),version:(current?.version??0)+1};
 if(current)await ctx.db.patch(current._id,data);else await ctx.db.insert("standupRevenueDrafts",data);
 return {version:data.version};
}});
export const publish = mutation({args:{...draftArgs,expectedDraftVersion:revenueNumber},handler:async(ctx,args)=>{
 const user=await authorize(ctx,args.teamId);dateCheck(args.date);valuesCheck(args.values);numberCheck(args.targetCents);
 if(amountKeys.every(key=>args.values[key]===null))throw Error("Enter at least one revenue amount. Zero is valid.");
 const month=args.date.slice(0,7);
 const [current,target,draft]=await Promise.all([snapshotFor(ctx,args.teamId,args.date),targetFor(ctx,args.teamId,month),draftFor(ctx,args.teamId,user.owner,args.date)]);
 if((current?.version??null)!==args.baseVersion)throw Error("A teammate updated this snapshot. Your draft is safe. Reload the latest snapshot before saving again.");
 if((target?.version??null)!==args.baseTargetVersion&&args.targetCents!==target?.targetCents)throw Error("The monthly target changed. Reload the latest target before saving again.");
 if((draft?.version??null)!==args.expectedDraftVersion)throw Error("This draft changed in another tab. Reload your saved draft before publishing.");
 const updatedAt=Date.now();const data={teamId:args.teamId,date:args.date,month,values:args.values,totalCents:total(args.values),version:(current?.version??0)+1,updatedAt,updatedBy:user.email};
 const id=current?current._id:await ctx.db.insert("standupRevenueSnapshots",data);if(current)await ctx.db.patch(current._id,data);
 if(!target||target.targetCents!==args.targetCents){const t={teamId:args.teamId,month,targetCents:args.targetCents,version:(target?.version??0)+1,updatedAt};if(target)await ctx.db.patch(target._id,t);else await ctx.db.insert("standupRevenueTargets",t);}
 if(draft)await ctx.db.delete(draft._id);
 return {id,version:data.version,totalCents:data.totalCents};
}});
// Administrative import of a user-supplied snapshot; never exposed to browser clients.
export const importSnapshot = internalMutation({args:{teamId:v.string(),date:v.string(),values:revenueValues,targetCents:revenueNumber},handler:async(ctx,args)=>{
 if(args.teamId!==TEAM)throw Error("Unknown team");dateCheck(args.date);valuesCheck(args.values);numberCheck(args.targetCents);
 if(await snapshotFor(ctx,args.teamId,args.date))throw Error("A snapshot already exists; import will not overwrite it.");
 const month=args.date.slice(0,7),updatedAt=Date.now();
 await ctx.db.insert("standupRevenueSnapshots",{teamId:args.teamId,date:args.date,month,values:args.values,totalCents:total(args.values),version:1,updatedAt,updatedBy:"User-provided revenue import"});
 if(!await targetFor(ctx,args.teamId,month))await ctx.db.insert("standupRevenueTargets",{teamId:args.teamId,month,targetCents:args.targetCents,version:1,updatedAt});
 return {date:args.date,totalCents:total(args.values)};
}});
