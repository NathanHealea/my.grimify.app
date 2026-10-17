import { hashEmail, normalizeEmail } from "./hash.ts";
import type { PaintMapping } from "./paint-map.ts";

export type ProfileRow = { id: string; email: string | null };
export type UserPaintRow = { user_id: string; paint_id: string };
export type PaletteRow = { id: string; user_id: string; name: string; created_at: string };
export type PalettePaintRow = {
  id: string;
  palette_id: string;
  position: number;
  paint_id: string;
};
export type PaletteGroupRow = { id: string; palette_id: string; name: string; position: number };
export type PaletteGroupPaintRow = { group_id: string; palette_paint_id: string; position: number };

export type OldData = {
  profiles: ProfileRow[];
  userPaints: UserPaintRow[];
  palettes: PaletteRow[];
  palettePaints: PalettePaintRow[];
  paletteGroups: PaletteGroupRow[];
  paletteGroupPaints: PaletteGroupPaintRow[];
};

export type ExportPalette = {
  name: string;
  paintIds: string[];
  groups: { name: string; paintIds: string[] }[];
};
export type ExportRecord = {
  emailHash: string;
  ownedPaintIds: string[];
  palettes: ExportPalette[];
};

export type UnmappedPaintReport = {
  brand: string;
  brandPaintId: string;
  name: string;
  reason: string;
  ownedRefs: number;
  paletteRefs: number;
};

type Removed = {
  duplicatePaints: number;
  paintsOverCap: number;
  groupsOverCap: number;
  groupPaintsDropped: number;
  namesShortened: number;
  namesUntitled: number;
};

export type ExportReport = {
  totals: {
    usersExported: number;
    usersSkippedNoEmail: number;
    usersWithNoData: number;
    ownedPaints: number;
    palettes: number;
    removed: Removed;
  };
  unmapped: UnmappedPaintReport[];
};

// The same limits convex/palettes.ts enforces on palettes created in the app.
export const PALETTE_NAME_MAX = 60;
export const PALETTE_PAINTS_MAX = 200;
export const PALETTE_GROUPS_MAX = 30;

const UNTITLED = "Untitled";

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row));
    if (list) list.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

function byPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

function fitName(name: string, removed: Removed): string {
  let fitted = name.trim();
  if (fitted.length > PALETTE_NAME_MAX) {
    // Don't keep half of a surrogate pair (an emoji) at the cut.
    fitted = fitted
      .slice(0, PALETTE_NAME_MAX)
      .replace(/[\uD800-\uDBFF]$/, "")
      .trimEnd();
    removed.namesShortened += 1;
  }
  if (fitted === "") {
    removed.namesUntitled += 1;
    return UNTITLED;
  }
  return fitted;
}

export function transform(
  data: OldData,
  paintMap: Map<string, PaintMapping>,
  hashKey: string,
): { records: ExportRecord[]; report: ExportReport } {
  const removed: Removed = {
    duplicatePaints: 0,
    paintsOverCap: 0,
    groupsOverCap: 0,
    groupPaintsDropped: 0,
    namesShortened: 0,
    namesUntitled: 0,
  };
  const catalogIdOf = (oldPaintId: string): string | null => {
    const mapping = paintMap.get(oldPaintId);
    if (!mapping) throw new Error(`Old paint ${oldPaintId} is missing from the paint map`);
    return mapping.catalogId;
  };

  const ownedByUser = groupBy(data.userPaints, (row) => row.user_id);
  const palettesByUser = groupBy(data.palettes, (row) => row.user_id);
  const paintsByPalette = groupBy(data.palettePaints, (row) => row.palette_id);
  const groupsByPalette = groupBy(data.paletteGroups, (row) => row.palette_id);
  const membersByGroup = groupBy(data.paletteGroupPaints, (row) => row.group_id);
  const palettePaintsById = new Map(data.palettePaints.map((row) => [row.id, row]));

  const convertPalette = (palette: PaletteRow): ExportPalette => {
    const unique: string[] = [];
    for (const row of byPosition(paintsByPalette.get(palette.id) ?? [])) {
      const catalogId = catalogIdOf(row.paint_id);
      if (catalogId === null) continue;
      if (unique.includes(catalogId)) removed.duplicatePaints += 1;
      else unique.push(catalogId);
    }
    const paintIds = unique.slice(0, PALETTE_PAINTS_MAX);
    removed.paintsOverCap += unique.length - paintIds.length;
    const kept = new Set(paintIds);

    const groupRows = byPosition(groupsByPalette.get(palette.id) ?? []);
    removed.groupsOverCap += Math.max(0, groupRows.length - PALETTE_GROUPS_MAX);
    const groups = groupRows.slice(0, PALETTE_GROUPS_MAX).map((group) => {
      const members: string[] = [];
      for (const member of byPosition(membersByGroup.get(group.id) ?? [])) {
        const row = palettePaintsById.get(member.palette_paint_id);
        if (!row) throw new Error(`Group ${group.id} references a missing palette paint`);
        const catalogId = catalogIdOf(row.paint_id);
        if (catalogId === null) continue;
        if (!kept.has(catalogId) || members.includes(catalogId)) removed.groupPaintsDropped += 1;
        else members.push(catalogId);
      }
      return { name: fitName(group.name, removed), paintIds: members };
    });

    return { name: fitName(palette.name, removed), paintIds, groups };
  };

  const profilesByEmail = new Map<string, ProfileRow[]>();
  let usersSkippedNoEmail = 0;
  for (const profile of data.profiles) {
    const email = normalizeEmail(profile.email ?? "");
    if (email === "") {
      usersSkippedNoEmail += 1;
      continue;
    }
    profilesByEmail.set(email, [...(profilesByEmail.get(email) ?? []), profile]);
  }

  const records: ExportRecord[] = [];
  let usersWithNoData = 0;
  for (const [email, profiles] of profilesByEmail) {
    const owned = new Set<string>();
    const palettes: PaletteRow[] = [];
    for (const profile of profiles) {
      for (const row of ownedByUser.get(profile.id) ?? []) {
        const catalogId = catalogIdOf(row.paint_id);
        if (catalogId !== null) owned.add(catalogId);
      }
      palettes.push(...(palettesByUser.get(profile.id) ?? []));
    }
    if (owned.size === 0 && palettes.length === 0) {
      usersWithNoData += 1;
      continue;
    }
    palettes.sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
    );
    records.push({
      emailHash: hashEmail(email, hashKey),
      ownedPaintIds: [...owned].sort(),
      palettes: palettes.map(convertPalette),
    });
  }
  records.sort((a, b) => a.emailHash.localeCompare(b.emailHash));

  const countRefs = (rows: { paint_id: string }[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.paint_id, (counts.get(row.paint_id) ?? 0) + 1);
    return counts;
  };
  const ownedRefs = countRefs(data.userPaints);
  const paletteRefs = countRefs(data.palettePaints);
  const unmapped: UnmappedPaintReport[] = [];
  for (const [oldPaintId, mapping] of paintMap) {
    if (mapping.catalogId !== null) continue;
    unmapped.push({
      brand: mapping.brand,
      brandPaintId: mapping.brandPaintId,
      name: mapping.name,
      reason: mapping.reason,
      ownedRefs: ownedRefs.get(oldPaintId) ?? 0,
      paletteRefs: paletteRefs.get(oldPaintId) ?? 0,
    });
  }
  unmapped.sort(
    (a, b) => a.brand.localeCompare(b.brand) || a.brandPaintId.localeCompare(b.brandPaintId),
  );

  return {
    records,
    report: {
      totals: {
        usersExported: records.length,
        usersSkippedNoEmail,
        usersWithNoData,
        ownedPaints: records.reduce((sum, record) => sum + record.ownedPaintIds.length, 0),
        palettes: records.reduce((sum, record) => sum + record.palettes.length, 0),
        removed,
      },
      unmapped,
    },
  };
}
