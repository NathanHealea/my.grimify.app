// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  convertBrand,
  decodeEntities,
  type LegacyPaint,
  legacyPaintId,
  slug,
} from "./import-legacy.ts";

function legacy(id: string, type: string, name: string, hex = "#9A1115"): LegacyPaint {
  return { id, name, hex, type };
}

describe("slug", () => {
  it("slugs names the way the ID rules describe", () => {
    expect(slug("Bugman's Glow")).toBe("bugmans-glow");
    expect(slug("Olivgrün Base")).toBe("olivgrun-base");
    expect(slug("Drop & Paint")).toBe("drop-paint");
    expect(slug("OIF &amp; OEF – US")).toBe("oif-oef-us");
  });
});

describe("decodeEntities", () => {
  it("decodes HTML entities in names", () => {
    expect(decodeEntities("Silver &amp; Metal Midtones -86-")).toBe("Silver & Metal Midtones -86-");
    expect(decodeEntities("It&#39;s")).toBe("It's");
    expect(decodeEntities("Mephiston Red")).toBe("Mephiston Red");
  });
});

describe("convertBrand", () => {
  it("converts a brand with lines, types and finishes", () => {
    const file = convertBrand("vallejo", [
      legacy("val-1", "Model Color", "White", "#FFFFFF"),
      legacy("val-2", "Xpress Color", "Templar White", "#EDE8D7"),
      legacy("val-3", "Metal Color", "Aluminium", "#A8A9AD"),
    ]);

    expect(file.brand.id).toBe("vallejo");
    expect(file.lines).toEqual([
      { id: "vallejo-model-color", name: "Model Color" },
      { id: "vallejo-xpress-color", name: "Xpress Color" },
      { id: "vallejo-metal-color", name: "Metal Color" },
    ]);
    expect(file.paints).toEqual([
      {
        id: "vallejo-model-color-white",
        lineId: "vallejo-model-color",
        name: "White",
        hex: "#FFFFFF",
        type: "acrylic",
      },
      {
        id: "vallejo-xpress-color-templar-white",
        lineId: "vallejo-xpress-color",
        name: "Templar White",
        hex: "#EDE8D7",
        type: "contrast",
      },
      {
        id: "vallejo-metal-color-aluminium",
        lineId: "vallejo-metal-color",
        name: "Aluminium",
        hex: "#A8A9AD",
        type: "metallic",
        finish: "metallic",
      },
    ]);
  });

  it("skips excluded lines", () => {
    const file = convertBrand("ak-interactive", [
      legacy("ak-1", "3rd Gen Acrylics", "White"),
      legacy("ak-600", "Abteilung 502", "Starship Filth"),
    ]);

    expect(file.lines.map((line) => line.id)).toEqual(["ak-interactive-3rd-gen-acrylics"]);
    expect(file.paints.map((paint) => paint.id)).toEqual(["ak-interactive-3rd-gen-acrylics-white"]);
  });

  it("merges same-line duplicates and keeps the other spelling as an alias", () => {
    const file = convertBrand("citadel", [
      legacy("cit-4", "Base", "Bugmans Glow", "#8C5144"),
      legacy("cit-309", "Base", "Bugman's Glow", "#8C5144"),
    ]);

    expect(file.paints).toEqual([
      {
        id: "citadel-base-bugmans-glow",
        lineId: "citadel-base",
        name: "Bugman's Glow",
        hex: "#8C5144",
        type: "base",
        aliases: ["Bugmans Glow"],
      },
    ]);
  });

  it("stops on a collision with different hex values", () => {
    expect(() =>
      convertBrand("citadel", [
        legacy("cit-4", "Base", "Bugmans Glow", "#8C5144"),
        legacy("cit-309", "Base", "Bugman's Glow", "#8C5145"),
      ]),
    ).toThrow(/cit-4.*cit-309/);
  });

  it("stops on an unmapped line", () => {
    expect(() => convertBrand("scale75", [legacy("s-1", "Mystery Range", "Red")])).toThrow(
      'Unmapped line "Mystery Range" for scale75',
    );
  });

  it("maps Speedpaint Medium to technical", () => {
    const file = convertBrand("army-painter", [
      legacy("ap-400", "Speedpaint", "Grim Black"),
      legacy("ap-462", "Speedpaint", "Speedpaint Medium", "#F2EFE9"),
    ]);

    expect(file.paints.map((paint) => [paint.name, paint.type])).toEqual([
      ["Grim Black", "speedpaint"],
      ["Speedpaint Medium", "technical"],
    ]);
  });
});

describe("legacyPaintId", () => {
  it("legacyPaintId derives the catalog ID convertBrand writes", () => {
    const fixtures: Record<string, LegacyPaint[]> = {
      citadel: [
        legacy("cit-1", "Base", "Abaddon Black", "#231F20"),
        legacy("cit-4", "Base", "Bugmans Glow", "#8C5144"),
        legacy("cit-309", "Base", "Bugman's Glow", "#8C5144"),
        legacy("cit-50", "Shade", "Agrax Earthshade", "#5A4A2F"),
      ],
      vallejo: [
        legacy("val-3", "Metal Color", "Aluminium", "#A8A9AD"),
        legacy("val-9", "Model Color", "Olivgrün Base", "#4B5320"),
      ],
      "ak-interactive": [
        legacy("ak-1", "3rd Gen Acrylics", "White", "#FFFFFF"),
        legacy("ak-600", "Abteilung 502", "Starship Filth", "#3B2F2F"),
      ],
      scale75: [legacy("s-1", "Drop & Paint", "Blood &amp; Guts", "#7A0A0A")],
    };

    for (const [brandId, paints] of Object.entries(fixtures)) {
      const catalogIds = convertBrand(brandId, paints).paints.map((paint) => paint.id);
      for (const paint of paints.filter((paint) => paint.type !== "Abteilung 502")) {
        expect(catalogIds, `${brandId}/${paint.id}`).toContain(legacyPaintId(brandId, paint));
      }
    }

    expect(legacyPaintId("citadel", fixtures.citadel[1])).toBe("citadel-base-bugmans-glow");
    expect(legacyPaintId("citadel", fixtures.citadel[2])).toBe("citadel-base-bugmans-glow");
    expect(legacyPaintId("ak-interactive", fixtures["ak-interactive"][1])).toBeNull();
  });
});
