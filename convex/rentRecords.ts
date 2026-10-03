import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { authorize } from './rent';
import { billFields, evidenceEntry } from './rentRecordTables';
function date(s: string) { if (!/^20\d{2}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0,10)!==s) throw Error('Enter valid dates.'); }
function amount(n: number) { if (!Number.isSafeInteger(n)||Math.abs(n)>100000000) throw Error('Enter a valid amount.'); }
export const overview = query({ args: {}, handler: async ctx => {
  await authorize(ctx); const files = await ctx.db.query('rentFiles').collect();
  return { bills: await ctx.db.query('rentBills').collect(), files: files.map(({storageId, ...f})=>f) };
} });
export const file = query({ args: {id:v.id('rentFiles')}, handler: async(ctx,{id})=>{ await authorize(ctx); const f=await ctx.db.get(id);if(!f)throw Error('File not found.');return f; } });
export const destination = query({ args:{paymentId:v.optional(v.id('rentPayments')),billId:v.optional(v.id('rentBills'))},handler:async(ctx,args)=>{
  await authorize(ctx); if(args.paymentId && args.billId)throw Error('Choose one destination.');
  if(args.paymentId){const p=await ctx.db.get(args.paymentId);if(!p||p.voidedAt)throw Error('Payment not available.');}
  if(args.billId&&!await ctx.db.get(args.billId))throw Error('Bill not found.');
  return true;
} });
export const attach = internalMutation({args:{storageId:v.id('_storage'),name:v.string(),type:v.string(),size:v.number(),requestKey:v.string(),author:v.string(),paymentId:v.optional(v.id('rentPayments')),billId:v.optional(v.id('rentBills'))},handler:async(ctx,a)=>{
  const existing=await ctx.db.query('rentFiles').withIndex('by_request',q=>q.eq('requestKey',a.requestKey)).unique();
  if(existing){await ctx.storage.delete(a.storageId);return existing._id;}
  if(a.paymentId){const p=await ctx.db.get(a.paymentId);if(!p||p.voidedAt)throw Error('Payment not available.');}
  if(a.billId&&!await ctx.db.get(a.billId))throw Error('Bill not found.');
  const {author,paymentId,...rest}=a;
  return ctx.db.insert('rentFiles',{...rest,paymentIds:paymentId?[paymentId]:[],createdAt:Date.now(),createdBy:author});
} });
export const linkFile = mutation({args:{id:v.id('rentFiles'),paymentId:v.id('rentPayments')},handler:async(ctx,{id,paymentId})=>{
  await authorize(ctx);const f=await ctx.db.get(id),p=await ctx.db.get(paymentId);if(!f||f.billId)throw Error('Payment proof not found.');if(!p||p.voidedAt)throw Error('Payment not available.');
  if(!f.paymentIds.includes(paymentId))await ctx.db.patch(id,{paymentIds:[...f.paymentIds,paymentId]});
} });
export const setConfirmation = mutation({args:{id:v.id('rentPayments'),checked:v.boolean()},handler:async(ctx,{id,checked})=>{
  const email=await authorize(ctx), p=await ctx.db.get(id);if(!p||p.voidedAt)throw Error('Payment not available.');
  await ctx.db.patch(id,{checked,checkedAt:Date.now(),checkedBy:email});
} });
export const saveBill = mutation({args:{...billFields,requestKey:v.string()},handler:async(ctx,a)=>{
  const email=await authorize(ctx);[a.statementDate,a.periodStart,a.periodEnd,a.dueDate].forEach(date);
  [a.chargesCents,a.previousCents,a.paymentsCents,a.totalCents].forEach(amount);
  if(a.periodStart>a.periodEnd||a.dueDate<a.statementDate||a.paymentsCents<0)throw Error('Check the bill dates and payment amount.');
  if(a.previousCents-a.paymentsCents+a.chargesCents!==a.totalCents)throw Error('Previous balance minus payments plus new charges must equal the statement total. Include credits in the previous balance or new charges.');
  if(!a.requestKey||a.requestKey.length>100||a.note.length>4000)throw Error('Invalid bill details.');
  const retry=await ctx.db.query('rentBills').withIndex('by_request',q=>q.eq('requestKey',a.requestKey)).unique();if(retry)return retry._id;
  const duplicate=await ctx.db.query('rentBills').withIndex('by_statement',q=>q.eq('statementDate',a.statementDate)).unique();
  if(duplicate)throw Error('A statement with this date is already logged. Attach the PDF to the existing bill.');
  return ctx.db.insert('rentBills',{...a,month:a.statementDate.slice(0,7),createdAt:Date.now(),createdBy:email});
} });
// Statement edits keep their document links and reject stale concurrent changes.
export const saveBillGrid = mutation({args:{rows:v.array(v.object({...billFields,id:v.optional(v.id('rentBills')),month:v.string(),expectedVersion:v.number()})),requestKey:v.string()},handler:async(ctx,{rows,requestKey})=>{
  const email=await authorize(ctx);
  if(!requestKey||requestKey.length>100||!rows.length||rows.length>24)throw Error('Save between 1 and 24 statements at once.');
  if(new Set(rows.map(r=>r.statementDate)).size!==rows.length||new Set(rows.filter(r=>r.id).map(r=>r.id)).size!==rows.filter(r=>r.id).length)throw Error('Each statement must appear only once.');
  const prepared=[];
  for(const row of rows){
    [row.statementDate,row.periodStart,row.periodEnd,row.dueDate].forEach(date);[row.chargesCents,row.previousCents,row.paymentsCents,row.totalCents].forEach(amount);
    if(row.month!==row.statementDate.slice(0,7))throw Error('Statement date must stay within its ledger month.');
    if(row.periodStart>row.periodEnd||row.dueDate<row.statementDate||row.paymentsCents<0)throw Error('Check the bill dates and payment amount.');
    if(row.previousCents-row.paymentsCents+row.chargesCents!==row.totalCents||row.note.length>4000)throw Error('Check the statement amounts.');
    const byDate=await ctx.db.query('rentBills').withIndex('by_statement',q=>q.eq('statementDate',row.statementDate)).unique();
    const existing=row.id?await ctx.db.get(row.id):byDate;
    if(existing?.lastEditKey===requestKey)continue;
    if(row.id&&!existing||existing&&(existing._id!==row.id||(existing.version||0)!==row.expectedVersion)||!existing&&row.expectedVersion!==0)throw Error('This statement changed on another device. Copy your edits, then discard and reload before trying again.');
    if(byDate&&byDate._id!==row.id)throw Error('A statement with this date is already logged.');
    prepared.push({row,existing});
  }
  for(const {row,existing} of prepared){const {id,expectedVersion,...fields}=row;const value={...fields,version:expectedVersion+1,lastEditKey:requestKey,updatedAt:Date.now(),updatedBy:email};
    if(existing)await ctx.db.patch(existing._id,value);else await ctx.db.insert('rentBills',{...value,requestKey:requestKey+':'+row.statementDate,createdAt:Date.now(),createdBy:email});
  }
  return {saved:prepared.length};
} });
// One-time extraction of user-supplied bank screenshots. Entries are evidence, never new receipts.
export const importEvidence = internalMutation({args:{id:v.id('rentFiles'),entries:v.array(evidenceEntry)},handler:async(ctx,{id,entries})=>{
  const f=await ctx.db.get(id);if(!f)throw Error('File not found.');if(f.entries)return {linked:f.paymentIds.length};
  const all=await ctx.db.query('rentPayments').collect(), paymentIds:typeof f.paymentIds=[];
  const result=[];
  for(const e of entries){date(e.date);amount(e.amountCents);if(!Number.isInteger(e.payer)||e.payer<0||e.payer>3)throw Error('Invalid payer.');
    const candidates=e.month?all.filter(p=>p.month===e.month&&p.payer===e.payer&&p.amountCents===e.amountCents&&!p.voidedAt):[];
    const p=candidates.length===1&&!paymentIds.includes(candidates[0]._id)?candidates[0]:null;
    if(p){paymentIds.push(p._id);await ctx.db.patch(p._id,{checked:true,checkedAt:Date.now(),checkedBy:'Screenshot reconciliation authorized by John'});}
    result.push({...e,...(p?{paymentId:p._id,review:'Matched to recorded rent by month, payer, and amount.'}:{review:e.review||'No exact rent entry matched. Review before recording or changing totals.'})});
  }
  await ctx.db.patch(id,{entries:result,paymentIds});return {linked:paymentIds.length,review:result.length-paymentIds.length};
} });
