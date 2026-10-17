import type {
  Brand,
  BrandFile,
  Line,
  Paint,
  PaintType,
} from "../../src/features/catalog/schema.ts";

/** A paint as stored in the earlier Grimify repo (`scripts/data/paints/<brand>.json`). */
export type LegacyPaint = { id: string; name: string; hex: string; type: string };

type LineRule = PaintType | "exclude";

type BrandConfig = { brand: Brand; lines: Record<string, LineRule> };

// Conversion rules agreed for the seed catalog (DECISIONS 018). The legacy `type` is the line name.
export const BRANDS: Record<string, BrandConfig> = {
  citadel: {
    brand: {
      id: "citadel",
      name: "Citadel",
      manufacturer: "Games Workshop",
      website: "https://www.games-workshop.com",
    },
    lines: {
      Base: "base",
      Layer: "layer",
      Edge: "layer",
      Shade: "shade",
      Contrast: "contrast",
      Dry: "dry",
      Air: "air",
      Spray: "primer",
      Technical: "technical",
    },
  },
  "army-painter": {
    brand: {
      id: "army-painter",
      name: "The Army Painter",
      manufacturer: "The Army Painter",
      website: "https://thearmypainter.com",
    },
    lines: {
      Fanatic: "acrylic",
      Warpaints: "acrylic",
      Masterclass: "acrylic",
      "Fanatic Metallic": "metallic",
      "Warpaints Metallic": "metallic",
      "Fanatic Wash": "wash",
      "Warpaints Wash": "wash",
      "Warpaints Air": "air",
      Speedpaint: "speedpaint",
    },
  },
  vallejo: {
    brand: {
      id: "vallejo",
      name: "Vallejo",
      manufacturer: "Acrílicos Vallejo",
      website: "https://acrylicosvallejo.com",
    },
    lines: {
      "Model Color": "acrylic",
      "Game Color": "acrylic",
      "Mecha Color": "acrylic",
      "Panzer Aces": "acrylic",
      "Model Air": "air",
      "Game Air": "air",
      "Game Color Metallic": "metallic",
      "Metal Color": "metallic",
      "Liquid Metal": "metallic",
      "Game Color Wash": "wash",
      "Model Wash": "wash",
      "Game Color Ink": "ink",
      "Xpress Color": "contrast",
      "Surface Primer": "primer",
    },
  },
  "ak-interactive": {
    brand: {
      id: "ak-interactive",
      name: "AK Interactive",
      manufacturer: "AK Interactive",
      website: "https://ak-interactive.com",
    },
    lines: {
      "3rd Gen Acrylics": "acrylic",
      "3rd Gen Intense": "acrylic",
      Acrylics: "acrylic",
      "Acrylics AFV": "acrylic",
      "Acrylics Figure": "acrylic",
      "Acrylics Naval": "acrylic",
      "3rd Gen Metallic": "metallic",
      "Acrylics Air": "air",
      "Acrylics Primer": "primer",
      "Abteilung 502": "exclude",
    },
  },
  scale75: {
    brand: {
      id: "scale75",
      name: "Scale75",
      manufacturer: "Scale75",
      website: "https://scale75.com",
    },
    lines: {
      Scalecolor: "acrylic",
      "Scalecolor Artist": "acrylic",
      "Scalecolor Floww": "acrylic",
      "Fantasy & Games": "acrylic",
      Warfront: "acrylic",
      "Drop & Paint": "acrylic",
      "FX Fluor": "acrylic",
      "Metal n' Alchemy": "metallic",
      Inktensity: "ink",
      "Instant Colors": "contrast",
      "Prism Effect": "other",
      "Mystic Colors": "other",
    },
  },
  "green-stuff-world": {
    brand: {
      id: "green-stuff-world",
      name: "Green Stuff World",
      manufacturer: "Green Stuff World",
      website: "https://www.greenstuffworld.com",
    },
    lines: { Acrylic: "acrylic", Metallic: "metallic" },
  },
};

// A colorless thinning medium with a placeholder hex; technical keeps it out of automatic matching.
const PAINT_TYPE_OVERRIDES: Record<string, PaintType> = {
  "army-painter/Speedpaint Medium": "technical",
};

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|[a-z]+);/g, (match, code: string) =>
    code.startsWith("#") ? String.fromCodePoint(Number(code.slice(1))) : (ENTITIES[code] ?? match),
  );
}

export function slug(text: string): string {
  return decodeEntities(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function brandConfig(brandId: string): BrandConfig {
  const config = BRANDS[brandId];
  if (!config) throw new Error(`No conversion rules for brand "${brandId}"`);
  return config;
}

function lineRule(brandId: string, config: BrandConfig, legacy: LegacyPaint): LineRule {
  const rule = config.lines[legacy.type];
  if (rule === undefined) throw new Error(`Unmapped line "${legacy.type}" for ${brandId}`);
  return rule;
}

function lineIdFor(brandId: string, legacy: LegacyPaint): string {
  return `${brandId}-${slug(legacy.type)}`;
}

function paintName(legacy: LegacyPaint): string {
  return decodeEntities(legacy.name).trim();
}

/** The catalog ID `convertBrand` gives this legacy paint, or null when its line is excluded. */
export function legacyPaintId(brandId: string, legacy: LegacyPaint): string | null {
  if (lineRule(brandId, brandConfig(brandId), legacy) === "exclude") return null;
  return `${lineIdFor(brandId, legacy)}-${slug(paintName(legacy))}`;
}

export function convertBrand(brandId: string, legacyPaints: LegacyPaint[]): BrandFile {
  const config = brandConfig(brandId);

  const lines = new Map<string, Line>();
  const paints = new Map<string, { paint: Paint; sourceId: string }>();

  for (const legacy of legacyPaints) {
    const rule = lineRule(brandId, config, legacy);
    const id = legacyPaintId(brandId, legacy);
    if (rule === "exclude" || id === null) continue;

    const lineId = lineIdFor(brandId, legacy);
    if (!lines.has(lineId)) lines.set(lineId, { id: lineId, name: legacy.type });

    const name = paintName(legacy);
    const existing = paints.get(id);

    if (existing) {
      if (existing.paint.hex !== legacy.hex) {
        throw new Error(
          `"${id}" collides: ${existing.sourceId} (${existing.paint.hex}) and ${legacy.id} (${legacy.hex})`,
        );
      }
      mergeName(existing.paint, name);
      continue;
    }

    const type = PAINT_TYPE_OVERRIDES[`${brandId}/${name}`] ?? rule;
    paints.set(id, {
      sourceId: legacy.id,
      paint: {
        id,
        lineId,
        name,
        hex: legacy.hex,
        type,
        ...(type === "metallic" ? { finish: "metallic" as const } : {}),
      },
    });
  }

  return {
    brand: config.brand,
    lines: [...lines.values()],
    paints: [...paints.values()].map(({ paint }) => paint),
  };
}

// The spelling with apostrophes or hyphens ("Bugman's Glow") is the proper one; the other becomes an alias.
function mergeName(paint: Paint, name: string) {
  const punctuation = (text: string) => (text.match(/['’-]/g) ?? []).length;
  const [kept, alias] =
    punctuation(name) > punctuation(paint.name) ? [name, paint.name] : [paint.name, name];
  paint.name = kept;
  if (alias !== kept && !paint.aliases?.includes(alias)) {
    paint.aliases = [...(paint.aliases ?? []), alias];
  }
}
