// @vitest-environment node
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { PaintMapping } from "./paint-map.ts";
import { type OldData, profilesFromAuthUsers, transform } from "./transform.ts";

const HASH_KEY = "test-hash-key-0123456789abcdef0123456789";

function hashOf(normalizedEmail: string): string {
  return createHmac("sha256", HASH_KEY).update(normalizedEmail).digest("hex");
}

function emptyData(): OldData {
  return {
    profiles: [],
    userPaints: [],
    palettes: [],
    palettePaints: [],
    paletteGroups: [],
    paletteGroupPaints: [],
  };
}

function paintId(i: number): string {
  return `citadel-base-paint-${String(i).padStart(3, "0")}`;
}

describe("transform", () => {
  it("transform builds one record per user with mapped owned paints and ordered palettes", () => {
    const paintMap = new Map<string, PaintMapping>([
      ["old-paint-a", { catalogId: "citadel-base-abaddon-black" }],
      ["old-paint-b", { catalogId: "army-painter-warpaints-matt-black" }],
      ["old-paint-b-merged", { catalogId: "army-painter-warpaints-matt-black" }],
      ["old-paint-c", { catalogId: "vallejo-model-color-white" }],
    ]);
    const data: OldData = {
      ...emptyData(),
      profiles: [
        { id: "profile-1", email: "painter@example.com" },
        { id: "profile-2", email: "idle@example.com" },
      ],
      userPaints: [
        { user_id: "profile-1", paint_id: "old-paint-c" },
        { user_id: "profile-1", paint_id: "old-paint-b" },
        { user_id: "profile-1", paint_id: "old-paint-b-merged" },
        { user_id: "profile-1", paint_id: "old-paint-a" },
      ],
      palettes: [
        {
          id: "palette-newer",
          user_id: "profile-1",
          name: "Newer",
          created_at: "2025-03-01T00:00:00Z",
        },
        {
          id: "palette-older",
          user_id: "profile-1",
          name: "Older",
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
      palettePaints: [
        { id: "pp-older-2", palette_id: "palette-older", position: 2, paint_id: "old-paint-a" },
        { id: "pp-older-0", palette_id: "palette-older", position: 0, paint_id: "old-paint-c" },
        { id: "pp-older-1", palette_id: "palette-older", position: 1, paint_id: "old-paint-b" },
        { id: "pp-newer-0", palette_id: "palette-newer", position: 0, paint_id: "old-paint-a" },
      ],
      paletteGroups: [
        { id: "group-second", palette_id: "palette-older", name: "Second", position: 1 },
        { id: "group-first", palette_id: "palette-older", name: "First", position: 0 },
      ],
      paletteGroupPaints: [
        { group_id: "group-first", palette_paint_id: "pp-older-2", position: 1 },
        { group_id: "group-first", palette_paint_id: "pp-older-0", position: 0 },
        { group_id: "group-second", palette_paint_id: "pp-older-1", position: 0 },
      ],
    };

    const { records, report } = transform(data, paintMap, HASH_KEY);

    expect(records).toEqual([
      {
        emailHash: hashOf("painter@example.com"),
        ownedPaintIds: [
          "army-painter-warpaints-matt-black",
          "citadel-base-abaddon-black",
          "vallejo-model-color-white",
        ],
        palettes: [
          {
            name: "Older",
            paintIds: [
              "vallejo-model-color-white",
              "army-painter-warpaints-matt-black",
              "citadel-base-abaddon-black",
            ],
            groups: [
              {
                name: "First",
                paintIds: ["vallejo-model-color-white", "citadel-base-abaddon-black"],
              },
              { name: "Second", paintIds: ["army-painter-warpaints-matt-black"] },
            ],
          },
          { name: "Newer", paintIds: ["citadel-base-abaddon-black"], groups: [] },
        ],
      },
    ]);
    expect(report.totals).toMatchObject({
      usersExported: 1,
      usersSkippedNoEmail: 0,
      usersWithNoData: 1,
      ownedPaints: 3,
      palettes: 2,
    });
  });

  it("transform fits palettes to the caps", () => {
    const paintMap = new Map<string, PaintMapping>();
    for (let i = 0; i < 250; i++) {
      paintMap.set(`old-paint-${i}`, { catalogId: paintId(i) });
    }
    const palettePaints: OldData["palettePaints"] = [];
    for (let position = 0; position < 250; position++) {
      const paint = position === 5 ? "old-paint-2" : `old-paint-${position}`;
      palettePaints.push({
        id: `pp-${position}`,
        palette_id: "palette-big",
        position,
        paint_id: paint,
      });
    }
    const paletteGroups: OldData["paletteGroups"] = [];
    for (let position = 0; position < 35; position++) {
      paletteGroups.push({
        id: `group-${position}`,
        palette_id: "palette-big",
        name: `Group ${position}`,
        position,
      });
    }
    paletteGroups[0].name = "  Highlights  ";
    paletteGroups[1].name = "   ";
    paletteGroups[2].name = `${"G".repeat(59)} and more words past the limit`;
    const data: OldData = {
      ...emptyData(),
      profiles: [{ id: "profile-1", email: "painter@example.com" }],
      palettes: [
        {
          id: "palette-big",
          user_id: "profile-1",
          name: "x".repeat(80),
          created_at: "2025-01-01T00:00:00Z",
        },
        {
          id: "palette-blank",
          user_id: "profile-1",
          name: " \t ",
          created_at: "2025-02-01T00:00:00Z",
        },
      ],
      palettePaints,
      paletteGroups,
      paletteGroupPaints: [
        { group_id: "group-0", palette_paint_id: "pp-10", position: 0 },
        { group_id: "group-0", palette_paint_id: "pp-220", position: 1 },
        { group_id: "group-0", palette_paint_id: "pp-5", position: 2 },
        { group_id: "group-0", palette_paint_id: "pp-2", position: 3 },
        { group_id: "group-34", palette_paint_id: "pp-0", position: 0 },
      ],
    };

    const { records, report } = transform(data, paintMap, HASH_KEY);

    const [big, blank] = records[0].palettes;
    expect(big.name).toBe("x".repeat(60));
    expect(big.paintIds).toHaveLength(200);
    expect(new Set(big.paintIds).size).toBe(200);
    expect(big.paintIds.slice(0, 6)).toEqual([
      paintId(0),
      paintId(1),
      paintId(2),
      paintId(3),
      paintId(4),
      paintId(6),
    ]);
    expect(big.paintIds.at(-1)).toBe(paintId(200));
    expect(big.groups).toHaveLength(30);
    expect(big.groups.map((group) => group.name).slice(0, 4)).toEqual([
      "Highlights",
      "Untitled",
      "G".repeat(59),
      "Group 3",
    ]);
    expect(big.groups.at(-1)?.name).toBe("Group 29");
    expect(big.groups[0].paintIds).toEqual([paintId(10), paintId(2)]);
    expect(blank).toEqual({ name: "Untitled", paintIds: [], groups: [] });
    expect(report.totals.removed).toEqual({
      duplicatePaints: 1,
      paintsOverCap: 49,
      groupsOverCap: 5,
      groupPaintsDropped: 2,
      namesShortened: 2,
      namesUntitled: 2,
    });
  });

  it("transform doesn't split an emoji when cutting a name", () => {
    const data: OldData = {
      ...emptyData(),
      profiles: [{ id: "profile-1", email: "painter@example.com" }],
      palettes: [
        {
          id: "palette-1",
          user_id: "profile-1",
          name: `${"a".repeat(59)}🎨 and more`,
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
    };

    const { records } = transform(data, new Map(), HASH_KEY);

    const name = records[0]?.palettes[0]?.name ?? "";
    expect(name).toBe("a".repeat(59));
    expect(name.length).toBeLessThanOrEqual(60);
  });

  it("transform drops unmapped paints and reports them once", () => {
    const paintMap = new Map<string, PaintMapping>([
      ["old-paint-mapped", { catalogId: "citadel-base-abaddon-black" }],
      [
        "old-paint-admin",
        {
          catalogId: null,
          reason: "not-in-legacy-file",
          brand: "vallejo",
          brandPaintId: "val-admin-1",
          name: "Admin Red",
        },
      ],
      [
        "old-paint-unused",
        {
          catalogId: null,
          reason: "unknown-brand",
          brand: "acme",
          brandPaintId: "acme-1",
          name: "Acme Blue",
        },
      ],
    ]);
    const data: OldData = {
      ...emptyData(),
      profiles: [{ id: "profile-1", email: "painter@example.com" }],
      userPaints: [
        { user_id: "profile-1", paint_id: "old-paint-admin" },
        { user_id: "profile-1", paint_id: "old-paint-mapped" },
      ],
      palettes: [
        { id: "palette-1", user_id: "profile-1", name: "One", created_at: "2025-01-01T00:00:00Z" },
        { id: "palette-2", user_id: "profile-1", name: "Two", created_at: "2025-02-01T00:00:00Z" },
      ],
      palettePaints: [
        { id: "pp-1a", palette_id: "palette-1", position: 0, paint_id: "old-paint-admin" },
        { id: "pp-1b", palette_id: "palette-1", position: 1, paint_id: "old-paint-mapped" },
        { id: "pp-2a", palette_id: "palette-2", position: 0, paint_id: "old-paint-admin" },
      ],
      paletteGroups: [{ id: "group-1", palette_id: "palette-1", name: "Group", position: 0 }],
      paletteGroupPaints: [
        { group_id: "group-1", palette_paint_id: "pp-1a", position: 0 },
        { group_id: "group-1", palette_paint_id: "pp-1b", position: 1 },
      ],
    };

    const { records, report } = transform(data, paintMap, HASH_KEY);

    expect(records[0].ownedPaintIds).toEqual(["citadel-base-abaddon-black"]);
    expect(records[0].palettes).toEqual([
      {
        name: "One",
        paintIds: ["citadel-base-abaddon-black"],
        groups: [{ name: "Group", paintIds: ["citadel-base-abaddon-black"] }],
      },
      { name: "Two", paintIds: [], groups: [] },
    ]);
    expect(report.unmapped).toEqual([
      {
        brand: "acme",
        brandPaintId: "acme-1",
        name: "Acme Blue",
        reason: "unknown-brand",
        ownedRefs: 0,
        paletteRefs: 0,
      },
      {
        brand: "vallejo",
        brandPaintId: "val-admin-1",
        name: "Admin Red",
        reason: "not-in-legacy-file",
        ownedRefs: 1,
        paletteRefs: 2,
      },
    ]);
    expect(report.totals.removed.groupPaintsDropped).toBe(0);
    expect(report.totals.removed.duplicatePaints).toBe(0);
  });

  it("transform merges users sharing a normalized email", () => {
    const paintMap = new Map<string, PaintMapping>([
      ["old-paint-a", { catalogId: "citadel-base-abaddon-black" }],
      ["old-paint-b", { catalogId: "vallejo-model-color-white" }],
      ["old-paint-c", { catalogId: "scale75-scalecolor-black" }],
    ]);
    const data: OldData = {
      ...emptyData(),
      profiles: [
        { id: "profile-upper", email: "  A@Example.com " },
        { id: "profile-lower", email: "a@example.com" },
      ],
      userPaints: [
        { user_id: "profile-upper", paint_id: "old-paint-a" },
        { user_id: "profile-upper", paint_id: "old-paint-b" },
        { user_id: "profile-lower", paint_id: "old-paint-b" },
        { user_id: "profile-lower", paint_id: "old-paint-c" },
      ],
      palettes: [
        {
          id: "palette-lower",
          user_id: "profile-lower",
          name: "Lower",
          created_at: "2025-01-01T00:00:00Z",
        },
        {
          id: "palette-upper",
          user_id: "profile-upper",
          name: "Upper",
          created_at: "2025-02-01T00:00:00Z",
        },
      ],
    };

    const { records, report } = transform(data, paintMap, HASH_KEY);

    expect(records).toEqual([
      {
        emailHash: hashOf("a@example.com"),
        ownedPaintIds: [
          "citadel-base-abaddon-black",
          "scale75-scalecolor-black",
          "vallejo-model-color-white",
        ],
        palettes: [
          { name: "Lower", paintIds: [], groups: [] },
          { name: "Upper", paintIds: [], groups: [] },
        ],
      },
    ]);
    expect(report.totals.usersExported).toBe(1);
  });

  it("export output contains no emails or old UUIDs", () => {
    const ids = {
      profileA: "0b6f1c2e-1111-4a6b-9c1d-000000000001",
      profileB: "0b6f1c2e-1111-4a6b-9c1d-000000000002",
      profileNull: "0b6f1c2e-1111-4a6b-9c1d-000000000003",
      profileBlank: "0b6f1c2e-1111-4a6b-9c1d-000000000004",
      palette: "7d2e4f10-2222-4c3a-8b7e-000000000001",
      palettePaintMapped: "a91c3b55-3333-4d2f-a6c4-000000000001",
      palettePaintUnmapped: "a91c3b55-3333-4d2f-a6c4-000000000002",
      group: "c4e8d901-4444-4b1e-9f2a-000000000001",
      paintMapped: "e3f7a210-5555-4e8d-b3c1-000000000001",
      paintUnmapped: "e3f7a210-5555-4e8d-b3c1-000000000002",
    };
    const emails = ["First.Painter@example.com", "second@example.com"];
    const paintMap = new Map<string, PaintMapping>([
      [ids.paintMapped, { catalogId: "citadel-base-abaddon-black" }],
      [
        ids.paintUnmapped,
        {
          catalogId: null,
          reason: "excluded-line",
          brand: "citadel",
          brandPaintId: "cit-99",
          name: "Excluded Spray",
        },
      ],
    ]);
    const data: OldData = {
      profiles: [
        { id: ids.profileA, email: emails[0] },
        { id: ids.profileB, email: emails[1] },
        { id: ids.profileNull, email: null },
        { id: ids.profileBlank, email: "   " },
      ],
      userPaints: [
        { user_id: ids.profileA, paint_id: ids.paintMapped },
        { user_id: ids.profileB, paint_id: ids.paintUnmapped },
        { user_id: ids.profileNull, paint_id: ids.paintMapped },
        { user_id: ids.profileBlank, paint_id: ids.paintMapped },
      ],
      palettes: [
        {
          id: ids.palette,
          user_id: ids.profileA,
          name: "Mine",
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
      palettePaints: [
        {
          id: ids.palettePaintMapped,
          palette_id: ids.palette,
          position: 0,
          paint_id: ids.paintMapped,
        },
        {
          id: ids.palettePaintUnmapped,
          palette_id: ids.palette,
          position: 1,
          paint_id: ids.paintUnmapped,
        },
      ],
      paletteGroups: [{ id: ids.group, palette_id: ids.palette, name: "Group", position: 0 }],
      paletteGroupPaints: [
        { group_id: ids.group, palette_paint_id: ids.palettePaintMapped, position: 0 },
      ],
    };

    const { records, report } = transform(data, paintMap, HASH_KEY);
    const output = JSON.stringify({ records, report }).toLowerCase();

    for (const email of emails) {
      expect(output).not.toContain(email.toLowerCase());
    }
    for (const id of Object.values(ids)) {
      expect(output).not.toContain(id);
    }
    expect(records.map((record) => record.emailHash)).toEqual([
      hashOf("first.painter@example.com"),
    ]);
    expect(report.totals.usersSkippedNoEmail).toBe(2);
    expect(report.totals.usersWithNoData).toBe(1);
  });

  it("transform throws when an old paint is missing from the paint map", () => {
    const data: OldData = {
      ...emptyData(),
      profiles: [{ id: "profile-1", email: "painter@example.com" }],
      userPaints: [{ user_id: "profile-1", paint_id: "old-paint-unknown" }],
    };

    expect(() => transform(data, new Map(), HASH_KEY)).toThrow("old-paint-unknown");
  });

  it("transform throws when a group member points at a missing palette paint", () => {
    const data: OldData = {
      ...emptyData(),
      profiles: [{ id: "profile-1", email: "painter@example.com" }],
      palettes: [
        { id: "palette-1", user_id: "profile-1", name: "One", created_at: "2025-01-01T00:00:00Z" },
      ],
      paletteGroups: [{ id: "group-1", palette_id: "palette-1", name: "Group", position: 0 }],
      paletteGroupPaints: [{ group_id: "group-1", palette_paint_id: "pp-gone", position: 0 }],
    };

    expect(() => transform(data, new Map(), HASH_KEY)).toThrow("group-1");
  });
});

describe("profilesFromAuthUsers", () => {
  it("keeps an email only when it is confirmed", () => {
    expect(
      profilesFromAuthUsers([
        { id: "u1", email: "a@example.com", email_confirmed_at: "2025-01-01T00:00:00Z" },
        { id: "u2", email: "b@example.com", email_confirmed_at: null },
        { id: "u3", email: null, email_confirmed_at: "2025-01-01T00:00:00Z" },
      ]),
    ).toEqual([
      { id: "u1", email: "a@example.com" },
      { id: "u2", email: null },
      { id: "u3", email: null },
    ]);
  });

  it("throws when a user appears twice", () => {
    expect(() =>
      profilesFromAuthUsers([
        { id: "u1", email: "a@example.com", email_confirmed_at: "2025-01-01T00:00:00Z" },
        { id: "u1", email: "a@example.com", email_confirmed_at: "2025-01-01T00:00:00Z" },
      ]),
    ).toThrow("appeared twice");
  });
});
