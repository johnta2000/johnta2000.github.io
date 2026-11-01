import { query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
export async function requireOwner(ctx:any) {
  const u=await ctx.auth.getUserIdentity();
  if(!u?.subject || u.issuer!=='https://clerk.john-ta.com' || u.email?.trim().toLowerCase()!=='johnta2018@gmail.com' || (u.emailVerified!==undefined && u.emailVerified!==true)) throw Error('Not authorized for bank history.');
  return 'johnta2018@gmail.com';
}
async function owned(ctx:any,id:any){const owner=await requireOwner(ctx),row=await ctx.db.get(id);if(!row||row.owner!==owner)throw Error('Record unavailable.');return row;}
export const accounts=query({args:{},handler:async ctx=>{const owner=await requireOwner(ctx);return ctx.db.query('bankArchiveAccounts').withIndex('by_owner',q=>q.eq('owner',owner)).collect();}});
export const account=query({args:{id:v.id('bankArchiveAccounts')},handler:async(ctx,{id})=>{
  const account=await owned(ctx,id);
  const transactions=await ctx.db.query('bankArchiveTransactions').withIndex('by_account',q=>q.eq('accountId',id)).collect();
  const statements=await ctx.db.query('bankArchiveStatements').withIndex('by_account',q=>q.eq('accountId',id)).collect();
  return {account,transactions:transactions.filter(r=>r.owner===account.owner),statements:statements.filter(r=>r.owner===account.owner).map(({storageId,...r})=>({...r,hasPdf:!!storageId}))};
}});
export const file=query({args:{id:v.id('bankArchiveStatements')},handler:async(ctx,{id})=>{const s=await owned(ctx,id);await owned(ctx,s.accountId);if(!s.storageId)throw Error('PDF unavailable.');return {storageId:s.storageId,name:'Statement '+s.data.closing_date+'.pdf'};}});
// Imports are administrator-only. No public browser mutation can overwrite bank records.
export const importAccount=internalMutation({args:{data:v.any()},handler:async(ctx,{data})=>{
  if(!data.id||!data.name||!Number.isSafeInteger(data.current_balance_cents))throw Error('Invalid account import.');
  const owner='johnta2018@gmail.com';const old=await ctx.db.query('bankArchiveAccounts').withIndex('by_key',q=>q.eq('owner',owner).eq('key',data.id)).unique();
  if(old){await ctx.db.patch(old._id,{data,importedAt:Date.now()});return old._id;}
  return ctx.db.insert('bankArchiveAccounts',{owner,key:data.id,data,importedAt:Date.now()});
}});
export const importRows=internalMutation({args:{accountId:v.id('bankArchiveAccounts'),kind:v.union(v.literal('transactions'),v.literal('statements')),rows:v.array(v.any())},handler:async(ctx,{accountId,kind,rows})=>{
  const a=await ctx.db.get(accountId);if(!a||a.owner!=='johnta2018@gmail.com'||rows.length>100)throw Error('Invalid import.');
  const table=kind==='transactions'?'bankArchiveTransactions':'bankArchiveStatements';let added=0;
  for(const data of rows){if(!data.id||data.account_id!==a.key)throw Error('Wrong account.');if(kind==='transactions'&&(!Number.isSafeInteger(data.amount_cents)||!/^\d{4}-\d{2}-\d{2}$/.test(data.posted_date)))throw Error('Invalid transaction.');
    const old=await ctx.db.query(table).withIndex('by_key',q=>q.eq('accountId',accountId).eq('key',data.id)).unique();
    if(old){if(JSON.stringify(old.data)!==JSON.stringify(data))throw Error('Existing source differs; reconcile before replacing.');continue;}
    await ctx.db.insert(table,{owner:a.owner,accountId,key:data.id,data});added++;
  }return {added};
}});
export const attachPdf=internalMutation({args:{id:v.id('bankArchiveStatements'),storageId:v.id('_storage')},handler:async(ctx,{id,storageId})=>{const row=await ctx.db.get(id);if(!row||row.owner!=='johnta2018@gmail.com'||row.storageId)throw Error('Statement unavailable or already attached.');await ctx.db.patch(id,{storageId});}});
export const uploadUrl=internalMutation({args:{},handler:async ctx=>ctx.storage.generateUploadUrl()});
