import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const entryFields = {
  teamId: v.string(),
  standupDate: v.string(),
  personName: v.string(),
  yesterday: v.string(),
  today: v.string(),
  blockers: v.optional(v.string()),
  notes: v.optional(v.string()),
};

function normalizePersonKey(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const listForDate = query({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("standupEntries")
      .withIndex("by_date", (q) => q.eq("teamId", args.teamId).eq("standupDate", args.standupDate))
      .collect();
  },
});

export const getDayNotes = query({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("standupDayNotes")
      .withIndex("by_date", (q) => q.eq("teamId", args.teamId).eq("standupDate", args.standupDate))
      .unique();
  },
});

export const getForPersonAndDate = query({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
    personName: v.string(),
  },
  handler: async (ctx, args) => {
    const personKey = normalizePersonKey(args.personName);
    if (!personKey) return null;

    return await ctx.db
      .query("standupEntries")
      .withIndex("by_person_date", (q) =>
        q.eq("teamId", args.teamId).eq("personKey", personKey).eq("standupDate", args.standupDate),
      )
      .unique();
  },
});

export const getPreviousForPerson = query({
  args: {
    teamId: v.string(),
    beforeDate: v.string(),
    personName: v.string(),
  },
  handler: async (ctx, args) => {
    const personKey = normalizePersonKey(args.personName);
    if (!personKey) return null;

    const entries = await ctx.db
      .query("standupEntries")
      .withIndex("by_person_date", (q) =>
        q.eq("teamId", args.teamId).eq("personKey", personKey).lt("standupDate", args.beforeDate),
      )
      .order("desc")
      .take(1);

    return entries[0] ?? null;
  },
});

export const save = mutation({
  args: entryFields,
  handler: async (ctx, args) => {
    const now = Date.now();
    const personName = args.personName.trim();
    const personKey = normalizePersonKey(personName);

    if (!personKey) {
      throw new Error("Name is required.");
    }

    const existing = await ctx.db
      .query("standupEntries")
      .withIndex("by_person_date", (q) =>
        q.eq("teamId", args.teamId).eq("personKey", personKey).eq("standupDate", args.standupDate),
      )
      .unique();

    const payload = {
      teamId: args.teamId,
      standupDate: args.standupDate,
      personKey,
      personName,
      yesterday: args.yesterday.trim(),
      today: args.today.trim(),
      blockers: args.blockers?.trim() || "",
      notes: args.notes?.trim() || "",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("standupEntries", {
      ...payload,
      submittedAt: now,
    });
  },
});

export const saveDayNotes = mutation({
  args: {
    teamId: v.string(),
    standupDate: v.string(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("standupDayNotes")
      .withIndex("by_date", (q) => q.eq("teamId", args.teamId).eq("standupDate", args.standupDate))
      .unique();

    const payload = {
      teamId: args.teamId,
      standupDate: args.standupDate,
      notes: args.notes.trim(),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("standupDayNotes", {
      ...payload,
      createdAt: now,
    });
  },
});
