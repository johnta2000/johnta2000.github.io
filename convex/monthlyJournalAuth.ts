import type { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";

export async function requireOwner(ctx: Pick<QueryCtx | MutationCtx | ActionCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  // This production issuer requires email-code verification at signup and sign-in.
  // Its signed tokens can omit email_verified; explicit false always fails closed.
  const verifiedEmail = identity?.emailVerified === true ||
    (identity?.emailVerified === undefined && identity?.issuer === "https://clerk.john-ta.com");
  if (identity?.email?.trim().toLowerCase() !== "johnta2018@gmail.com" || !verifiedEmail) {
    throw new Error("Only the verified owner can access this journal.");
  }
  return identity.tokenIdentifier;
}

