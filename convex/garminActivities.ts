import {GarminRequestError, isoDate} from "./garminClient";

// Personal API SummarizedActivityDTO: duration is timer time, elapsedDuration includes pauses.
// Date filters and daily attribution both use the activity's local start date.
export function normalizeGarminActivities(activities: any[], summaries: any[], start: string, end: string) {
  const days = new Map<string, {sleepDate: string; workoutMinutes: number; workoutCount: number}>();
  const get = (date: string) => {
    if (!days.has(date)) days.set(date, {sleepDate: date, workoutMinutes: 0, workoutCount: 0});
    return days.get(date)!;
  };
  // A successful empty activity search is not proof of watch coverage. Only dated Garmin
  // summaries establish rest days; today stays unknown until an activity is recorded.
  for (const summary of summaries) {
    const date = isoDate(summary.calendarDate);
    if (String(summary.source).toLowerCase() === "garmin" && date >= start && date < end) get(date);
  }
  const seen = new Map<number, string>();
  for (const activity of activities) {
    if (!activity || typeof activity !== "object" || !Number.isSafeInteger(activity.activityId) || activity.activityId <= 0)
      throw new GarminRequestError("Garmin returned an unsupported activity record. Previous workout totals were kept.", "workouts");
    // Multisport parents include their legs. Never count both.
    if (typeof activity.parentId === "number" && activity.parentId > 0) continue;
    let date: string;
    try {
      if (typeof activity.startTimeLocal !== "string" || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(activity.startTimeLocal)) throw Error();
      date = isoDate(activity.startTimeLocal.slice(0, 10));
    } catch { throw new GarminRequestError("Garmin returned an invalid workout date. Previous workout totals were kept.", "workouts"); }
    if (date < start || date > end) continue;
    const seconds = activity.duration;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0)
      throw new GarminRequestError("Garmin omitted a workout's timer duration. Previous workout totals were kept.", "workouts");
    const signature = JSON.stringify([date, seconds]);
    if (seen.has(activity.activityId)) {
      if (seen.get(activity.activityId) !== signature) throw new GarminRequestError("Garmin activities changed during import. Previous workout totals were kept; sync again.", "workouts");
      continue;
    }
    seen.set(activity.activityId, signature);
    const day = get(date);
    day.workoutMinutes += seconds / 60;
    day.workoutCount++;
  }
  return [...days.values()];
}

export async function fetchGarminActivities(json: (path: string) => Promise<any>, start: string, end: string) {
  const activities: any[] = [];
  const limit = 99;
  const pages = new Set<string>();
  for (let offset = 0; offset < 9900; offset += limit) {
    const value = await json("/activitylist-service/activities/search/activities?" + new URLSearchParams({start: String(offset), limit: String(limit), startDate: start, endDate: end, excludeChildren: "true", sortOrder: "asc"}));
    if (!Array.isArray(value)) throw new GarminRequestError("Garmin returned an unsupported workouts response. Previous workout totals were kept.", "workouts");
    const signature = JSON.stringify(value.map(a => a?.activityId));
    if (value.length && pages.has(signature)) throw new GarminRequestError("Garmin repeated an activity page. Previous workout totals were kept; sync again.", "workouts");
    pages.add(signature);
    activities.push(...value);
    if (value.length < limit) return activities;
  }
  throw new GarminRequestError("Garmin returned too many activities for one sync. Previous workout totals were kept.", "workouts");
}
