// Fictional review fixture. Every layout reads the same seven days.
export const dates = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'];
export const weekdays = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'];
export const dateLabel = i => weekdays[i] + ', Nov ' + (19 + i);

export const metrics = {
  sleep: { label: 'Time asleep', short: 'Sleep', average: 'Average per night', minimum: 4 },
  score: { label: 'Sleep score', short: 'Score', average: 'Average score', minimum: 4 },
  recovery: { label: 'Recovery', short: 'Recovery', average: 'Average recovery', minimum: 4 },
  workout: { label: 'Workout time', short: 'Workouts', average: 'Week total', minimum: 7 }
};
export const metricKeys = Object.keys(metrics);

const people = [
  ['You', 'WHOOP', [438,451,442,425,461,469,452], [57,69,73,70,76,64,72], [0,69,50,0,80,42,33]],
  ['Alexandria', 'WHOOP', [482,467,455,478,464,450,471], [76,80,79,84,81,72,74], [28,0,35,20,0,42,38]],
  ['Morgan', 'Eight Sleep', [449,465,438,452,460,442,456], null, null],
  ['Jordan', 'WHOOP', [412,391,437,506,452,402,438], [60,72,55,68,60,62,64], [62,90,52,0,80,105,77]],
  ['Priya', 'Garmin', [473,488,483,465,484,492,null], null, [41,0,45,32,58,0,70]],
  ['Avery', 'Apple Health', [437,446,null,415,429,445,450], null, [62,0,75,45,61,0,58]],
  ['Taylor', 'WHOOP', [406,427,441,456,435,420,410], [80,77,84,92,80,88,88], [22,null,0,32,40,0,37]],
  ['Camila', 'Garmin', [null,null,null,453,466,473,480], null, [null,null,null,26,0,33,40]],
  ['Sam', 'WHOOP', [458,454,476,468,null,474,457], [71,77,67,72,null,75,81], [0,39,0,47,25,47,5]],
  ['Riley', 'Eight Sleep', Array(7).fill(null), null, null]
];
export const members = people.map(([name, provider, sleep, recovery, workout], index) => {
  const missing = () => Array(7).fill(null);
  const score = sleep.map((v, day) => v === null || provider === 'Apple Health' ? null :
    Math.min(97, Math.max(61, Math.round(82 + (v - 448) * .19 + ((day + 7 + index) % 3 - 1) * 2))));
  return {id:name.toLowerCase(), name, provider, private:name==='Riley', readings:{sleep, score, recovery:recovery ?? missing(), workout:workout ?? missing()}};
});
export const memberById = Object.fromEntries(members.map(p => [p.id, p]));

export function format(key, value) {
  if (!Number.isFinite(value)) return '—';
  if (key === 'score') return String(value);
  if (key === 'recovery') return value + '%';
  const minutes = Math.round(value);
  return minutes < 60 ? minutes + 'm' : Math.floor(minutes / 60) + 'h ' + String(minutes % 60).padStart(2,'0') + 'm';
}
export function difference(key, value) {
  if (key === 'score' || key === 'recovery') return Number(value.toFixed(1)) + ' pts';
  return format(key, value);
}
export function gapReason(row, key, day = false) {
  if (row.person.private) return 'Private';
  if (row.count === 0) return 'No readings';
  if (day) return 'Missing';
  return row.count + '/' + metrics[key].minimum + ' days needed';
}

function rank(rows, direction = -1) {
  rows.sort((a,b) => (a.value === null) - (b.value === null) ||
    direction * ((a.value ?? 0) - (b.value ?? 0)) || a.person.name.localeCompare(b.person.name));
  const eligible = rows.filter(r => r.value !== null).length;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    r.rank = r.value === null ? null : i && r.value === rows[i-1].value ? rows[i-1].rank : i+1;
    r.eligible = eligible;
  }
  return rows;
}

function weeklyRows(key) {
  return rank(members.map(person => {
    const series = person.readings[key];
    const observed = series.filter(Number.isFinite);
    const count = observed.length;
    const sum = observed.reduce((a,b) => a+b, 0);
    const avg = count ? sum / count : null;
    const precision = ['sleep','workout'].includes(key) ? 1 : 10;
    const value = count < metrics[key].minimum ? null : key === 'workout' ? sum : Math.round(avg * precision) / precision;
    const low = count ? Math.min(...observed) : null;
    const high = count ? Math.max(...observed) : null;
    return {person, series, count, value, low, high, avg, span:count ? high-low : null};
  }));
}
export const weekly = Object.fromEntries(metricKeys.map(k => [k, weeklyRows(k)]));
export const byPerson = Object.fromEntries(metricKeys.map(k => [k, Object.fromEntries(weekly[k].map(r => [r.person.id,r]))]));
export const nightly = Object.fromEntries(metricKeys.map(k => [k, dates.map((_, day) =>
  rank(weekly[k].map(r => ({...r, value:r.series[day]}))))]));
export function spreadRows(key) {
  return rank(weekly[key].map(r => ({...r, value:r.value === null ? null : r.span})), 1);
}
export const directions = [
  {id:'split', name:'Split scoreboard', short:'Two leaderboards, side by side.', prompt:'Find the same friend in two independently ranked lists.', detail:'Pick a name in either list to follow them in both.'},
  {id:'sheet', name:'Rank sheet', short:'Four ranks on one row per friend.', prompt:'See where each friend stands across all four metrics.', detail:'Select a column to sort. Select a name for their exact readings.'},
  {id:'daily', name:'Daily movers', short:'See who climbed since yesterday.', prompt:'Pick a date to see its standings and the change in places.', detail:'Each day has its own standings. Movement compares two consecutive days.'},
  {id:'profile', name:'Rank profile', short:'One person across four metrics.', prompt:'Follow a named friend across four different rankings.', detail:'Each point is a weekly place. A gap means no qualifying rank for that metric.'},
  {id:'range', name:'Highs & lows', short:'See whose week was most consistent.', prompt:'Compare each person’s shortest and longest readings.', detail:'Shorter bars mean a narrower range. The dot marks the average of the recorded days.'},
  {id:'chase', name:'Chasing first', short:'See how far each friend is from first.', prompt:'See the leader and the exact gap for everyone behind.', detail:'The gap is the difference from the leading weekly value. Tied leaders have zero gap.'}
];
export const designById = Object.fromEntries(directions.map(d => [d.id, d]));
