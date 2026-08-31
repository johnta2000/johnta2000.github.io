import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const DASHBOARD_BOARD_ID = "monitoring:dashboard";

type MonitoringSnapshot = {
  state?: unknown;
  history?: unknown;
  baseline?: unknown;
  feed?: unknown;
};

function allowedEmails() {
  return new Set(
    (process.env.MONITORING_ALLOWED_EMAIL || process.env.SLEEP_ALLOWED_EMAIL || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function requireAuthorizedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const email = identity?.email?.trim().toLowerCase();

  if (!identity || !email || identity.emailVerified === false) {
    throw new Error("Sign in with a verified email to open this dashboard.");
  }
  if (!allowedEmails().has(email)) {
    throw new Error("This email is not authorized for the monitoring dashboard.");
  }

  return { subject: identity.subject, email };
}

async function dashboardRecord(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("warRoomState")
    .withIndex("by_board", (q) => q.eq("boardId", DASHBOARD_BOARD_ID))
    .unique();
}

function validateSnapshot(value: unknown): asserts value is MonitoringSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Monitoring snapshot must be an object.");
  }
  const snapshot = value as MonitoringSnapshot;
  if (!snapshot.state || !snapshot.history || !snapshot.baseline || !snapshot.feed) {
    throw new Error("Monitoring snapshot is missing a required data section.");
  }
}

export const verify = query({
  args: {},
  handler: async (ctx) => requireAuthorizedUser(ctx),
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAuthorizedUser(ctx);
    const record = await dashboardRecord(ctx);
    return {
      viewer,
      snapshot: (record?.buckets as MonitoringSnapshot | undefined) ?? null,
      updatedAt: record?.updatedAt ?? null,
    };
  },
});

export const changeFeed = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthorizedUser(ctx);
    const record = await dashboardRecord(ctx);
    const snapshot = record?.buckets as MonitoringSnapshot | undefined;
    return snapshot?.feed ?? null;
  },
});

export const ingest = mutation({
  args: {
    secret: v.string(),
    snapshot: v.any(),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.MONITORING_INGEST_SECRET;
    if (!expectedSecret || args.secret.length < 32 || args.secret !== expectedSecret) {
      throw new Error("Monitoring ingestion is not authorized.");
    }
    validateSnapshot(args.snapshot);

    const existing = await dashboardRecord(ctx);
    const payload = {
      completed: {},
      linearLinks: {},
      docLinks: {},
      buckets: args.snapshot,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("warRoomState", {
        boardId: DASHBOARD_BOARD_ID,
        ...payload,
      });
    }

    return { updatedAt: payload.updatedAt };
  },
});
