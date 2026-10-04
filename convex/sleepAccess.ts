import { internalQuery } from "./_generated/server";
export async function signedIn(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject || !identity.email || identity.emailVerified === false) throw new Error("Sign in with a verified email to continue.");
  return identity;
}
export function isOwnerEmail(email: string) {
  return (process.env.SLEEP_ALLOWED_EMAIL || "").split(",").map(value => value.trim().toLowerCase()).includes(email.trim().toLowerCase());
}
export async function requireSleepUser(ctx: any) {
  const identity = await signedIn(ctx);
  const profile = await ctx.db.query("sleepProfiles").withIndex("by_subject", (q: any) => q.eq("subject", identity.subject)).unique();
  if (!profile && !isOwnerEmail(identity.email)) throw new Error("An invitation is required to join Daylight.");
  return identity;
}
export const authorize = internalQuery({ args: {}, handler: async ctx => {
  const user = await requireSleepUser(ctx);
  return { subject: user.subject, email: user.email };
}});
