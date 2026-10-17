import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { BRANDS, type LegacyPaint } from "./catalog/import-legacy.ts";
import { LEDGER_FILE } from "./catalog/validate.ts";
import { type ExportConfig, readConfig } from "./legacy/export-config.ts";
import { buildPaintMap } from "./legacy/paint-map.ts";
import { fetchAll, fetchAuthUsers, type FetchLike } from "./legacy/supabase.ts";
import { type OldData, profilesFromAuthUsers, transform } from "./legacy/transform.ts";

// One-time export of the old Grimify (Supabase) data for the legacy import (docs/features/legacy-import.md).
const USAGE = "usage: npm run legacy:export -- <output-dir> <grimify>/scripts/data";

const OUTPUT_FILES = ["export.json", "report.json"];

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const catalogDir = new URL("../data/catalog/", import.meta.url);

const legacyFileSchema = z.array(
  z.object({ id: z.string(), name: z.string(), hex: z.string(), type: z.string() }),
);
const catalogFileSchema = z.object({ paints: z.array(z.object({ id: z.string() })) });

type TableSpec<T> = { table: string; select: string; order: string; row: z.ZodType<T> };
type Source = { url: string; secretKey: string; fetch: FetchLike };

async function readTable<T>(source: Source, spec: TableSpec<T>): Promise<T[]> {
  const rows = await fetchAll(source, spec.table, spec.select, spec.order);
  console.log(`Read ${rows.length} ${spec.table} rows`);
  return z.array(spec.row).parse(rows);
}

const tables = {
  brands: {
    table: "brands",
    select: "id,slug,name",
    order: "id",
    row: z.object({ id: z.number(), slug: z.string(), name: z.string() }),
  },
  productLines: {
    table: "product_lines",
    select: "id,brand_id",
    order: "id",
    row: z.object({ id: z.number(), brand_id: z.number() }),
  },
  paints: {
    table: "paints",
    select: "id,brand_paint_id,name,product_line_id",
    order: "id",
    row: z.object({
      id: z.string(),
      brand_paint_id: z.string(),
      name: z.string(),
      product_line_id: z.number(),
    }),
  },
  userPaints: {
    table: "user_paints",
    select: "user_id,paint_id",
    order: "user_id,paint_id",
    row: z.object({ user_id: z.string(), paint_id: z.string() }),
  },
  palettes: {
    table: "palettes",
    select: "id,user_id,name,created_at",
    order: "id",
    row: z.object({
      id: z.string(),
      user_id: z.string(),
      name: z.string(),
      created_at: z.string(),
    }),
  },
  palettePaints: {
    table: "palette_paints",
    select: "id,palette_id,position,paint_id",
    order: "id",
    row: z.object({
      id: z.string(),
      palette_id: z.string(),
      position: z.number(),
      paint_id: z.string(),
    }),
  },
  paletteGroups: {
    table: "palette_groups",
    select: "id,palette_id,name,position",
    order: "id",
    row: z.object({
      id: z.string(),
      palette_id: z.string(),
      name: z.string(),
      position: z.number(),
    }),
  },
  paletteGroupPaints: {
    table: "palette_group_paints",
    select: "group_id,palette_paint_id,position",
    order: "id",
    row: z.object({ group_id: z.string(), palette_paint_id: z.string(), position: z.number() }),
  },
};

/** Old users with only a confirmed email kept; `profiles.id` is the auth user's ID. */
async function readUsers(source: Source): Promise<OldData["profiles"]> {
  const users = await fetchAuthUsers(source);
  console.log(`Read ${users.length} auth users`);
  return profilesFromAuthUsers(users);
}

async function readLegacyFiles(legacyDir: string): Promise<Record<string, LegacyPaint[]>> {
  const files: Record<string, LegacyPaint[]> = {};
  for (const brandId of Object.keys(BRANDS)) {
    const path = resolve(legacyDir, "paints", `${brandId}.json`);
    files[brandId] = legacyFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  }
  return files;
}

async function readCatalogIds(): Promise<Set<string>> {
  const names = (await readdir(catalogDir)).filter(
    (name) => name.endsWith(".json") && name !== LEDGER_FILE,
  );
  const ids = new Set<string>();
  for (const name of names) {
    const file = catalogFileSchema.parse(
      JSON.parse(await readFile(new URL(name, catalogDir), "utf8")),
    );
    for (const paint of file.paints) ids.add(paint.id);
  }
  return ids;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function main(args: string[]): Promise<number> {
  const [outDirArg, legacyDir] = args;
  let config: ExportConfig;
  try {
    if (!outDirArg || !legacyDir) throw new Error(USAGE);
    config = readConfig(process.env, outDirArg, repoRoot);
    for (const name of OUTPUT_FILES) {
      if (await exists(resolve(config.outDir, name))) {
        throw new Error(
          `${name} already exists in ${config.outDir}; move it or pick another directory`,
        );
      }
    }
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  const source: Source = { url: config.supabaseUrl, secretKey: config.secretKey, fetch };
  const legacyFiles = await readLegacyFiles(legacyDir);
  const catalogIds = await readCatalogIds();
  const paintMap = buildPaintMap(
    {
      brands: await readTable(source, tables.brands),
      productLines: await readTable(source, tables.productLines),
      paints: await readTable(source, tables.paints),
    },
    legacyFiles,
    catalogIds,
  );
  const data: OldData = {
    profiles: await readUsers(source),
    userPaints: await readTable(source, tables.userPaints),
    palettes: await readTable(source, tables.palettes),
    palettePaints: await readTable(source, tables.palettePaints),
    paletteGroups: await readTable(source, tables.paletteGroups),
    paletteGroupPaints: await readTable(source, tables.paletteGroupPaints),
  };
  const { records, report } = transform(data, paintMap, config.hashKey);

  await mkdir(config.outDir, { recursive: true, mode: 0o700 });
  // "wx" refuses to overwrite an earlier export; 0o600 because the file holds people's collections.
  const write = (name: string, value: unknown) =>
    writeFile(resolve(config.outDir, name), `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  await write("export.json", records);
  await write("report.json", report);

  const { totals } = report;
  console.log(
    `Exported ${totals.usersExported} users (${totals.ownedPaints} owned paints, ${totals.palettes} palettes); ` +
      `skipped ${totals.usersSkippedNoEmail} without an email and ${totals.usersWithNoData} with no data; ` +
      `${report.unmapped.length} unmapped paints → ${config.outDir}`,
  );
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
