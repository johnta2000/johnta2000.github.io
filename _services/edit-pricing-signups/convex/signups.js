import { mutationGeneric } from "convex/server";
import { ConvexError, v } from "convex/values";

export const join = mutationGeneric({
  args: { email: v.string(), consent: v.literal("edit-pricing-v1"), website: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.website) return null;
    const email = args.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }
    const existing = await ctx.db.query("signups")
      .withIndex("by_email", (q) => q.eq("email", email)).first();
    if (existing?.consentVersion === args.consent) return null;
    const consent = {
      consentVersion: args.consent,
      consentText: "Yes, email me updates from John Ta about The Edit hotel pricing tool.",
      consentedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, consent);
    else await ctx.db.insert("signups", { email, ...consent });
    return null;
  },
});
