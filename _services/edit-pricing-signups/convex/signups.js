import { mutationGeneric } from "convex/server";
import { ConvexError, v } from "convex/values";

export const join = mutationGeneric({
  args: { email: v.string(), website: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.website) return null;
    const email = args.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }
    const existing = await ctx.db.query("signups")
      .withIndex("by_email", (q) => q.eq("email", email)).first();
    if (!existing) await ctx.db.insert("signups", { email });
    return null;
  },
});
