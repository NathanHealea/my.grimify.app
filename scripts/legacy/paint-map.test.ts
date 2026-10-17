// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { LegacyPaint } from "../catalog/import-legacy.ts";
import { buildPaintMap, type OldPaintRow } from "./paint-map.ts";

const brands = [
  { id: 1, slug: "citadel", name: "Citadel" },
  { id: 2, slug: "ak-interactive", name: "AK Interactive" },
  { id: 3, slug: "made-up-brand", name: "Made Up Brand" },
];

const productLines = [
  { id: 10, brand_id: 1 },
  { id: 20, brand_id: 2 },
  { id: 30, brand_id: 3 },
];

const legacyFiles: Record<string, LegacyPaint[]> = {
  citadel: [
    { id: "cit-1", name: "Abaddon Black", hex: "#231F20", type: "Base" },
    { id: "cit-2", name: "Retired Green", hex: "#00FF00", type: "Layer" },
  ],
  "ak-interactive": [{ id: "ak-1", name: "Panzer Grey", hex: "#4A4F52", type: "Abteilung 502" }],
};

const catalogIds = new Set(["citadel-base-abaddon-black"]);

function paint(id: string, brandPaintId: string, name: string, lineId: number): OldPaintRow {
  return { id, brand_paint_id: brandPaintId, name, product_line_id: lineId };
}

describe("buildPaintMap", () => {
  it("buildPaintMap maps by brand and brand_paint_id", () => {
    const paints = [
      paint("00000000-0000-4000-8000-000000000001", "cit-1", "Abaddon Black", 10),
      paint("00000000-0000-4000-8000-000000000002", "x-1", "Mystery Paint", 30),
      paint("00000000-0000-4000-8000-000000000003", "ak-1", "Panzer Grey", 20),
      paint("00000000-0000-4000-8000-000000000004", "cit-2", "Retired Green", 10),
      paint("00000000-0000-4000-8000-000000000005", "cit-999", "Admin Added", 10),
    ];

    const map = buildPaintMap({ paints, productLines, brands }, legacyFiles, catalogIds);

    expect(map.get("00000000-0000-4000-8000-000000000001")).toEqual({
      catalogId: "citadel-base-abaddon-black",
    });
    expect(map.get("00000000-0000-4000-8000-000000000002")).toEqual({
      catalogId: null,
      reason: "unknown-brand",
      brand: "made-up-brand",
      brandPaintId: "x-1",
      name: "Mystery Paint",
    });
    expect(map.get("00000000-0000-4000-8000-000000000003")).toEqual({
      catalogId: null,
      reason: "excluded-line",
      brand: "ak-interactive",
      brandPaintId: "ak-1",
      name: "Panzer Grey",
    });
    expect(map.get("00000000-0000-4000-8000-000000000004")).toEqual({
      catalogId: null,
      reason: "not-in-catalog",
      brand: "citadel",
      brandPaintId: "cit-2",
      name: "Retired Green",
    });
    expect(map.get("00000000-0000-4000-8000-000000000005")).toEqual({
      catalogId: null,
      reason: "not-in-legacy-file",
      brand: "citadel",
      brandPaintId: "cit-999",
      name: "Admin Added",
    });
    expect(map.size).toBe(5);
  });

  it("buildPaintMap throws on a paint whose product line is unknown", () => {
    const paints = [paint("00000000-0000-4000-8000-000000000001", "cit-1", "Abaddon Black", 99)];

    expect(() => buildPaintMap({ paints, productLines, brands }, legacyFiles, catalogIds)).toThrow(
      "unknown product line 99",
    );
  });

  it("buildPaintMap throws when a known brand has no legacy file", () => {
    const paints = [paint("00000000-0000-4000-8000-000000000001", "cit-1", "Abaddon Black", 10)];

    expect(() => buildPaintMap({ paints, productLines, brands }, {}, catalogIds)).toThrow(
      'No legacy paint file for brand "citadel"',
    );
  });
});
