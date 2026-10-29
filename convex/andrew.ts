import {query,mutation,internalMutation} from "./_generated/server";
import {v} from "convex/values";
const ISSUER="https://clerk.john-ta.com";
async function member(ctx:any){
 const identity=await ctx.auth.getUserIdentity();let members:any[]=[];
 try{members=JSON.parse(process.env.ANDREW_PROJECT_TEAM||"[]");}catch{}
 const email=identity?.email?.trim().toLowerCase();
 const person=Array.isArray(members)&&members.find((m:any)=>m.email?.trim().toLowerCase()===email);
 if(!identity?.subject||identity.issuer!==ISSUER||(identity.emailVerified!==undefined&&identity.emailVerified!==true)||!email||!person)throw Error("This account is not authorized for Andrew Mission Control.");
 return {email,owner:person.role==="owner"};
}
function validate(value:any){
 if(!value||typeof value!=="object"||JSON.stringify(value).length>20000)throw Error("Invalid or oversized record.");
 const str=(s:any,n=5000)=>{if(typeof s!=="string"||s.length>n)throw Error("A field is too long or invalid.");};
 const date=(s:any)=>{str(s,10);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s))throw Error("Use a valid date.");};
 const url=(s:any)=>{str(s,2000);if(s){let u;try{u=new URL(s);}catch{throw Error("Use a full https or http link.");}if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error("Use a full https or http link.");}};
 if(value.type==="task"){
  if(!["scheduled","demand","update"].includes(value.group))throw Error("Invalid task group.");
  str(value.title,300);str(value.notes);str(value.blocker,1000);url(value.url);date(value.due);
  if(!Array.isArray(value.checks)||value.checks.length!==4||value.checks.some((x:any)=>typeof x!=="boolean")||typeof value.accepted!=="boolean"||typeof value.assigned!=="boolean")throw Error("Invalid checklist.");
  if(!value.assigned&&value.checks.some(Boolean))throw Error("Assign this slot before recording progress.");
  if(value.accepted&&!value.checks.every(Boolean))throw Error("Complete the checklist before acceptance.");
 }else if(value.type==="account"){
  if(!["reddit","facebook"].includes(value.platform))throw Error("Invalid platform.");
  str(value.name,150);if(!value.name.trim())throw Error("Add an account name.");url(value.url);str(value.notes);if(typeof value.archived!=="boolean")throw Error("Invalid archive setting.");
 }else if(value.type==="snapshot"){
  str(value.accountKey,100);date(value.date);if(!value.date||value.date>new Date().toISOString().slice(0,10))throw Error("Use a current or past observation date.");
  str(value.health,30);if(!["healthy","attention","restricted","unknown"].includes(value.health))throw Error("Invalid health.");
  str(value.notes);url(value.evidence);for(const key of ["audience","posts","comments","engagement","reach","clicks"]){const n=value[key];if(n!==null&&(!Number.isSafeInteger(n)||n<0||n>100000000000))throw Error("Metrics must be whole numbers, or blank when unknown.");}
 }else if(value.type==="coverage"){
  str(value.notes);date(value.reviewedDate);if(typeof value.complete!=="boolean")throw Error("Invalid coverage state.");
 }else throw Error("Unknown record type.");
}
export const verify=query({args:{},handler:async ctx=>member(ctx)});
export const workspace=query({args:{},handler:async ctx=>{const user=await member(ctx);const records=await ctx.db.query("andrewRecords").take(3001);if(records.length>3000)throw Error("Workspace limit reached.");return {user,records:records.map(({_id,_creationTime,...r})=>r)};}});
export const save=mutation({args:{key:v.string(),value:v.any(),expectedVersion:v.number()},handler:async(ctx,args)=>{
 const user=await member(ctx);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(args.key)||!Number.isSafeInteger(args.expectedVersion)||args.expectedVersion<0)throw Error("Invalid record.");validate(args.value);
 const old=await ctx.db.query("andrewRecords").withIndex("by_key",q=>q.eq("key",args.key)).unique();
 if((old?.version||0)!==args.expectedVersion)throw Error("This record changed since you opened it. Load the latest workspace first.");
 if(old&&old.value.type!==args.value.type)throw Error("Cannot change the record type.");
 if(args.value.type==="task"){
  if(!old)throw Error("Use an existing agreement slot.");
  if(args.value.group!==old.value.group)throw Error("Cannot change the agreement group.");
  if(args.value.accepted!==old.value.accepted&&!user.owner)throw Error("Only the project owner can mark company acceptance.");
 }
 if(args.value.type==="snapshot"){
  const account=await ctx.db.query("andrewRecords").withIndex("by_key",q=>q.eq("key",args.value.accountKey)).unique();
  if(account?.value.type!=="account")throw Error("Choose an existing account.");
 }
 if(!old&&(await ctx.db.query("andrewRecords").take(3000)).length>=3000)throw Error("Workspace limit reached.");
 const updated={value:args.value,version:args.expectedVersion+1,updatedAt:Date.now(),updatedBy:user.email};
 if(old)await ctx.db.patch(old._id,updated);else await ctx.db.insert("andrewRecords",{key:args.key,...updated});return {version:updated.version};
}});
export const seed=internalMutation({args:{records:v.array(v.object({key:v.string(),value:v.any()}))},handler:async(ctx,args)=>{
 if(await ctx.db.query("andrewRecords").first())throw Error("Workspace already initialized.");
 for(const record of args.records)await ctx.db.insert("andrewRecords",{...record,version:1,updatedAt:Date.now(),updatedBy:"Agreement import"});
 return {created:args.records.length};
}});
