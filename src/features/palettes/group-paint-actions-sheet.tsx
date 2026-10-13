import "./group-paint-actions-sheet.css";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";

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
import { useToast } from "@/features/feedback/toast-provider";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { OFFLINE_EDIT_NOTE } from "./palette-name-sheet";

type Group = Doc<"palettes">["groups"][number];
type View = "actions" | "move" | "copy";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paletteId: Id<"palettes">;
  paintId: string;
  paintName: string;
  group: Group;
  groups: Group[];
  online: boolean;
  /** Called before a move or remove takes the paint out of this group, and with false if it fails. */
  onLeaving: (leaving: boolean) => void;
  /** Puts focus back once the sheet has closed; Radix only does this itself for a SheetTrigger. */
  onClosed: () => void;
};

/** Move, copy or remove one paint in a group; the paint always stays in the palette. */
export function GroupPaintActionsSheet({
  open,
  onOpenChange,
  paletteId,
  paintId,
  paintName,
  group,
  groups,
  online,
  onLeaving,
  onClosed,
}: Props) {
  const movePaintToGroup = useMutation(api.palettes.movePaintToGroup);
  const addPaintToGroup = useMutation(api.palettes.addPaintToGroup);
  const removePaintFromGroup = useMutation(api.palettes.removePaintFromGroup);
  const toast = useToast();
  const [view, setView] = useState<View>("actions");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Convex holds a mutation until the connection returns, so offline a pending save mustn't trap the user.
  const locked = saving && online;
  const others = groups.filter((g) => g.id !== group.id);

  const run = (verb: "move" | "copy" | "remove", save: () => Promise<unknown>, done: string) => {
    if (saving) return;
    const leaving = verb !== "copy";
    setSaving(true);
    setError(null);
    if (leaving) onLeaving(true);
    save()
      .then(() => {
        onOpenChange(false);
        toast(done);
      })
      .catch((cause: unknown) => {
        if (leaving) onLeaving(false);
        if (cause instanceof ConvexError && cause.data === "PAINT_NOT_IN_PALETTE") {
          return setError("This paint is no longer in the palette.");
        }
        console.error(`Trying to ${verb} the paint failed`, cause);
        setError(`Couldn't ${verb} ${paintName}. Check your connection and try again.`);
      })
      .finally(() => setSaving(false));
  };

  const choose = (target: Group) =>
    view === "move"
      ? run(
          "move",
          () =>
            movePaintToGroup({ paletteId, paintId, fromGroupId: group.id, toGroupId: target.id }),
          `Moved to ${target.name}`,
        )
      : run(
          "copy",
          () => addPaintToGroup({ paletteId, groupId: target.id, paintId }),
          `Copied to ${target.name}`,
        );

  const title =
    view === "actions"
      ? `${paintName} in ${group.name}`
      : `${view === "move" ? "Move" : "Copy"} ${paintName} to`;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Closing mid-save would hide an error that arrives afterwards.
        if (locked) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        // Reset on close, not open: by the time onOpenAutoFocus runs, Radix has picked a button from the old view.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          setView("actions");
          setError(null);
          onClosed();
        }}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetBody className="group-paint-actions-sheet__body">
          {view === "actions" ? (
            <>
              <Button
                variant="outline"
                disabled={others.length === 0}
                onClick={() => setView("move")}
              >
                Move to group…
              </Button>
              <Button
                variant="outline"
                disabled={others.length === 0}
                onClick={() => setView("copy")}
              >
                Copy to group…
              </Button>
              <Button
                variant="outline"
                disabled={!online}
                // aria-disabled, not disabled: a disabled button drops focus, which a failed save would strand.
                aria-disabled={saving || undefined}
                onClick={() =>
                  run(
                    "remove",
                    () => removePaintFromGroup({ paletteId, groupId: group.id, paintId }),
                    `Removed from ${group.name}`,
                  )
                }
              >
                Remove from group
              </Button>
            </>
          ) : (
            <>
              {others.map((target) => {
                const holds = target.paintIds.includes(paintId);
                return (
                  <Button
                    key={target.id}
                    variant="outline"
                    disabled={holds || !online}
                    aria-disabled={saving || undefined}
                    onClick={() => choose(target)}
                  >
                    {holds ? `${target.name} (already in it)` : target.name}
                  </Button>
                );
              })}
              <Button variant="ghost" disabled={locked} onClick={() => setView("actions")}>
                Back
              </Button>
            </>
          )}
          <p className="group-paint-actions-sheet__error" role="alert">
            {error}
          </p>
          <p className="group-paint-actions-sheet__note" role="status">
            {!online && OFFLINE_EDIT_NOTE}
          </p>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline" disabled={locked}>
              Cancel
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
