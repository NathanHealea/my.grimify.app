/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const HASH = "0123456789abcdef".repeat(4);
const OTHER_HASH = "fedcba9876543210".repeat(4);

type Group = { name: string; paintIds: string[] };

function palette(name: string, paintIds: string[] = [], groups: Group[] = []) {
  return { name, paintIds, groups };
}

function rows(t: TestConvex<typeof schema>) {
  return t.run((ctx) => ctx.db.query("legacyImports").collect());
}

afterEach(() => {
  vi.useRealTimers();
});

describe("legacyImports.stageChunk", () => {
  it("stageChunk builds a row across chunks and marks it complete", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.legacyImports.stageChunk, {
        emailHash: HASH,
        reset: false,
        done: false,
        ownedPaintIds: ["citadel-base-abaddon-black"],
        palettes: [],
      }),
    ).rejects.toThrow("NOT_STAGED");
    expect(await rows(t)).toHaveLength(0);

    expect(
      await t.mutation(internal.legacyImports.stageChunk, {
        emailHash: HASH,
        reset: true,
        done: false,
        ownedPaintIds: ["citadel-base-abaddon-black", "citadel-base-mephiston-red"],
        palettes: [palette("Ultramarines", ["citadel-base-macragge-blue"])],
      }),
    ).toBe("staged");
    expect((await rows(t)).map((r) => r.complete)).toEqual([false]);

    vi.setSystemTime(2_000);
    expect(
      await t.mutation(internal.legacyImports.stageChunk, {
        emailHash: HASH,
        reset: false,
        done: false,
        ownedPaintIds: ["vallejo-model-color-flat-blue"],
        palettes: [
          palette(
            "Blood Angels",
            ["citadel-base-mephiston-red"],
            [{ name: "Armour", paintIds: ["citadel-base-mephiston-red"] }],
          ),
        ],
      }),
    ).toBe("staged");

    vi.setSystemTime(3_000);
    expect(
      await t.mutation(internal.legacyImports.stageChunk, {
        emailHash: HASH,
        reset: false,
        done: true,
        ownedPaintIds: ["army-painter-matt-black"],
        palettes: [palette("Necrons")],
      }),
    ).toBe("staged");

    const all = await rows(t);
    expect(all).toHaveLength(1);
    const { _id, _creationTime, ...fields } = all[0];
    expect(_id).toEqual(expect.any(String));
    expect(_creationTime).toEqual(expect.any(Number));
    expect(fields).toEqual({
      emailHash: HASH,
      ownedPaintIds: [
        "citadel-base-abaddon-black",
        "citadel-base-mephiston-red",
        "vallejo-model-color-flat-blue",
        "army-painter-matt-black",
      ],
      palettes: [
        palette("Ultramarines", ["citadel-base-macragge-blue"]),
        palette(
          "Blood Angels",
          ["citadel-base-mephiston-red"],
          [{ name: "Armour", paintIds: ["citadel-base-mephiston-red"] }],
        ),
        palette("Necrons"),
      ],
      palettesOmitted: 0,
      complete: true,
      loadedAt: 1_000,
    });
  });

  it("stageChunk with reset replaces an existing row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = convexTest(schema, modules);

    await t.mutation(internal.legacyImports.stageChunk, {
      emailHash: HASH,
      reset: true,
      done: true,
      ownedPaintIds: ["citadel-base-abaddon-black"],
      palettes: [palette("Old", ["citadel-base-abaddon-black"])],
    });

    vi.setSystemTime(5_000);
    await t.mutation(internal.legacyImports.stageChunk, {
      emailHash: HASH,
      reset: true,
      done: false,
      ownedPaintIds: ["citadel-base-mephiston-red"],
      palettes: [palette("New", ["citadel-base-mephiston-red"])],
    });
    await t.mutation(internal.legacyImports.stageChunk, {
      emailHash: HASH,
      reset: false,
      done: true,
      ownedPaintIds: ["citadel-base-macragge-blue"],
      palettes: [],
    });

    const all = await rows(t);
    expect(all).toHaveLength(1);
    const { _id, _creationTime, ...fields } = all[0];
    expect(_id).toEqual(expect.any(String));
    expect(_creationTime).toEqual(expect.any(Number));
    expect(fields).toEqual({
      emailHash: HASH,
      ownedPaintIds: ["citadel-base-mephiston-red", "citadel-base-macragge-blue"],
      palettes: [palette("New", ["citadel-base-mephiston-red"])],
      palettesOmitted: 0,
      complete: true,
      loadedAt: 5_000,
    });
  });

  it("stageChunk skips claimed hashes", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("legacyImportClaims", { emailHash: HASH, claimedAt: 1_000 }),
    );

    expect(
      await t.mutation(internal.legacyImports.stageChunk, {
        emailHash: HASH,
        reset: true,
        done: true,
        ownedPaintIds: ["citadel-base-abaddon-black"],
        palettes: [palette("Ultramarines")],
      }),
    ).toBe("claimed");
    expect(
      await t.mutation(internal.legacyImports.stageChunk, {
        emailHash: HASH,
        reset: false,
        done: true,
        ownedPaintIds: ["citadel-base-mephiston-red"],
        palettes: [],
      }),
    ).toBe("claimed");
    expect(await rows(t)).toHaveLength(0);

    expect(
      await t.mutation(internal.legacyImports.stageChunk, {
        emailHash: OTHER_HASH,
        reset: true,
        done: true,
        ownedPaintIds: [],
        palettes: [],
      }),
    ).toBe("staged");
    expect((await rows(t)).map((r) => r.emailHash)).toEqual([OTHER_HASH]);
  });

  it("stageChunk rejects invalid input", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = convexTest(schema, modules);
    const base = {
      emailHash: HASH,
      reset: true,
      done: true,
      ownedPaintIds: [] as string[],
      palettes: [] as ReturnType<typeof palette>[],
    };
    const tooManyPaints = Array.from({ length: 201 }, (_, i) => `citadel-paint-${i}`);
    const tooManyGroups = Array.from({ length: 31 }, (_, i) => ({
      name: `Group ${i}`,
      paintIds: [],
    }));

    const cases: [typeof base, string][] = [
      [{ ...base, emailHash: "abc" }, "INVALID_EMAIL_HASH"],
      [{ ...base, emailHash: HASH.toUpperCase() }, "INVALID_EMAIL_HASH"],
      [{ ...base, emailHash: HASH.slice(1) }, "INVALID_EMAIL_HASH"],
      [{ ...base, ownedPaintIds: ["Bad ID"] }, "INVALID_PAINT_ID"],
      [{ ...base, palettes: [palette("Ultramarines", ["Bad ID"])] }, "INVALID_PAINT_ID"],
      [
        {
          ...base,
          palettes: [
            palette("Ultramarines", ["citadel-a"], [{ name: "Armor", paintIds: ["citadel-b"] }]),
          ],
        },
        "GROUP_PAINT_NOT_IN_PALETTE",
      ],
      [
        {
          ...base,
          palettes: [
            palette(
              "Ultramarines",
              ["citadel-a"],
              [{ name: "Armor", paintIds: ["citadel-a", "citadel-a"] }],
            ),
          ],
        },
        "GROUP_PAINT_NOT_IN_PALETTE",
      ],
      [
        {
          ...base,
          palettes: [palette("Ultramarines", [], [{ name: "Armour", paintIds: ["Bad ID"] }])],
        },
        "INVALID_PAINT_ID",
      ],
      [{ ...base, palettes: [palette("   ")] }, "PALETTE_NAME_INVALID"],
      [{ ...base, palettes: [palette("x".repeat(61))] }, "PALETTE_NAME_INVALID"],
      [
        { ...base, palettes: [palette("Ultramarines", [], [{ name: "", paintIds: [] }])] },
        "GROUP_NAME_INVALID",
      ],
      [
        {
          ...base,
          palettes: [palette("Ultramarines", [], [{ name: "x".repeat(61), paintIds: [] }])],
        },
        "GROUP_NAME_INVALID",
      ],
      [{ ...base, palettes: [palette("Ultramarines", tooManyPaints)] }, "PALETTE_FULL"],
      [{ ...base, palettes: [palette("Ultramarines", [], tooManyGroups)] }, "GROUP_LIMIT"],
    ];

    for (const [args, code] of cases) {
      await expect(t.mutation(internal.legacyImports.stageChunk, args)).rejects.toThrow(code);
    }
    expect(await rows(t)).toHaveLength(0);

    await t.mutation(internal.legacyImports.stageChunk, {
      ...base,
      done: false,
      ownedPaintIds: ["citadel-base-abaddon-black", "citadel-base-mephiston-red"],
      palettes: [palette("  Ultramarines  ", [], [{ name: "  Armour  ", paintIds: [] }])],
    });
    const staged = await rows(t);

    vi.setSystemTime(2_000);
    for (const [args, code] of cases.slice(3)) {
      await expect(t.mutation(internal.legacyImports.stageChunk, args)).rejects.toThrow(code);
      await expect(
        t.mutation(internal.legacyImports.stageChunk, { ...args, reset: false }),
      ).rejects.toThrow(code);
    }
    expect(await rows(t)).toEqual(staged);

    await t.mutation(internal.legacyImports.stageChunk, {
      ...base,
      reset: false,
      ownedPaintIds: ["citadel-base-mephiston-red", "citadel-base-macragge-blue"],
    });
    const [row] = await rows(t);
    expect(row.ownedPaintIds).toEqual([
      "citadel-base-abaddon-black",
      "citadel-base-mephiston-red",
      "citadel-base-macragge-blue",
    ]);
    expect(row.palettes).toEqual([palette("Ultramarines", [], [{ name: "Armour", paintIds: [] }])]);
  });

  it("stageChunk keeps at most 50 palettes", async () => {
    const t = convexTest(schema, modules);
    const names = Array.from({ length: 60 }, (_, i) => `Palette ${i + 1}`);

    await t.mutation(internal.legacyImports.stageChunk, {
      emailHash: HASH,
      reset: true,
      done: false,
      ownedPaintIds: [],
      palettes: names.slice(0, 30).map((name) => palette(name)),
    });
    await t.mutation(internal.legacyImports.stageChunk, {
      emailHash: HASH,
      reset: false,
      done: true,
      ownedPaintIds: [],
      palettes: names.slice(30).map((name) => palette(name)),
    });

    const all = await rows(t);
    expect(all).toHaveLength(1);
    expect(all[0].palettes.map((p) => p.name)).toEqual(names.slice(0, 50));
    expect(all[0].palettesOmitted).toBe(10);
    expect(all[0].complete).toBe(true);
  });
});

describe("legacyImports.purgeExpired", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  function hashOf(i: number) {
    return i.toString(16).padStart(64, "0");
  }

  function stagedRow(emailHash: string, loadedAt: number, complete: boolean) {
    return { emailHash, ownedPaintIds: [], palettes: [], palettesOmitted: 0, complete, loadedAt };
  }

  it("purgeExpired deletes only rows past 180 days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("legacyImports", stagedRow(hashOf(1), NOW - 181 * DAY, true));
      await ctx.db.insert("legacyImports", stagedRow(hashOf(2), NOW - 181 * DAY, false));
      await ctx.db.insert("legacyImports", stagedRow(hashOf(3), NOW - 180 * DAY, true));
      await ctx.db.insert("legacyImports", stagedRow(hashOf(4), NOW - 179 * DAY, false));
      await ctx.db.insert("legacyImportClaims", {
        emailHash: hashOf(5),
        claimedAt: NOW - 181 * DAY,
      });
      await ctx.db.insert("legacyImportClaims", {
        emailHash: hashOf(6),
        claimedAt: NOW - 180 * DAY,
      });
      await ctx.db.insert("legacyImportClaims", {
        emailHash: hashOf(7),
        claimedAt: NOW - 179 * DAY,
      });
    });

    expect(await t.mutation(internal.legacyImports.purgeExpired, {})).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await rows(t)).map((r) => r.emailHash)).toEqual([hashOf(3), hashOf(4)]);
    const claims = await t.run((ctx) => ctx.db.query("legacyImportClaims").collect());
    expect(claims.map((c) => c.emailHash)).toEqual([hashOf(6), hashOf(7)]);
  });

  it("purgeExpired works in batches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 600; i++) {
        await ctx.db.insert("legacyImports", stagedRow(hashOf(i), NOW - 200 * DAY, i % 2 === 0));
        await ctx.db.insert("legacyImportClaims", {
          emailHash: hashOf(600 + i),
          claimedAt: NOW - 200 * DAY,
        });
      }
      await ctx.db.insert("legacyImports", stagedRow(hashOf(5_000), NOW - DAY, true));
    });
    const countAll = () =>
      t.run(async (ctx) => {
        const imports = await ctx.db.query("legacyImports").collect();
        const claims = await ctx.db.query("legacyImportClaims").collect();
        return imports.length + claims.length;
      });

    await t.mutation(internal.legacyImports.purgeExpired, {});
    expect(await countAll()).toBe(1_201 - 500);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await countAll()).toBe(1);
    expect((await rows(t)).map((r) => r.emailHash)).toEqual([hashOf(5_000)]);
  });
});
