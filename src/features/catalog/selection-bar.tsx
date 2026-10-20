import "./selection-bar.css";

import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { AddToPaletteSheet } from "@/features/palettes/add-to-palette-sheet";
import { OFFLINE_EDIT_NOTE } from "@/features/palettes/palette-name-sheet";
import { useOnlineStatus } from "@/features/pwa/use-online-status";

import { type Selection, useSelectedIds } from "./selection-store";

/** The most paints select mode ticks; matches the palette cap in convex/palettes.ts. */
export const MAX_SELECTED = 200;

type Props = {
  /** Select mode's ticks, in the order they were ticked. */
  selection: Selection;
  onDone: () => void;
};

/** Select mode's bar above the nav: the count, Add to palette and Done. */
export function SelectionBar({ selection, onDone }: Props) {
  const ids = useSelectedIds(selection);
  const paintIds = useMemo(() => [...ids], [ids]);
  const online = useOnlineStatus();
  const [picking, setPicking] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);

  return (
    <section className="selection-bar" aria-label="Selection">
      <div className="selection-bar__text">
        <p className="selection-bar__count" role="status">
          {`${paintIds.length} selected`}
        </p>
        <p className="selection-bar__note" role="status">
          {!online
            ? OFFLINE_EDIT_NOTE
            : paintIds.length >= MAX_SELECTED &&
              `You can add up to ${MAX_SELECTED} paints at once.`}
        </p>
      </div>
      <Button
        ref={addButton}
        disabled={paintIds.length === 0 || !online}
        onClick={() => setPicking(true)}
      >
        Add to palette
      </Button>
      <Button variant="outline" onClick={onDone}>
        Done
      </Button>
      <AddToPaletteSheet
        open={picking}
        onOpenChange={setPicking}
        paintIds={paintIds}
        onAdded={onDone}
        returnFocus={addButton}
      />
    </section>
  );
}
