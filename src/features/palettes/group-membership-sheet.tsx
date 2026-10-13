import "./group-membership-sheet.css";

import { useMutation } from "convex/react";
import { type RefObject, useState } from "react";

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

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { OFFLINE_EDIT_NOTE } from "./palette-name-sheet";

type Group = Doc<"palettes">["groups"][number];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paletteId: Id<"palettes">;
  paintId: string;
  paintName: string;
  groups: Group[];
  online: boolean;
  /** Where focus goes when the sheet closes; Radix only does this itself for a SheetTrigger. */
  returnFocus: RefObject<HTMLElement | null>;
};

/** One checkbox per group; ticking adds the paint to that group and unticking takes it out, saved at once. */
export function GroupMembershipSheet({
  open,
  onOpenChange,
  paletteId,
  paintId,
  paintName,
  groups,
  online,
  returnFocus,
}: Props) {
  const addPaintToGroup = useMutation(api.palettes.addPaintToGroup);
  const removePaintFromGroup = useMutation(api.palettes.removePaintFromGroup);
  // The box shows what was asked for until the save settles; afterwards the palette is the truth.
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const toggle = (group: Group, checked: boolean) => {
    if (pending.has(group.id)) return;
    setError(null);
    setPending((current) => new Map(current).set(group.id, checked));
    const save = checked ? addPaintToGroup : removePaintFromGroup;
    save({ paletteId, groupId: group.id, paintId })
      .catch((cause: unknown) => {
        console.error("Updating the group failed", cause);
        setError(`Couldn't update ${group.name}. Check your connection and try again.`);
      })
      .finally(() =>
        setPending((current) => {
          const next = new Map(current);
          next.delete(group.id);
          return next;
        }),
      );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onOpenAutoFocus={() => setError(null)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>{`Groups for ${paintName}`}</SheetTitle>
        </SheetHeader>
        <SheetBody className="group-membership-sheet__body">
          <ul className="group-membership-sheet__groups">
            {groups.map((group) => (
              <li key={group.id}>
                <label className="group-membership-sheet__group">
                  <input
                    type="checkbox"
                    className="group-membership-sheet__checkbox"
                    checked={pending.get(group.id) ?? group.paintIds.includes(paintId)}
                    disabled={!online}
                    // aria-disabled, not disabled: a disabled box drops focus mid-save.
                    aria-disabled={pending.has(group.id) || undefined}
                    onChange={(event) => toggle(group, event.target.checked)}
                  />
                  <span className="group-membership-sheet__name">{group.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="group-membership-sheet__error" role="alert">
            {error}
          </p>
          <p className="group-membership-sheet__note" role="status">
            {!online && OFFLINE_EDIT_NOTE}
          </p>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button>Done</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
