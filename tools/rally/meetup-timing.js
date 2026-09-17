// Generated from convex/meetupTiming.ts. Run node scripts/build-meetup-timing.mjs.
var RallyMeetupTiming = (() => {
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

  // convex/meetupTiming.ts
  var meetupTiming_exports = {};
  __export(meetupTiming_exports, {
    availableNextSets: () => availableNextSets,
    resolveMeetupTiming: () => resolveMeetupTiming
  });
  var stamp = (value) => Date.parse(value + "Z");
  function resolveMeetupTiming(input, sets) {
    if (!input || !["before", "after", "between"].includes(input.mode)) throw new Error("Choose before, after, or between sets.");
    const first = sets.find((set) => set.id === input.setId);
    if (!first) throw new Error("Choose a set from this festival\u2019s lineup.");
    const minutes = input.minutes;
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0 || minutes > 120) throw new Error("Choose an offset from 0 to 120 minutes.");
    const snapshot = (set) => ({ id: set.id, artist: set.artist, day: set.day, festivalDate: set.festivalDate, stage: set.stage, start: set.start, end: set.end });
    let time, label, next;
    if (input.mode === "between") {
      next = sets.find((set) => set.id === input.nextSetId);
      if (!next || next.id === first.id || next.festivalDate !== first.festivalDate) throw new Error("Choose two different sets on the same festival day.");
      const gap = (stamp(next.start) - stamp(first.end)) / 6e4;
      if (gap < 0) throw new Error("Those sets overlap or are in reverse order. Choose a later second set.");
      if (minutes > gap) throw new Error("That meetup time is after the second set starts. Choose a smaller offset.");
      time = stamp(first.end) + minutes * 6e4;
      label = `Between ${first.artist} and ${next.artist}`;
    } else {
      time = stamp(input.mode === "before" ? first.start : first.end) + (input.mode === "before" ? -1 : 1) * minutes * 6e4;
      label = minutes ? `${minutes} min ${input.mode} ${first.artist}` : `At ${first.artist}\u2019s ${input.mode === "before" ? "start" : "end"}`;
    }
    if (!Number.isFinite(time)) throw new Error("This set is missing its scheduled time.");
    const when = new Date(time).toISOString().slice(0, 16);
    return { when, timing: { mode: input.mode, setId: first.id, ...next ? { nextSetId: next.id } : {}, minutes, label, sets: [snapshot(first), ...next ? [snapshot(next)] : []] } };
  }
  function availableNextSets(firstId, sets) {
    const first = sets.find((set) => set.id === firstId);
    return first ? sets.filter((set) => set.id !== first.id && set.festivalDate === first.festivalDate && stamp(set.start) >= stamp(first.end)) : [];
  }
  return __toCommonJS(meetupTiming_exports);
})();
