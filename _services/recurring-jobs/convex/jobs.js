import { queryGeneric as query, internalMutationGeneric as internalMutation } from "convex/server";
import { ConvexError, v } from "convex/values";
import { job } from "./schema.js";

const owners = new Set(["johnta2018@gmail.com", "john@affil.ai"]);

export const list = query({
  args: {},
  handler: async ctx => {
    const user = await ctx.auth.getUserIdentity();
    // This Clerk issuer uses verified email sign-in and may omit email_verified.
    if (!user?.subject || user.issuer !== "https://clerk.john-ta.com" ||
        (user.emailVerified !== true && user.emailVerified !== undefined) ||
        !owners.has(user.email?.trim().toLowerCase())) {
      throw new ConvexError("Owner access required");
    }
    const snapshot = await ctx.db.query("inventory").unique();
    return snapshot && { jobs: snapshot.jobs, checkedAt: snapshot.checkedAt };
  },
});

export const replace = internalMutation({
  args: { jobs: v.array(job), checkedAt: v.number() },
  handler: async (ctx, snapshot) => {
    if (new Set(snapshot.jobs.map(j => j.id)).size !== snapshot.jobs.length ||
        snapshot.jobs.some(j => !/^[a-zA-Z0-9_-]{1,256}$/.test(j.id) ||
          !j.name.trim() || j.name.length > 512 || !j.schedule || j.schedule.length > 2048 ||
          (j.thread !== undefined && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(j.thread)))) {
      throw new Error("Invalid inventory");
    }
    const old = await ctx.db.query("inventory").unique();
    if (!old) await ctx.db.insert("inventory", snapshot);
    else if (snapshot.checkedAt > old.checkedAt) await ctx.db.replace(old._id, snapshot);
  },
});
