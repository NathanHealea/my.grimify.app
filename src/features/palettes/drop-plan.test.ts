import { type FunctionReference, getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import {
  announceCancel,
  announceDrop,
  announceOver,
  announcePickUp,
  applyPlan,
  type DragData,
  optimisticMove,
  planDrop,
} from "./drop-plan";

const PALETTE_ID = "palette-1";

const nameOf = (ref: unknown) => getFunctionName(ref as FunctionReference<"query">);

const mainPaint = (paintId: string): DragData => ({ type: "paint", groupId: null, paintId });
const groupPaint = (groupId: string, paintId: string): DragData => ({
  type: "paint",
  groupId,
  paintId,
});
const heading = (groupId: string): DragData => ({ type: "group", groupId });
const zone = (groupId: string): DragData => ({ type: "zone", groupId });

function palette() {
  return {
    _id: PALETTE_ID,
    _creationTime: 1,
    userId: "user-1",
    name: "Ultramarines",
    paintIds: ["paint-a", "paint-b", "paint-c", "paint-d"],
    groups: [
      { id: "group-trim", name: "Trim", paintIds: ["paint-b"] },
      { id: "group-armor", name: "Armor", paintIds: ["paint-a", "paint-c", "paint-d"] },
      { id: "group-highlights", name: "Highlights", paintIds: ["paint-b", "paint-d"] },
    ],
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

    expect(
      planDrop(groupPaint("group-armor", "paint-d"), groupPaint("group-armor", "paint-a"), lists),
    ).toEqual({ kind: "moveGroupPaint", groupId: "group-armor", paintId: "paint-d", toIndex: 0 });
    expect(
      planDrop(groupPaint("group-armor", "paint-a"), groupPaint("group-armor", "paint-d"), lists),
    ).toEqual({ kind: "moveGroupPaint", groupId: "group-armor", paintId: "paint-a", toIndex: 2 });
    expect(
      planDrop(groupPaint("group-armor", "paint-c"), groupPaint("group-armor", "paint-c"), lists),
    ).toEqual({ kind: "none", reason: "same-spot" });

    expect(planDrop(mainPaint("paint-c"), groupPaint("group-trim", "paint-b"), lists)).toEqual({
      kind: "addPaintToGroup",
      groupId: "group-trim",
      paintId: "paint-c",
      toIndex: 0,
    });
    expect(planDrop(mainPaint("paint-b"), groupPaint("group-armor", "paint-d"), lists)).toEqual({
      kind: "addPaintToGroup",
      groupId: "group-armor",
      paintId: "paint-b",
      toIndex: 2,
    });
    expect(planDrop(mainPaint("paint-a"), groupPaint("group-armor", "paint-c"), lists)).toEqual({
      kind: "none",
      reason: "already-in-group",
    });
    expect(planDrop(mainPaint("paint-b"), groupPaint("group-trim", "paint-b"), lists)).toEqual({
      kind: "none",
      reason: "already-in-group",
    });

    expect(planDrop(mainPaint("paint-c"), zone("group-trim"), lists)).toEqual({
      kind: "addPaintToGroup",
      groupId: "group-trim",
      paintId: "paint-c",
    });
    expect(planDrop(mainPaint("paint-c"), heading("group-trim"), lists)).toEqual({
      kind: "addPaintToGroup",
      groupId: "group-trim",
      paintId: "paint-c",
    });
    expect(planDrop(mainPaint("paint-b"), zone("group-trim"), lists)).toEqual({
      kind: "none",
      reason: "already-in-group",
    });
    expect(planDrop(mainPaint("paint-b"), heading("group-trim"), lists)).toEqual({
      kind: "none",
      reason: "already-in-group",
    });

    expect(
      planDrop(
        groupPaint("group-armor", "paint-c"),
        groupPaint("group-highlights", "paint-b"),
        lists,
      ),
    ).toEqual({
      kind: "movePaintToGroup",
      fromGroupId: "group-armor",
      toGroupId: "group-highlights",
      paintId: "paint-c",
      toIndex: 0,
    });
    expect(
      planDrop(
        groupPaint("group-armor", "paint-c"),
        groupPaint("group-highlights", "paint-d"),
        lists,
      ),
    ).toEqual({
      kind: "movePaintToGroup",
      fromGroupId: "group-armor",
      toGroupId: "group-highlights",
      paintId: "paint-c",
      toIndex: 1,
    });
    expect(
      planDrop(
        groupPaint("group-armor", "paint-d"),
        groupPaint("group-highlights", "paint-b"),
        lists,
      ),
    ).toEqual({ kind: "none", reason: "already-in-group" });

    expect(planDrop(groupPaint("group-armor", "paint-c"), zone("group-highlights"), lists)).toEqual(
      {
        kind: "movePaintToGroup",
        fromGroupId: "group-armor",
        toGroupId: "group-highlights",
        paintId: "paint-c",
      },
    );
    expect(planDrop(groupPaint("group-armor", "paint-c"), heading("group-trim"), lists)).toEqual({
      kind: "movePaintToGroup",
      fromGroupId: "group-armor",
      toGroupId: "group-trim",
      paintId: "paint-c",
    });
    expect(planDrop(groupPaint("group-armor", "paint-c"), zone("group-armor"), lists)).toEqual({
      kind: "none",
      reason: "same-spot",
    });
    expect(planDrop(groupPaint("group-armor", "paint-c"), heading("group-armor"), lists)).toEqual({
      kind: "none",
      reason: "same-spot",
    });
    expect(planDrop(groupPaint("group-armor", "paint-d"), zone("group-highlights"), lists)).toEqual(
      { kind: "none", reason: "already-in-group" },
    );
    expect(
      planDrop(groupPaint("group-armor", "paint-d"), heading("group-highlights"), lists),
    ).toEqual({ kind: "none", reason: "already-in-group" });

    expect(planDrop(groupPaint("group-armor", "paint-c"), mainPaint("paint-a"), lists)).toEqual({
      kind: "none",
      reason: "already-in-main",
    });

    expect(planDrop(heading("group-trim"), heading("group-highlights"), lists)).toEqual({
      kind: "moveGroup",
      groupId: "group-trim",
      toIndex: 2,
    });
    expect(planDrop(heading("group-highlights"), heading("group-trim"), lists)).toEqual({
      kind: "moveGroup",
      groupId: "group-highlights",
      toIndex: 0,
    });
    expect(planDrop(heading("group-armor"), heading("group-armor"), lists)).toEqual({
      kind: "none",
      reason: "same-spot",
    });

    expect(planDrop(heading("group-trim"), mainPaint("paint-a"), lists)).toEqual({
      kind: "none",
      reason: "wrong-target",
    });
    expect(planDrop(heading("group-trim"), groupPaint("group-armor", "paint-c"), lists)).toEqual({
      kind: "none",
      reason: "wrong-target",
    });
    expect(planDrop(heading("group-trim"), zone("group-armor"), lists)).toEqual({
      kind: "none",
      reason: "wrong-target",
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

  it("applies a reorder within a group to a copy of the palette", () => {
    const before = palette();
    const snapshot = structuredClone(before);

    const after = applyPlan(before, {
      kind: "moveGroupPaint",
      groupId: "group-armor",
      paintId: "paint-d",
      toIndex: 0,
    });

    expect(after.groups).toEqual([
      { id: "group-trim", name: "Trim", paintIds: ["paint-b"] },
      { id: "group-armor", name: "Armor", paintIds: ["paint-d", "paint-a", "paint-c"] },
      { id: "group-highlights", name: "Highlights", paintIds: ["paint-b", "paint-d"] },
    ]);
    expect(after.paintIds).toEqual(snapshot.paintIds);
    expect(before).toEqual(snapshot);

    const clamped = applyPlan(before, {
      kind: "moveGroupPaint",
      groupId: "group-armor",
      paintId: "paint-a",
      toIndex: 99,
    });
    expect(clamped.groups[1].paintIds).toEqual(["paint-c", "paint-d", "paint-a"]);
    expect(before).toEqual(snapshot);
  });

  it("applies an add to a group at a position or at the end", () => {
    const before = palette();
    const snapshot = structuredClone(before);

    const atStart = applyPlan(before, {
      kind: "addPaintToGroup",
      groupId: "group-trim",
      paintId: "paint-c",
      toIndex: 0,
    });
    expect(atStart.groups[0].paintIds).toEqual(["paint-c", "paint-b"]);
    expect(atStart.paintIds).toEqual(snapshot.paintIds);
    expect(atStart.groups.slice(1)).toEqual(snapshot.groups.slice(1));

    const appended = applyPlan(before, {
      kind: "addPaintToGroup",
      groupId: "group-trim",
      paintId: "paint-c",
    });
    expect(appended.groups[0].paintIds).toEqual(["paint-b", "paint-c"]);
    expect(appended.paintIds).toEqual(snapshot.paintIds);
    expect(before).toEqual(snapshot);
  });

  it("applies a move between groups at a position or at the end", () => {
    const before = palette();
    const snapshot = structuredClone(before);

    const placed = applyPlan(before, {
      kind: "movePaintToGroup",
      fromGroupId: "group-armor",
      toGroupId: "group-highlights",
      paintId: "paint-c",
      toIndex: 1,
    });
    expect(placed.groups[1].paintIds).toEqual(["paint-a", "paint-d"]);
    expect(placed.groups[2].paintIds).toEqual(["paint-b", "paint-c", "paint-d"]);
    expect(placed.groups[0]).toEqual(snapshot.groups[0]);
    expect(placed.paintIds).toEqual(snapshot.paintIds);

    const appended = applyPlan(before, {
      kind: "movePaintToGroup",
      fromGroupId: "group-armor",
      toGroupId: "group-highlights",
      paintId: "paint-c",
    });
    expect(appended.groups[1].paintIds).toEqual(["paint-a", "paint-d"]);
    expect(appended.groups[2].paintIds).toEqual(["paint-b", "paint-d", "paint-c"]);

    const alreadyThere = applyPlan(before, {
      kind: "movePaintToGroup",
      fromGroupId: "group-armor",
      toGroupId: "group-highlights",
      paintId: "paint-d",
      toIndex: 0,
    });
    expect(alreadyThere.groups[1].paintIds).toEqual(["paint-a", "paint-c"]);
    expect(alreadyThere.groups[2].paintIds).toEqual(["paint-b", "paint-d"]);

    expect(before).toEqual(snapshot);
  });

  it("applies a group reorder keeping each group's paints", () => {
    const before = palette();
    const snapshot = structuredClone(before);

    const after = applyPlan(before, { kind: "moveGroup", groupId: "group-highlights", toIndex: 0 });

    expect(after.groups).toEqual([
      { id: "group-highlights", name: "Highlights", paintIds: ["paint-b", "paint-d"] },
      { id: "group-trim", name: "Trim", paintIds: ["paint-b"] },
      { id: "group-armor", name: "Armor", paintIds: ["paint-a", "paint-c", "paint-d"] },
    ]);
    expect(after.paintIds).toEqual(snapshot.paintIds);
    expect(before).toEqual(snapshot);
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

  it("rewrites the cached palette for a reorder within a group", () => {
    const cached = palette();
    const localStore = {
      getQuery: vi.fn(() => cached),
      setQuery: vi.fn(),
      getAllQueries: vi.fn(() => []),
    };

    optimisticMove(localStore, PALETTE_ID, {
      kind: "moveGroupPaint",
      groupId: "group-armor",
      paintId: "paint-d",
      toIndex: 0,
    });

    expect(localStore.setQuery).toHaveBeenCalledOnce();
    const [writeRef, writeArgs, next] = localStore.setQuery.mock.calls[0] as unknown as [
      unknown,
      unknown,
      ReturnType<typeof palette>,
    ];
    expect(nameOf(writeRef)).toBe(nameOf(api.palettes.get));
    expect(writeArgs).toEqual({ paletteId: PALETTE_ID });
    expect(next.groups[1].paintIds).toEqual(["paint-d", "paint-a", "paint-c"]);
    expect(next.paintIds).toEqual(cached.paintIds);
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

describe("screen reader announcements", () => {
  it("announces drags with names and positions", () => {
    const lists = palette();
    const names: Record<string, string> = {
      "paint-a": "Macragge Blue",
      "paint-b": "Retributor Armour",
      "paint-c": "Abaddon Black",
      "paint-d": "Leadbelcher",
    };
    const paintName = (paintId: string) => names[paintId];

    expect(announcePickUp(mainPaint("paint-b"), lists, paintName)).toBe(
      "Picked up Retributor Armour, position 2 of 4 in All paints.",
    );
    expect(announcePickUp(groupPaint("group-armor", "paint-c"), lists, paintName)).toBe(
      "Picked up Abaddon Black, position 2 of 3 in Armor.",
    );
    expect(announcePickUp(heading("group-highlights"), lists, paintName)).toBe(
      "Picked up group Highlights, position 3 of 3.",
    );

    expect(announceOver(mainPaint("paint-a"), null, lists, paintName)).toBe(
      "Macragge Blue is not over a list.",
    );
    expect(announceOver(heading("group-trim"), undefined, lists, paintName)).toBe(
      "Group Trim is not over another group.",
    );
    expect(announceOver(mainPaint("paint-b"), mainPaint("paint-d"), lists, paintName)).toBe(
      "Retributor Armour is over position 4 of 4 in All paints.",
    );
    expect(announceOver(mainPaint("paint-b"), mainPaint("paint-b"), lists, paintName)).toBe(
      "Retributor Armour is over position 2 of 4 in All paints.",
    );
    expect(
      announceOver(
        groupPaint("group-armor", "paint-a"),
        groupPaint("group-armor", "paint-d"),
        lists,
        paintName,
      ),
    ).toBe("Macragge Blue is over position 3 of 3 in Armor.");
    expect(announceOver(heading("group-trim"), heading("group-highlights"), lists, paintName)).toBe(
      "Group Trim is over position 3 of 3.",
    );
    expect(
      announceOver(
        mainPaint("paint-a"),
        groupPaint("group-highlights", "paint-d"),
        lists,
        paintName,
      ),
    ).toBe("Macragge Blue is over Highlights, position 2 of 3. Dropping adds it to Highlights.");
    expect(
      announceOver(
        groupPaint("group-armor", "paint-c"),
        groupPaint("group-trim", "paint-b"),
        lists,
        paintName,
      ),
    ).toBe("Abaddon Black is over Trim, position 1 of 2. Dropping moves it to Trim.");
    expect(announceOver(mainPaint("paint-c"), zone("group-trim"), lists, paintName)).toBe(
      "Abaddon Black is over Trim, position 2 of 2. Dropping adds it to Trim.",
    );
    expect(
      announceOver(
        groupPaint("group-armor", "paint-a"),
        heading("group-highlights"),
        lists,
        paintName,
      ),
    ).toBe("Macragge Blue is over Highlights, position 3 of 3. Dropping moves it to Highlights.");
    expect(
      announceOver(groupPaint("group-armor", "paint-c"), zone("group-armor"), lists, paintName),
    ).toBe("Abaddon Black is over position 2 of 3 in Armor.");
    expect(
      announceOver(groupPaint("group-armor", "paint-c"), heading("group-armor"), lists, paintName),
    ).toBe("Abaddon Black is over position 2 of 3 in Armor.");
    expect(announceOver(mainPaint("paint-b"), zone("group-trim"), lists, paintName)).toBe(
      "Retributor Armour is already in Trim.",
    );
    expect(
      announceOver(groupPaint("group-armor", "paint-a"), mainPaint("paint-b"), lists, paintName),
    ).toBe("Macragge Blue is already in All paints.");

    expect(announceDrop(mainPaint("paint-a"), mainPaint("paint-c"), lists, paintName)).toBe(
      "Dropped Macragge Blue at position 3 of 4 in All paints.",
    );
    expect(
      announceDrop(
        groupPaint("group-armor", "paint-d"),
        groupPaint("group-armor", "paint-a"),
        lists,
        paintName,
      ),
    ).toBe("Dropped Leadbelcher at position 1 of 3 in Armor.");
    expect(announceDrop(heading("group-highlights"), heading("group-trim"), lists, paintName)).toBe(
      "Dropped group Highlights at position 1 of 3.",
    );
    expect(
      announceDrop(
        mainPaint("paint-c"),
        groupPaint("group-highlights", "paint-b"),
        lists,
        paintName,
      ),
    ).toBe("Added Abaddon Black to Highlights.");
    expect(
      announceDrop(groupPaint("group-armor", "paint-c"), zone("group-trim"), lists, paintName),
    ).toBe("Moved Abaddon Black to Trim.");
    expect(announceDrop(mainPaint("paint-b"), zone("group-highlights"), lists, paintName)).toBe(
      "Retributor Armour is already in Highlights; nothing changed.",
    );
    expect(
      announceDrop(groupPaint("group-trim", "paint-b"), mainPaint("paint-a"), lists, paintName),
    ).toBe("Retributor Armour is already in All paints; nothing changed.");
    expect(announceDrop(mainPaint("paint-b"), mainPaint("paint-b"), lists, paintName)).toBe(
      "Retributor Armour is back at position 2 of 4 in All paints.",
    );
    expect(announceDrop(groupPaint("group-armor", "paint-c"), null, lists, paintName)).toBe(
      "Abaddon Black is back at position 2 of 3 in Armor.",
    );
    expect(announceDrop(heading("group-armor"), heading("group-armor"), lists, paintName)).toBe(
      "Group Armor is back at position 2 of 3.",
    );
    expect(announceDrop(heading("group-armor"), mainPaint("paint-a"), lists, paintName)).toBe(
      "Group Armor is back at position 2 of 3.",
    );

    expect(announceCancel(mainPaint("paint-d"), lists, paintName)).toBe(
      "Cancelled; Leadbelcher is back at position 4 of 4 in All paints.",
    );
    expect(announceCancel(heading("group-trim"), lists, paintName)).toBe(
      "Cancelled; group Trim is back at position 1 of 3.",
    );

    const noNames = () => undefined;
    expect(announcePickUp(mainPaint("paint-a"), lists, noNames)).toBe(
      "Picked up Unknown paint, position 1 of 4 in All paints.",
    );
    expect(announceOver(mainPaint("paint-a"), null, lists, noNames)).toBe(
      "Unknown paint is not over a list.",
    );
  });
});
