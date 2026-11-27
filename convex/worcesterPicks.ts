import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { applyChange } from "../tools/worcester-best-buy/family-picks.mjs";

const fields = { picks: v.string(), base: v.number(), extra: v.boolean() };
type Selection = { picks: string; base: number; extra: boolean };

function checkSelection({ picks, base }: Selection, allowEmpty: boolean) {
  if (picks.length > 1800 || !Number.isSafeInteger(base) || base < 0 || base > 999999999) {
    throw new Error("Invalid shopping list.");
  }
  const tokens = picks ? picks.split(".") : [];
  if ((!tokens.length && !base && !allowEmpty) || tokens.length > 174) throw new Error("Invalid shopping list.");
  let previous = 0;
  for (const token of tokens) {
    const match = /^([1-9]\d{0,4})(?:x([2-9]|[1-9]\d))?$/.exec(token);
    const product = match ? Number(match[1]) : 0;
    if (product < 1 || product > 99999 || product <= previous) throw new Error("Invalid product reference.");
    previous = product;
  }
}

// One-off links keep an immutable copy even when a recipient edits their picks.
export const save = mutation({
  args: fields,
  handler: async (ctx, value) => {
    checkSelection(value, false);
    const existing = await ctx.db.query("worcesterPickLists")
      .withIndex("by_selection", q => q.eq("picks", value.picks).eq("base", value.base).eq("extra", value.extra)).unique();
    return existing?._id ?? await ctx.db.insert("worcesterPickLists", value);
  },
});

export const get = query({
  args: { id: v.id("worcesterPickLists") },
  handler: async (ctx, { id }) => {
    const list = await ctx.db.get(id);
    return list ? { picks: list.picks, base: list.base, extra: list.extra } : null;
  },
});

function validateRequest(key: string) {
  if (!/^[a-z\d-]{36}$/.test(key)) throw new Error("Invalid edit reference.");
}

function publicFamily(list: Selection & { version: number }) {
  return { picks: list.picks, base: list.base, extra: list.extra, version: list.version };
}

// Possession of the opaque family link grants access to this shopping list only.
export const createFamily = mutation({
  args: { ...fields, request: v.string() },
  handler: async (ctx, { request, ...value }) => {
    validateRequest(request);
    checkSelection(value, true);
    const existing = await ctx.db.query("worcesterFamilyLists").withIndex("by_request", q => q.eq("request", request)).unique();
    return existing?._id ?? await ctx.db.insert("worcesterFamilyLists", { ...value, request, version: 0 });
  },
});

export const getFamily = query({
  args: { id: v.id("worcesterFamilyLists") },
  handler: async (ctx, { id }) => {
    const list = await ctx.db.get(id);
    return list && publicFamily(list);
  },
});

const changeFields = {
  items: v.array(v.object({ id: v.number(), count: v.number(), relative: v.boolean() })),
  base: v.optional(v.number()),
  extra: v.optional(v.boolean()),
};

export const updateFamily = mutation({
  args: { id: v.id("worcesterFamilyLists"), request: v.string(), change: v.object(changeFields) },
  handler: async (ctx, { id, request, change }) => {
    validateRequest(request);
    if (change.items.length > 174 || change.items.some(op => !Number.isInteger(op.id) || op.id < 1 || op.id > 99999 ||
      !Number.isInteger(op.count) || Math.abs(op.count) > 99 || (!op.relative && op.count < 0))) throw new Error("Invalid item change.");
    const list = await ctx.db.get(id);
    if (!list) throw new Error("Shopping list unavailable.");
    const applied = await ctx.db.query("worcesterFamilyEdits")
      .withIndex("by_list_request", q => q.eq("list", id).eq("request", request)).unique();
    if (applied) return publicFamily(list);
    const next = { ...applyChange(list, change), version: list.version + 1 };
    checkSelection(next, true);
    await ctx.db.patch(id, next);
    await ctx.db.insert("worcesterFamilyEdits", { list: id, request });
    return next;
  },
});
