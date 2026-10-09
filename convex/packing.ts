import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { packingState } from "./packingTables";

const OWNER_EMAIL = "johnta2018@gmail.com";
const ISSUER = "https://clerk.john-ta.com";

export async function requirePackingOwner(ctx: { auth: QueryCtx["auth"] }) {
  const user = await ctx.auth.getUserIdentity();
  // This Clerk instance verifies email through its email-code flow. Its signed
  // tokens may omit email_verified; explicit false or a different issuer fails.
  if (!user || user.issuer !== ISSUER || user.email?.trim().toLowerCase() !== OWNER_EMAIL ||
      (user.emailVerified !== true && user.emailVerified !== undefined)) {
    throw Error("This account is not authorized for packing.");
  }
  return OWNER_EMAIL;
}

function validateState(state: Infer<typeof packingState>) {
  if (state.trips.length > 100) throw Error("Keep up to 100 trips in your checklist.");
  const ids = new Set<string>();
  let itemCount = 0;
  function id(value: string) {
    if (!value || value.length > 100 || ids.has(value)) throw Error("Checklist IDs must be unique and valid.");
    ids.add(value);
  }
  function text(value: string, max: number) {
    if (!value.trim() || value.length > max) throw Error("Checklist text is empty or too long.");
  }
  function sections(values: typeof state.template) {
    if (values.length > 20) throw Error("Keep up to 20 sections in a checklist.");
    for (const section of values) {
      id(section.id); text(section.name, 100);
      if (section.items.length > 200) throw Error("Keep up to 200 items in a section.");
      for (const item of section.items) { id(item.id); text(item.label, 150); itemCount++; }
    }
  }
  sections(state.template);
  for (const trip of state.trips) { id(trip.id); text(trip.name, 100); sections(trip.sections); }
  if (itemCount > 10000) throw Error("Your packing lists have too many items.");
  if (state.activeId !== null && state.activeId !== "default" && !state.trips.some(trip => trip.id === state.activeId)) throw Error("Choose an existing trip.");
}

export const verify = query({ args: {}, handler: async ctx => {
  const email = await requirePackingOwner(ctx);
  return { email };
} });

export const read = query({ args: {}, handler: async ctx => {
  const owner = await requirePackingOwner(ctx);
  const record = await ctx.db.query("packingWorkspaces").withIndex("by_owner", q => q.eq("owner", owner)).unique();
  return { state: record?.state ?? null, version: record?.version ?? 0 };
} });

export const save = mutation({
  args: { state: packingState, expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const owner = await requirePackingOwner(ctx);
    if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 0) throw Error("Invalid checklist version.");
    validateState(args.state);
    const record = await ctx.db.query("packingWorkspaces").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if ((record?.version ?? 0) !== args.expectedVersion) throw Error("Your checklist changed on another device. Reload to review the saved version.");
    const version = args.expectedVersion + 1;
    const values = { state: args.state, version, updatedAt: Date.now() };
    if (record) await ctx.db.patch(record._id, values);
    else await ctx.db.insert("packingWorkspaces", { owner, ...values });
    return { version };
  },
});
