import "./move-sheet.css";

import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { OFFLINE_EDIT_NOTE } from "./palette-name-sheet";

/** The non-drag way to reorder (WCAG 2.1.1): moves a paint or group by one place or to an end. */
export function MoveSheet({
  open,
  onOpenChange,
  title,
  index,
  count,
  online,
  returnFocus,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  index: number;
  count: number;
  online: boolean;
  /** Puts focus back once the sheet has closed; Radix only does this itself for a SheetTrigger. */
  returnFocus: RefObject<HTMLElement | null>;
  /** Saves the move; it shows at once, and a failure is reported by the caller. */
  onMove: (toIndex: number) => void;
}) {
  const first = index <= 0;
  const last = index >= count - 1;
  const moves = [
    { label: "Move to top", toIndex: 0, disabled: first },
    { label: "Move up", toIndex: index - 1, disabled: first },
    { label: "Move down", toIndex: index + 1, disabled: last },
    { label: "Move to bottom", toIndex: count - 1, disabled: last },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetBody className="move-sheet__body">
          <p>{`Position ${index + 1} of ${count}`}</p>
          {moves.map((move) => (
            <Button
              key={move.label}
              variant="outline"
              disabled={move.disabled || !online}
              onClick={() => {
                onMove(move.toIndex);
                onOpenChange(false);
              }}
            >
              {move.label}
            </Button>
          ))}
          <p className="move-sheet__note" role="status">
            {!online && OFFLINE_EDIT_NOTE}
          </p>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
