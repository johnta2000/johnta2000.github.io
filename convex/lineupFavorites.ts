import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const EVENT_ID = "lost-lands-2026";

async function requireIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) throw new Error("Sign in to sync your lineup favorites.");
  return identity;
}

export const getMine = query({
  args: { eventId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const eventId = args.eventId || EVENT_ID;
    const row = await ctx.db
      .query("lineupFavorites")
      .withIndex("by_user_event", (q: any) =>
        q.eq("clerkSubject", identity.subject).eq("eventId", eventId),
      )
      .unique();

    return {
      artistIds: row?.artistIds || [],
      name: identity.name || identity.nickname || identity.email || "Account",
    };
  },
});

export const saveMine = mutation({
  args: {
    eventId: v.optional(v.string()),
    artistIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const eventId = args.eventId || EVENT_ID;
    const artistIds = [...new Set(args.artistIds)].slice(0, 1000);
    const existing = await ctx.db
      .query("lineupFavorites")
      .withIndex("by_user_event", (q: any) =>
        q.eq("clerkSubject", identity.subject).eq("eventId", eventId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { artistIds, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("lineupFavorites", {
        eventId,
        clerkSubject: identity.subject,
        artistIds,
        updatedAt: Date.now(),
      });
    }

    return { artistIds };
  },
});
