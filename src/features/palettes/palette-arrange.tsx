import "./palette-arrange.css";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/features/feedback/toast-provider";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
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

export function PaletteArrange({
  palette,
  online,
  nameOf,
  children,
}: {
  palette: Doc<"palettes">;
  online: boolean;
  nameOf: (paintId: string) => string;
  children: ReactNode;
}) {
  // Touch waits for a short hold so a swipe that starts on a handle still scrolls; mouse needs a little travel.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = usePaletteMoves(palette._id, nameOf);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    // Edits need a connection (DECISIONS 047); a drag that ends offline changes nothing.
    if (!online) return;
    move(planDrop(active.data.current as DragData, over?.data.current as DragData, palette));
  };

  return (
    // dnd-kit renders its live region in place unless given a container; the body keeps it out of the page's own status regions.
    <DndContext
      sensors={sensors}
      accessibility={{
        container: document.body,
        screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS },
      }}
      onDragEnd={onDragEnd}
    >
      {children}
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
