import type { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
export async function questionUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const user = await ctx.auth.getUserIdentity();
  const allowed = (process.env.PAYMENT_QUESTIONS_ALLOWED_EMAIL || "").split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const verified = user?.emailVerified === true || (user?.emailVerified === undefined && user?.issuer === 'https://clerk.john-ta.com');
  if (!user || !verified || !allowed.includes(user.email?.trim().toLowerCase() || '')) throw Error('This account is not authorized for payment questions.');
  return { owner: 'payment-questions:personal', email: user.email!.trim().toLowerCase() };
}
