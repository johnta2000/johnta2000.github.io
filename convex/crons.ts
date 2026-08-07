import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync connected WHOOP accounts",
  { hours: 6 },
  internal.whoop.syncAll,
);

crons.daily(
  "sync affilignment meeting notes at 10:30am PT",
  { hourUTC: 17, minuteUTC: 30 },
  internal.standups.syncRecentFathomAffilignment,
);

crons.daily(
  "sync affilignment meeting notes at 11am PT",
  { hourUTC: 18, minuteUTC: 0 },
  internal.standups.syncRecentFathomAffilignment,
);

export default crons;
