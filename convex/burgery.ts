import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { anyApi } from "convex/server";
import { v } from "convex/values";
import { receiptDraft, burgerItem } from "./burgeryTables";
import { allocations, personKey, text, validateCounts, validateDraft, validateBurgerItems } from "./burgeryLogic";
import type { BurgerItem } from "./burgeryLogic";
import { starterTrips } from "./burgerySeed";

export async function requireMember(ctx: { auth: QueryCtx["auth"] }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.issuer !== "https://clerk.john-ta.com" || !identity.email || (identity.emailVerified !== true && identity.emailVerified !== undefined)) throw Error("Sign in to add entries or receipts.");
  return identity.subject;
}
async function ownedReceipt(ctx: QueryCtx | MutationCtx, id: any) {
  const owner = await requireMember(ctx), record = await ctx.db.get("burgeryReceipts", id);
  if (!record || record.owner !== owner) throw Error("Receipt not found.");
  return record;
}
function requestKey(value: string) { if (!/^[a-zA-Z0-9_-]{10,100}$/.test(value)) throw Error("Invalid submission identifier."); }

// Explicit projection: no file URLs, receipt text, amounts, or submitter IDs leave the private receipt tables.
export const ledger = query({ args: {}, handler: async ctx => {
  const trips = await ctx.db.query("burgeryTrips").collect();
  const entries = await ctx.db.query("burgeryEntries").collect();
  return trips.map(trip => ({ id: trip._id, key: trip.key, name: trip.name, month: trip.month, location: trip.location,
    entries: entries.filter(e => e.tripId === trip._id).map(e => ({ id: e._id, name: e.person, patties: e.patties, burgers: e.burgers ?? null, cheese: e.cheese ?? null, log: e.log, items:e.items?.map(i=>({label:i.label,quantity:i.quantity,pattiesEach:i.pattiesEach,cheeseEach:i.cheeseEach,customizations:i.customizations.map(c=>({id:c.id,amount:c.amount}))}))??null, receiptBacked: !!e.receiptId })),
  }));
} });
export const mine = query({ args: {}, handler: async ctx => {
  const owner = await requireMember(ctx);
  const records = await ctx.db.query("burgeryReceipts").withIndex("by_owner_created", q => q.eq("owner", owner)).order("desc").take(100);
  return { scannerReady: !!process.env.OPENAI_API_KEY, receipts: records.map(({ storageId, sha256, owner: _owner, ...r }) => r) };
} });
export const receiptFile = query({ args: { id: v.id("burgeryReceipts") }, handler: async (ctx, { id }) => {
  const r = await ownedReceipt(ctx, id);
  return { storageId: r.storageId, type: r.type };
} });
export const createTrip = mutation({ args: { name: v.string(), month: v.string(), location: v.string() }, handler: async (ctx, args) => {
  await requireMember(ctx);
  const name = text(args.name, 100, "Trip name"), location = text(args.location, 120, "Location");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(args.month)) throw Error("Choose a valid trip month.");
  const key = `${personKey(name)}|${args.month}|${personKey(location)}`;
  const trips = await ctx.db.query("burgeryTrips").collect();
  const existing = trips.find(t => personKey(t.name) === personKey(name) && t.month === args.month && personKey(t.location) === personKey(location));
  if (existing) return existing._id;
  if (trips.length >= 500) throw Error("The trip limit has been reached.");
  return await ctx.db.insert("burgeryTrips", { key, name, month: args.month, location, createdAt: Date.now() });
} });
export const addEntry = mutation({ args: { tripId: v.id("burgeryTrips"), person: v.string(), patties: v.number(), burgers: v.optional(v.number()), cheese: v.optional(v.number()), log: v.string(), items:v.optional(v.array(burgerItem)),requestKey: v.string() }, handler: async (ctx, args) => {
  const owner = await requireMember(ctx); requestKey(args.requestKey);
  const existing = await ctx.db.query("burgeryEntries").withIndex("by_request", q => q.eq("owner", owner).eq("requestKey", args.requestKey)).unique();
  if (existing) return existing._id;
  if (!await ctx.db.get(args.tripId)) throw Error("Trip not found.");
  validateCounts(args.patties, args.burgers, args.cheese);
  const person = text(args.person, 80, "Person"), log = text(args.log, 2000, "Order", true);
  const items=args.items===undefined?undefined:validateBurgerItems(args.items,args.patties,args.burgers,args.cheese);
  const recent = await ctx.db.query("burgeryEntries").withIndex("by_owner_created", q => q.eq("owner", owner).gte("createdAt", Date.now() - 86400000)).take(51);
  if (recent.length >= 50) throw Error("Daily entry limit reached. Try again tomorrow.");
  return await ctx.db.insert("burgeryEntries", { ...args, ...(items?{items}:{}),person, personKey: personKey(person), log, owner, source: "manual", createdAt: Date.now() });
} });
export const checkUpload = query({ args: { tripId: v.id("burgeryTrips"), targetEntryId: v.optional(v.id("burgeryEntries")) }, handler: async (ctx, args) => {
  const owner = await requireMember(ctx);
  if (!await ctx.db.get(args.tripId)) throw Error("Trip not found.");
  if (args.targetEntryId) {
    const entry = await ctx.db.get(args.targetEntryId);
    if (!entry || entry.tripId !== args.tripId || (entry.source !== "legacy" && entry.owner !== owner)) throw Error("Choose one of your entries to attach a receipt.");
    if (entry.receiptId) throw Error("This entry already has a confirmed receipt.");
  }
  const recent = await ctx.db.query("burgeryReceipts").withIndex("by_owner_created", q => q.eq("owner", owner).gte("createdAt", Date.now() - 86400000)).take(21);
  if (recent.length >= 20) throw Error("Daily receipt limit reached. Try again tomorrow.");
  return owner;
} });
export const recordUpload = internalMutation({ args: {
  owner: v.string(), tripId: v.id("burgeryTrips"), targetEntryId: v.optional(v.id("burgeryEntries")), storageId: v.id("_storage"), name: v.string(), type: v.string(), size: v.number(), sha256: v.string(), requestKey: v.string(),
}, handler: async (ctx, args) => {
  requestKey(args.requestKey);
  const existing = await ctx.db.query("burgeryReceipts").withIndex("by_request", q => q.eq("owner", args.owner).eq("requestKey", args.requestKey)).unique();
  if (existing) return { id: existing._id, reused: true };
  const duplicates = await ctx.db.query("burgeryReceipts").withIndex("by_hash", q => q.eq("sha256", args.sha256)).collect();
  if (duplicates.some(r => r.status !== "discarded")) throw Error("This receipt has already been submitted. Open the original submission to review it.");
  const recent = await ctx.db.query("burgeryReceipts").withIndex("by_owner_created", q => q.eq("owner", args.owner).gte("createdAt", Date.now() - 86400000)).take(21);
  if (recent.length >= 20) throw Error("Daily receipt limit reached. Try again tomorrow.");
  const now = Date.now();
  const id = await ctx.db.insert("burgeryReceipts", { ...args, status: "queued", attempts: 0, createdAt: now, updatedAt: now });
  await ctx.scheduler.runAfter(0, anyApi.burgeryScanner.scan, { id });
  return { id, reused: false };
} });
export const claimScan = internalMutation({ args: { id: v.id("burgeryReceipts") }, handler: async (ctx, { id }) => {
  const r = await ctx.db.get(id);
  if (!r || r.status !== "queued") return null;
  await ctx.db.patch(id, { status: "scanning", attempts: r.attempts + 1, updatedAt: Date.now(), error: undefined });
  // Recover if a worker dies before writing its result.
  await ctx.scheduler.runAfter(180000, anyApi.burgery.expireScan, { id, attempt: r.attempts + 1 });
  return { ...r, attempts: r.attempts + 1 };
} });
export const expireScan = internalMutation({ args: { id: v.id("burgeryReceipts"), attempt: v.number() }, handler: async (ctx, args) => {
  const r = await ctx.db.get(args.id);
  if (r?.status === "scanning" && r.attempts === args.attempt) await ctx.db.patch(r._id, { status: "failed", error: "The scan timed out. Retry or enter the receipt details manually.", updatedAt: Date.now() });
} });
export const finishScan = internalMutation({ args: { id: v.id("burgeryReceipts"), attempt: v.number(), draft: v.optional(receiptDraft), error: v.optional(v.string()), model: v.optional(v.string()), responseId: v.optional(v.string()) }, handler: async (ctx, args) => {
  const r = await ctx.db.get(args.id);
  if (!r || r.status !== "scanning" || r.attempts !== args.attempt) return;
  if (args.draft) validateDraft(args.draft);
  await ctx.db.patch(r._id, { status: args.draft ? "review" : "failed", scan: args.draft, error: args.error, model: args.model, responseId: args.responseId, updatedAt: Date.now() });
} });
export const retryScan = mutation({ args: { id: v.id("burgeryReceipts") }, handler: async (ctx, { id }) => {
  const r = await ownedReceipt(ctx, id);
  if (!["failed", "review"].includes(r.status)) throw Error("This receipt cannot be rescanned right now.");
  if (r.attempts >= 5) throw Error("Scan retry limit reached. Enter the details manually.");
  if (!process.env.OPENAI_API_KEY) throw Error("Automatic scanning is not configured yet. Enter the details manually.");
  await ctx.db.patch(id, { status: "queued", updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, anyApi.burgeryScanner.scan, { id });
} });
export const saveReceiptDraft = mutation({ args: { id: v.id("burgeryReceipts"), draft: receiptDraft, expectedUpdatedAt: v.number() }, handler: async (ctx, args) => {
  const r = await ownedReceipt(ctx, args.id);
  if (!["review", "failed"].includes(r.status)) throw Error("This receipt cannot be edited right now.");
  if (r.updatedAt !== args.expectedUpdatedAt) throw Error("This receipt changed on another device. Reopen it before saving.");
  validateDraft(args.draft);
  await ctx.db.patch(r._id, { reviewed: args.draft, updatedAt: Date.now() });
} });
export const confirmReceipt = mutation({ args: { id: v.id("burgeryReceipts"), draft: receiptDraft, expectedUpdatedAt: v.number() }, handler: async (ctx, args) => {
  const r = await ownedReceipt(ctx, args.id);
  if (r.status === "confirmed") return { alreadyConfirmed: true }; // Safe retry after an uncertain network response.
  if (!["review", "failed"].includes(r.status)) throw Error("Wait for the scan to finish before confirming.");
  if (r.updatedAt !== args.expectedUpdatedAt) throw Error("This receipt changed on another device. Reopen it before confirming.");
  const entries = allocations(args.draft);
  if (r.targetEntryId) {
    const target = await ctx.db.get(r.targetEntryId);
    if (!target || target.receiptId || (target.source !== "legacy" && target.owner !== r.owner)) throw Error("This entry cannot accept a receipt.");
    if (entries.length !== 1 || entries[0].personKey !== target.personKey || entries[0].patties !== target.patties || (target.burgers !== undefined && entries[0].burgers !== target.burgers)) throw Error("To attach this receipt, its burgers must match this person’s existing entry. Submit a group receipt separately.");
    await ctx.db.patch(target._id, { receiptId: r._id, burgers: entries[0].burgers, cheese: entries[0].cheese,items:entries[0].items });
  } else {
    for (const e of entries) await ctx.db.insert("burgeryEntries", { ...e, tripId: r.tripId, receiptId: r._id, owner: r.owner, requestKey: `receipt_${r._id}_${e.personKey}`, source: "receipt", createdAt: Date.now() });
  }
  await ctx.db.patch(r._id, { status: "confirmed", reviewed: args.draft, confirmedAt: Date.now(), updatedAt: Date.now(), error: undefined });
  return { alreadyConfirmed: false };
} });
export const discardReceipt = mutation({ args: { id: v.id("burgeryReceipts") }, handler: async (ctx, { id }) => {
  const r = await ownedReceipt(ctx, id);
  if (r.status === "confirmed") throw Error("A confirmed receipt cannot be discarded.");
  await ctx.db.patch(id, { status: "discarded", updatedAt: Date.now() });
} });
export const seed = internalMutation({ args: {}, handler: async ctx => {
  for (const t of starterTrips) {
    let trip = await ctx.db.query("burgeryTrips").withIndex("by_key", q => q.eq("key", t.key)).unique();
    if (!trip) { const id = await ctx.db.insert("burgeryTrips", { key: t.key, name: t.name, month: t.month, location: t.location, createdAt: Date.now() }); trip = (await ctx.db.get(id))!; }
    for (const e of t.entries) {
      const key = `seed_${t.key}_${personKey(e.name)}`;
      if (await ctx.db.query("burgeryEntries").withIndex("by_request", q => q.eq("owner", "seed").eq("requestKey", key)).unique()) continue;
      const more = e as typeof e & { burgers?: number; cheese?: number;items?:BurgerItem[] };
      if(more.items)validateBurgerItems(more.items,e.patties,more.burgers,more.cheese);
      await ctx.db.insert("burgeryEntries", { tripId: trip._id, person: e.name, personKey: personKey(e.name), patties: e.patties, burgers: more.burgers, cheese: more.cheese,items:more.items, log: e.log, source: "legacy", owner: "seed", requestKey: key, createdAt: Date.now() });
    }
  }
  return { trips: starterTrips.length };
} });

// Only the four original San Diego imports are amended. Counts and unrelated records stay intact.
export const updateNitehartsDetails = internalMutation({args:{},handler:async ctx=>{
  const trip=await ctx.db.query("burgeryTrips").withIndex("by_key",q=>q.eq("key","niteharts-2026-10")).unique();
  if(!trip)throw Error("Niteharts trip not found.");
  const seedTrip=starterTrips.find(t=>t.key==="niteharts-2026-10")!;
  let updated=0;
  for(const source of seedTrip.entries){
    const entry=await ctx.db.query("burgeryEntries").withIndex("by_request",q=>q.eq("owner","seed").eq("requestKey",`seed_${trip.key}_${personKey(source.name)}`)).unique();
    if(!entry||entry.tripId!==trip._id||entry.source!=="legacy"||entry.receiptId)throw Error("The original Niteharts entry changed; review it before updating.");
    const details=source as typeof source&{burgers:number;cheese:number;items:BurgerItem[]};
    if(entry.patties!==source.patties||entry.burgers!==details.burgers)throw Error("Niteharts counts changed; review them before updating.");
    const items=validateBurgerItems(details.items,entry.patties,entry.burgers,details.cheese);
    if(JSON.stringify(entry.items)!==JSON.stringify(items)||entry.log!==source.log){await ctx.db.patch(entry._id,{items,log:source.log});updated++;}
  }
  return {updated};
}});
