import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const EVENT_ID = "lost-lands-2026";

async function requireIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) throw new Error("Sign in to sync your lineup favorites.");
  return identity;
}

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function rallyPreferenceTarget(ctx: any, identity: any, eventId: string) {
  const doc = await ctx.db
    .query("warRoomState")
    .withIndex("by_board", (q: any) => q.eq("boardId", `rally:${eventId}`))
    .unique();
  const state = doc?.buckets;
  if (!doc || !state || !Array.isArray(state.members)) return null;
  const email = normalizedEmail(identity.email);
  const member = state.members.find((person: any) =>
    person.clerkSubject === identity.subject ||
    (email && normalizedEmail(person.email) === email),
  );
  return member ? { doc, state, member } : null;
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
    const rallyTarget = row ? null : await rallyPreferenceTarget(ctx, identity, eventId);
    const rallyArtistIds = rallyTarget?.state?.lineupFavorites?.[rallyTarget.member.id];

    return {
      artistIds: row?.artistIds || (Array.isArray(rallyArtistIds) ? rallyArtistIds : []),
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

    const rallyTarget = await rallyPreferenceTarget(ctx, identity, eventId);
    if (rallyTarget) {
      const state = structuredClone(rallyTarget.state);
      state.lineupFavorites ||= {};
      state.lineupFavorites[rallyTarget.member.id] = artistIds;
      await ctx.db.patch(rallyTarget.doc._id, { buckets: state, updatedAt: Date.now() });
    }

    return { artistIds };
  },
});
