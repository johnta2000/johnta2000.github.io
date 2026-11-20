import { mutationGeneric } from "convex/server";
import { ConvexError, v } from "convex/values";

const launchConsentWording = {
  "hotel-pricing-launch-v1": "Yes, email me the link when it’s ready.",
  "hotel-pricing-launch-v2": "I agree to receive one email from John Ta with the link to the hotel pricing tool when it’s ready.",
};

export const join = mutationGeneric({
  args: {
    email: v.string(),
    consent: v.union(
      v.literal("edit-pricing-v1"),
      v.literal("hotel-pricing-launch-v1"),
      v.literal("hotel-pricing-launch-v2"),
    ),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.website) return null;
    const email = args.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }
    const existing = await ctx.db.query("signups")
      .withIndex("by_email", (q) => q.eq("email", email)).first();
    if (args.consent !== "edit-pricing-v1") {
      if (existing?.launchLinkConsent) return null;
      const launchLinkConsent = {
        version: args.consent,
        wording: launchConsentWording[args.consent],
        context: "I’m working on a tool to compare hotel prices from credit card programs. Want to try it? I’ll send you one email with the signup link when it’s ready.",
        acceptedAt: Date.now(),
      };
      if (existing) await ctx.db.patch(existing._id, { launchLinkConsent });
      else await ctx.db.insert("signups", { email, launchLinkConsent });
      return null;
    }
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
