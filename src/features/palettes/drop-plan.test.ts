import { type FunctionReference, getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { applyPlan, type DragData, optimisticMove, planDrop } from "./drop-plan";

const PALETTE_ID = "palette-1";

const nameOf = (ref: unknown) => getFunctionName(ref as FunctionReference<"query">);

const mainPaint = (paintId: string): DragData => ({ type: "paint", groupId: null, paintId });

function palette() {
  return {
    _id: PALETTE_ID,
    _creationTime: 1,
    userId: "user-1",
    name: "Ultramarines",
    paintIds: ["paint-a", "paint-b", "paint-c", "paint-d"],
    groups: [{ id: "group-trim", name: "Trim", paintIds: ["paint-b"] }],
    updatedAt: 1,
  };
}

describe("planDrop", () => {
  it("plans what a drop does", () => {
    const lists = palette();

    expect(planDrop(mainPaint("paint-c"), mainPaint("paint-a"), lists)).toEqual({
      kind: "movePaint",
      paintId: "paint-c",
      toIndex: 0,
    });
    expect(planDrop(mainPaint("paint-a"), mainPaint("paint-c"), lists)).toEqual({
      kind: "movePaint",
      paintId: "paint-a",
      toIndex: 2,
    });
    expect(planDrop(mainPaint("paint-b"), mainPaint("paint-d"), lists)).toEqual({
      kind: "movePaint",
      paintId: "paint-b",
      toIndex: 3,
    });

    expect(planDrop(mainPaint("paint-b"), mainPaint("paint-b"), lists)).toEqual({
      kind: "none",
      reason: "same-spot",
    });
    expect(planDrop(mainPaint("paint-b"), null, lists)).toEqual({
      kind: "none",
      reason: "no-target",
    });
    expect(planDrop(mainPaint("paint-b"), undefined, lists)).toEqual({
      kind: "none",
      reason: "no-target",
    });
  });
});

describe("a move shows at once and reverts on failure", () => {
  it("applies a main-list move to a copy of the palette", () => {
    const before = { ...palette(), paintIds: ["paint-a", "paint-b", "paint-c"] };
    const snapshot = structuredClone(before);

    const after = applyPlan(before, { kind: "movePaint", paintId: "paint-c", toIndex: 0 });

    expect(after.paintIds).toEqual(["paint-c", "paint-a", "paint-b"]);
    expect(after.groups).toEqual(snapshot.groups);
    expect(after).toMatchObject({ _id: PALETTE_ID, name: "Ultramarines" });
    expect(after).not.toBe(before);
    expect(before).toEqual(snapshot);

    expect(
      applyPlan(before, { kind: "movePaint", paintId: "paint-a", toIndex: 99 }).paintIds,
    ).toEqual(["paint-b", "paint-c", "paint-a"]);
    expect(
      applyPlan(before, { kind: "movePaint", paintId: "paint-b", toIndex: 1 }).paintIds,
    ).toEqual(["paint-a", "paint-b", "paint-c"]);
    expect(applyPlan(before, { kind: "none", reason: "same-spot" })).toEqual(snapshot);
  });

  it("rewrites the cached palette for a main-list move", () => {
    const cached = { ...palette(), paintIds: ["paint-a", "paint-b", "paint-c"] };
    const localStore = {
      getQuery: vi.fn(() => cached),
      setQuery: vi.fn(),
      getAllQueries: vi.fn(() => []),
    };

    optimisticMove(localStore, PALETTE_ID, {
      kind: "movePaint",
      paintId: "paint-c",
      toIndex: 0,
    });

    expect(localStore.getQuery).toHaveBeenCalledOnce();
    const [readRef, readArgs] = localStore.getQuery.mock.calls[0] as unknown as [unknown, unknown];
    expect(nameOf(readRef)).toBe(nameOf(api.palettes.get));
    expect(readArgs).toEqual({ paletteId: PALETTE_ID });

    expect(localStore.setQuery).toHaveBeenCalledOnce();
    const [writeRef, writeArgs, next] = localStore.setQuery.mock.calls[0] as unknown as [
      unknown,
      unknown,
      ReturnType<typeof palette>,
    ];
    expect(nameOf(writeRef)).toBe(nameOf(api.palettes.get));
    expect(writeArgs).toEqual({ paletteId: PALETTE_ID });
    expect(next.paintIds).toEqual(["paint-c", "paint-a", "paint-b"]);
    expect(next.groups).toEqual(cached.groups);
  });

  it("leaves the store alone while the palette is loading or gone", () => {
    for (const cached of [undefined, null]) {
      const localStore = {
        getQuery: vi.fn(() => cached),
        setQuery: vi.fn(),
        getAllQueries: vi.fn(() => []),
      };

      optimisticMove(localStore, PALETTE_ID, {
        kind: "movePaint",
        paintId: "paint-c",
        toIndex: 0,
      });

      expect(localStore.setQuery).not.toHaveBeenCalled();
    }
  });
});
