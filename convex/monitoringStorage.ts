// Monitoring uses separate indexed records inside the existing private board
// table. This keeps the shared deployment's schema and other tools unchanged.
const ROOT = "monitoring:v2:";
const META = ROOT + "meta";
const SUMMARY = ROOT + "summary:";
const DETAIL = ROOT + "detail:";
const HISTORY = ROOT + "history:";
const RUN = ROOT + "run:";
const EVENT = ROOT + "event:";
const LEGACY = "monitoring:dashboard";

type RecordData = Record<string, any>;
const record = (value: any): value is RecordData => !!value && typeof value === "object" && !Array.isArray(value);
const rows = (value: any): RecordData[] => Array.isArray(value) ? value.filter(record) : [];
const time = (value: any) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const idPart = (value: string) => encodeURIComponent(value);
const runPrefix = (id: string) => RUN + idPart(id) + ":";
const sortIndex = (a: RecordData, b: RecordData) => b.time - a.time || b.key.localeCompare(a.key);

function stable(value: any): string {
  return JSON.stringify(value, (_key, child) => record(child)
    ? Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]])) : child);
}
async function hash(value: any) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function monitoringRow(ctx: any, boardId: string) {
  return ctx.db.query("warRoomState").withIndex("by_board", (q: any) => q.eq("boardId", boardId)).unique();
}
async function prefixRows(ctx: any, prefix: string, limit = 1000): Promise<any[]> {
  return ctx.db.query("warRoomState").withIndex("by_board", (q: any) => q.gte("boardId", prefix).lt("boardId", prefix + "\uffff"))
    .order("desc").take(limit);
}
async function put(ctx: any, boardId: string, buckets: RecordData, existing?: any) {
  const previous = existing === undefined ? await monitoringRow(ctx, boardId) : existing;
  if (previous && stable(previous.buckets) === stable(buckets)) return previous;
  const payload = {completed:{}, linearLinks:{}, docLinks:{}, buckets, updatedAt:Date.now()};
  if (previous) {await ctx.db.patch(previous._id, payload); return {...previous, ...payload};}
  const _id = await ctx.db.insert("warRoomState", {boardId, ...payload});
  return {_id, boardId, ...payload};
}
function runKey(monitorId: string, run: RecordData) {
  const stamp = time(run.timestamp || run.id);
  return runPrefix(monitorId) + new Date(stamp).toISOString() + ":" + idPart(String(run.id || run.timestamp));
}
async function saveHistory(ctx: any, monitorId: string, history: RecordData) {
  const boardId = HISTORY + idPart(monitorId);
  const previous = await monitoringRow(ctx, boardId);
  const prior = previous?.buckets ?? {};
  const {runs: _runs, ...metadata} = history;
  const requestedLimit = Number(history.maxRuns || prior.limit || (monitorId === "paze-directory" ? 336 : 60));
  const limit = Math.max(Number(prior.limit || 0), 1, Math.min(1000, Math.floor(requestedLimit)));
  const index = new Map<string, RecordData>(rows(prior.index).map(entry => [entry.key, entry]));
  for (const run of rows(history.runs)) {
    const key = runKey(monitorId, run), signature = await hash(run);
    const known = index.get(key);
    if (known?.signature === signature) continue;
    // Immutable run payloads live separately; retries read no historic payloads.
    await put(ctx, key, run);
    index.set(key, {key, time:time(run.timestamp || run.id), signature});
  }
  const ordered = [...index.values()].sort(sortIndex);
  for (const entry of ordered.slice(limit)) {
    const stale = await monitoringRow(ctx, entry.key);
    if (stale) await ctx.db.delete(stale._id);
  }
  return put(ctx, boardId, {metadata:{...(prior.metadata ?? {}), ...metadata, maxRuns:limit}, limit, index:ordered.slice(0, limit)}, previous);
}
export async function monitorSummary(ctx: any, monitorId: string) {
  return monitoringRow(ctx, SUMMARY + idPart(monitorId));
}
export async function saveMonitor(ctx: any, monitor: RecordData, options: {history?: RecordData; baseline?: RecordData; previous?: any} = {}) {
  const monitorId = String(monitor.id);
  const previous = options.previous === undefined ? await monitorSummary(ctx, monitorId) : options.previous;
  const previousMonitor = previous?.buckets?.monitor;
  const stale = previousMonitor && time(monitor.latestRunAt) < time(previousMonitor.latestRunAt);
  const history = options.history ? await saveHistory(ctx, monitorId, options.history) : null;
  const historyRevision = history?.updatedAt ?? previous?.buckets?.historyRevision;
  if (!stale && !(previousMonitor?.configured && !monitor.configured)) {
    const {details, ...summary} = monitor;
    const detailHash = await hash({details:details ?? null, baseline:options.baseline ?? null});
    if (previous?.buckets?.detailHash !== detailHash) {
      const oldDetail = await monitoringRow(ctx, DETAIL + idPart(monitorId));
      await put(ctx, DETAIL + idPart(monitorId), {details:details ?? null,
        ...(options.baseline !== undefined ? {baseline:options.baseline} : oldDetail?.buckets?.baseline ? {baseline:oldDetail.buckets.baseline} : {})}, oldDetail);
    }
    await put(ctx, SUMMARY + idPart(monitorId), {monitor:summary, detailHash,
      ...(historyRevision !== undefined ? {historyRevision} : {})}, previous);
  } else if (history && historyRevision !== previous?.buckets?.historyRevision) {
    await put(ctx, SUMMARY + idPart(monitorId), {...previous.buckets, historyRevision}, previous);
  }
}
export async function saveEvents(ctx: any, events: RecordData[]) {
  if (!events.length) return;
  const meta = await monitoringRow(ctx, META);
  if (!meta) throw Error("Monitoring storage is not initialized.");
  const index = new Map<string, RecordData>(rows(meta.buckets.feedIndex).map(entry => [entry.key, entry]));
  const oldest = index.size >= 100 ? Math.min(...[...index.values()].map(entry => entry.time)) : -Infinity;
  for (const event of events) {
    if (typeof event.id !== "string" || time(event.timestamp) < oldest) continue;
    const key = EVENT + new Date(time(event.timestamp)).toISOString() + ":" + idPart(event.id);
    if (index.has(key)) continue;
    await put(ctx, key, event);
    index.set(key, {key, id:event.id, time:time(event.timestamp)});
  }
  const ordered = [...index.values()].sort(sortIndex);
  for (const entry of ordered.slice(100)) {
    const stale = await monitoringRow(ctx, entry.key);
    if (stale) await ctx.db.delete(stale._id);
  }
  await put(ctx, META, {...meta.buckets, feedIndex:ordered.slice(0,100)}, meta);
}
export async function ensureMonitoringStorage(ctx: any, initialSnapshot?: RecordData) {
  let meta = await monitoringRow(ctx, META);
  if (meta) return meta;
  const legacy = await monitoringRow(ctx, LEGACY);
  const snapshot = legacy?.buckets ?? initialSnapshot;
  if (!snapshot?.state) throw Error("The monitoring dashboard needs an initial Paze snapshot before external reports.");
  const {monitors, ...state} = snapshot.state;
  meta = await put(ctx, META, {state, order:rows(monitors).map(m => m.id), feedIndex:[], migratedAt:Date.now()}, null);
  for (const monitor of rows(monitors)) {
    const history = monitor.id === "paze-directory" ? snapshot.history : snapshot.monitorHistory?.[monitor.id];
    // Migration never drops retained records even if an older producer used a larger cap.
    await saveMonitor(ctx, monitor, {history:history ? {...history, maxRuns:Math.max(Number(history.maxRuns || 0), rows(history.runs).length)} : undefined,
      ...(monitor.id === "paze-directory" ? {baseline:snapshot.baseline} : {})});
  }
  await saveEvents(ctx, rows(snapshot.feed?.events));
  return monitoringRow(ctx, META);
}
function orderSummaries(summaries: any[], order: string[]) {
  return summaries.sort((a,b) => {
    const l = order.indexOf(a.buckets.monitor.id), r = order.indexOf(b.buckets.monitor.id);
    return (l < 0 ? order.length : l) - (r < 0 ? order.length : r);
  });
}
function stateFor(monitors: RecordData[], base: RecordData, latestEventId: string | null) {
  const statuses = monitors.filter(m => m.configured).map(m => m.status);
  const overallStatus = statuses.some(s => s === "alert" || s === "error") ? "attention"
    : statuses.some(s => s === "watch" || s === "unavailable") ? "watch" : "healthy";
  const generatedAt = [base.generatedAt, ...monitors.map(m => m.latestRunAt)].filter(Boolean)
    .sort((a,b) => time(b)-time(a))[0] ?? null;
  return {...base, generatedAt, overallStatus, latestEventId, monitors};
}
export async function monitoringOverview(ctx: any) {
  const meta = await monitoringRow(ctx, META);
  if (!meta) {
    const legacy = await monitoringRow(ctx, LEGACY);
    const snapshot = legacy?.buckets;
    if (!snapshot) return {snapshot:null, updatedAt:null};
    return {snapshot:{state:{...snapshot.state, monitors:rows(snapshot.state.monitors).map(({details, ...m}) => ({...m, detailRevision:legacy.updatedAt}))},
      feed:{events:[], eventCount:rows(snapshot.feed?.events).length}}, updatedAt:legacy.updatedAt};
  }
  const summaries = orderSummaries(await prefixRows(ctx, SUMMARY, 100), meta.buckets.order ?? []);
  const monitors = summaries.map(r => ({...r.buckets.monitor, detailRevision:r.updatedAt}));
  return {snapshot:{state:stateFor(monitors, meta.buckets.state, meta.buckets.feedIndex[0]?.id ?? null),
    feed:{events:[], eventCount:meta.buckets.feedIndex.length}}, updatedAt:Math.max(meta.updatedAt, ...summaries.map(r => r.updatedAt))};
}
export async function monitoringDetail(ctx: any, monitorId: string) {
  const summary = await monitorSummary(ctx, monitorId);
  if (!summary) {
    const legacy = await monitoringRow(ctx, LEGACY);
    const s = legacy?.buckets, monitor = rows(s?.state?.monitors).find(m => m.id === monitorId);
    if (!monitor) throw Error("This monitor is not available.");
    return {monitor, history:monitorId === "paze-directory" ? s.history : s.monitorHistory?.[monitorId] ?? {runs:[]},
      ...(monitorId === "paze-directory" ? {baseline:s.baseline} : {}), revision:legacy.updatedAt};
  }
  const [detail, history] = await Promise.all([monitoringRow(ctx, DETAIL + idPart(monitorId)), monitoringRow(ctx, HISTORY + idPart(monitorId))]);
  const runs = history ? (await prefixRows(ctx, runPrefix(monitorId), Math.max(history.buckets.limit, history.buckets.index.length))).map(r => r.buckets) : [];
  return {monitor:{...summary.buckets.monitor, details:detail?.buckets?.details ?? {}},
    history:{...(history?.buckets?.metadata ?? {}), runs}, ...(detail?.buckets?.baseline ? {baseline:detail.buckets.baseline} : {}), revision:summary.updatedAt};
}
export async function monitoringFeed(ctx: any) {
  const meta = await monitoringRow(ctx, META);
  if (!meta) return (await monitoringRow(ctx, LEGACY))?.buckets?.feed ?? null;
  const events = (await prefixRows(ctx, EVENT, 100)).map(r => r.buckets);
  const monitors = (await prefixRows(ctx, SUMMARY, 100)).map(r => r.buckets.monitor);
  return {schemaVersion:1, feedId:"john-ta-monitoring-changes", generatedAt:stateFor(monitors, meta.buckets.state, events[0]?.id ?? null).generatedAt,
    latestEventId:events[0]?.id ?? null, events};
}
export async function legacyMonitoringSnapshot(ctx: any) {
  const overview = await monitoringOverview(ctx);
  if (!overview.snapshot) return overview;
  const monitors = [], monitorHistory: RecordData = {};
  let history = {runs:[]}, baseline = {merchants:[]};
  for (const card of overview.snapshot.state.monitors) {
    const detail = await monitoringDetail(ctx, card.id);
    monitors.push(detail.monitor);
    if (card.id === "paze-directory") {history = detail.history; baseline = detail.baseline ?? baseline;}
    else monitorHistory[card.id] = detail.history;
  }
  return {...overview, snapshot:{state:{...overview.snapshot.state, monitors}, history, baseline, monitorHistory, feed:await monitoringFeed(ctx)}};
}
