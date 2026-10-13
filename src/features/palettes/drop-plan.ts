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

/** What dropping `active` on `over` should do, as the mutation to call. */
export function planDrop(
  active: DragData,
  over: DragData | null | undefined,
  palette: PaletteLists,
): DropPlan {
  if (!over) return { kind: "none", reason: "no-target" };
  if (active.type === "paint" && over.type === "paint") {
    if (active.groupId === over.groupId && active.paintId === over.paintId) {
      return { kind: "none", reason: "same-spot" };
    }
    if (active.groupId === null && over.groupId === null) {
      return {
        kind: "movePaint",
        paintId: active.paintId,
        toIndex: palette.paintIds.indexOf(over.paintId),
      };
    }
  }
  return { kind: "none", reason: "wrong-target" };
}

// Mirrors convex/palettes.ts: toIndex is the position in the resulting list, clamped to its end.
function moveTo<T>(items: T[], item: T, toIndex: number): T[] {
  const from = items.indexOf(item);
  if (from === -1) return items;
  const next = items.filter((_, i) => i !== from);
  next.splice(Math.min(toIndex, next.length), 0, item);
  return next;
}

/** The palette as it will be once the server applies `plan`. */
export function applyPlan<P extends PaletteLists>(palette: P, plan: DropPlan): P {
  switch (plan.kind) {
    case "movePaint":
      return { ...palette, paintIds: moveTo(palette.paintIds, plan.paintId, plan.toIndex) };
    default:
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
