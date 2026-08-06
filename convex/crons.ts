import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync connected WHOOP accounts",
  { hours: 6 },
  internal.whoop.syncAll,
);

export default crons;
