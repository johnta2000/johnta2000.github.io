import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  WHOOP_API_BASE,
  buildWhoopAuthorizationUrl,
  decryptWhoopToken,
  encryptWhoopToken,
  refreshWhoopTokens,
} from "./whoopLib";

type WhoopSleep = {
  id: string;
  start: string;
  end: string;
  timezone_offset?: string;
  nap?: boolean;
  score_state?: string;
  score?: {
    sleep_performance_percentage?: number;
    sleep_efficiency_percentage?: number;
    stage_summary?: {
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
    };
  };
};

type WhoopSleepPage = {
  records?: WhoopSleep[];
  next_token?: string;
};

async function requireAuthorizedIdentity(ctx: { auth: any }) {
  const identity = await ctx.auth.getUserIdentity();
  const email = identity?.email?.trim().toLowerCase();
  const allowedEmails = new Set(
    (process.env.SLEEP_ALLOWED_EMAIL || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!identity || !email || !allowedEmails.has(email)) {
    throw new Error("This email is not authorized for the sleep dashboard.");
  }
  return identity;
}

export const beginConnect = action({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthorizedIdentity(ctx);
    const state = crypto.randomUUID().replaceAll("-", "");
    await ctx.runMutation(internal.whoopData.createOAuthState, {
      state,
      clerkSubject: identity.subject,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return { url: buildWhoopAuthorizationUrl(state) };
  },
});

export const sync = action({
  args: {},
  handler: async (ctx): Promise<{ inserted: number; updated: number }> => {
    const identity = await requireAuthorizedIdentity(ctx);
    return performSync(ctx, identity.subject);
  },
});

export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.runQuery(internal.whoopData.listConnections, {});
    let synced = 0;
    for (const connection of connections) {
      try {
        await performSync(ctx, connection.clerkSubject);
        synced += 1;
      } catch (error) {
        console.error("Automatic WHOOP sync failed", error);
      }
    }
    return { synced };
  },
});

async function performSync(ctx: any, clerkSubject: string) {
    const connection = await ctx.runQuery(internal.whoopData.getConnection, {
      clerkSubject,
    });
    if (!connection) throw new Error("Connect WHOOP before syncing.");

    let accessToken = await decryptWhoopToken(connection.accessTokenEncrypted);
    if (connection.expiresAt <= Date.now() + 60_000) {
      const refreshToken = await decryptWhoopToken(
        connection.refreshTokenEncrypted,
      );
      const refreshed = await refreshWhoopTokens(refreshToken, connection.scope);
      accessToken = refreshed.access_token;
      await ctx.runMutation(internal.whoopData.saveConnection, {
        clerkSubject,
        accessTokenEncrypted: await encryptWhoopToken(refreshed.access_token),
        refreshTokenEncrypted: await encryptWhoopToken(
          refreshed.refresh_token || refreshToken,
        ),
        expiresAt: Date.now() + refreshed.expires_in * 1000,
        scope: refreshed.scope || connection.scope,
        tokenType: refreshed.token_type || connection.tokenType,
      });
    }

    const sleeps = await fetchWhoopSleeps(accessToken);
    const nights = sleeps
      .filter(
        (sleep) =>
          !sleep.nap &&
          sleep.score_state === "SCORED" &&
          Number.isFinite(sleep.score?.sleep_performance_percentage),
      )
      .map(toSleepNight);

    return ctx.runMutation(internal.whoopData.upsertSleepNights, {
      clerkSubject,
      importBatchId: `whoop-api-${Date.now()}`,
      nights,
    });
}

export const disconnect = action({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuthorizedIdentity(ctx);
    const connection = await ctx.runQuery(internal.whoopData.getConnection, {
      clerkSubject: identity.subject,
    });
    if (connection) {
      const accessToken = await decryptWhoopToken(connection.accessTokenEncrypted);
      await fetch(`${WHOOP_API_BASE}/developer/v2/user/access`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => undefined);
      await ctx.runMutation(internal.whoopData.removeConnection, {
        clerkSubject: identity.subject,
      });
    }
    return { disconnected: true };
  },
});

async function fetchWhoopSleeps(accessToken: string) {
  const records: WhoopSleep[] = [];
  const start = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString();
  let nextToken: string | undefined;
  for (let page = 0; page < 16; page += 1) {
    const url = new URL(`${WHOOP_API_BASE}/developer/v2/activity/sleep`);
    url.searchParams.set("limit", "25");
    url.searchParams.set("start", start);
    if (nextToken) url.searchParams.set("nextToken", nextToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json()) as WhoopSleepPage & {
      message?: string;
    };
    if (!response.ok) {
      throw new Error(payload.message || `WHOOP sync failed (${response.status}).`);
    }
    records.push(...(payload.records || []));
    nextToken = payload.next_token;
    if (!nextToken) break;
  }
  return records;
}

function toSleepNight(sleep: WhoopSleep) {
  const stages = sleep.score?.stage_summary;
  const light = stages?.total_light_sleep_time_milli || 0;
  const deep = stages?.total_slow_wave_sleep_time_milli || 0;
  const rem = stages?.total_rem_sleep_time_milli || 0;
  return {
    sleepDate: dateAtOffset(sleep.end, sleep.timezone_offset),
    score: sleep.score!.sleep_performance_percentage!,
    durationMinutes: Math.round((light + deep + rem) / 60_000),
    efficiency: sleep.score?.sleep_efficiency_percentage,
    deepMinutes: Math.round(deep / 60_000),
    remMinutes: Math.round(rem / 60_000),
    asleepAt: sleep.start,
    wokeAt: sleep.end,
  };
}

function dateAtOffset(value: string, offset = "+00:00") {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  const direction = match?.[1] === "-" ? -1 : 1;
  const minutes = match
    ? direction * (Number(match[2]) * 60 + Number(match[3]))
    : 0;
  return new Date(new Date(value).getTime() + minutes * 60_000)
    .toISOString()
    .slice(0, 10);
}
