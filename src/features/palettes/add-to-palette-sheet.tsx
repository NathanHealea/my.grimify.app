import "./add-to-palette-sheet.css";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Plus } from "lucide-react";
import { type RefObject, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/features/feedback/toast-provider";
import { useOnlineStatus } from "@/features/pwa/use-online-status";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { OFFLINE_EDIT_NOTE, PaletteNameSheet } from "./palette-name-sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paintIds: string[];
  /** Called once the paints are in a palette. */
  onAdded?: () => void;
  /** Where focus goes when the sheets close; Radix only does this itself for a SheetTrigger. */
  returnFocus?: RefObject<HTMLElement | null>;
};

function addedMessage(added: number, name: string): string {
  if (added === 0) return `Already in ${name}`;
  if (added === 1) return `Added to ${name}`;
  return `Added ${added} paints to ${name}`;
}

/** Picks one of the user's palettes, or makes a new one, and adds the paints to it. */
export function AddToPaletteSheet({ open, onOpenChange, paintIds, onAdded, returnFocus }: Props) {
  const { isAuthenticated } = useConvexAuth();
  // Clerk can report signed in before Convex has the identity; listMine would throw until then.
  const palettes = useQuery(api.palettes.listMine, open && isAuthenticated ? {} : "skip");
  const addPaints = useMutation(api.palettes.addPaints);
  const create = useMutation(api.palettes.create);
  const toast = useToast();
  const online = useOnlineStatus();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const noFocus = useRef<HTMLElement>(null);
  // Convex holds a mutation until the connection returns, so offline a pending add mustn't trap the user.
  const locked = adding && online;

  const finish = (added: number, name: string) => {
    toast(addedMessage(added, name));
    onAdded?.();
  };

  const choose = (paletteId: Id<"palettes">, name: string) => {
    setAdding(true);
    setError(null);
    addPaints({ paletteId, paintIds })
      .then(({ added }) => {
        onOpenChange(false);
        finish(added, name);
      })
      .catch((cause: unknown) => {
        if (cause instanceof ConvexError && cause.data === "PALETTE_FULL") {
          setError("This palette is full (200 paints)");
          return;
        }
        console.error("Adding to the palette failed", cause);
        setError("Couldn't add to the palette. Check your connection and try again.");
      })
      .finally(() => setAdding(false));
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          // Closing mid-add would hide an error that arrives afterwards.
          if (locked) return;
          onOpenChange(next);
          setError(null);
        }}
      >
        <SheetContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // Moving on to New palette hands focus to the name sheet instead.
            if (!naming) returnFocus?.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>Add to palette</SheetTitle>
          </SheetHeader>
          <SheetBody className="add-to-palette">
            <p className="add-to-palette__error" role="alert">
              {error}
            </p>
            <p className="add-to-palette__note" role="status">
              {!online && OFFLINE_EDIT_NOTE}
            </p>
            {palettes === undefined ? (
              <p className="add-to-palette__note">Loading your palettes…</p>
            ) : (
              <ul className="add-to-palette__list">
                {palettes.map((palette) => (
                  <li key={palette._id}>
                    <button
                      type="button"
                      className="add-to-palette__palette"
                      disabled={locked || !online}
                      onClick={() => choose(palette._id, palette.name)}
                    >
                      {/* The space keeps the accessible name "Ultramarines 3 paints"; flex hides it visually. */}
                      <span className="add-to-palette__name">{palette.name}</span>{" "}
                      <span className="add-to-palette__count">
                        {`${palette.paintCount} ${palette.paintCount === 1 ? "paint" : "paints"}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              disabled={locked || !online}
              onClick={() => {
                setNaming(true);
                onOpenChange(false);
              }}
            >
              <Plus aria-hidden="true" />
              New palette
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <PaletteNameSheet
        open={naming}
        onOpenChange={setNaming}
        title="New palette"
        submitLabel="Create"
        returnFocus={returnFocus ?? noFocus}
        onSave={async (name) => {
          const paletteId = await create({ name });
          const { added } = await addPaints({ paletteId, paintIds });
          finish(added, name);
        }}
      />
    </>
  );
}
