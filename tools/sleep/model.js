/* Pure, source-aware calculations shared by the dashboard and its regression tests. */
(function (root) {
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  function dateShift(date, amount) {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + amount);
    return value.toISOString().slice(0, 10);
  }
  function range(rows, days, endDate) {
    const start = dateShift(endDate, 1 - days);
    return rows.filter(
      (row) => row.sleepDate >= start && row.sleepDate <= endDate,
    );
  }
  function value(row, metric) {
    if (metric === "score" && row.scoreKind !== "native") return undefined;
    if (metric === "restorativeMinutes")
      return finite(row.deepMinutes) && finite(row.remMinutes)
        ? row.deepMinutes + row.remMinutes
        : undefined;
    return finite(row[metric]) ? row[metric] : undefined;
  }
  function mean(values) {
    const valid = values.filter(finite);
    return valid.length
      ? valid.reduce((a, b) => a + b, 0) / valid.length
      : null;
  }
  function stats(rows, metric, days, endDate, source = "whoop") {
    const own = rows.filter((row) => row.source === source);
    const current = range(own, days, endDate)
      .map((row) => value(row, metric))
      .filter(finite);
    const previous = range(own, days, dateShift(endDate, -days))
      .map((row) => value(row, metric))
      .filter(finite);
    const avg = mean(current),
      prev = mean(previous);
    return {
      average: avg,
      previous: prev,
      delta: avg !== null && prev !== null ? avg - prev : null,
      count: current.length,
      previousCount: previous.length,
    };
  }
  function matchedDevices(rows, days, endDate) {
    const grouped = new Map();
    range(rows, days, endDate).forEach((row) => {
      if (
        !finite(row.durationMinutes) ||
        !["whoop", "apple_health"].includes(row.source)
      )
        return;
      if (!grouped.has(row.sleepDate)) grouped.set(row.sleepDate, {});
      grouped.get(row.sleepDate)[row.source] = row.durationMinutes;
    });
    const pairs = [...grouped.values()].filter(
      (row) => finite(row.whoop) && finite(row.apple_health),
    );
    return {
      count: pairs.length,
      whoop: mean(pairs.map((row) => row.whoop)),
      apple: mean(pairs.map((row) => row.apple_health)),
      difference: mean(pairs.map((row) => row.apple_health - row.whoop)),
    };
  }
  function stages(row) {
    if (
      !row ||
      !finite(row.durationMinutes) ||
      row.durationMinutes <= 0 ||
      !finite(row.deepMinutes) ||
      !finite(row.remMinutes)
    )
      return null;
    const light = row.durationMinutes - row.deepMinutes - row.remMinutes;
    if (light < 0 || row.deepMinutes < 0 || row.remMinutes < 0) return null;
    return [
      { label: "Light", minutes: light, color: "#bfd0b9" },
      { label: "Deep", minutes: row.deepMinutes, color: "#648877" },
      { label: "REM", minutes: row.remMinutes, color: "#c6bfd8" },
    ];
  }
  function duration(minutes) {
    if (!finite(minutes)) return "—";
    const rounded = Math.round(minutes);
    return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, "0")}m`;
  }
  function sample(endDate) {
    const nights = [],
      alertness = [];
    for (let i = 0; i < 98; i++) {
      const sleepDate = dateShift(endDate, i - 97);
      const score = Math.round(
        79 + Math.sin(i * 1.8) * 9 + Math.cos(i * 0.37) * 7,
      );
      const minutes = Math.round(
        430 + Math.sin(i * 1.8) * 44 + Math.cos(i * 0.37) * 28,
      );
      const deepMinutes = Math.round(minutes * 0.19),
        remMinutes = Math.round(minutes * 0.24);
      nights.push({
        sleepDate,
        source: "whoop",
        score,
        scoreKind: "native",
        durationMinutes: minutes,
        efficiency: 91 + (i % 7),
        hrv: Math.round(60 + Math.sin(i * .45) * 14),
        restingHeartRate: Math.round(55 - Math.sin(i * .45) * 5),
        deepMinutes,
        remMinutes,
        asleepAt: `${dateShift(sleepDate, -1)}T23:12:00-07:00`,
        wokeAt: `${sleepDate}T07:18:00-07:00`,
      });
      if (i % 11 !== 3) nights.push({sleepDate,source:"eightsleep",scoreKind:"native",score:Math.min(100,score+4),durationMinutes:minutes+18,hrv:Math.round(65+Math.sin(i*.45+.2)*13),restingHeartRate:Math.round(57-Math.sin(i*.45+.2)*4)});
      if (i % 9 !== 2)
        nights.push({
          sleepDate,
          source: "apple_health",
          score: 88,
          scoreKind: "derived",
          durationMinutes: minutes + (i % 5) * 6 - 7,
        });
      if (i % 6 !== 0 && i < 97)
        alertness.push({
          ratingDate: sleepDate,
          score: Math.min(
            10,
            Math.max(1, Math.round(score / 12 + Math.sin(i) * 2)),
          ),
          note: "",
          updatedAt: new Date(`${sleepDate}T19:00:00Z`).getTime(),
        });
    }
    Object.assign(
      nights.find((row) => row.sleepDate === endDate && row.source === "whoop"),
      {
        score: 89,
        durationMinutes: 462,
        deepMinutes: 86,
        remMinutes: 112,
        efficiency: 95,
      },
    );
    const latestApple = nights.find(
      (row) => row.sleepDate === endDate && row.source === "apple_health",
    );
    if (latestApple) latestApple.durationMinutes = 474;
    return { nights, alertness };
  }
  // Receives separate, already-authorized member histories; this is not an access-control layer.
  const metrics = {
    durationMinutes: {label: "Time asleep", unit: "min"}, score: {label: "Sleep performance", unit: "%"},
    efficiency: {label: "Sleep efficiency", unit: "%"}, deepMinutes: {label: "Deep sleep", unit: "min"},
    remMinutes: {label: "REM sleep", unit: "min"}, consistency: {label: "Sleep consistency", unit: "%"},
    recovery: {label: "Recovery", unit: "%"}, hrv: {label: "HRV", unit: "ms"},
    restingHeartRate: {label: "Resting heart rate", unit: "bpm"}, strain: {label: "Day strain", unit: "/21"},
    workoutMinutes: {label: "Workout time", unit: "min"}, workoutCount: {label: "Workouts", unit: "workouts"},
  };
  const competitions = {
    score: {label: "Sleep performance", metric: "score", mode: "average", description: "Average sleep performance. At least 4 of 7 days to rank."},
    recovery: {label: "Recovery", metric: "recovery", mode: "average", description: "Average recovery score. At least 4 of 7 days to rank."},
    consistency: {label: "Sleep consistency", metric: "consistency", mode: "average", description: "Average WHOOP sleep consistency. At least 4 of 7 days to rank."},
    strain: {label: "Day strain", metric: "strain", mode: "average", description: "Average completed-day strain. At least 4 of 7 days. Measures effort, not overall health."},
    workoutMinutes: {label: "Workout minutes", metric: "workoutMinutes", mode: "total", description: "Total workout time. All 7 days must be tracked to rank; rest days count as zero."},
    sleepGain: {label: "Sleep improvement", metric: "score", mode: "delta", description: "Sleep performance change vs. your previous 7 days. At least 4 days in each week."},
    hrvGain: {label: "HRV improvement", metric: "hrv", mode: "percentChange", description: "HRV change vs. your own previous 7 days. At least 4 days in each week; requires 14 days of sharing."},
  };
  function standings(members, category, today) {
    const rule = competitions[category] || competitions.score, end = dateShift(today, -1);
    const entries = members.map(member => {
      const unique = [...new Map(member.nights.filter(n => n.source === "whoop").map(n => [n.sleepDate, n])).values()];
      const data = stats(unique, rule.metric, 7, end);
      const shared = !member.metrics || member.metrics.includes(rule.metric);
      const baseline = ["delta", "percentChange"].includes(rule.mode);
      const eligible = shared && data.count >= (rule.mode === "total" ? 7 : 4) && (!baseline || data.previousCount >= 4) && (rule.mode !== "percentChange" || data.previous > 0);
      const raw = !eligible ? null : rule.mode === "total" ? data.average * data.count : rule.mode === "delta" ? data.delta : rule.mode === "percentChange" ? data.delta / data.previous * 100 : data.average;
      // Rank at displayed precision, with competition-style ties (1, 1, 3).
      const result = raw === null ? null : rule.mode === "total" ? Math.round(raw) : Math.round(raw * 10) / 10;
      return {...member, ...data, result, eligible, reason: !shared ? "Not shared" : baseline && data.previousCount < 4 ? "Needs previous-week history" : "Needs more tracked days"};
    }).sort((a,b) => Number(b.eligible) - Number(a.eligible) || (b.result ?? 0) - (a.result ?? 0) || a.name.localeCompare(b.name));
    let rank = 0;
    entries.forEach((entry,index) => { if (entry.eligible) { if (index === 0 || entry.result !== entries[index - 1].result) rank = index + 1; entry.rank = rank; }});
    return {entries, rule, start: dateShift(end, -6), end};
  }
  function groupHistory(members, metric, days, endDate) {
    const dates = Array.from({ length: days }, (_, i) => dateShift(endDate, i - days + 1));
    return { dates, members: members.map((member) => {
      const byDate = new Map(member.nights.filter(row => row.source === "whoop").map(row => [row.sleepDate, row]));
      const nights = [...byDate.values()];
      const points = dates.map(date => ({ date, value: byDate.has(date) ? value(byDate.get(date), metric) : undefined }));
      const segments = [];
      let segment = [];
      points.forEach((point, index) => {
        if (finite(point.value)) segment.push({ ...point, index });
        else if (segment.length) { segments.push(segment); segment = []; }
      });
      if (segment.length) segments.push(segment);
      return { id: member.id, name: member.name, color: member.color, dash: member.dash, points, segments, ...stats(nights, metric, days, endDate) };
    }) };
  }
  function sampleGroup(endDate) {
    return [
      { id: "you", name: "You (sample)", color: "#397967", dash: "" },
      { id: "alex", name: "Alex (sample)", color: "#b66b3d", dash: "7 4" },
      { id: "morgan", name: "Morgan (sample)", color: "#7c6da7", dash: "2 5" },
    ].map((member, person) => ({ ...member, nights: Array.from({ length: 180 }, (_, i) => ({
      sleepDate: dateShift(endDate, i - 179), source: "whoop", scoreKind: "native",
      durationMinutes: Math.round(433 + person * 15 + Math.sin(i * .8 + person * 2) * 43 + Math.cos(i * .21 + person) * 21),
      score: Math.round(78 + person * 3 + Math.sin(i * .8 + person * 2) * 12),
      efficiency: Math.round(91 + Math.sin(i * .55 + person) * 5),
      deepMinutes: Math.round(85 + Math.sin(i * .4 + person) * 22),
      remMinutes: Math.round(100 + Math.sin(i * .6 + person) * 28),
      consistency: Math.round(78 + person * 3 + Math.cos(i * .3) * 9),
      recovery: Math.round(64 + person * 4 + Math.sin(i * .5 + person) * 24),
      hrv: Math.round(45 + person * 18 + Math.sin(i * .2 + person) * 12),
      restingHeartRate: Math.round(57 + person * 3 + Math.cos(i * .2) * 5),
      strain: Math.round((10 + Math.sin(i * .8 + person) * 5) * 10) / 10,
      workoutMinutes: i % 3 === person ? 0 : 35 + (i % 4) * 12,
      workoutCount: i % 3 === person ? 0 : 1,

    })).filter((_, i) => (i + person * 3) % (13 + person * 4) !== 5) }));
  }
  // Synced recovery readings take precedence only for WHOOP on the same date.
  // Imported sources keep their own measurements and native score provenance.
  function providerHistory(nights, whoopDays, days, endDate) {
    const dates = Array.from({length: days}, (_, i) => dateShift(endDate, i - days + 1));
    const byDate = new Map(dates.map(date => [date, {}]));
    for (const night of nights) {
      if (!byDate.has(night.sleepDate)) continue;
      byDate.get(night.sleepDate)[night.source] = {...night};
    }
    for (const day of whoopDays) {
      if (!byDate.has(day.sleepDate)) continue;
      const providers = byDate.get(day.sleepDate);
      providers.whoop ||= {sleepDate: day.sleepDate, source: "whoop"};
      for (const metric of ["hrv", "restingHeartRate"])
        if (finite(day[metric])) providers.whoop[metric] = day[metric];
    }
    return {dates, rows: dates.map(date => byDate.get(date))};
  }
  const api = {
    providerHistory,
    metrics, competitions, standings,
    groupHistory,
    sampleGroup,
    range,
    stats,
    matchedDevices,
    stages,
    duration,
    sample,
    value,
    mean,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Daylight = api;
})(typeof window !== "undefined" ? window : globalThis);
