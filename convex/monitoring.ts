import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const DASHBOARD_BOARD_ID = "monitoring:dashboard";
const MAX_EXTERNAL_RUNS = 60;
const MAX_FEED_EVENTS = 100;

type JsonRecord = Record<string, any>;
type MonitoringSnapshot = {
  state?: JsonRecord;
  history?: JsonRecord;
  baseline?: JsonRecord;
  feed?: JsonRecord;
  monitorHistory?: Record<string, JsonRecord>;
};

const EXTERNAL_MONITORS = {
  "paze-clover-map-ranking": {
    name: "Paze / Clover map ranking",
    description: "Tracks the dedicated map page across Search Console, cannibalization, index health, and clean Google result checks.",
    cadence: "3× daily via Codex",
    defaultSource: "https://www.nextcard.com/tools/clover-paze-map",
  },
  "transfer-bonus-discovery": {
    name: "Transfer bonus discovery",
    description: "Scans official issuer and loyalty-program sources for new transfer bonuses, changed terms, and coverage failures.",
    cadence: "Codex heartbeat",
    defaultSource: null,
  },
} as const;

type ExternalReport = {
  monitorId: keyof typeof EXTERNAL_MONITORS;
  timestamp: string;
  status: "healthy" | "watch" | "alert" | "unavailable" | "error";
  summary: string;
  durationMs: number | null;
  meaningful: boolean;
  eventType: string;
  metrics: JsonRecord;
  details: JsonRecord;
  sourceUrls: string[];
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function allowedEmails() {
  return new Set(
    (process.env.MONITORING_ALLOWED_EMAIL || process.env.SLEEP_ALLOWED_EMAIL || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function requireAuthorizedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const email = identity?.email?.trim().toLowerCase();

  if (!identity || !email || identity.emailVerified === false) {
    throw new Error("Sign in with a verified email to open this dashboard.");
  }
  if (!allowedEmails().has(email)) {
    throw new Error("This email is not authorized for the monitoring dashboard.");
  }

  return { subject: identity.subject, email };
}

async function dashboardRecord(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("warRoomState")
    .withIndex("by_board", (q) => q.eq("boardId", DASHBOARD_BOARD_ID))
    .unique();
}

function validateSnapshot(value: unknown): asserts value is MonitoringSnapshot {
  if (!isRecord(value)) throw new Error("Monitoring snapshot must be an object.");
  if (!value.state || !value.history || !value.baseline || !value.feed) {
    throw new Error("Monitoring snapshot is missing a required data section.");
  }
}

function validateReport(value: unknown): ExternalReport {
  if (!isRecord(value) || JSON.stringify(value).length > 50_000) {
    throw new Error("External monitor report must be a reasonably sized object.");
  }

  const monitorId = value.monitorId as keyof typeof EXTERNAL_MONITORS;
  if (!EXTERNAL_MONITORS[monitorId]) throw new Error("External monitor id is not supported.");

  const statuses = new Set(["healthy", "watch", "alert", "unavailable", "error"]);
  if (typeof value.status !== "string" || !statuses.has(value.status)) {
    throw new Error("External monitor status is invalid.");
  }

  const timestamp = typeof value.timestamp === "string" ? value.timestamp : "";
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error("External monitor timestamp must be valid ISO-8601.");
  }

  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  if (!summary || summary.length > 800) {
    throw new Error("External monitor summary must be between 1 and 800 characters.");
  }

  const durationMs = value.durationMs == null ? null : Number(value.durationMs);
  if (durationMs != null && (!Number.isFinite(durationMs) || durationMs < 0)) {
    throw new Error("External monitor duration is invalid.");
  }

  const sourceUrls = Array.isArray(value.sourceUrls) ? value.sourceUrls : [];
  if (sourceUrls.length > 12 || sourceUrls.some((url) => typeof url !== "string" || !/^https:\/\//.test(url))) {
    throw new Error("External monitor source URLs are invalid.");
  }
  if (value.metrics != null && !isRecord(value.metrics)) throw new Error("External monitor metrics must be an object.");
  if (value.details != null && !isRecord(value.details)) throw new Error("External monitor details must be an object.");

  return {
    monitorId,
    timestamp,
    status: value.status as ExternalReport["status"],
    summary,
    durationMs,
    meaningful: value.meaningful === true,
    eventType: typeof value.eventType === "string" && value.eventType.trim()
      ? value.eventType.trim().slice(0, 80)
      : "status",
    metrics: (value.metrics as JsonRecord | undefined) ?? {},
    details: (value.details as JsonRecord | undefined) ?? {},
    sourceUrls,
  };
}

function eventId(report: ExternalReport) {
  const compact = report.timestamp.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${compact}-${report.monitorId}-${report.eventType}`;
}

function feedEvents(feed: unknown) {
  return isRecord(feed) && Array.isArray(feed.events) ? feed.events.filter(isRecord) : [];
}

function mergeFeed(left: unknown, right: unknown, timestamp: string) {
  const byId = new Map<string, JsonRecord>();
  for (const event of [...feedEvents(left), ...feedEvents(right)]) {
    if (typeof event.id === "string") byId.set(event.id, event);
  }
  const events = [...byId.values()]
    .sort((a, b) => Date.parse(String(b.timestamp || "")) - Date.parse(String(a.timestamp || "")))
    .slice(0, MAX_FEED_EVENTS);
  return {
    schemaVersion: 1,
    feedId: "john-ta-monitoring-changes",
    generatedAt: timestamp,
    latestEventId: events[0]?.id ?? null,
    events,
  };
}

function recomputeState(state: JsonRecord, timestamp: string, latestEventId: string | null) {
  const monitors = Array.isArray(state.monitors) ? state.monitors.filter(isRecord) : [];
  const statuses = monitors.filter((monitor) => monitor.configured).map((monitor) => monitor.status);
  const overallStatus = statuses.some((status) => status === "alert" || status === "error")
    ? "attention"
    : statuses.some((status) => status === "watch" || status === "unavailable")
      ? "watch"
      : "healthy";
  return { ...state, generatedAt: timestamp, overallStatus, latestEventId, monitors };
}

function mergeIngestSnapshot(incoming: MonitoringSnapshot, existing?: MonitoringSnapshot): MonitoringSnapshot {
  if (!existing || !isRecord(existing.state)) {
    return { ...incoming, monitorHistory: incoming.monitorHistory ?? {} };
  }

  const incomingState = isRecord(incoming.state) ? incoming.state : {};
  const incomingMonitors = Array.isArray(incomingState.monitors) ? incomingState.monitors.filter(isRecord) : [];
  const existingMonitors = Array.isArray(existing.state.monitors) ? existing.state.monitors.filter(isRecord) : [];
  const externalById = new Map(
    existingMonitors
      .filter((monitor) => EXTERNAL_MONITORS[monitor.id as keyof typeof EXTERNAL_MONITORS] && monitor.configured)
      .map((monitor) => [monitor.id, monitor]),
  );
  const monitors = incomingMonitors
    .filter((monitor) => monitor.id !== "paze-bonus-discovery")
    .map((monitor) => externalById.get(monitor.id) ?? monitor);
  for (const [id, monitor] of externalById) {
    if (!monitors.some((candidate) => candidate.id === id)) monitors.push(monitor);
  }

  const timestamp = String(incomingState.generatedAt || existing.state.generatedAt || new Date().toISOString());
  const feed = mergeFeed(incoming.feed, existing.feed, timestamp);
  return {
    ...incoming,
    state: recomputeState({ ...incomingState, monitors }, timestamp, feed.latestEventId),
    feed,
    monitorHistory: existing.monitorHistory ?? incoming.monitorHistory ?? {},
  };
}

function applyExternalReport(snapshot: MonitoringSnapshot, report: ExternalReport): MonitoringSnapshot {
  const metadata = EXTERNAL_MONITORS[report.monitorId];
  const state = isRecord(snapshot.state) ? snapshot.state : {};
  const currentMonitors = Array.isArray(state.monitors) ? state.monitors.filter(isRecord) : [];
  const previous = currentMonitors.find((monitor) => monitor.id === report.monitorId) ?? {};
  const completed = !["unavailable", "error"].includes(report.status);
  const recovered = report.status === "healthy" && previous.configured && previous.status !== "healthy";
  const shouldFeed = report.meaningful || recovered || report.status === "alert" || report.status === "error" || previous.status !== report.status;
  const sourceUrls = report.sourceUrls.length
    ? report.sourceUrls
    : metadata.defaultSource ? [metadata.defaultSource] : [];

  const monitor = {
    id: report.monitorId,
    name: metadata.name,
    description: metadata.description,
    configured: true,
    status: report.status,
    sourceUrl: sourceUrls[0] ?? null,
    sourceUrls,
    cadence: metadata.cadence,
    latestRunAt: report.timestamp,
    latestSuccessAt: completed ? report.timestamp : previous.latestSuccessAt ?? null,
    latestChangeAt: report.meaningful ? report.timestamp : previous.latestChangeAt ?? null,
    durationMs: report.durationMs,
    summary: report.summary,
    error: report.status === "error" ? report.summary : null,
    metrics: report.metrics,
    details: report.details,
  };

  const monitors = currentMonitors
    .filter((candidate) => candidate.id !== report.monitorId && candidate.id !== "paze-bonus-discovery");
  const order = ["paze-directory", "paze-clover-map-ranking", "transfer-bonus-discovery"];
  monitors.push(monitor);
  monitors.sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));

  const histories = isRecord(snapshot.monitorHistory) ? snapshot.monitorHistory : {};
  const currentHistory = isRecord(histories[report.monitorId]) ? histories[report.monitorId] : {};
  const priorRuns = Array.isArray(currentHistory.runs) ? currentHistory.runs.filter(isRecord) : [];
  const run = {
    id: report.timestamp,
    monitorId: report.monitorId,
    timestamp: report.timestamp,
    status: report.status,
    summary: report.summary,
    durationMs: report.durationMs,
    meaningful: report.meaningful,
    eventType: report.eventType,
    metrics: report.metrics,
    details: report.details,
    sourceUrls,
  };
  const runs = [run, ...priorRuns.filter((candidate) => candidate.id !== run.id)].slice(0, MAX_EXTERNAL_RUNS);

  const event = {
    id: eventId(report),
    monitorId: report.monitorId,
    timestamp: report.timestamp,
    type: recovered ? "recovery" : report.eventType,
    status: report.status,
    title: `${metadata.name}: ${recovered ? "recovered" : report.eventType}`,
    summary: report.summary,
    sourceUrls,
  };
  const feed = mergeFeed(shouldFeed ? { events: [event] } : { events: [] }, snapshot.feed, report.timestamp);

  return {
    ...snapshot,
    state: recomputeState({ ...state, monitors }, report.timestamp, feed.latestEventId),
    feed,
    monitorHistory: {
      ...histories,
      [report.monitorId]: { schemaVersion: 1, maxRuns: MAX_EXTERNAL_RUNS, runs },
    },
  };
}

async function saveSnapshot(
  ctx: MutationCtx,
  existing: Awaited<ReturnType<typeof dashboardRecord>> | null,
  snapshot: MonitoringSnapshot,
) {
  const payload = {
    completed: {},
    linearLinks: {},
    docLinks: {},
    buckets: snapshot,
    updatedAt: Date.now(),
  };
  if (existing) await ctx.db.patch(existing._id, payload);
  else await ctx.db.insert("warRoomState", { boardId: DASHBOARD_BOARD_ID, ...payload });
  return { updatedAt: payload.updatedAt };
}

export const verify = query({
  args: {},
  handler: async (ctx) => requireAuthorizedUser(ctx),
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAuthorizedUser(ctx);
    const record = await dashboardRecord(ctx);
    return {
      viewer,
      snapshot: (record?.buckets as MonitoringSnapshot | undefined) ?? null,
      updatedAt: record?.updatedAt ?? null,
    };
  },
});

export const changeFeed = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthorizedUser(ctx);
    const record = await dashboardRecord(ctx);
    const snapshot = record?.buckets as MonitoringSnapshot | undefined;
    return snapshot?.feed ?? null;
  },
});

export const ingest = mutation({
  args: { secret: v.string(), snapshot: v.any() },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.MONITORING_INGEST_SECRET;
    if (!expectedSecret || args.secret.length < 32 || args.secret !== expectedSecret) {
      throw new Error("Monitoring ingestion is not authorized.");
    }
    validateSnapshot(args.snapshot);
    const existing = await dashboardRecord(ctx);
    const merged = mergeIngestSnapshot(args.snapshot, existing?.buckets as MonitoringSnapshot | undefined);
    return await saveSnapshot(ctx, existing, merged);
  },
});

export const report = mutation({
  args: { secret: v.string(), report: v.any() },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.MONITORING_REPORT_SECRET;
    if (!expectedSecret || args.secret.length < 32 || args.secret !== expectedSecret) {
      throw new Error("External monitoring report is not authorized.");
    }
    const report = validateReport(args.report);
    const existing = await dashboardRecord(ctx);
    const snapshot = existing?.buckets as MonitoringSnapshot | undefined;
    if (!snapshot) throw new Error("The monitoring dashboard needs an initial Paze snapshot before external reports.");
    validateSnapshot(snapshot);
    return await saveSnapshot(ctx, existing, applyExternalReport(snapshot, report));
  },
});
