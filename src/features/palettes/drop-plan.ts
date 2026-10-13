import type { OptimisticLocalStore } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

export type DragData =
  | { type: "paint"; groupId: string | null; paintId: string }
  | { type: "group"; groupId: string }
  | { type: "zone"; groupId: string };

export type DropPlan =
  | { kind: "movePaint"; paintId: string; toIndex: number }
  | { kind: "moveGroupPaint"; groupId: string; paintId: string; toIndex: number }
  | { kind: "addPaintToGroup"; groupId: string; paintId: string; toIndex?: number }
  | {
      kind: "movePaintToGroup";
      fromGroupId: string;
      toGroupId: string;
      paintId: string;
      toIndex?: number;
    }
  | { kind: "moveGroup"; groupId: string; toIndex: number }
  | {
      kind: "none";
      reason: "same-spot" | "no-target" | "already-in-group" | "already-in-main" | "wrong-target";
    };

type PaletteLists = Pick<Doc<"palettes">, "paintIds" | "groups">;

const groupPaints = (palette: PaletteLists, groupId: string) =>
  palette.groups.find((g) => g.id === groupId)?.paintIds ?? [];

/** What dropping `active` on `over` should do, as the mutation to call. */
export function planDrop(
  active: DragData,
  over: DragData | null | undefined,
  palette: PaletteLists,
): DropPlan {
  if (!over) return { kind: "none", reason: "no-target" };

  if (active.type === "group") {
    if (over.type !== "group") return { kind: "none", reason: "wrong-target" };
    if (over.groupId === active.groupId) return { kind: "none", reason: "same-spot" };
    return {
      kind: "moveGroup",
      groupId: active.groupId,
      toIndex: palette.groups.findIndex((g) => g.id === over.groupId),
    };
  }
  if (active.type !== "paint") return { kind: "none", reason: "wrong-target" };

  const { paintId } = active;
  const from = active.groupId;
  const to = over.groupId;
  if (to === null) {
    if (from !== null) return { kind: "none", reason: "already-in-main" };
    if (over.type !== "paint") return { kind: "none", reason: "wrong-target" };
    if (over.paintId === paintId) return { kind: "none", reason: "same-spot" };
    return { kind: "movePaint", paintId, toIndex: palette.paintIds.indexOf(over.paintId) };
  }

  const target = groupPaints(palette, to);
  // Dropping on a row puts the paint before it; a heading or the group's empty space appends.
  const at = over.type === "paint" ? { toIndex: target.indexOf(over.paintId) } : {};
  if (from === to) {
    if (over.type !== "paint" || over.paintId === paintId) {
      return { kind: "none", reason: "same-spot" };
    }
    return { kind: "moveGroupPaint", groupId: to, paintId, toIndex: target.indexOf(over.paintId) };
  }
  if (target.includes(paintId)) return { kind: "none", reason: "already-in-group" };
  if (from === null) return { kind: "addPaintToGroup", groupId: to, paintId, ...at };
  return { kind: "movePaintToGroup", fromGroupId: from, toGroupId: to, paintId, ...at };
}

// Mirrors convex/palettes.ts: toIndex is the position in the resulting list, clamped to its end.
function moveTo<T>(items: T[], item: T, toIndex: number): T[] {
  const from = items.indexOf(item);
  if (from === -1) return items;
  const next = items.filter((_, i) => i !== from);
  next.splice(Math.min(toIndex, next.length), 0, item);
  return next;
}

function insertAt(ids: string[], id: string, toIndex?: number): string[] {
  const next = [...ids];
  next.splice(toIndex ?? ids.length, 0, id);
  return next;
}

/** The palette as it will be once the server applies `plan`. */
export function applyPlan<P extends PaletteLists>(palette: P, plan: DropPlan): P {
  const mapGroups = (change: (group: P["groups"][number]) => P["groups"][number]) => ({
    ...palette,
    groups: palette.groups.map(change),
  });
  switch (plan.kind) {
    case "movePaint":
      return { ...palette, paintIds: moveTo(palette.paintIds, plan.paintId, plan.toIndex) };
    case "moveGroupPaint":
      return mapGroups((g) =>
        g.id === plan.groupId
          ? { ...g, paintIds: moveTo(g.paintIds, plan.paintId, plan.toIndex) }
          : g,
      );
    case "addPaintToGroup":
      return mapGroups((g) =>
        g.id === plan.groupId && !g.paintIds.includes(plan.paintId)
          ? { ...g, paintIds: insertAt(g.paintIds, plan.paintId, plan.toIndex) }
          : g,
      );
    case "movePaintToGroup": {
      const source = palette.groups.find((g) => g.id === plan.fromGroupId);
      if (!source?.paintIds.includes(plan.paintId)) return palette;
      return mapGroups((g) => {
        if (g.id === plan.fromGroupId) {
          return { ...g, paintIds: g.paintIds.filter((id) => id !== plan.paintId) };
        }
        if (g.id === plan.toGroupId && !g.paintIds.includes(plan.paintId)) {
          return { ...g, paintIds: insertAt(g.paintIds, plan.paintId, plan.toIndex) };
        }
        return g;
      });
    }
    case "moveGroup": {
      const group = palette.groups.find((g) => g.id === plan.groupId);
      if (!group) return palette;
      return { ...palette, groups: moveTo(palette.groups, group, plan.toIndex) };
    }
    case "none":
      return palette;
  }
}

/** Shows a move in the cached palette before the server confirms it; Convex rolls it back on failure. */
export function optimisticMove(
  localStore: OptimisticLocalStore,
  paletteId: string,
  plan: DropPlan,
): void {
  const palette = localStore.getQuery(api.palettes.get, { paletteId });
  if (!palette) return;
  localStore.setQuery(api.palettes.get, { paletteId }, applyPlan(palette, plan));
}
