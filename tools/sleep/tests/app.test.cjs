const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Daylight = require("../model.js");
function load() {
  const elements = new Map();
  const element = () => ({
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    dataset: {},
    children: [],
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    querySelectorAll() {
      return [];
    },
    replaceChildren() {},
    append() {},
    getBoundingClientRect() {
      return { width: 0, height: 0 };
    },
  });
  const context = vm.createContext({
    Daylight,
    URLSearchParams,
    location: { search: "" },
    setTimeout,
    clearTimeout,
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, element());
        return elements.get(selector);
      },
      querySelectorAll() {
        return [];
      },
      createElement: element,
    },
    window: {},
    console: { error() {} },
    fetch: async () => {
      throw new Error("Network access is forbidden in this test");
    },
  });
  vm.runInContext(
    fs
      .readFileSync(require.resolve("../app.js"), "utf8")
      .replace("init().catch((error) => showAuthError(error));", ""),
    context,
  );
  return { run: (code) => vm.runInContext(code, context), elements, context };
}
test("CSV duration is not divided by milliseconds just because an HRV field exists", () => {
  const app = load();
  const rows = app.run(
    `parseSleepExport('date,sleep_performance_percentage,duration_minutes,hrv_rmssd_milli\\n2026-10-03,89,462,65','whoop.csv')`,
  );
  assert.equal(rows[0].durationMinutes, 462);
  assert.equal(rows[0].hrv, 65);
});
test("an empty manual score is rejected instead of being imported as zero", () => {
  const app = load();
  app.elements.get("#manualDate").value = "2026-10-03";
  app.run("stageManualNight()");
  assert.match(app.elements.get("#importMessage").textContent, /score between/);
  assert.equal(app.run("stagedNights.length"), 0);
});
test("sample check-ins are ephemeral and external API actions are rejected", async () => {
  const app = load();
  app.run("isDemo=true; demoData={nights:[],alertness:[]}");
  await app.run(
    `convexCall('mutation','sleep:saveAlertness',{ratingDate:'2026-10-03',score:7})`,
  );
  assert.equal(app.run("demoData.alertness[0].score"), 7);
  await assert.rejects(
    app.run(`convexCall('action','whoop:beginConnect',{})`),
    /Sample workspace/,
  );
  await assert.rejects(
    app.run(`convexCall('mutation','sleep:importNights',{nights:[]})`),
    /Sample workspace/,
  );
});
test("ordinary API reads require an authenticated session", async () => {
  const app = load();
  await assert.rejects(
    app.run(`convexCall('query','sleep:dashboard',{})`),
    /Not authenticated/,
  );
});
test("load errors reveal a retry state and preserve current data", async () => {
  const app = load();
  app.run(
    `convexQuery=async()=>{throw new Error('Service unavailable')}; sleepNights=[{sleepDate:'2026-10-03',source:'whoop',score:89}]`,
  );
  await app.run("loadDashboard()");
  assert.equal(app.elements.get("#loadError").hidden, false);
  assert.equal(
    app.elements.get("#lastUpdated").textContent,
    "Could not refresh",
  );
  assert.equal(app.run("sleepNights.length"), 1);
});
test("empty dashboard renders missing values and source-aware empty states", () => {
  const app = load();
  app.elements.get("#app").hidden = true;
  app.run("renderDashboard()");
  assert.equal(app.elements.get("#latestScore").textContent, "—");
  assert.equal(app.elements.get("#historyEmpty").hidden, false);
  assert.match(
    app.elements.get("#deviceComparison").innerHTML,
    /No overlapping nights/,
  );
  assert.doesNotMatch(
    app.elements.get("#metricCards").innerHTML,
    /NaN|undefined/,
  );
});
test("Health import keeps midnight stages together, deduplicates overlap, skips WHOOP, and keeps main sleep over naps", () => {
  const app = load();
  const record = (startDate, endDate, value, sourceName = "Apple Watch") => ({
    getAttribute: (key) => ({ startDate, endDate, value, sourceName })[key],
  });
  const records = [
    record(
      "2026-10-02 23:00:00 -0700",
      "2026-10-02 23:40:00 -0700",
      "AsleepCore",
    ),
    record(
      "2026-10-02 23:40:00 -0700",
      "2026-10-03 01:00:00 -0700",
      "AsleepDeep",
    ),
    record(
      "2026-10-03 01:00:00 -0700",
      "2026-10-03 07:00:00 -0700",
      "AsleepREM",
    ),
    record("2026-10-02 23:00:00 -0700", "2026-10-03 07:00:00 -0700", "Asleep"),
    record("2026-10-03 13:00:00 -0700", "2026-10-03 14:00:00 -0700", "Asleep"),
    record(
      "2026-10-03 14:00:00 -0700",
      "2026-10-03 19:00:00 -0700",
      "Asleep",
      "WHOOP",
    ),
  ];
  app.context.DOMParser = class {
    parseFromString() {
      return {
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return records;
        },
      };
    }
  };
  const nights = app.run(`parseAppleHealthXml('<HealthData/>')`);
  assert.equal(nights.length, 1);
  assert.equal(nights[0].sleepDate, "2026-10-03");
  assert.equal(nights[0].durationMinutes, 480);
  assert.equal(nights[0].deepMinutes, 80);
  assert.equal(nights[0].source, "apple_health");
  assert.equal(nights[0].scoreKind, "derived");
});
