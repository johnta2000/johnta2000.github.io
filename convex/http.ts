import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  encryptWhoopToken,
  exchangeAuthorizationCode,
  whoopConfig,
} from "./whoopLib";

const http = httpRouter();

http.route({
  path: "/whoop/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const oauthError = requestUrl.searchParams.get("error");
    const appUrl = safeAppUrl();

    if (oauthError) return redirect(appUrl, "error", oauthError);
    if (!code || !state) return redirect(appUrl, "error", "missing_response");

    const pending = await ctx.runMutation(internal.whoopData.consumeOAuthState, {
      state,
    });
    if (!pending) return redirect(appUrl, "error", "invalid_state");

    try {
      const tokens = await exchangeAuthorizationCode(code);
      if (!tokens.refresh_token) {
        throw new Error("WHOOP did not return an offline refresh token.");
      }
      await ctx.runMutation(internal.whoopData.saveConnection, {
        clerkSubject: pending.clerkSubject,
        accessTokenEncrypted: await encryptWhoopToken(tokens.access_token),
        refreshTokenEncrypted: await encryptWhoopToken(tokens.refresh_token),
        expiresAt: Date.now() + tokens.expires_in * 1000,
        scope: tokens.scope || "offline read:sleep",
        tokenType: tokens.token_type || "bearer",
      });
      return redirect(appUrl, "connected");
    } catch (error) {
      console.error("WHOOP OAuth callback failed", error);
      return redirect(appUrl, "error", "token_exchange");
    }
  }),
});

function safeAppUrl() {
  try {
    return new URL(whoopConfig().appUrl);
  } catch {
    return new URL("https://www.john-ta.com/tools/sleep/");
  }
}

function redirect(appUrl: URL, status: string, reason?: string) {
  const destination = new URL(appUrl);
  destination.searchParams.set("whoop", status);
  if (reason) destination.searchParams.set("reason", reason);
  return new Response(null, {
    status: 302,
    headers: { Location: destination.toString(), "Cache-Control": "no-store" },
  });
}

export default http;
