import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync connected WHOOP accounts",
  { hours: 6 },
  internal.whoop.syncAll,
);

crons.interval(
  "sync affilignment meeting notes",
  { hours: 1 },
  internal.standups.syncRecentFathomAffilignment,
);

export default crons;
