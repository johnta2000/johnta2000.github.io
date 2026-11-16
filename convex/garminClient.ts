import {fetchGarminActivities, normalizeGarminActivities} from "./garminActivities";
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
function emptySleepSummary(value: any) {
  // Garmin includes undated placeholders for nights without a measured main sleep.
  // They can contain nap/sleep-need metadata, which is not a main-sleep reading.
  return value && typeof value === "object" && !Array.isArray(value) && value.calendarDate === null
    && ["id", "sleepTimeSeconds", "sleepStartTimestampGMT", "sleepEndTimestampGMT", "lightSleepSeconds", "deepSleepSeconds", "remSleepSeconds", "sleepScores"].every(field => value[field] == null);
}
const timestamp = (v: unknown) => {
  if (typeof v === "number" && v > 0) { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : undefined; }
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
    if (emptySleepSummary(sleep)) continue;
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
export class GarminRequestError extends Error {
  constructor(message: string, public readonly step: string, public readonly status?: number) { super(message); this.name = "GarminRequestError"; }
}
export type GarminCoverage = {sleep: string[]; hrv: string[]; restingHeartRate: string[]; workouts?: string[]};
export async function fetchGarmin(apiKey: string, start: string, end: string, request: typeof fetch = fetch, pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve,ms))) {
  const chunks = windows(start, end);
  if (!apiKey.trim() || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new GarminRequestError("Enter a valid Garmin Personal API key.","authorization");
  const deadline=Date.now()+60000;
  async function json(path: string, auth: string, method = "GET") {
    const step = path.includes("/personal-api-key/token") ? "authorization" : path.includes("/sleep-service/") ? "sleep history" : path.includes("/hrv-service/") ? "overnight HRV" : path.includes("/activitylist-service/") ? "workouts" : "resting heart rate";
    // Garmin's official authenticator accepts */* and reads a plain-text JWT.
    // Only the health-data endpoints return JSON.
    const tokenRequest = step === "authorization";
    for(let attempt=0;attempt<2;attempt++) {
      const remaining=deadline-Date.now();
      if(remaining<=0)throw new GarminRequestError(`Garmin ${step} is taking too long. Use Sync now to retry.`,step);
      let response: Response;
      try { response = await request(BASE + path, {method, headers:{Authorization:auth, Accept:tokenRequest ? "*/*" : "application/json"}, redirect:"error", signal:AbortSignal.timeout(Math.min(12000,remaining))}); }
      catch { if(attempt===0 && Date.now()+500<deadline){await pause(250);continue;} throw new GarminRequestError(`Garmin ${step} could not be reached. Use Sync now to retry.`, step); }
      if (response.status === 204) return null;
      if (!response.ok) {
        if(attempt===0 && [502,503,504].includes(response.status) && Date.now()+500<deadline){await pause(250);continue;}
        // Report only a fixed operation label and HTTP status, never provider response bodies or credentials.
        const detail = response.status === 401 || response.status === 403 ? "Access was denied. Check your Personal API key and its expiration." : response.status === 429 ? "Garmin is limiting requests. Try again later." : response.status >= 500 ? "Garmin returned a service error. Try again later." : "Garmin rejected this request. Please share this message with John so the connection can be checked.";
        throw new GarminRequestError(`Garmin ${step} failed (HTTP ${response.status}). ${detail}`,step,response.status);
      }
      try { return tokenRequest ? await response.text() : await response.json(); }
      catch { throw new GarminRequestError(`Garmin ${step} returned an unreadable response. Use Sync now to retry.`,step,response.status); }
    }
    throw new GarminRequestError(`Garmin ${step} could not finish. Use Sync now to retry.`,step);
  }
  const token = await json("/personalapitoken-service/personal-api/personal-api-key/token", "ApiKey " + apiKey.trim(), "POST");
  const bearer = typeof token === "string" ? token.trim() : "";
  // Reject HTML, JSON wrappers and malformed responses before using them in a header.
  // This is a format check, not JWT signature verification; Garmin validates its bearer token.
  if (bearer.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer)) throw new GarminRequestError("Garmin returned an unsupported token response.","authorization");
  const auth="Bearer "+bearer, sleeps:any[]=[], hrvs:any[]=[], summaries:any[]=[], warnings:string[]=[];
  const coverage:GarminCoverage={sleep:[],hrv:[],restingHeartRate:[]};
  const dates=(from:string,to:string)=>{const result:string[]=[];for(let d=from;d<=to;d=shift(d,1))result.push(d);return result;};
  function records(value:any,step:string) {
    if(!Array.isArray(value))throw new GarminRequestError(`Garmin returned an unsupported ${step} response. Existing readings were kept.`,step);
    for(const row of value) {try { if(!row || typeof row!=="object")throw Error();isoDate(row.calendarDate); } catch {throw new GarminRequestError(`Garmin returned an invalid date in ${step}. Existing readings were kept.`,step);} }
    return value;
  }
  async function optional(work:()=>Promise<void>, permissionRequired = true) {
    try { await work();return true; }
    catch(error) {
      // An expired/rejected bearer token is an authorization failure, not missing health data.
      if(!(error instanceof GarminRequestError) || error.status===401 || (permissionRequired && error.status===403))throw error;
      if(!warnings.includes(error.message))warnings.push(error.message);
      return false;
    }
  }
  for(const chunk of chunks) {
    await optional(async()=>{
      const value=await json("/sleep-service/sleep/dailySleepSummariesByDate?"+new URLSearchParams({startDate:chunk.start,endDate:chunk.end}),auth);
      const measured = Array.isArray(value) ? value.filter(row => !emptySleepSummary(row)) : value;
      sleeps.push(...records(measured??[],"sleep history"));coverage.sleep.push(...dates(chunk.start,chunk.end));
    });
    await optional(async()=>{
      const value=await json(`/hrv-service/hrv/daily/${chunk.start}/${chunk.end}`,auth);
      // hrvSummaries is optional in Garmin's schema; watches without HRV may have no summaries.
      if(value!==null && (typeof value!=="object" || Array.isArray(value)))throw new GarminRequestError("Garmin returned an unsupported overnight HRV response. Existing readings were kept.","overnight HRV");
      hrvs.push(...records(value?.hrvSummaries??[],"overnight HRV"));coverage.hrv.push(...dates(chunk.start,chunk.end));
    });
  }
  // Fetch the explicitly named restingHeartRate; the batch restingValue can be a minimum instead.
  // Two requests at a time, newest first. Stop this optional stream on failure instead of making 28 failing calls.
  const pending=dates(start,end).reverse();let next=0,stopped=false;
  async function dailyWorker(){while(!stopped && next<pending.length){const date=pending[next++];const ok=await optional(async()=>{
    const value=await json("/usersummary-service/usersummary/daily?"+new URLSearchParams({calendarDate:date}),auth);
    if(value!==null){records([value],"resting heart rate");if(value.calendarDate!==date)throw new GarminRequestError("Garmin returned a mismatched summary date. Existing readings were kept.","resting heart rate");summaries.push(value);}
    coverage.restingHeartRate.push(date);
  });if(!ok)stopped=true;}}
  await Promise.all([dailyWorker(),dailyWorker()]);
  const nights = normalizeGarmin(sleeps,hrvs,summaries,start,end);
  let activitySyncVersion: number | undefined;
  await optional(async()=>{
    const activities = await fetchGarminActivities(path => json(path, auth), start, end);
    const daily = normalizeGarminActivities(activities, summaries, start, end);
    const byDate = new Map(nights.map(n => [n.sleepDate, n]));
    for (const day of daily) {
      if (!byDate.has(day.sleepDate)) {const row = {sleepDate:day.sleepDate,source:"garmin",scoreKind:"native"};nights.push(row);byDate.set(day.sleepDate,row);}
      Object.assign(byDate.get(day.sleepDate)!,day);
    }
    coverage.workouts = dates(start,end);
    activitySyncVersion = 1;
  },false);
  return {nights,coverage,warnings,complete:warnings.length===0,...(activitySyncVersion ? {activitySyncVersion} : {})};
}
