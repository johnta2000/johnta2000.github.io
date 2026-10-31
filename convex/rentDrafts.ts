import {query,mutation} from './_generated/server';
import {v} from 'convex/values';
import {authorize} from './rent';
export const get = query({args:{},handler:async ctx=>{
  const owner=await authorize(ctx);return await ctx.db.query('rentWorkspaceDrafts').withIndex('by_owner',q=>q.eq('owner',owner)).unique();
}});
export const save = mutation({args:{value:v.string(),expectedVersion:v.number(),requestKey:v.string()},handler:async(ctx,a)=>{
  const owner=await authorize(ctx);
  if(a.value.length>200000||!a.requestKey||a.requestKey.length>100||!Number.isSafeInteger(a.expectedVersion)||a.expectedVersion<0)throw Error('Invalid draft.');
  const parsed=JSON.parse(a.value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid draft.');
  const existing=await ctx.db.query('rentWorkspaceDrafts').withIndex('by_owner',q=>q.eq('owner',owner)).unique();
  if(existing?.requestKey===a.requestKey){if(existing.value!==a.value)throw Error('Draft retry changed.');return existing.version;}
  if((existing?.version||0)!==a.expectedVersion)throw Error('Your draft changed in another tab or device. This copy is preserved on this device; reload to compare before saving.');
  const version=a.expectedVersion+1,fields={owner,value:a.value,version,requestKey:a.requestKey,updatedAt:Date.now()};
  if(existing)await ctx.db.patch(existing._id,fields);else await ctx.db.insert('rentWorkspaceDrafts',fields);return version;
}});
