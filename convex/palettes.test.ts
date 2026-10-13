/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ISSUER = "https://actual-squirrel-9784.clerk.accounts.dev";

async function signedIn(subject: string) {
  const t = convexTest(schema, modules);
  const as = t.withIdentity({ subject, issuer: ISSUER });
  const userId = await as.mutation(api.users.store, {});
  return { t, as, userId };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("palettes", () => {
  it("creates a palette with a trimmed name and empty lists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as, userId } = await signedIn("a");

    const id = await as.mutation(api.palettes.create, { name: "  Ultramarines  " });

    const rows = await t.run((ctx) => ctx.db.query("palettes").collect());
    expect(rows).toHaveLength(1);
    const { _id, _creationTime, ...fields } = rows[0];
    expect(_id).toBe(id);
    expect(_creationTime).toEqual(expect.any(Number));
    expect(fields).toEqual({
      userId,
      name: "Ultramarines",
      paintIds: [],
      groups: [],
      updatedAt: 1_000,
    });
  });

  it("rejects blank and over-long names", async () => {
    const { t, as } = await signedIn("a");

    await expect(as.mutation(api.palettes.create, { name: "" })).rejects.toThrow(
      "PALETTE_NAME_INVALID",
    );
    await expect(as.mutation(api.palettes.create, { name: "   " })).rejects.toThrow(
      "PALETTE_NAME_INVALID",
    );
    await expect(as.mutation(api.palettes.create, { name: "x".repeat(61) })).rejects.toThrow(
      "PALETTE_NAME_INVALID",
    );
    expect(await t.run((ctx) => ctx.db.query("palettes").collect())).toHaveLength(0);

    await as.mutation(api.palettes.create, { name: "x".repeat(60) });
    const rows = await t.run((ctx) => ctx.db.query("palettes").collect());
    expect(rows.map((r) => r.name)).toEqual(["x".repeat(60)]);
  });

  it("rejects the 51st palette", async () => {
    const { t, as } = await signedIn("a");
    for (let i = 1; i <= 50; i++) {
      await as.mutation(api.palettes.create, { name: `Palette ${i}` });
    }

    await expect(as.mutation(api.palettes.create, { name: "Palette 51" })).rejects.toThrow(
      "PALETTE_LIMIT",
    );
    expect(await t.run((ctx) => ctx.db.query("palettes").collect())).toHaveLength(50);
  });

  it("renames and deletes own palettes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });

    vi.setSystemTime(2_000);
    expect(
      await as.mutation(api.palettes.rename, { paletteId: id, name: " Ultramarines 2nd Co. " }),
    ).toBeNull();
    const renamed = await as.query(api.palettes.get, { paletteId: id });
    expect(renamed).toMatchObject({ _id: id, name: "Ultramarines 2nd Co.", updatedAt: 2_000 });

    expect(await as.mutation(api.palettes.remove, { paletteId: id })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("palettes").collect())).toHaveLength(0);
    expect(await as.query(api.palettes.get, { paletteId: id })).toBeNull();
  });

  it("rejects blank and over-long names on rename", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });

    vi.setSystemTime(2_000);
    for (const name of ["", "   ", "x".repeat(61)]) {
      await expect(as.mutation(api.palettes.rename, { paletteId: id, name })).rejects.toThrow(
        "PALETTE_NAME_INVALID",
      );
    }
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      name: "Ultramarines",
      updatedAt: 1_000,
    });

    await as.mutation(api.palettes.rename, { paletteId: id, name: "x".repeat(60) });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ name: "x".repeat(60) });
  });

  it("keeps users' palettes apart", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as: asA, userId: a } = await signedIn("a");
    const asB = t.withIdentity({ subject: "b", issuer: ISSUER });
    await asB.mutation(api.users.store, {});
    const aId = await asA.mutation(api.palettes.create, { name: "A's palette" });
    const bId = await asB.mutation(api.palettes.create, { name: "B's palette" });

    expect(await asB.query(api.palettes.get, { paletteId: aId })).toBeNull();
    await expect(
      asB.mutation(api.palettes.rename, { paletteId: aId, name: "Taken" }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(asB.mutation(api.palettes.remove, { paletteId: aId })).rejects.toThrow(
      "NOT_FOUND",
    );

    const aRow = await t.run((ctx) => ctx.db.get(aId));
    expect(aRow).toMatchObject({ userId: a, name: "A's palette", updatedAt: 1_000 });
    expect((await asA.query(api.palettes.listMine, {})).map((p) => p._id)).toEqual([aId]);
    expect((await asB.query(api.palettes.listMine, {})).map((p) => p._id)).toEqual([bId]);
  });

  it("get returns null for a malformed ID", async () => {
    const { as } = await signedIn("a");

    expect(await as.query(api.palettes.get, { paletteId: "not-an-id" })).toBeNull();
  });

  it("rejects unauthenticated calls", async () => {
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });

    await expect(t.query(api.palettes.listMine, {})).rejects.toThrow("UNAUTHENTICATED");
    await expect(t.query(api.palettes.get, { paletteId: id })).rejects.toThrow("UNAUTHENTICATED");
    await expect(t.mutation(api.palettes.create, { name: "Blood Angels" })).rejects.toThrow(
      "UNAUTHENTICATED",
    );
    await expect(
      t.mutation(api.palettes.rename, { paletteId: id, name: "Blood Angels" }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(t.mutation(api.palettes.remove, { paletteId: id })).rejects.toThrow(
      "UNAUTHENTICATED",
    );
    const rows = await t.run((ctx) => ctx.db.query("palettes").collect());
    expect(rows.map((r) => r.name)).toEqual(["Ultramarines"]);
  });

  it("lists palettes newest-updated first with counts and preview", async () => {
    vi.useFakeTimers();
    const { t, as } = await signedIn("a");
    vi.setSystemTime(1_000);
    const oldest = await as.mutation(api.palettes.create, { name: "Oldest" });
    vi.setSystemTime(2_000);
    const newest = await as.mutation(api.palettes.create, { name: "Newest" });
    vi.setSystemTime(3_000);
    const middle = await as.mutation(api.palettes.create, { name: "Middle" });
    const seven = ["p-1", "p-2", "p-3", "p-4", "p-5", "p-6", "p-7"];
    await t.run(async (ctx) => {
      await ctx.db.patch(newest, { paintIds: seven, updatedAt: 5_000 });
      await ctx.db.patch(middle, { paintIds: ["p-9", "p-8"], updatedAt: 4_000 });
    });

    expect(await as.query(api.palettes.listMine, {})).toEqual([
      {
        _id: newest,
        name: "Newest",
        paintCount: 7,
        previewPaintIds: ["p-1", "p-2", "p-3", "p-4", "p-5"],
        updatedAt: 5_000,
      },
      {
        _id: middle,
        name: "Middle",
        paintCount: 2,
        previewPaintIds: ["p-9", "p-8"],
        updatedAt: 4_000,
      },
      { _id: oldest, name: "Oldest", paintCount: 0, previewPaintIds: [], updatedAt: 1_000 },
    ]);
  });

  it("adds paints to the end without duplicates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    await t.run((ctx) => ctx.db.patch(id, { paintIds: ["p-1", "p-2"] }));

    vi.setSystemTime(2_000);
    const result = await as.mutation(api.palettes.addPaints, {
      paletteId: id,
      paintIds: ["p-4", "p-2", "p-3", "p-4", "p-1"],
    });

    expect(result).toEqual({ added: 2 });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      paintIds: ["p-1", "p-2", "p-4", "p-3"],
      updatedAt: 2_000,
    });
  });

  it("rejects an add past 200 paints", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    const full = Array.from({ length: 199 }, (_, i) => `p-${i}`);
    await t.run((ctx) => ctx.db.patch(id, { paintIds: full }));

    vi.setSystemTime(2_000);
    await expect(
      as.mutation(api.palettes.addPaints, { paletteId: id, paintIds: ["new-1", "new-2"] }),
    ).rejects.toThrow("PALETTE_FULL");
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      paintIds: full,
      updatedAt: 1_000,
    });

    expect(
      await as.mutation(api.palettes.addPaints, { paletteId: id, paintIds: ["new-1"] }),
    ).toEqual({ added: 1 });
    expect((await t.run((ctx) => ctx.db.get(id)))?.paintIds).toEqual([...full, "new-1"]);

    const other = await as.mutation(api.palettes.create, { name: "Blood Angels" });
    await expect(
      as.mutation(api.palettes.addPaints, {
        paletteId: other,
        paintIds: Array.from({ length: 201 }, () => "p-1"),
      }),
    ).rejects.toThrow("PALETTE_FULL");
    expect((await t.run((ctx) => ctx.db.get(other)))?.paintIds).toEqual([]);
  });

  it("accepts exactly 200 paints in one call", async () => {
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    const twoHundred = Array.from({ length: 200 }, (_, i) => `p-${i}`);

    expect(
      await as.mutation(api.palettes.addPaints, { paletteId: id, paintIds: twoHundred }),
    ).toEqual({ added: 200 });
    expect((await t.run((ctx) => ctx.db.get(id)))?.paintIds).toEqual(twoHundred);
  });

  it("leaves the palette untouched when every paint is already in it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    await t.run((ctx) => ctx.db.patch(id, { paintIds: ["p-1", "p-2"] }));

    vi.setSystemTime(2_000);
    expect(
      await as.mutation(api.palettes.addPaints, { paletteId: id, paintIds: ["p-2", "p-1"] }),
    ).toEqual({ added: 0 });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      paintIds: ["p-1", "p-2"],
      updatedAt: 1_000,
    });
  });

  it("rejects malformed paint IDs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });

    vi.setSystemTime(2_000);
    for (const bad of ["Bad ID!", ""]) {
      await expect(
        as.mutation(api.palettes.addPaints, { paletteId: id, paintIds: ["p-1", bad] }),
      ).rejects.toThrow("INVALID_PAINT_ID");
      await expect(
        as.mutation(api.palettes.removePaint, { paletteId: id, paintId: bad }),
      ).rejects.toThrow("INVALID_PAINT_ID");
    }
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      paintIds: [],
      updatedAt: 1_000,
    });
  });

  it("removes a paint from the main list and every group", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    await t.run((ctx) =>
      ctx.db.patch(id, {
        paintIds: ["p-1", "p-2", "p-3", "p-4"],
        groups: [
          { id: "g-1", name: "Armour", paintIds: ["p-3", "p-2", "p-1"] },
          { id: "g-2", name: "Trim", paintIds: ["p-4", "p-2"] },
          { id: "g-3", name: "Base", paintIds: ["p-4"] },
        ],
      }),
    );

    vi.setSystemTime(2_000);
    expect(
      await as.mutation(api.palettes.removePaint, { paletteId: id, paintId: "p-2" }),
    ).toBeNull();

    const expected = {
      paintIds: ["p-1", "p-3", "p-4"],
      groups: [
        { id: "g-1", name: "Armour", paintIds: ["p-3", "p-1"] },
        { id: "g-2", name: "Trim", paintIds: ["p-4"] },
        { id: "g-3", name: "Base", paintIds: ["p-4"] },
      ],
    };
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ ...expected, updatedAt: 2_000 });

    vi.setSystemTime(3_000);
    expect(
      await as.mutation(api.palettes.removePaint, { paletteId: id, paintId: "p-9" }),
    ).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ ...expected, updatedAt: 2_000 });
  });

  it("removes a paint that is only in a group", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    await t.run((ctx) =>
      ctx.db.patch(id, {
        paintIds: ["p-1"],
        groups: [{ id: "g-1", name: "Armour", paintIds: ["p-1", "p-5"] }],
      }),
    );

    vi.setSystemTime(2_000);
    await as.mutation(api.palettes.removePaint, { paletteId: id, paintId: "p-5" });

    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      paintIds: ["p-1"],
      groups: [{ id: "g-1", name: "Armour", paintIds: ["p-1"] }],
      updatedAt: 2_000,
    });
  });

  it("keeps add and remove to the owner", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as: asA, userId: a } = await signedIn("a");
    const asB = t.withIdentity({ subject: "b", issuer: ISSUER });
    await asB.mutation(api.users.store, {});
    const aId = await asA.mutation(api.palettes.create, { name: "A's palette" });
    await t.run((ctx) => ctx.db.patch(aId, { paintIds: ["p-1", "p-2"] }));

    vi.setSystemTime(2_000);
    await expect(
      asB.mutation(api.palettes.addPaints, { paletteId: aId, paintIds: ["p-3"] }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      asB.mutation(api.palettes.removePaint, { paletteId: aId, paintId: "p-1" }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      t.mutation(api.palettes.addPaints, { paletteId: aId, paintIds: ["p-3"] }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      t.mutation(api.palettes.removePaint, { paletteId: aId, paintId: "p-1" }),
    ).rejects.toThrow("UNAUTHENTICATED");

    expect(await t.run((ctx) => ctx.db.get(aId))).toMatchObject({
      userId: a,
      paintIds: ["p-1", "p-2"],
      updatedAt: 1_000,
    });
  });

  it("leaves the palette untouched when a group is renamed to its own name", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    const armor = await as.mutation(api.palettes.createGroup, { paletteId: id, name: "Armor" });

    vi.setSystemTime(2_000);
    await as.mutation(api.palettes.renameGroup, { paletteId: id, groupId: armor, name: " Armor " });

    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      groups: [{ id: armor, name: "Armor" }],
      updatedAt: 1_000,
    });
  });

  it("creates, renames and removes groups", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    await t.run((ctx) => ctx.db.patch(id, { paintIds: ["p-1", "p-2"] }));

    vi.setSystemTime(2_000);
    const armour = await as.mutation(api.palettes.createGroup, {
      paletteId: id,
      name: "  Armour  ",
    });
    vi.setSystemTime(3_000);
    const trim = await as.mutation(api.palettes.createGroup, { paletteId: id, name: "Trim" });

    expect(armour).toEqual(expect.any(String));
    expect(armour).not.toBe("");
    expect(trim).not.toBe(armour);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      paintIds: ["p-1", "p-2"],
      groups: [
        { id: armour, name: "Armour", paintIds: [] },
        { id: trim, name: "Trim", paintIds: [] },
      ],
      updatedAt: 3_000,
    });

    await t.run(async (ctx) => {
      const row = await ctx.db.get(id);
      await ctx.db.patch(id, {
        groups: row!.groups.map((g) => (g.id === armour ? { ...g, paintIds: ["p-2"] } : g)),
      });
    });

    vi.setSystemTime(4_000);
    expect(
      await as.mutation(api.palettes.renameGroup, {
        paletteId: id,
        groupId: armour,
        name: " Power Armour ",
      }),
    ).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      groups: [
        { id: armour, name: "Power Armour", paintIds: ["p-2"] },
        { id: trim, name: "Trim", paintIds: [] },
      ],
      updatedAt: 4_000,
    });

    vi.setSystemTime(5_000);
    expect(
      await as.mutation(api.palettes.removeGroup, { paletteId: id, groupId: armour }),
    ).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      paintIds: ["p-1", "p-2"],
      groups: [{ id: trim, name: "Trim", paintIds: [] }],
      updatedAt: 5_000,
    });
  });

  it("caps groups and checks group names", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    const thirty = Array.from({ length: 30 }, (_, i) => ({
      id: `g-${i}`,
      name: `Group ${i}`,
      paintIds: [],
    }));
    await t.run((ctx) => ctx.db.patch(id, { groups: thirty }));

    vi.setSystemTime(2_000);
    await expect(
      as.mutation(api.palettes.createGroup, { paletteId: id, name: "Group 31" }),
    ).rejects.toThrow("GROUP_LIMIT");
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      groups: thirty,
      updatedAt: 1_000,
    });

    const other = await as.mutation(api.palettes.create, { name: "Blood Angels" });
    await t.run((ctx) =>
      ctx.db.patch(other, {
        groups: [{ id: "g-1", name: "Armour", paintIds: [] }],
        updatedAt: 1_000,
      }),
    );
    for (const name of ["", "   ", "x".repeat(61)]) {
      await expect(
        as.mutation(api.palettes.createGroup, { paletteId: other, name }),
      ).rejects.toThrow("GROUP_NAME_INVALID");
      await expect(
        as.mutation(api.palettes.renameGroup, { paletteId: other, groupId: "g-1", name }),
      ).rejects.toThrow("GROUP_NAME_INVALID");
    }
    expect(await t.run((ctx) => ctx.db.get(other))).toMatchObject({
      groups: [{ id: "g-1", name: "Armour", paintIds: [] }],
      updatedAt: 1_000,
    });

    await as.mutation(api.palettes.renameGroup, {
      paletteId: other,
      groupId: "g-1",
      name: "x".repeat(60),
    });
    const sixty = await as.mutation(api.palettes.createGroup, {
      paletteId: other,
      name: "y".repeat(60),
    });
    expect((await t.run((ctx) => ctx.db.get(other)))?.groups).toEqual([
      { id: "g-1", name: "x".repeat(60), paintIds: [] },
      { id: sixty, name: "y".repeat(60), paintIds: [] },
    ]);
  });

  it("adds a paint to groups only from the main list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    await t.run((ctx) =>
      ctx.db.patch(id, {
        paintIds: ["p-1", "p-2"],
        groups: [
          { id: "g-1", name: "Armour", paintIds: ["p-2"] },
          { id: "g-2", name: "Trim", paintIds: [] },
        ],
      }),
    );

    vi.setSystemTime(2_000);
    expect(
      await as.mutation(api.palettes.addPaintToGroup, {
        paletteId: id,
        groupId: "g-1",
        paintId: "p-1",
      }),
    ).toBeNull();
    await as.mutation(api.palettes.addPaintToGroup, {
      paletteId: id,
      groupId: "g-2",
      paintId: "p-1",
    });
    const expected = {
      paintIds: ["p-1", "p-2"],
      groups: [
        { id: "g-1", name: "Armour", paintIds: ["p-2", "p-1"] },
        { id: "g-2", name: "Trim", paintIds: ["p-1"] },
      ],
    };
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ ...expected, updatedAt: 2_000 });

    vi.setSystemTime(3_000);
    expect(
      await as.mutation(api.palettes.addPaintToGroup, {
        paletteId: id,
        groupId: "g-1",
        paintId: "p-1",
      }),
    ).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ ...expected, updatedAt: 2_000 });

    await expect(
      as.mutation(api.palettes.addPaintToGroup, { paletteId: id, groupId: "g-2", paintId: "p-9" }),
    ).rejects.toThrow("PAINT_NOT_IN_PALETTE");
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ ...expected, updatedAt: 2_000 });
  });

  it("moves and removes paints between groups", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    await t.run((ctx) =>
      ctx.db.patch(id, {
        paintIds: ["p-1", "p-2", "p-3"],
        groups: [
          { id: "g-1", name: "Armour", paintIds: ["p-1", "p-2", "p-3"] },
          { id: "g-2", name: "Trim", paintIds: ["p-3"] },
        ],
      }),
    );

    vi.setSystemTime(2_000);
    expect(
      await as.mutation(api.palettes.movePaintToGroup, {
        paletteId: id,
        paintId: "p-1",
        fromGroupId: "g-1",
        toGroupId: "g-2",
      }),
    ).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      paintIds: ["p-1", "p-2", "p-3"],
      groups: [
        { id: "g-1", name: "Armour", paintIds: ["p-2", "p-3"] },
        { id: "g-2", name: "Trim", paintIds: ["p-3", "p-1"] },
      ],
      updatedAt: 2_000,
    });

    vi.setSystemTime(3_000);
    await as.mutation(api.palettes.movePaintToGroup, {
      paletteId: id,
      paintId: "p-3",
      fromGroupId: "g-1",
      toGroupId: "g-2",
    });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      groups: [
        { id: "g-1", name: "Armour", paintIds: ["p-2"] },
        { id: "g-2", name: "Trim", paintIds: ["p-3", "p-1"] },
      ],
      updatedAt: 3_000,
    });

    vi.setSystemTime(4_000);
    expect(
      await as.mutation(api.palettes.removePaintFromGroup, {
        paletteId: id,
        groupId: "g-2",
        paintId: "p-3",
      }),
    ).toBeNull();
    const expected = {
      paintIds: ["p-1", "p-2", "p-3"],
      groups: [
        { id: "g-1", name: "Armour", paintIds: ["p-2"] },
        { id: "g-2", name: "Trim", paintIds: ["p-1"] },
      ],
    };
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ ...expected, updatedAt: 4_000 });

    vi.setSystemTime(5_000);
    expect(
      await as.mutation(api.palettes.removePaintFromGroup, {
        paletteId: id,
        groupId: "g-2",
        paintId: "p-3",
      }),
    ).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ ...expected, updatedAt: 4_000 });
  });

  it("leaves the palette untouched when a move has nothing to move", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as } = await signedIn("a");
    const id = await as.mutation(api.palettes.create, { name: "Ultramarines" });
    const groups = [
      { id: "g-1", name: "Armour", paintIds: ["p-1"] },
      { id: "g-2", name: "Trim", paintIds: [] },
    ];
    await t.run((ctx) => ctx.db.patch(id, { paintIds: ["p-1", "p-2"], groups }));

    vi.setSystemTime(2_000);
    const move = (paintId: string, fromGroupId: string, toGroupId: string) =>
      as.mutation(api.palettes.movePaintToGroup, { paletteId: id, paintId, fromGroupId, toGroupId });
    expect(await move("p-2", "g-1", "g-2")).toBeNull();
    expect(await move("p-9", "g-1", "g-2")).toBeNull();
    expect(await move("p-1", "g-1", "g-1")).toBeNull();

    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      paintIds: ["p-1", "p-2"],
      groups,
      updatedAt: 1_000,
    });
  });

  it("keeps group changes to the owner", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { t, as: asA, userId: a } = await signedIn("a");
    const asB = t.withIdentity({ subject: "b", issuer: ISSUER });
    await asB.mutation(api.users.store, {});
    const aId = await asA.mutation(api.palettes.create, { name: "A's palette" });
    const aRow = {
      userId: a,
      paintIds: ["p-1", "p-2"],
      groups: [
        { id: "g-1", name: "Armour", paintIds: ["p-1"] },
        { id: "g-2", name: "Trim", paintIds: [] },
      ],
      updatedAt: 1_000,
    };
    await t.run((ctx) => ctx.db.patch(aId, aRow));

    vi.setSystemTime(2_000);
    const paletteId = aId;
    const allSix = (caller: typeof asB) => [
      () => caller.mutation(api.palettes.createGroup, { paletteId, name: "Taken" }),
      () => caller.mutation(api.palettes.renameGroup, { paletteId, groupId: "g-1", name: "Taken" }),
      () => caller.mutation(api.palettes.removeGroup, { paletteId, groupId: "g-1" }),
      () =>
        caller.mutation(api.palettes.addPaintToGroup, {
          paletteId,
          groupId: "g-2",
          paintId: "p-2",
        }),
      () =>
        caller.mutation(api.palettes.removePaintFromGroup, {
          paletteId,
          groupId: "g-1",
          paintId: "p-1",
        }),
      () =>
        caller.mutation(api.palettes.movePaintToGroup, {
          paletteId,
          paintId: "p-1",
          fromGroupId: "g-1",
          toGroupId: "g-2",
        }),
    ];
    for (const call of allSix(asB)) {
      await expect(call()).rejects.toThrow("NOT_FOUND");
    }
    for (const call of allSix(t)) {
      await expect(call()).rejects.toThrow("UNAUTHENTICATED");
    }

    await expect(
      asA.mutation(api.palettes.renameGroup, { paletteId: aId, groupId: "g-9", name: "New" }),
    ).rejects.toThrow("GROUP_NOT_FOUND");
    await expect(
      asA.mutation(api.palettes.removeGroup, { paletteId: aId, groupId: "g-9" }),
    ).rejects.toThrow("GROUP_NOT_FOUND");
    await expect(
      asA.mutation(api.palettes.addPaintToGroup, {
        paletteId: aId,
        groupId: "g-9",
        paintId: "p-2",
      }),
    ).rejects.toThrow("GROUP_NOT_FOUND");
    await expect(
      asA.mutation(api.palettes.removePaintFromGroup, {
        paletteId: aId,
        groupId: "g-9",
        paintId: "p-1",
      }),
    ).rejects.toThrow("GROUP_NOT_FOUND");
    await expect(
      asA.mutation(api.palettes.movePaintToGroup, {
        paletteId: aId,
        paintId: "p-1",
        fromGroupId: "g-9",
        toGroupId: "g-2",
      }),
    ).rejects.toThrow("GROUP_NOT_FOUND");
    await expect(
      asA.mutation(api.palettes.movePaintToGroup, {
        paletteId: aId,
        paintId: "p-1",
        fromGroupId: "g-1",
        toGroupId: "g-9",
      }),
    ).rejects.toThrow("GROUP_NOT_FOUND");

    await expect(
      asA.mutation(api.palettes.addPaintToGroup, {
        paletteId: aId,
        groupId: "g-2",
        paintId: "Bad ID!",
      }),
    ).rejects.toThrow("INVALID_PAINT_ID");
    await expect(
      asA.mutation(api.palettes.removePaintFromGroup, {
        paletteId: aId,
        groupId: "g-1",
        paintId: "Bad ID!",
      }),
    ).rejects.toThrow("INVALID_PAINT_ID");
    await expect(
      asA.mutation(api.palettes.movePaintToGroup, {
        paletteId: aId,
        paintId: "Bad ID!",
        fromGroupId: "g-1",
        toGroupId: "g-2",
      }),
    ).rejects.toThrow("INVALID_PAINT_ID");

    expect(await t.run((ctx) => ctx.db.get(aId))).toMatchObject({ ...aRow, name: "A's palette" });
  });
});
