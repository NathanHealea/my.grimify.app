import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import crons from "./crons";

describe("crons", () => {
  it("crons register a daily purge", () => {
    const purgeJobs = Object.values(crons.crons).filter(
      (job) => job.name === getFunctionName(internal.legacyImports.purgeExpired),
    );

    expect(purgeJobs).toHaveLength(1);
    expect(purgeJobs[0].args).toEqual([{}]);
    expect(purgeJobs[0].schedule).toEqual({ type: "interval", hours: 24 });
  });
});
