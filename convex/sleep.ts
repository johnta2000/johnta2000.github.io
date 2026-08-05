import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const source = v.union(
  v.literal("whoop"),
  v.literal("apple_health"),
  v.literal("eightsleep"),
  v.literal("manual"),
);

const sleepNight = v.object({
  sleepDate: v.string(),
  source,
  score: v.number(),
  scoreKind: v.union(v.literal("native"), v.literal("derived")),
  durationMinutes: v.optional(v.number()),
  efficiency: v.optional(v.number()),
  hrv: v.optional(v.number()),
  restingHeartRate: v.optional(v.number()),
  deepMinutes: v.optional(v.number()),
  remMinutes: v.optional(v.number()),
  asleepAt: v.optional(v.string()),
  wokeAt: v.optional(v.string()),
});

async function requireAuthorizedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const allowedEmails = new Set(
    (process.env.SLEEP_ALLOWED_EMAIL || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const email = identity?.email?.trim().toLowerCase();

  if (!identity || !email || identity.emailVerified === false) {
    throw new Error("Sign in with a verified email to open this dashboard.");
  }
  if (!allowedEmails.has(email)) {
    throw new Error("This email is not authorized for the sleep dashboard.");
  }

  return identity;
}

function assertIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
}

function cleanOptionalNumber(value: number | undefined, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

export const verify = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthorizedUser(ctx);
    return { email: identity.email };
  },
});

export const dashboard = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    assertIsoDate(args.startDate, "startDate");
    assertIsoDate(args.endDate, "endDate");

    const [nights, alertness] = await Promise.all([
      ctx.db
        .query("sleepNights")
        .withIndex("by_date", (q) => q.gte("sleepDate", args.startDate).lte("sleepDate", args.endDate))
        .collect(),
      ctx.db
        .query("alertnessRatings")
        .withIndex("by_date", (q) => q.gte("ratingDate", args.startDate).lte("ratingDate", args.endDate))
        .collect(),
    ]);

    return { nights, alertness };
  },
});

export const importNights = mutation({
  args: {
    importBatchId: v.string(),
    nights: v.array(sleepNight),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    if (!args.nights.length || args.nights.length > 500) {
      throw new Error("Import between 1 and 500 nights at a time.");
    }

    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const night of args.nights) {
      assertIsoDate(night.sleepDate, "sleepDate");
      if (!Number.isFinite(night.score) || night.score < 0 || night.score > 100) {
        throw new Error(`Sleep score for ${night.sleepDate} must be between 0 and 100.`);
      }

      const existing = await ctx.db
        .query("sleepNights")
        .withIndex("by_source_date", (q) => q.eq("source", night.source).eq("sleepDate", night.sleepDate))
        .unique();

      const payload = {
        ...night,
        score: Math.round(night.score * 10) / 10,
        durationMinutes: cleanOptionalNumber(night.durationMinutes, 0, 1440),
        efficiency: cleanOptionalNumber(night.efficiency, 0, 100),
        hrv: cleanOptionalNumber(night.hrv, 0, 500),
        restingHeartRate: cleanOptionalNumber(night.restingHeartRate, 20, 250),
        deepMinutes: cleanOptionalNumber(night.deepMinutes, 0, 720),
        remMinutes: cleanOptionalNumber(night.remMinutes, 0, 720),
        importBatchId: args.importBatchId.slice(0, 100),
        importedAt: now,
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

    return { inserted, updated, total: args.nights.length };
  },
});

export const saveAlertness = mutation({
  args: {
    ratingDate: v.string(),
    score: v.number(),
    note: v.optional(v.string()),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedUser(ctx);
    assertIsoDate(args.ratingDate, "ratingDate");
    if (!Number.isInteger(args.score) || args.score < 1 || args.score > 10) {
      throw new Error("Alertness must be a whole number from 1 to 10.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("alertnessRatings")
      .withIndex("by_date", (q) => q.eq("ratingDate", args.ratingDate))
      .unique();
    const payload = {
      score: args.score,
      note: args.note?.trim().slice(0, 500) || "",
      timezone: args.timezone.slice(0, 80),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("alertnessRatings", {
      ...payload,
      ratingDate: args.ratingDate,
      recordedAt: now,
    });
  },
});
