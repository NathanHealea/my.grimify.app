import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "purge expired legacy imports",
  { hours: 24 },
  internal.legacyImports.purgeExpired,
  {},
);

export default crons;
