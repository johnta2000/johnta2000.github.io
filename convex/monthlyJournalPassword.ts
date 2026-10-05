"use node";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { action } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { requireOwner } from "./monthlyJournalAuth";

export const unlock = action({ args: { password: v.string(), setup: v.boolean() }, handler: async (ctx, args): Promise<{ token: string; expiresAt: number }> => {
  await requireOwner(ctx);
  if (args.password.length < 12 || args.password.length > 256) throw new Error("Use a password between 12 and 256 characters.");
  const config: { salt: string; hash: string } | null = await ctx.runMutation(makeFunctionReference<"mutation">("monthlyJournal:beginUnlock"), {});
  if (!config && !args.setup) throw new Error("Set your journal password first.");
  if (config && args.setup) throw new Error("Password already configured. Reload and unlock.");
  const salt = config?.salt ?? randomBytes(32).toString("hex");
  const derived = scryptSync(args.password, salt, 64);
  if (config && !timingSafeEqual(derived, Buffer.from(config.hash, "hex"))) throw new Error("Incorrect journal password.");
  const token = randomBytes(32).toString("hex");
  const expiresAt: number = await ctx.runMutation(makeFunctionReference<"mutation">("monthlyJournal:finishUnlock"), {
    tokenHash: createHash("sha256").update(token).digest("hex"), salt, hash: derived.toString("hex"), setup: !config,
  });
  return { token, expiresAt };
}});
