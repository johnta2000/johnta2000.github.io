var RallyEvents = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // convex/rallyEventLifecycle.ts
  var rallyEventLifecycle_exports = {};
  __export(rallyEventLifecycle_exports, {
    configureLifecycle: () => configureLifecycle,
    lifecycle: () => lifecycle,
    localInstant: () => localInstant,
    zoneFor: () => zoneFor
  });
  var zones = {
    "lost-lands-2026": "America/New_York",
    "edc-las-vegas-2027": "America/Los_Angeles",
    "btsm-kai-wachi-block-party-2026": "America/Los_Angeles",
    "midnight-carnival-rl-grime-2026": "America/Los_Angeles",
    "niteharts-festival-2026": "America/Los_Angeles",
    "decadence-digital-city-2026": "America/Denver"
  };
  function zoneFor(event) {
    return event.eventTimeZone || zones[event.id] || null;
  }
  function localInstant(local, zone) {
    const target = Date.parse(local + "Z");
    if (!Number.isFinite(target)) return NaN;
    let result = target;
    for (let i = 0; i < 4; i++) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(result)).map((p) => [p.type, p.value]));
      const actual = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
      const delta = target - actual;
      if (!delta) return result;
      result += delta;
    }
    return result;
  }
  function lifecycle(event, now = Date.now()) {
    const zone = zoneFor(event);
    let end = Number(event.eventEndAt) || 0;
    if (!end && zone && /^\d{4}-\d{2}-\d{2}$/.test(event.endsAt || "")) {
      const lastDay = (event.lineup || []).filter((s) => (s.festivalDate || s.date) === event.endsAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.end || ""));
      const latest = lastDay.map((s) => s.end).sort().at(-1);
      const next = new Date(Date.parse(event.endsAt + "T00:00Z") + 864e5).toISOString().slice(0, 10);
      try {
        end = localInstant(latest || next + "T06:00", zone);
      } catch {
        end = 0;
      }
    }
    const finished = !!end && now >= end;
    const past = event.eventVisibility === "past" || event.eventVisibility !== "active" && finished && now >= end + 48 * 36e5;
    return { past, finished, endAt: end || null, automaticPastAt: end ? end + 48 * 36e5 : null, timeZone: zone };
  }
  function configureLifecycle(state, p, current) {
    if (!["admin", "leader"].includes(current.role)) throw new Error("Only an admin can manage event history.");
    if (!["auto", "past", "active"].includes(p.visibility)) throw new Error("Choose a valid event status.");
    const zone = String(p.timeZone || "");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
    } catch {
      throw new Error("Enter a valid event timezone, such as America/New_York.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.endsAt || "") || !Number.isFinite(Date.parse(p.endsAt + "T00:00Z")) || (/* @__PURE__ */ new Date(p.endsAt + "T00:00Z")).toISOString().slice(0, 10) !== p.endsAt || p.endsAt < state.startsAt) throw new Error("Choose a valid final event day.");
    Object.assign(state, { eventVisibility: p.visibility, eventTimeZone: zone, endsAt: p.endsAt });
    delete state.eventEndAt;
  }
  return __toCommonJS(rallyEventLifecycle_exports);
})();
