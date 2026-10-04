import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

import { dailyWhoopFields } from "./sleepTables";

const importedWhoopNight = v.object({
  sleepDate: v.string(),
  score: v.number(),
  durationMinutes: v.optional(v.number()),
  efficiency: v.optional(v.number()),
  consistency: v.optional(v.number()),
  deepMinutes: v.optional(v.number()),
  remMinutes: v.optional(v.number()),
  asleepAt: v.optional(v.string()),
  wokeAt: v.optional(v.string()),
});

import { requireSleepUser as requireAuthorizedIdentity } from "./sleepAccess";

export const status = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthorizedIdentity(ctx);
    const connection = await ctx.db
      .query("whoopConnections")
      .withIndex("by_subject", (q) => q.eq("clerkSubject", identity.subject))
      .unique();
    return {
      connected: Boolean(connection),
      lastSyncedAt: connection?.lastSyncedAt,
      needsUpgrade: Boolean(connection && ["read:recovery", "read:cycles", "read:workout"].some(scope => !connection.scope.split(/\s+/).includes(scope))),
    };
  },
});

export const createOAuthState = internalMutation({
  args: {
    state: v.string(),
    clerkSubject: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("whoopOAuthStates", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const consumeOAuthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("whoopOAuthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt < Date.now()) return null;
    return { clerkSubject: row.clerkSubject };
  },
});

export const getConnection = internalQuery({
  args: { clerkSubject: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("whoopConnections")
      .withIndex("by_subject", (q) => q.eq("clerkSubject", args.clerkSubject))
      .unique(),
});

export const listConnections = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("whoopConnections").collect()).map((connection) => ({
      clerkSubject: connection.clerkSubject,
    })),
});

export const saveConnection = internalMutation({
  args: {
    clerkSubject: v.string(),
    accessTokenEncrypted: v.string(),
    refreshTokenEncrypted: v.string(),
    expiresAt: v.number(),
    scope: v.string(),
    tokenType: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whoopConnections")
      .withIndex("by_subject", (q) => q.eq("clerkSubject", args.clerkSubject))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return;
    }
    await ctx.db.insert("whoopConnections", {
      ...args,
      connectedAt: now,
      updatedAt: now,
    });
  },
});

export const upsertSleepNights = internalMutation({
  args: {
    clerkSubject: v.string(),
    importBatchId: v.string(),
    nights: v.array(importedWhoopNight),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("whoopConnections")
      .withIndex("by_subject", (q) => q.eq("clerkSubject", args.clerkSubject))
      .unique();
    if (!connection) throw new Error("WHOOP is not connected.");

    let inserted = 0;
    let updated = 0;
    const now = Date.now();
    for (const night of args.nights) {
      const existing = await ctx.db
        .query("sleepNights")
        .withIndex("by_owner_source_date", (q) =>
          q.eq("ownerSubject", args.clerkSubject).eq("source", "whoop").eq("sleepDate", night.sleepDate),
        )
        .unique();
      const payload = {
        ...night,
        ownerSubject: args.clerkSubject,
        source: "whoop" as const,
        scoreKind: "native" as const,
        importBatchId: args.importBatchId,
        importedAt: existing?.importedAt || now,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
        updated += 1;
      } else {
        await ctx.db.insert("sleepNights", payload);
        inserted += 1;
      }
    }
    await ctx.db.patch(connection._id, { lastSyncedAt: now, updatedAt: now });
    return { inserted, updated };
  },
});

export const removeConnection = internalMutation({
  args: { clerkSubject: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("whoopConnections")
      .withIndex("by_subject", (q) => q.eq("clerkSubject", args.clerkSubject))
      .unique();
    if (connection) await ctx.db.delete(connection._id);
  },
});

// Each sync replaces only fields covered by its granted scopes, preserving sleep-only connections.
export const upsertDays = internalMutation({
  args: {clerkSubject: v.string(), fields: v.array(v.string()), days: v.array(v.object({sleepDate: v.string(), ...dailyWhoopFields}))},
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("whoopConnections").withIndex("by_subject", q => q.eq("clerkSubject", args.clerkSubject)).unique();
    if (!connection) throw new Error("WHOOP is not connected.");
    for (const day of args.days) {
      const existing = await ctx.db.query("whoopDays").withIndex("by_owner_date", q => q.eq("ownerSubject", args.clerkSubject).eq("sleepDate", day.sleepDate)).unique();
      const payload: any = {ownerSubject: args.clerkSubject, sleepDate: day.sleepDate, updatedAt: Date.now()};
      for (const field of args.fields) if (field in dailyWhoopFields) payload[field] = (day as any)[field];
      if (existing) await ctx.db.patch(existing._id, payload);
      else await ctx.db.insert("whoopDays", payload);
    }
  }
});
