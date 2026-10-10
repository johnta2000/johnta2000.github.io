import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

export const PRIVATE_LAUNCH_BOARD = "war-room-10012026";
const ARCHIVED_BOARDS = new Set(["war-room-06122026", "war-room-06152026"]);
const ARCHIVE_OWNERS = new Set(["john@affil.ai", "johnta2018@gmail.com"]);
const APPROVED_EMAILS = new Set([
  "john@affil.ai",
  "johnta2018@gmail.com",
  "tothandrew22@gmail.com",
  "vivek@affil.ai",
  "vishal@affil.ai",
  "jenny@affil.ai",
]);

export async function requireLaunchUser(ctx: Pick<QueryCtx | MutationCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  // This Clerk instance verifies email at signup and signs in with email codes.
  // Its signed tokens may omit email_verified; match the site's other private tools.
  // Explicit false, malformed values, and missing verification from other issuers fail.
  const verifiedEmail = identity?.emailVerified === true ||
    (identity?.emailVerified === undefined && identity?.issuer === "https://clerk.john-ta.com");
  if (!identity || !verifiedEmail || !identity.email) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in with a verified email to open this war room." });
  }
  const email = identity.email.trim().toLowerCase();
  if (!APPROVED_EMAILS.has(email)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "This account is not approved for this war room." });
  }
  return { email, subject: identity.subject };
}

export async function requireWarRoomAccess(ctx: Pick<QueryCtx | MutationCtx, "auth">, boardId: string) {
  // This API serves only explicitly registered war rooms. Other tools must use
  // their own endpoints, which apply membership, roles, and field-level privacy.
  if (boardId === PRIVATE_LAUNCH_BOARD) {
    await requireLaunchUser(ctx);
    return;
  }
  if (ARCHIVED_BOARDS.has(boardId)) {
    const identity = await ctx.auth.getUserIdentity();
    const verified = identity?.emailVerified === true ||
      (identity?.emailVerified === undefined && identity?.issuer === "https://clerk.john-ta.com");
    if (identity?.subject && verified && ARCHIVE_OWNERS.has(identity.email?.trim().toLowerCase() || "")) return;
  }
  throw new ConvexError({ code: "FORBIDDEN", message: "This board is not available through the war-room API. Open its own tool with an approved account." });
}
