// Official Personal API: https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
// Keep transport separate from storage so mappings can also serve a future approved OAuth connector.
const BASE = "https://personal.connectapi.garmin.com";
export function isoDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value) throw new Error("Use a valid YYYY-MM-DD date.");
  return value;
}
export function shift(date: string, days: number) { return new Date(Date.parse(isoDate(date) + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10); }
export function windows(start: string, end: string) {
  isoDate(start); isoDate(end);
  const length = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (length < 1 || length > 90) throw new Error("Sync between 1 and 90 days at a time.");
  const out: {start: string; end: string}[] = [];
  for (let date = start; date <= end; date = shift(date, 31)) out.push({start: date, end: shift(date, 30) < end ? shift(date, 30) : end});
  return out;
}
const number = (v: unknown, max: number, min = 0) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
const timestamp = (v: unknown) => {
  if (typeof v === "number" && v > 0) return new Date(v).toISOString();
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(v)) return undefined;
  // Garmin's GMT fields may omit the Z suffix. Never interpret these in the server's local timezone.
  const time = Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(v) ? v : v + "Z");
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
};
export function normalizeGarmin(sleeps: any[], hrvs: any[], summaries: any[], start: string, end: string) {
  windows(start, end);
  const days = new Map<string, any>();
  const get = (date: unknown) => { const d = isoDate(date); if (d < start || d > end) return null; if (!days.has(d)) days.set(d, {sleepDate:d, source:"garmin", scoreKind:"native"}); return days.get(d); };
  for (const sleep of sleeps) {
    const row = get(sleep.calendarDate); if (!row) continue;
    const seconds = number(sleep.sleepTimeSeconds, 86400);
    // Unknown/off-wrist summaries must not produce a zero-hour night or fabricated score.
    if (!seconds || sleep.sleepWindowConfirmationType === "off_wrist") continue;
    row.durationMinutes = seconds / 60;
    const score = sleep.sleepScores?.overall;
    row.score = score?.qualifierKey === "INVALID" ? undefined : number(score?.value, 100);
    row.lightMinutes = number(sleep.lightSleepSeconds, seconds);
    if (row.lightMinutes !== undefined) row.lightMinutes /= 60;
    row.deepMinutes = number(sleep.deepSleepSeconds, seconds);
    row.remMinutes = sleep.deviceRemCapable === false ? undefined : number(sleep.remSleepSeconds, seconds);
    if (row.deepMinutes !== undefined) row.deepMinutes /= 60;
    if (row.remMinutes !== undefined) row.remMinutes /= 60;
    if ((row.lightMinutes ?? 0) + (row.deepMinutes ?? 0) + (row.remMinutes ?? 0) > row.durationMinutes) { delete row.lightMinutes; delete row.deepMinutes; delete row.remMinutes; }
    row.asleepAt = timestamp(sleep.sleepStartTimestampGMT); row.wokeAt = timestamp(sleep.sleepEndTimestampGMT);
    if (row.asleepAt && row.wokeAt && row.asleepAt >= row.wokeAt) { delete row.asleepAt; delete row.wokeAt; }
  }
  for (const hrv of hrvs) { const row = get(hrv.calendarDate); if (row && hrv.status !== "INVALID") row.hrv = number(hrv.lastNightAvg, 500, 1); }
  for (const summary of summaries) {
    if (String(summary.source).toLowerCase() !== "garmin") continue;
    const row = get(summary.calendarDate); if (row) row.restingHeartRate = number(summary.restingHeartRate, 250, 20);
  }
  return [...days.values()].filter(row => [row.durationMinutes,row.hrv,row.restingHeartRate].some(v => v !== undefined))
    .map(row => Object.fromEntries(Object.entries(row).filter(([,v]) => v !== undefined))).sort((a,b) => String(a.sleepDate).localeCompare(String(b.sleepDate)));
}
export async function fetchGarmin(apiKey: string, start: string, end: string, request: typeof fetch = fetch) {
  const chunks = windows(start, end);
  if (!apiKey.trim() || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new Error("Enter a valid Garmin Personal API key.");
  async function json(path: string, auth: string, method = "GET") {
    const response = await request(BASE + path, {method, headers:{Authorization:auth, Accept:"application/json"}, redirect:"error", signal:AbortSignal.timeout(20000)});
    if (response.status === 204) return null;
    // Do not echo response bodies: providers can include credentials or private data in errors.
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Garmin access was denied. Check whether your Personal API key has expired or been revoked." : response.status === 429 ? "Garmin is limiting requests. Try again later." : "Garmin could not complete the sync. Try again later.");
    return response.json();
  }
  const token = await json("/personalapitoken-service/personal-api/personal-api-key/token", "ApiKey " + apiKey.trim(), "POST");
  const bearer = token?.access_token ?? token?.accessToken;
  if (typeof bearer !== "string" || !bearer || /[\r\n]/.test(bearer)) throw new Error("Garmin returned an unsupported token response.");
  const auth = "Bearer " + bearer, sleeps:any[] = [], hrvs:any[] = [], summaries:any[] = [];
  for (const chunk of chunks) {
    const sleep = await json("/sleep-service/sleep/dailySleepSummariesByDate?" + new URLSearchParams({startDate:chunk.start,endDate:chunk.end}), auth);
    if (sleep !== null && !Array.isArray(sleep)) throw new Error("Garmin returned an unsupported sleep response.");
    sleeps.push(...(sleep || []));
    const hrv = await json(`/hrv-service/hrv/daily/${chunk.start}/${chunk.end}`, auth);
    if (hrv !== null && !Array.isArray(hrv.hrvSummaries)) throw new Error("Garmin returned an unsupported HRV response.");
    hrvs.push(...(hrv?.hrvSummaries || []));
  }
  // The batch v2 summary's restingValue can fall back to absolute minimum HR.
  // Use the explicitly named restingHeartRate from the daily endpoint instead.
  for (let date = start; date <= end; date = shift(date, 1)) {
    const summary = await json("/usersummary-service/usersummary/daily?" + new URLSearchParams({calendarDate:date}), auth);
    if (summary !== null) { if (summary.calendarDate !== date) throw new Error("Garmin returned a mismatched summary date."); summaries.push(summary); }
  }
  return normalizeGarmin(sleeps, hrvs, summaries, start, end);
}
