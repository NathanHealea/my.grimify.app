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
});
