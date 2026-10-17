/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { hashEmail } from "./lib/emailHash";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ISSUER = "https://actual-squirrel-9784.clerk.accounts.dev";
const HASH_KEY = "made-up-legacy-import-hash-key-for-tests";
const CLERK_SECRET = "sk_test_fake";
const CLERK_USERS_URL = "https://api.clerk.com/v1/users/";
const MACRAGGE_BLUE = "citadel-base-macragge-blue";
const RED = "citadel-base-mephiston-red";

type T = TestConvex<typeof schema>;
type Address = { email_address: string; verification: { status: string } | null };
type Staged = Omit<Doc<"legacyImports">, "_id" | "_creationTime" | "emailHash">;

function verified(email: string): Address {
  return { email_address: email, verification: { status: "verified" } };
}

function unverified(email: string): Address {
  return { email_address: email, verification: { status: "unverified" } };
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (input instanceof Request) return input.url;
  return input instanceof URL ? input.href : input;
}

function stubClerk(users: Record<string, Address[]>) {
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = requestUrl(input);
    const id = decodeURIComponent(url.slice(CLERK_USERS_URL.length));
    const addresses = url.startsWith(CLERK_USERS_URL) ? users[id] : undefined;
    if (!addresses) {
      return Promise.resolve(Response.json({ errors: [{ code: "not_found" }] }, { status: 404 }));
    }
    return Promise.resolve(Response.json({ id, email_addresses: addresses }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function testPaints(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `test-paint-${String(i + 1).padStart(3, "0")}`);
}

async function stage(t: T, email: string, fields: Partial<Staged> = {}) {
  const emailHash = await hashEmail(email, HASH_KEY);
  await t.run((ctx) =>
    ctx.db.insert("legacyImports", {
      emailHash,
      ownedPaintIds: [],
      palettes: [],
      palettesOmitted: 0,
      complete: true,
      loadedAt: 1,
      ...fields,
    }),
  );
  return emailHash;
}

async function signedIn(t: T, subject: string) {
  const as = t.withIdentity({ subject, issuer: ISSUER });
  const userId = await as.mutation(api.users.store, {});
  return { as, userId };
}

async function insertPalette(t: T, userId: Id<"users">, name: string, updatedAt: number) {
  return await t.run((ctx) =>
    ctx.db.insert("palettes", { userId, name, paintIds: [], groups: [], updatedAt }),
  );
}

function table<N extends "userPaints" | "palettes" | "legacyImports" | "legacyImportClaims">(
  t: T,
  name: N,
) {
  return t.run((ctx) => ctx.db.query(name).collect());
}

beforeEach(() => {
  vi.stubEnv("LEGACY_IMPORT_HASH_KEY", HASH_KEY);
  vi.stubEnv("CLERK_SECRET_KEY", CLERK_SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("legacyClaim.findMine", () => {
  it("findMine returns counts for a complete staged match and null otherwise", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubClerk({
      user_a: [verified("a@example.com")],
      user_b: [verified("c@example.com"), unverified("b@example.com")],
    });
    await stage(t, "a@example.com", {
      ownedPaintIds: [MACRAGGE_BLUE, RED, "test-paint-001"],
      palettes: [
        { name: "Ultramarines", paintIds: [MACRAGGE_BLUE], groups: [] },
        { name: "Blood Angels", paintIds: [RED], groups: [] },
      ],
      palettesOmitted: 4,
    });
    await stage(t, "b@example.com", { ownedPaintIds: [RED] });
    const { as: asA } = await signedIn(t, "user_a");
    const { as: asB } = await signedIn(t, "user_b");

    expect(await asA.action(api.legacyClaim.findMine, {})).toEqual({
      ownedCount: 3,
      paletteCount: 6,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(requestUrl(url)).toBe("https://api.clerk.com/v1/users/user_a");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk_test_fake");

    expect(await asB.action(api.legacyClaim.findMine, {})).toBeNull();
  });

  it("findMine matches a staged row under any of the caller's verified addresses", async () => {
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("other@example.com"), verified("a@example.com")] });
    await stage(t, "a@example.com", { ownedPaintIds: [RED] });
    const { as } = await signedIn(t, "user_a");

    expect(await as.action(api.legacyClaim.findMine, {})).toEqual({
      ownedCount: 1,
      paletteCount: 0,
    });
  });

  it("findMine returns null for an incomplete staged row", async () => {
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("a@example.com")] });
    await stage(t, "a@example.com", { ownedPaintIds: [RED], complete: false });
    const { as } = await signedIn(t, "user_a");

    expect(await as.action(api.legacyClaim.findMine, {})).toBeNull();
  });

  it("findMine returns null when nothing is staged for the caller", async () => {
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("a@example.com")] });
    await stage(t, "b@example.com", { ownedPaintIds: [RED] });
    const { as } = await signedIn(t, "user_a");

    expect(await as.action(api.legacyClaim.findMine, {})).toBeNull();
  });

  it("findMine returns null when the caller has no verified address", async () => {
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [] });
    await stage(t, "a@example.com", { ownedPaintIds: [RED] });
    const { as } = await signedIn(t, "user_a");

    expect(await as.action(api.legacyClaim.findMine, {})).toBeNull();
  });

  it("findMine returns null without calling Clerk when signed out", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubClerk({ user_a: [verified("a@example.com")] });
    await stage(t, "a@example.com", { ownedPaintIds: [RED] });

    expect(await t.action(api.legacyClaim.findMine, {})).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("findMine returns null when the caller has no users row", async () => {
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("a@example.com")] });
    await stage(t, "a@example.com", { ownedPaintIds: [RED] });
    const as = t.withIdentity({ subject: "user_a", issuer: ISSUER });

    expect(await as.action(api.legacyClaim.findMine, {})).toBeNull();
  });

  it("findMine returns null without calling Clerk when the hash key is missing", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = stubClerk({ user_a: [verified("a@example.com")] });
    await stage(t, "a@example.com", { ownedPaintIds: [RED] });
    const { as } = await signedIn(t, "user_a");
    vi.stubEnv("LEGACY_IMPORT_HASH_KEY", undefined);

    expect(await as.action(api.legacyClaim.findMine, {})).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("findMine throws when the Clerk secret is missing", async () => {
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("a@example.com")] });
    await stage(t, "a@example.com", { ownedPaintIds: [RED] });
    const { as } = await signedIn(t, "user_a");
    vi.stubEnv("CLERK_SECRET_KEY", undefined);

    await expect(as.action(api.legacyClaim.findMine, {})).rejects.toThrow("CLERK_SECRET_KEY");
  });

  it("findMine throws when Clerk answers with an error", async () => {
    const t = convexTest(schema, modules);
    stubClerk({});
    await stage(t, "a@example.com", { ownedPaintIds: [RED] });
    const { as } = await signedIn(t, "user_a");

    await expect(as.action(api.legacyClaim.findMine, {})).rejects.toThrow("404");
  });
});

describe("legacyClaim.resolveMine", () => {
  it("resolveMine import merges paints and adds palettes up to the cap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("a@example.com")], user_b: [verified("b@example.com")] });
    const { as, userId } = await signedIn(t, "user_a");
    const { userId: otherId } = await signedIn(t, "user_b");
    await t.run(async (ctx) => {
      await ctx.db.insert("userPaints", {
        userId,
        paintId: MACRAGGE_BLUE,
        owned: false,
        wishlisted: true,
        favorite: true,
        updatedAt: 500,
      });
      await ctx.db.insert("userPaints", {
        userId: otherId,
        paintId: RED,
        owned: true,
        wishlisted: false,
        favorite: false,
        updatedAt: 600,
      });
    });
    for (let i = 1; i <= 48; i++) await insertPalette(t, userId, `Existing ${i}`, 100 + i);
    await insertPalette(t, otherId, "Someone else's", 700);
    const palettesBefore = await table(t, "palettes");
    const otherPaintsBefore = (await table(t, "userPaints")).filter((r) => r.userId === otherId);

    const staged = [MACRAGGE_BLUE, ...testPaints(119)];
    const stagedPalettes = [
      {
        name: "Ultramarines",
        paintIds: [MACRAGGE_BLUE, "test-paint-001", "test-paint-002"],
        groups: [
          { name: "Armour", paintIds: [MACRAGGE_BLUE] },
          { name: "Trim", paintIds: ["test-paint-001"] },
          { name: "Armour", paintIds: ["test-paint-002"] },
        ],
      },
      {
        name: "Blood Angels",
        paintIds: ["test-paint-003", "test-paint-004"],
        groups: [
          { name: "Base", paintIds: ["test-paint-003"] },
          { name: "Highlight", paintIds: ["test-paint-004"] },
        ],
      },
      { name: "Necrons", paintIds: ["test-paint-005"], groups: [] },
      { name: "Orks", paintIds: [], groups: [] },
      { name: "Tau", paintIds: ["test-paint-006"], groups: [] },
    ];
    const emailHash = await stage(t, "a@example.com", {
      ownedPaintIds: staged,
      palettes: stagedPalettes,
      palettesOmitted: 2,
    });

    vi.setSystemTime(10_000);
    expect(await as.action(api.legacyClaim.resolveMine, { choice: "import" })).toEqual({
      paintsAdded: 120,
      palettesAdded: 2,
      palettesSkipped: 5,
    });

    const paints = await table(t, "userPaints");
    const mine = paints.filter((r) => r.userId === userId);
    expect(mine.map((r) => r.paintId).sort()).toEqual([...staged].sort());
    for (const row of mine) {
      expect(row).toMatchObject({ owned: true, updatedAt: 10_000 });
      if (row.paintId === MACRAGGE_BLUE) {
        expect(row).toMatchObject({ wishlisted: true, favorite: true });
      } else {
        expect(row).toMatchObject({ wishlisted: false, favorite: false });
      }
    }
    expect(paints.filter((r) => r.userId === otherId)).toEqual(otherPaintsBefore);

    const palettesAfter = await table(t, "palettes");
    const beforeIds = new Set(palettesBefore.map((p) => p._id));
    expect(palettesAfter.filter((p) => beforeIds.has(p._id))).toEqual(palettesBefore);
    expect(palettesAfter.filter((p) => p.userId === userId)).toHaveLength(50);
    const added = palettesAfter
      .filter((p) => !beforeIds.has(p._id))
      .sort((a, b) => a._creationTime - b._creationTime);
    expect(
      added.map((p) => ({
        userId: p.userId,
        name: p.name,
        paintIds: p.paintIds,
        groups: p.groups.map(({ name, paintIds }) => ({ name, paintIds })),
        updatedAt: p.updatedAt,
      })),
    ).toEqual(stagedPalettes.slice(0, 2).map((p) => ({ userId, ...p, updatedAt: 10_000 })));
    for (const p of added) {
      const ids = p.groups.map((g) => g.id);
      for (const id of ids) expect(id).toEqual(expect.any(String));
      expect(ids.every((id) => id.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }

    expect(await table(t, "legacyImports")).toEqual([]);
    const claims = await table(t, "legacyImportClaims");
    expect(claims.map(({ emailHash, claimedAt }) => ({ emailHash, claimedAt }))).toEqual([
      { emailHash, claimedAt: 10_000 },
    ]);
  });

  it("resolveMine import counts only paints the caller didn't already own", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("a@example.com")] });
    const { as, userId } = await signedIn(t, "user_a");
    await t.run((ctx) =>
      ctx.db.insert("userPaints", {
        userId,
        paintId: RED,
        owned: true,
        wishlisted: false,
        favorite: true,
        updatedAt: 500,
      }),
    );
    await stage(t, "a@example.com", { ownedPaintIds: [RED, "test-paint-001"] });

    vi.setSystemTime(10_000);
    expect(await as.action(api.legacyClaim.resolveMine, { choice: "import" })).toEqual({
      paintsAdded: 1,
      palettesAdded: 0,
      palettesSkipped: 0,
    });

    const rows = await table(t, "userPaints");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.paintId === RED)).toMatchObject({ owned: true, favorite: true });
    expect(rows.find((r) => r.paintId === "test-paint-001")).toMatchObject({
      owned: true,
      wishlisted: false,
      favorite: false,
      updatedAt: 10_000,
    });
  });

  it("resolveMine discard deletes the staged row and changes nothing else", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("a@example.com")] });
    const { as, userId } = await signedIn(t, "user_a");
    await t.run((ctx) =>
      ctx.db.insert("userPaints", {
        userId,
        paintId: MACRAGGE_BLUE,
        owned: false,
        wishlisted: true,
        favorite: false,
        updatedAt: 500,
      }),
    );
    await insertPalette(t, userId, "Existing", 600);
    const emailHash = await stage(t, "a@example.com", {
      ownedPaintIds: [MACRAGGE_BLUE, RED],
      palettes: [{ name: "Ultramarines", paintIds: [MACRAGGE_BLUE], groups: [] }],
      palettesOmitted: 1,
    });
    await stage(t, "b@example.com", { ownedPaintIds: [RED] });
    const paintsBefore = await table(t, "userPaints");
    const palettesBefore = await table(t, "palettes");
    const otherStaged = (await table(t, "legacyImports")).filter((r) => r.emailHash !== emailHash);

    vi.setSystemTime(10_000);
    expect(await as.action(api.legacyClaim.resolveMine, { choice: "discard" })).toEqual({
      paintsAdded: 0,
      palettesAdded: 0,
      palettesSkipped: 0,
    });

    expect(await table(t, "userPaints")).toEqual(paintsBefore);
    expect(await table(t, "palettes")).toEqual(palettesBefore);
    expect(await table(t, "legacyImports")).toEqual(otherStaged);
    const claims = await table(t, "legacyImportClaims");
    expect(claims.map(({ emailHash, claimedAt }) => ({ emailHash, claimedAt }))).toEqual([
      { emailHash, claimedAt: 10_000 },
    ]);
  });

  it("resolveMine fails on a second claim", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("a@example.com")], user_b: [verified("a@example.com")] });
    const { as: asA } = await signedIn(t, "user_a");
    const { as: asB } = await signedIn(t, "user_b");
    await stage(t, "a@example.com", {
      ownedPaintIds: [MACRAGGE_BLUE, RED],
      palettes: [{ name: "Ultramarines", paintIds: [MACRAGGE_BLUE], groups: [] }],
    });

    vi.setSystemTime(10_000);
    await asA.action(api.legacyClaim.resolveMine, { choice: "import" });
    const paintsAfterClaim = await table(t, "userPaints");
    const palettesAfterClaim = await table(t, "palettes");
    const claimsAfterClaim = await table(t, "legacyImportClaims");
    expect(paintsAfterClaim).toHaveLength(2);
    expect(palettesAfterClaim).toHaveLength(1);
    expect(claimsAfterClaim).toHaveLength(1);

    vi.setSystemTime(20_000);
    await expect(asA.action(api.legacyClaim.resolveMine, { choice: "import" })).rejects.toThrow(
      "LEGACY_IMPORT_NOT_FOUND",
    );
    await expect(asA.action(api.legacyClaim.resolveMine, { choice: "discard" })).rejects.toThrow(
      "LEGACY_IMPORT_NOT_FOUND",
    );
    await expect(asB.action(api.legacyClaim.resolveMine, { choice: "import" })).rejects.toThrow(
      "LEGACY_IMPORT_NOT_FOUND",
    );
    await expect(asB.action(api.legacyClaim.resolveMine, { choice: "discard" })).rejects.toThrow(
      "LEGACY_IMPORT_NOT_FOUND",
    );
    expect(await asA.action(api.legacyClaim.findMine, {})).toBeNull();
    expect(await asB.action(api.legacyClaim.findMine, {})).toBeNull();

    expect(await table(t, "userPaints")).toEqual(paintsAfterClaim);
    expect(await table(t, "palettes")).toEqual(palettesAfterClaim);
    expect(await table(t, "legacyImportClaims")).toEqual(claimsAfterClaim);
  });

  it("resolveMine rejects signed-out callers and callers without a users row", async () => {
    const t = convexTest(schema, modules);
    stubClerk({ user_a: [verified("a@example.com")] });
    await stage(t, "a@example.com", { ownedPaintIds: [RED] });
    const stagedBefore = await table(t, "legacyImports");

    await expect(t.action(api.legacyClaim.resolveMine, { choice: "import" })).rejects.toThrow(
      "UNAUTHENTICATED",
    );
    await expect(
      t
        .withIdentity({ subject: "user_a", issuer: ISSUER })
        .action(api.legacyClaim.resolveMine, { choice: "import" }),
    ).rejects.toThrow("UNAUTHENTICATED");

    expect(await table(t, "legacyImports")).toEqual(stagedBefore);
    expect(await table(t, "userPaints")).toEqual([]);
    expect(await table(t, "legacyImportClaims")).toEqual([]);
  });

  it("resolveMine rejects callers without a complete verified match", async () => {
    const t = convexTest(schema, modules);
    stubClerk({
      user_a: [verified("a@example.com")],
      user_b: [unverified("b@example.com")],
      user_c: [verified("c@example.com")],
    });
    await stage(t, "a@example.com", { ownedPaintIds: [RED], complete: false });
    await stage(t, "b@example.com", { ownedPaintIds: [RED] });
    await stage(t, "c@example.com", { ownedPaintIds: [RED] });
    const { as: asA } = await signedIn(t, "user_a");
    const { as: asB } = await signedIn(t, "user_b");
    const { as: asC } = await signedIn(t, "user_c");
    const stagedBefore = await table(t, "legacyImports");

    await expect(asA.action(api.legacyClaim.resolveMine, { choice: "import" })).rejects.toThrow(
      "LEGACY_IMPORT_NOT_FOUND",
    );
    await expect(asB.action(api.legacyClaim.resolveMine, { choice: "import" })).rejects.toThrow(
      "LEGACY_IMPORT_NOT_FOUND",
    );
    vi.stubEnv("LEGACY_IMPORT_HASH_KEY", undefined);
    await expect(asC.action(api.legacyClaim.resolveMine, { choice: "discard" })).rejects.toThrow(
      "LEGACY_IMPORT_NOT_FOUND",
    );

    expect(await table(t, "legacyImports")).toEqual(stagedBefore);
    expect(await table(t, "userPaints")).toEqual([]);
    expect(await table(t, "legacyImportClaims")).toEqual([]);
  });
});
