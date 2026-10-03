const { test } = require("node:test");
const assert = require("node:assert/strict");
const model = require("../model.js");
const row = (sleepDate, source, durationMinutes, extra = {}) => ({
  sleepDate,
  source,
  durationMinutes,
  score: 80,
  scoreKind: "native",
  ...extra,
});
test("date windows use calendar days and exclude future records", () => {
  const rows = [
    row("2026-09-26", "whoop", 400),
    row("2026-09-27", "whoop", 420),
    row("2026-10-03", "whoop", 450),
    row("2026-10-04", "whoop", 480),
  ];
  assert.deepEqual(
    model.range(rows, 7, "2026-10-03").map((r) => r.sleepDate),
    ["2026-09-27", "2026-10-03"],
  );
});
test("WHOOP averages never blend Apple-derived scores or interpret missing scores as zero", () => {
  const rows = [
    row("2026-10-01", "whoop", 450),
    row("2026-10-02", "whoop", 420, { score: 100, scoreKind: "derived" }),
    row("2026-10-01", "apple_health", 500, { score: 100 }),
  ];
  const stats = model.stats(rows, "score", 7, "2026-10-03");
  assert.equal(stats.average, 80);
  assert.equal(stats.count, 1);
  assert.equal(stats.delta, null);
});
test("comparison periods are adjacent and use only observations in each period", () => {
  const rows = [
    row("2026-10-01", "whoop", 480),
    row("2026-09-26", "whoop", 420),
    row("2026-09-19", "whoop", 100),
  ];
  const stats = model.stats(rows, "durationMinutes", 7, "2026-10-03");
  assert.equal(stats.delta, 60);
  assert.equal(stats.previousCount, 1);
  assert.equal(stats.count, 1);
});
test("device comparisons use only matched nights with valid durations", () => {
  const rows = [
    row("2026-10-01", "whoop", 420),
    row("2026-10-01", "apple_health", 440),
    row("2026-10-02", "whoop", 900),
    row("2026-10-03", "apple_health", 50),
    row("2026-10-03", "whoop", undefined),
  ];
  assert.deepEqual(model.matchedDevices(rows, 7, "2026-10-03"), {
    count: 1,
    whoop: 420,
    apple: 440,
    difference: 20,
  });
});
test("no matched nights are missing, not zeros", () => {
  assert.deepEqual(model.matchedDevices([], 7, "2026-10-03"), {
    count: 0,
    whoop: null,
    apple: null,
    difference: null,
  });
  assert.equal(model.stats([], "score", 7, "2026-10-03").average, null);
});
test("restorative sleep requires both stage measurements", () => {
  assert.equal(
    model.value({ deepMinutes: 80 }, "restorativeMinutes"),
    undefined,
  );
  assert.equal(
    model.value({ deepMinutes: 0, remMinutes: 100 }, "restorativeMinutes"),
    100,
  );
});
test("invalid stage totals are not graphed as negative light sleep", () => {
  assert.equal(
    model.stages({ durationMinutes: 100, deepMinutes: 80, remMinutes: 80 }),
    null,
  );
  assert.equal(model.stages({ durationMinutes: 400 }), null);
  const stages = model.stages({
    durationMinutes: 400,
    deepMinutes: 80,
    remMinutes: 100,
  });
  assert.equal(
    stages.reduce((sum, stage) => sum + stage.minutes, 0),
    400,
  );
});
test("durations round across hour boundaries and preserve genuine zero", () => {
  assert.equal(model.duration(479.8), "8h 00m");
  assert.equal(model.duration(0), "0h 00m");
  assert.equal(model.duration(undefined), "—");
  assert.equal(model.duration(null), "—");
});
test("sample data is deterministic, separate, and covers all ranges with a previous period", () => {
  const first = model.sample("2026-10-03"),
    second = model.sample("2026-10-03");
  assert.deepEqual(first, second);
  first.nights[0].score = -1;
  assert.notEqual(first.nights[0].score, second.nights[0].score);
  assert.equal(model.stats(second.nights, "score", 90, "2026-10-03").count, 90);
  assert.equal(
    model.stats(second.nights, "score", 90, "2026-10-03").previousCount,
    8,
  );
});

test("group history separates people, sources, and calendar gaps", () => {
  const group = model.groupHistory([
    { id: "a", nights: [row("2026-10-01", "whoop", 420), row("2026-10-03", "whoop", 480), row("2026-10-03", "apple_health", 900)] },
    { id: "b", nights: [row("2026-10-03", "whoop", 600)] },
  ], "durationMinutes", 3, "2026-10-03");
  assert.equal(group.members[0].average, 450);
  assert.equal(group.members[1].average, 600);
  assert.equal(group.members[0].points[1].value, undefined);
  assert.equal(group.members[0].segments.length, 2);
  assert.equal(group.members[1].count, 1);
});

test("group baselines remain personal and missing history is never zero", () => {
  const group = model.groupHistory([
    { id: "a", nights: [row("2026-09-30", "whoop", 400), row("2026-10-03", "whoop", 460)] },
    { id: "b", nights: [row("2026-10-03", "whoop", 600)] },
  ], "durationMinutes", 3, "2026-10-03");
  assert.equal(group.members[0].delta, 60);
  assert.equal(group.members[1].delta, null);
  assert.equal(group.members[1].previousCount, 0);
  assert.deepEqual(model.groupHistory([], "score", 7, "2026-10-03").members, []);
});

test("group coverage counts unique dates and ignores derived WHOOP scores", () => {
  const group = model.groupHistory([{id:"a", nights:[
    row("2026-10-03", "whoop", 400), row("2026-10-03", "whoop", 460),
    row("2026-10-02", "whoop", 400, {scoreKind:"derived"}),
  ]}], "score", 7, "2026-10-03");
  assert.equal(group.members[0].count, 1);
  assert.equal(group.members[0].points[5].value, undefined);
});
