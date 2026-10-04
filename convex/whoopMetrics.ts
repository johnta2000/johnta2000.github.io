// Keep WHOOP's sleep/recovery day and activity day distinct: recovery follows its sleep ID;
// strain follows cycle start, and workouts follow their local start date.
export function dateAtOffset(value: string, offset = "+00:00") {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  const minutes = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString().slice(0, 10);
}
export function buildWhoopDays(sleeps: any[], recoveries: any[], cycles: any[], workouts: any[], scopes: string, now = Date.now()) {
  const granted = new Set(scopes.split(/\s+/));
  const fields = [
    ...(granted.has("read:recovery") ? ["recovery", "hrv", "restingHeartRate"] : []),
    ...(granted.has("read:cycles") ? ["strain"] : []),
    ...(granted.has("read:workout") ? ["workoutMinutes", "workoutCount"] : []),
  ];
  const days = new Map<string, any>();
  const get = (date: string) => { if (!days.has(date)) days.set(date, {sleepDate: date}); return days.get(date); };
  const sleepById = new Map(sleeps.filter(s => !s.nap).map(s => [s.id, s]));
  for (const sleep of sleepById.values()) get(dateAtOffset(sleep.end, sleep.timezone_offset));
  for (const r of recoveries) {
    const sleep = sleepById.get(r.sleep_id);
    if (!sleep || r.score_state !== "SCORED" || r.score?.user_calibrating) continue;
    const day = get(dateAtOffset(sleep.end, sleep.timezone_offset));
    for (const [field, key] of [["recovery", "recovery_score"], ["hrv", "hrv_rmssd_milli"], ["restingHeartRate", "resting_heart_rate"]]) {
      if (Number.isFinite(r.score?.[key])) day[field] = r.score[key];
    }
  }
  // Only finished cycles qualify as complete activity days; ongoing day strain stays a gap.
  for (const cycle of [...cycles].sort((a,b) => a.start.localeCompare(b.start))) {
    if (!cycle.end || Date.parse(cycle.end) > now || cycle.score_state !== "SCORED") continue;
    const day = get(dateAtOffset(cycle.start, cycle.timezone_offset));
    if (Number.isFinite(cycle.score?.strain)) day.strain = cycle.score.strain;
    if (granted.has("read:workout")) { day.workoutMinutes = 0; day.workoutCount = 0; }
  }
  const seen = new Set<string>();
  const incompleteWorkoutDates = new Set<string>();
  for (const workout of workouts) {
    if (seen.has(workout.id)) continue;
    if (workout.score_state !== "SCORED" || !workout.end) { incompleteWorkoutDates.add(dateAtOffset(workout.start, workout.timezone_offset)); continue; }
    seen.add(workout.id);
    const duration = (Date.parse(workout.end) - Date.parse(workout.start)) / 60_000;
    if (!Number.isFinite(duration) || duration <= 0 || Date.parse(workout.end) > now) continue;
    const day = get(dateAtOffset(workout.start, workout.timezone_offset));
    day.workoutMinutes = (day.workoutMinutes || 0) + duration;
    day.workoutCount = (day.workoutCount || 0) + 1;
  }
  for (const date of incompleteWorkoutDates) { const day = get(date); delete day.workoutMinutes; delete day.workoutCount; }
  return {fields, days: [...days.values()]};
}
