import { requireOwner } from "./monthlyJournalAuth";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

export async function requireUnlocked(ctx: QueryCtx | MutationCtx, token: string) {
  const owner = await requireOwner(ctx);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  const session = await ctx.db.query("monthlyJournalSessions").withIndex("by_token", q => q.eq("tokenHash", hash)).unique();
  if (!session || session.owner !== owner || session.expiresAt <= Date.now()) throw new Error("Journal locked. Unlock again to continue.");
  return session;
}

export const status = query({ args: {}, handler: async ctx => {
  const owner = await requireOwner(ctx);
  return { configured: !!await ctx.db.query("monthlyJournalSecurity").withIndex("by_owner", q => q.eq("owner", "johnta2018@gmail.com")).unique() };
}});

// A committed attempt is recorded before password verification, including failed attempts.
export const beginUnlock = internalMutation({ args: {}, handler: async ctx => {
  const owner = await requireOwner(ctx);
  const config = await ctx.db.query("monthlyJournalSecurity").withIndex("by_owner", q => q.eq("owner", "johnta2018@gmail.com")).unique();
  if (!config) return null;
  const reset = Date.now() - config.windowStart >= 15 * 60 * 1000;
  if (!reset && config.attempts >= 5) throw new Error("Too many attempts. Try again in 15 minutes.");
  await ctx.db.patch(config._id, { attempts: reset ? 1 : config.attempts + 1, windowStart: reset ? Date.now() : config.windowStart });
  return { salt: config.salt, hash: config.hash };
}});

export const finishUnlock = internalMutation({
  args: { tokenHash: v.string(), salt: v.string(), hash: v.string(), setup: v.boolean() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const config = await ctx.db.query("monthlyJournalSecurity").withIndex("by_owner", q => q.eq("owner", "johnta2018@gmail.com")).unique();
    if (args.setup) {
      if (config) throw new Error("Password already configured. Reload and unlock.");
      await ctx.db.insert("monthlyJournalSecurity", { owner: "johnta2018@gmail.com", salt: args.salt, hash: args.hash, attempts: 0, windowStart: Date.now() });
    } else {
      if (!config || config.hash !== args.hash) throw new Error("Password changed. Try again.");
      await ctx.db.patch(config._id, { attempts: 0 });
    }
    const expiresAt = Date.now() + 60 * 60 * 1000;
    await ctx.db.insert("monthlyJournalSessions", { owner, tokenHash: args.tokenHash, expiresAt });
    return expiresAt;
  },
});

const personValidator = v.union(v.literal("vish"), v.literal("jenny"), v.literal("vivek"));

export const read = query({ args: { token: v.string(), month: v.string(), person: v.optional(personValidator) }, handler: async (ctx, args) => {
  await requireUnlocked(ctx, args.token);
  const current = await ctx.db.query("monthlyJournalEntries").withIndex("by_person_month", q => q.eq("person", args.person).eq("month", args.month)).unique();
  const previous = await ctx.db.query("monthlyJournalEntries").withIndex("by_person_month", q => q.eq("person", args.person).lt("month", args.month)).order("desc").first();
  return { current, previous };
}});

export const save = mutation({
  args: { token: v.string(), month: v.string(), person: v.optional(personValidator), answers: v.array(v.string()), notes: v.string(), followups: v.string(), revision: v.number() },
  handler: async (ctx, args) => {
    await requireUnlocked(ctx, args.token);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month) || args.answers.length !== 5) throw new Error("Invalid journal entry.");
    if ([...args.answers, args.notes, args.followups].some(s => s.length > 50000)) throw new Error("Each field must be under 50,000 characters.");
    const existing = await ctx.db.query("monthlyJournalEntries").withIndex("by_person_month", q => q.eq("person", args.person).eq("month", args.month)).unique();
    if ((existing?.revision ?? 0) !== args.revision) throw new Error("This month changed in another tab. Copy your edits before reloading.");
    const { token, ...entry } = args;
    const revision = args.revision + 1;
    const payload = { ...entry, revision, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, payload);
    else await ctx.db.insert("monthlyJournalEntries", payload);
    return revision;
  },
});

export const lock = mutation({ args: { token: v.string() }, handler: async (ctx, args) => {
  const session = await requireUnlocked(ctx, args.token);
  await ctx.db.delete(session._id);
}});

// Existing entries without a person stay unassigned. Moving never replaces another entry.
export const assign = mutation({
  args: { token: v.string(), month: v.string(), person: v.optional(personValidator), target: personValidator, revision: v.number() },
  handler: async (ctx, args) => {
    await requireUnlocked(ctx, args.token);
    if (args.person === args.target) throw new Error("Choose a different person.");
    const entry = await ctx.db.query("monthlyJournalEntries").withIndex("by_person_month", q => q.eq("person", args.person).eq("month", args.month)).unique();
    if (!entry) throw new Error("Write a note before assigning this entry, or choose a person above to start.");
    if (entry.revision !== args.revision) throw new Error("This entry changed. Reload before assigning it.");
    const target = await ctx.db.query("monthlyJournalEntries").withIndex("by_person_month", q => q.eq("person", args.target).eq("month", args.month)).unique();
    if (target) throw new Error("That person already has an entry this month. Your notes have not been moved or overwritten.");
    await ctx.db.patch(entry._id, { person: args.target, revision: entry.revision + 1, updatedAt: Date.now() });
  },
});
