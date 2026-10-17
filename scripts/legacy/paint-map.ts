import { BRANDS, type LegacyPaint, legacyPaintId } from "../catalog/import-legacy.ts";

export type OldBrandRow = { id: number; slug: string; name: string };
export type OldProductLineRow = { id: number; brand_id: number };
export type OldPaintRow = {
  id: string;
  brand_paint_id: string;
  name: string;
  product_line_id: number;
};

export type UnmappedReason =
  "unknown-brand" | "not-in-legacy-file" | "excluded-line" | "not-in-catalog";

export type PaintMapping =
  | { catalogId: string }
  | {
      catalogId: null;
      reason: UnmappedReason;
      brand: string;
      brandPaintId: string;
      name: string;
    };

export function buildPaintMap(
  old: { paints: OldPaintRow[]; productLines: OldProductLineRow[]; brands: OldBrandRow[] },
  legacyFiles: Record<string, LegacyPaint[]>,
  catalogIds: ReadonlySet<string>,
): Map<string, PaintMapping> {
  const brands = new Map(old.brands.map((brand) => [brand.id, brand]));
  const lines = new Map(old.productLines.map((line) => [line.id, line]));
  const legacyById = new Map(
    Object.entries(legacyFiles).map(([brandId, paints]) => [
      brandId,
      new Map(paints.map((paint) => [paint.id, paint])),
    ]),
  );

  const map = new Map<string, PaintMapping>();
  for (const paint of old.paints) {
    const line = lines.get(paint.product_line_id);
    if (!line)
      throw new Error(`Paint ${paint.id} has unknown product line ${paint.product_line_id}`);
    const brand = brands.get(line.brand_id);
    if (!brand) throw new Error(`Product line ${line.id} has unknown brand ${line.brand_id}`);

    const unmapped = (reason: UnmappedReason): PaintMapping => ({
      catalogId: null,
      reason,
      brand: brand.slug,
      brandPaintId: paint.brand_paint_id,
      name: paint.name,
    });

    if (!(brand.slug in BRANDS)) {
      map.set(paint.id, unmapped("unknown-brand"));
      continue;
    }
    const legacyFile = legacyById.get(brand.slug);
    if (!legacyFile) throw new Error(`No legacy paint file for brand "${brand.slug}"`);
    const legacy = legacyFile.get(paint.brand_paint_id);
    if (!legacy) {
      map.set(paint.id, unmapped("not-in-legacy-file"));
      continue;
    }
    const catalogId = legacyPaintId(brand.slug, legacy);
    if (catalogId === null) map.set(paint.id, unmapped("excluded-line"));
    else if (!catalogIds.has(catalogId)) map.set(paint.id, unmapped("not-in-catalog"));
    else map.set(paint.id, { catalogId });
  }
  return map;
}
