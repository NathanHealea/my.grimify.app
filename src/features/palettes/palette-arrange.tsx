import "./palette-arrange.css";

import {
  type Active,
  type Announcements,
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  type Over,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { ArrowUpDown, GripVertical } from "lucide-react";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import type { Catalog } from "@/features/catalog/schema";
import { useToast } from "@/features/feedback/toast-provider";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { DragPreview } from "./drag-preview";
import {
  announceCancel,
  announceDrop,
  announceOver,
  announcePickUp,
  type DragData,
  type DropPlan,
  dropRefusal,
  optimisticMove,
  planDrop,
  positionOf,
} from "./drop-plan";
import { MoveSheet } from "./move-sheet";

const DRAG_INSTRUCTIONS =
  "Press Space to pick up. Use the arrow keys to move, Space to drop, Escape to cancel.";

/** The ID dnd-kit knows an item by; a paint in two lists needs a different one in each. */
export function sortableIdOf(data: DragData): string {
  if (data.type === "paint") {
    return data.groupId === null ? `main:${data.paintId}` : `group:${data.groupId}:${data.paintId}`;
  }
  return `${data.type === "group" ? "heading" : "zone"}:${data.groupId}`;
}

/** Where the dragged item ends up once `plan` is applied. */
function landingOf(plan: DropPlan, active: DragData): DragData {
  switch (plan.kind) {
    case "movePaint":
      return { type: "paint", groupId: null, paintId: plan.paintId };
    case "moveGroupPaint":
    case "addPaintToGroup":
      return { type: "paint", groupId: plan.groupId, paintId: plan.paintId };
    case "movePaintToGroup":
      return { type: "paint", groupId: plan.toGroupId, paintId: plan.paintId };
    case "moveGroup":
      return { type: "group", groupId: plan.groupId };
    case "none":
      return active;
  }
}

const dataOf = (item: { data: { current?: unknown } } | null | undefined) =>
  item?.data.current as DragData | undefined;

// Groups only land on group headings. A paint prefers the row under the pointer, then a group's
// drop area; the keyboard has no pointer, so it falls back to the nearest item.
const collisionDetection: CollisionDetection = (args) => {
  const draggingGroup = dataOf(args.active)?.type === "group";
  const droppableContainers = args.droppableContainers.filter(
    (container) => (dataOf(container)?.type === "group") === draggingGroup,
  );
  const filtered = { ...args, droppableContainers };
  if (draggingGroup) return closestCenter(filtered);
  const within = pointerWithin(filtered);
  const rows = within.filter(
    (collision) => dataOf(droppableContainers.find((c) => c.id === collision.id))?.type === "paint",
  );
  if (rows.length > 0) return rows;
  return within.length > 0 ? within : closestCenter(filtered);
};

/** Runs a move plan against the server, shown at once and reverted with a toast if it fails. */
export function usePaletteMoves(palette: Doc<"palettes">, nameOf: (paintId: string) => string) {
  const toast = useToast();
  const movePaint = useMutation(api.palettes.movePaint).withOptimisticUpdate((store, args) =>
    optimisticMove(store, args.paletteId, {
      kind: "movePaint",
      paintId: args.paintId,
      toIndex: args.toIndex,
    }),
  );
  const moveGroupPaint = useMutation(api.palettes.moveGroupPaint).withOptimisticUpdate(
    (store, { paletteId, ...args }) =>
      optimisticMove(store, paletteId, { kind: "moveGroupPaint", ...args }),
  );
  const addPaintToGroup = useMutation(api.palettes.addPaintToGroup).withOptimisticUpdate(
    (store, { paletteId, ...args }) =>
      optimisticMove(store, paletteId, { kind: "addPaintToGroup", ...args }),
  );
  const movePaintToGroup = useMutation(api.palettes.movePaintToGroup).withOptimisticUpdate(
    (store, { paletteId, ...args }) =>
      optimisticMove(store, paletteId, { kind: "movePaintToGroup", ...args }),
  );
  const moveGroup = useMutation(api.palettes.moveGroup).withOptimisticUpdate(
    (store, { paletteId, ...args }) =>
      optimisticMove(store, paletteId, { kind: "moveGroup", ...args }),
  );

  return (plan: DropPlan) => {
    const paletteId = palette._id;
    let saving: Promise<null>;
    let name: string;
    switch (plan.kind) {
      case "none":
        return;
      case "moveGroup":
        name = `group ${palette.groups.find((g) => g.id === plan.groupId)?.name ?? ""}`;
        saving = moveGroup({ paletteId, groupId: plan.groupId, toIndex: plan.toIndex });
        break;
      case "movePaint":
        name = nameOf(plan.paintId);
        saving = movePaint({ paletteId, paintId: plan.paintId, toIndex: plan.toIndex });
        break;
      case "moveGroupPaint":
        name = nameOf(plan.paintId);
        saving = moveGroupPaint({
          paletteId,
          groupId: plan.groupId,
          paintId: plan.paintId,
          toIndex: plan.toIndex,
        });
        break;
      case "addPaintToGroup":
        name = nameOf(plan.paintId);
        saving = addPaintToGroup({
          paletteId,
          groupId: plan.groupId,
          paintId: plan.paintId,
          toIndex: plan.toIndex,
        });
        break;
      case "movePaintToGroup":
        name = nameOf(plan.paintId);
        saving = movePaintToGroup({
          paletteId,
          fromGroupId: plan.fromGroupId,
          toGroupId: plan.toGroupId,
          paintId: plan.paintId,
          toIndex: plan.toIndex,
        });
        break;
    }
    saving.catch((cause: unknown) => {
      console.error("Moving failed", cause);
      toast(`Couldn't move ${name}. Check your connection and try again.`);
    });
  };
}

const OpenMoveSheet = createContext<(data: DragData) => void>(() => undefined);

/** The plan that puts `data` at `toIndex` within its own list. */
function reorderPlan(data: DragData, toIndex: number): DropPlan {
  if (data.type === "group") return { kind: "moveGroup", groupId: data.groupId, toIndex };
  if (data.type === "zone") return { kind: "none", reason: "wrong-target" };
  return data.groupId === null
    ? { kind: "movePaint", paintId: data.paintId, toIndex }
    : { kind: "moveGroupPaint", groupId: data.groupId, paintId: data.paintId, toIndex };
}

// jsdom has no matchMedia.
const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function PaletteArrange({
  palette,
  catalog,
  online,
  children,
}: {
  palette: Doc<"palettes">;
  catalog: Catalog;
  online: boolean;
  children: ReactNode;
}) {
  const paints = useMemo(() => new Map(catalog.paints.map((p) => [p.id, p])), [catalog]);
  const brands = useMemo(() => new Map(catalog.brands.map((b) => [b.id, b.name])), [catalog]);
  const nameOf = (paintId: string) => paints.get(paintId)?.name ?? "unknown paint";
  const [dragging, setDragging] = useState<DragData | null>(null);
  // The handle takes every touch (touch-action: none); the hold keeps a tap on it from starting a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = usePaletteMoves(palette, nameOf);
  const toast = useToast();
  // dnd-kit's own restore focuses the handle the drag started from, which a move between lists removes.
  // Kept after closing so the sheet keeps its title while it animates out and focus knows where to return.
  const [moving, setMoving] = useState<DragData>({ type: "group", groupId: "" });
  const [moveOpen, setMoveOpen] = useState(false);
  const moveReturn = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return document.querySelector<HTMLElement>(`[data-move-button="${sortableIdOf(moving)}"]`);
      },
    }),
    [moving],
  );
  const openMove = (data: DragData) => {
    setMoving(data);
    setMoveOpen(true);
  };
  const byKeyboard = useRef(false);
  const focusAfterDrop = useRef<string | null>(null);

  useEffect(() => {
    const id = focusAfterDrop.current;
    if (id === null) return;
    const handle = document.querySelector<HTMLElement>(`[data-drag-handle="${id}"]`);
    if (!handle) return;
    focusAfterDrop.current = null;
    handle.focus();
  }, [palette, dragging]);

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    byKeyboard.current = activatorEvent instanceof KeyboardEvent;
    setDragging(dataOf(active) ?? null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const data = dataOf(active);
    setDragging(null);
    if (!data) return;
    // Edits need a connection (DECISIONS 047); a drag that ends offline changes nothing.
    const plan: DropPlan = online
      ? planDrop(data, dataOf(over), palette)
      : { kind: "none", reason: "no-target" };
    if (byKeyboard.current) {
      focusAfterDrop.current = sortableIdOf(landingOf(plan, data));
    } else if (online) {
      // Keyboard users hear why in the drop announcement; pointer users only see that nothing moved.
      const refusal = dropRefusal(data, dataOf(over), palette);
      if (refusal) toast(refusal);
    }
    move(plan);
  };

  const onDragCancel = () => {
    if (byKeyboard.current && dragging) focusAfterDrop.current = sortableIdOf(dragging);
    setDragging(null);
  };

  const paintName = (paintId: string) => paints.get(paintId)?.name;
  const announce =
    (say: (active: DragData, over: DragData | undefined) => string) =>
    ({ active, over }: { active: Active; over?: Over | null }) => {
      const data = dataOf(active);
      return data && say(data, dataOf(over));
    };
  const announcements: Announcements = {
    onDragStart: announce((active) => announcePickUp(active, palette, paintName)),
    onDragOver: announce((active, over) => announceOver(active, over, palette, paintName)),
    // An offline drop changes nothing, so it's announced as a drop on no target.
    onDragEnd: announce((active, over) =>
      announceDrop(active, online ? over : undefined, palette, paintName),
    ),
    onDragCancel: announce((active) => announceCancel(active, palette, paintName)),
  };

  const preview = (data: DragData) => {
    if (data.type === "paint") {
      const paint = paints.get(data.paintId);
      return (
        <DragPreview kind="paint" paint={paint} brandName={paint && brands.get(paint.brandId)} />
      );
    }
    const group = palette.groups.find((g) => g.id === data.groupId);
    return <DragPreview kind="group" name={group?.name ?? ""} />;
  };

  const movingPosition = positionOf(moving, palette);
  const movingTitle =
    moving.type === "paint"
      ? `Move ${paintName(moving.paintId) ?? "unknown paint"}`
      : `Move group ${palette.groups.find((g) => g.id === moving.groupId)?.name ?? ""}`;

  return (
    // dnd-kit renders its live region in place unless given a container; the body keeps it out of the page's own status regions.
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{
        container: document.body,
        restoreFocus: false,
        screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS },
        announcements,
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <OpenMoveSheet.Provider value={openMove}>{children}</OpenMoveSheet.Provider>
      <MoveSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title={movingTitle}
        index={movingPosition.index}
        count={movingPosition.count}
        online={online}
        returnFocus={moveReturn}
        onMove={(toIndex) => move(reorderPlan(moving, toIndex))}
      />
      <DragOverlay dropAnimation={prefersReducedMotion() ? null : undefined}>
        {dragging && preview(dragging)}
      </DragOverlay>
    </DndContext>
  );
}

type Sortable = ReturnType<typeof useSortable>;

/** Opens the Move sheet, the non-drag way to reorder this paint or group. */
export function MoveButton({
  data,
  label,
  disabled,
}: {
  data: DragData;
  label: string;
  disabled: boolean;
}) {
  const openMove = useContext(OpenMoveSheet);
  return (
    <Button
      variant="ghost"
      size="icon"
      data-move-button={sortableIdOf(data)}
      aria-label={label}
      disabled={disabled}
      onClick={() => openMove(data)}
    >
      <ArrowUpDown aria-hidden="true" />
    </Button>
  );
}

/** The only part of a row that takes a drag, so a touch anywhere else still scrolls the page. */
export function DragHandle({
  activatorRef,
  attributes,
  listeners,
  id,
  label,
  disabled,
}: {
  activatorRef: Sortable["setActivatorNodeRef"];
  attributes: Sortable["attributes"];
  listeners: Sortable["listeners"];
  id: string;
  label: string;
  disabled: boolean;
}) {
  return (
    <Button
      ref={activatorRef}
      variant="ghost"
      size="icon"
      className="palette-arrange__handle"
      data-drag-handle={id}
      disabled={disabled}
      {...attributes}
      {...listeners}
      aria-label={label}
    >
      <GripVertical aria-hidden="true" />
    </Button>
  );
}

/** A paint row that drags by its handle. */
export function SortableItem({
  data,
  name,
  disabled,
  className,
  children,
}: {
  data: DragData;
  /** The paint's name, for the handle and Move button labels. */
  name: string;
  disabled: boolean;
  className: string;
  children: ReactNode;
}) {
  const id = sortableIdOf(data);
  const {
    active,
    attributes,
    isDragging,
    isOver,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id, data, disabled });
  const from = dataOf(active);
  // Rows in another list don't shift to make room, so a line marks where the paint will go.
  const dropBefore =
    isOver && from?.type === "paint" && data.type === "paint" && from.groupId !== data.groupId;

  return (
    <li
      ref={setNodeRef}
      className={`${className} palette-arrange__item`}
      data-dragging={isDragging || undefined}
      data-drop-before={dropBefore || undefined}
      style={{
        "--drag-x": transform ? `${transform.x}px` : undefined,
        "--drag-y": transform ? `${transform.y}px` : undefined,
        "--drag-transition": transition ?? undefined,
      }}
    >
      {children}
      <MoveButton data={data} label={`Move ${name}`} disabled={disabled} />
      <DragHandle
        activatorRef={setActivatorNodeRef}
        attributes={attributes}
        listeners={listeners}
        id={id}
        label={`Drag ${name}`}
        disabled={disabled}
      />
    </li>
  );
}
