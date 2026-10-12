// Admin-only import for receipts explicitly supplied and assigned in a chat.
// Images and receipt amounts never enter the public source or ledger projection.
import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { receiptDraft } from './burgeryTables';
import { allocations, personKey, text } from './burgeryLogic';

function emailOwner(email:string){const normalized=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw Error('A valid receipt owner email is required.');return `email:${normalized}`;}
export const uploadUrl=internalMutation({args:{},handler:async ctx=>ctx.storage.generateUploadUrl()});
export const status=internalQuery({args:{email:v.string(),requestKey:v.string()},handler:async(ctx,args)=>{
 const owner=emailOwner(args.email),receipt=await ctx.db.query('burgeryReceipts').withIndex('by_request',q=>q.eq('owner',owner).eq('requestKey',args.requestKey)).unique();
 return receipt?{id:receipt._id,status:receipt.status}:null;
}});
export const confirm=internalMutation({args:{
 email:v.string(),tripId:v.id('burgeryTrips'),entryIds:v.array(v.id('burgeryEntries')),storageId:v.id('_storage'),name:v.string(),type:v.string(),size:v.number(),sha256:v.string(),requestKey:v.string(),draft:receiptDraft,
},handler:async(ctx,args)=>{
 const owner=emailOwner(args.email);
 if(!/^[a-zA-Z0-9_-]{10,100}$/.test(args.requestKey)||!/^[a-f0-9]{64}$/.test(args.sha256))throw Error('Invalid import identifiers.');
 const existing=await ctx.db.query('burgeryReceipts').withIndex('by_request',q=>q.eq('owner',owner).eq('requestKey',args.requestKey)).unique();
 if(existing){if(existing.sha256!==args.sha256||existing.tripId!==args.tripId||existing.status!=='confirmed')throw Error('The receipt import changed.');return {id:existing._id,reused:true};}
 if((await ctx.db.query('burgeryReceipts').withIndex('by_hash',q=>q.eq('sha256',args.sha256)).collect()).some(r=>r.status!=='discarded'))throw Error('This receipt has already been submitted.');
 const trip=await ctx.db.get('burgeryTrips',args.tripId);if(!trip)throw Error('Trip not found.');
 const metadata=await ctx.db.system.get('_storage',args.storageId);
 if(!metadata||metadata.size!==args.size||metadata.contentType!==args.type||args.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(args.type))throw Error('Check the imported receipt file.');
 const rows=allocations(args.draft),stem='import_'+args.sha256.slice(0,32);
 if(rows.length!==args.entryIds.length||new Set(args.entryIds).size!==args.entryIds.length)throw Error('Check the imported entries.');
 const recipes=(items:typeof rows[number]['items'])=>JSON.stringify(items.map(i=>[i.label,i.quantity,i.pattiesEach,i.cheeseEach,i.customizations.map(c=>[c.id,c.amount])]));
 const entries=await Promise.all(args.entryIds.map(id=>ctx.db.get('burgeryEntries',id)));
 for(const row of rows){
  const entry=entries.find(e=>e?.personKey===row.personKey);
  if(!entry||entry.owner!=='seed'||entry.source!=='manual'||entry.receiptId||entry.tripId!==trip._id||entry.requestKey!==`${stem}_${personKey(row.person).replace(/\s+/g,'_')}`||entry.patties!==row.patties||entry.burgers!==row.burgers||entry.cheese!==row.cheese||(!entry.items||recipes(entry.items)!==recipes(row.items)))throw Error('The imported order changed; review it before linking a receipt.');
 }
 const now=Date.now(),id=await ctx.db.insert('burgeryReceipts',{owner,tripId:trip._id,storageId:args.storageId,name:text(args.name,160,'Receipt name'),type:args.type,size:args.size,sha256:args.sha256,requestKey:args.requestKey,status:'confirmed',reviewed:args.draft,attempts:0,createdAt:now,updatedAt:now,confirmedAt:now});
 for(const entry of entries)await ctx.db.patch(entry!._id,{receiptId:id,owner,source:'receipt'});
 return {id,reused:false};
}});
