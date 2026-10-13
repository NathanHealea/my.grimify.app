import "./palette-arrange.css";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { GripVertical } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Catalog } from "@/features/catalog/schema";
import { useToast } from "@/features/feedback/toast-provider";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { DragPreview } from "./drag-preview";
import { type DragData, type DropPlan, optimisticMove, planDrop } from "./drop-plan";

const DRAG_INSTRUCTIONS =
  "Press Space to pick up. Use the arrow keys to move, Space to drop, Escape to cancel.";

/** Runs a move plan against the server, shown at once and reverted with a toast if it fails. */
export function usePaletteMoves(paletteId: string, nameOf: (paintId: string) => string) {
  const toast = useToast();
  const movePaint = useMutation(api.palettes.movePaint).withOptimisticUpdate((store, args) =>
    optimisticMove(store, args.paletteId, {
      kind: "movePaint",
      paintId: args.paintId,
      toIndex: args.toIndex,
    }),
  );

  return (plan: DropPlan) => {
    if (plan.kind !== "movePaint") return;
    movePaint({
      paletteId: paletteId as Id<"palettes">,
      paintId: plan.paintId,
      toIndex: plan.toIndex,
    }).catch((cause: unknown) => {
      console.error("Moving the paint failed", cause);
      toast(`Couldn't move ${nameOf(plan.paintId)}. Check your connection and try again.`);
    });
  };
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
  // Touch waits for a short hold so a swipe that starts on a handle still scrolls; mouse needs a little travel.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = usePaletteMoves(palette._id, nameOf);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    // Edits need a connection (DECISIONS 047); a drag that ends offline changes nothing.
    if (!online) return;
    move(planDrop(active.data.current as DragData, over?.data.current as DragData, palette));
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

  return (
    // dnd-kit renders its live region in place unless given a container; the body keeps it out of the page's own status regions.
    <DndContext
      sensors={sensors}
      accessibility={{
        container: document.body,
        screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS },
      }}
      onDragStart={({ active }) => setDragging(active.data.current as DragData)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {children}
      <DragOverlay dropAnimation={prefersReducedMotion() ? null : undefined}>
        {dragging && preview(dragging)}
      </DragOverlay>
    </DndContext>
  );
}

/** A list item that drags by its handle, the only part that takes a touch drag so the row still scrolls. */
export function SortableItem({
  id,
  data,
  label,
  disabled,
  className,
  children,
}: {
  id: string;
  data: DragData;
  label: string;
  disabled: boolean;
  className: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data, disabled });

  return (
    <li
      ref={setNodeRef}
      className={`${className} palette-arrange__item`}
      data-dragging={isDragging || undefined}
      style={{
        "--drag-x": transform ? `${transform.x}px` : undefined,
        "--drag-y": transform ? `${transform.y}px` : undefined,
        "--drag-transition": transition ?? undefined,
      }}
    >
      {children}
      <Button
        ref={setActivatorNodeRef}
        variant="ghost"
        size="icon"
        className="palette-arrange__handle"
        disabled={disabled}
        {...attributes}
        {...listeners}
        aria-label={label}
      >
        <GripVertical aria-hidden="true" />
      </Button>
    </li>
  );
}
