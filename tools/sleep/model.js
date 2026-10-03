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
  const api = {
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
