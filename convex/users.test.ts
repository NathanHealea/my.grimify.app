/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { DELETE_BATCH } from "./users";

const modules = import.meta.glob("./**/*.ts");
const ISSUER = "https://actual-squirrel-9784.clerk.accounts.dev";

describe("users", () => {
  it("stores one user per identity", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "a", issuer: ISSUER });

    const first = await asA.mutation(api.users.store, {});
    const second = await asA.mutation(api.users.store, {});

    expect(second).toBe(first);
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    const { _id, _creationTime, ...fields } = rows[0];
    expect(_id).toBe(first);
    expect(_creationTime).toEqual(expect.any(Number));
    expect(fields).toEqual({ tokenIdentifier: `${ISSUER}|a` });
  });

  it("keeps identities apart", async () => {
    const t = convexTest(schema, modules);
    const a = await t.withIdentity({ subject: "a", issuer: ISSUER }).mutation(api.users.store, {});
    const b = await t.withIdentity({ subject: "b", issuer: ISSUER }).mutation(api.users.store, {});

    expect(b).not.toBe(a);
  });

  it("rejects unauthenticated calls", async () => {
    const t = convexTest(schema, modules);

    await expect(t.mutation(api.users.store, {})).rejects.toThrow("UNAUTHENTICATED");
  });

  it("returns only the caller from me", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "a", issuer: ISSUER });
    const asB = t.withIdentity({ subject: "b", issuer: ISSUER });

    expect(await t.query(api.users.me, {})).toBeNull();
    const id = await asA.mutation(api.users.store, {});
    expect(await asA.query(api.users.me, {})).toEqual({ _id: id });
    expect(await asB.query(api.users.me, {})).toBeNull();
  });

  it("deletes the caller's data and nobody else's", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "a", issuer: ISSUER });
    const asB = t.withIdentity({ subject: "b", issuer: ISSUER });
    await asA.mutation(api.users.store, {});
    const b = await asB.mutation(api.users.store, {});
    await asA.mutation(api.userPaints.set, { paintId: "p-red", owned: true, clientUpdatedAt: 1 });
    await asA.mutation(api.userPaints.set, {
      paintId: "p-blue",
      wishlisted: true,
      clientUpdatedAt: 2,
    });
    await asA.mutation(api.userPaints.set, {
      paintId: "p-green",
      favorite: true,
      clientUpdatedAt: 3,
    });
    await asA.mutation(api.userPaints.set, { paintId: "p-grey", owned: true, clientUpdatedAt: 4 });
    await asA.mutation(api.userPaints.set, { paintId: "p-grey", owned: false, clientUpdatedAt: 5 });
    await asB.mutation(api.userPaints.set, { paintId: "p-red", owned: true, clientUpdatedAt: 6 });
    await asB.mutation(api.userPaints.set, { paintId: "p-blue", owned: false, clientUpdatedAt: 7 });

    expect(await asA.mutation(api.users.deleteAccount, {})).toBeNull();

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users.map((u) => u._id)).toEqual([b]);
    const rows = await t.run((ctx) => ctx.db.query("userPaints").collect());
    expect(rows.map(({ userId, paintId }) => ({ userId, paintId }))).toEqual([
      { userId: b, paintId: "p-red" },
      { userId: b, paintId: "p-blue" },
    ]);
    expect(await asA.query(api.users.me, {})).toBeNull();
    expect(await asB.query(api.users.me, {})).toEqual({ _id: b });
  });

  it("deletes the caller's palettes with the account and nobody else's", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "a", issuer: ISSUER });
    const asB = t.withIdentity({ subject: "b", issuer: ISSUER });
    await asA.mutation(api.users.store, {});
    const b = await asB.mutation(api.users.store, {});
    await asA.mutation(api.palettes.create, { name: "Ultramarines" });
    await asA.mutation(api.palettes.create, { name: "Necrons" });
    await asB.mutation(api.palettes.create, { name: "Orks" });
    const before = await t.run((ctx) => ctx.db.query("palettes").collect());
    const bPalettes = before.filter((p) => p.userId === b);

    await asA.mutation(api.users.deleteAccount, {});

    const after = await t.run((ctx) => ctx.db.query("palettes").collect());
    expect(after).toEqual(bPalettes);
    expect(after.map((p) => p.name)).toEqual(["Orks"]);
  });

  it("deletes large collections in batches", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const asA = t.withIdentity({ subject: "a", issuer: ISSUER });
      const a = await asA.mutation(api.users.store, {});
      const count = DELETE_BATCH * 2 + 1;
      await t.run(async (ctx) => {
        for (let i = 0; i < count; i++) {
          await ctx.db.insert("userPaints", {
            userId: a,
            paintId: `p-${String(i).padStart(4, "0")}`,
            owned: true,
            wishlisted: false,
            updatedAt: i,
          });
        }
      });

      await asA.mutation(api.users.deleteAccount, {});
      // One batch per transaction: the rest is left to scheduled mutations.
      const afterFirst = await t.run((ctx) => ctx.db.query("userPaints").collect());
      expect(afterFirst).toHaveLength(count - DELETE_BATCH);
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const remaining = await t.run((ctx) => ctx.db.query("userPaints").collect());
      expect(remaining).toHaveLength(0);
      expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects signed-out callers and is safe to retry", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "a", issuer: ISSUER });

    await expect(t.mutation(api.users.deleteAccount, {})).rejects.toThrow("UNAUTHENTICATED");
    expect(await asA.mutation(api.users.deleteAccount, {})).toBeNull();
  });
});
