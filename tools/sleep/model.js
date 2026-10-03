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
        deepMinutes,
        remMinutes,
        asleepAt: `${dateShift(sleepDate, -1)}T23:12:00-07:00`,
        wokeAt: `${sleepDate}T07:18:00-07:00`,
      });
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
    })).filter((_, i) => (i + person * 3) % (13 + person * 4) !== 5) }));
  }
  const api = {
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
