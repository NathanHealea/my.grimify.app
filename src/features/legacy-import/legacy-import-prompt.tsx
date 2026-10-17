import "./legacy-import-prompt.css";

import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/features/feedback/toast-provider";

import { api } from "../../../convex/_generated/api";

type Found = { ownedCount: number; paletteCount: number };
type Choice = "import" | "discard";
type Result = { paintsAdded: number; palettesAdded: number; palettesSkipped: number };

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function outcome(choice: Choice, result: Result) {
  if (choice === "discard") return "Old Grimify data discarded.";
  const added = `Added ${count(result.paintsAdded, "paint")} and ${count(result.palettesAdded, "palette")}.`;
  if (result.palettesSkipped === 0) return added;
  return `${added} ${count(result.palettesSkipped, "palette")} didn't fit.`;
}

const FAILURE: Record<Choice, string> = {
  import: "Couldn't import your old data. Try again.",
  discard: "Couldn't discard your old data. Try again.",
};

/** Asks once per signed-in session whether to bring over old Grimify data (UX_FLOWS Flow 11). */
export function LegacyImportPrompt() {
  const me = useQuery(api.users.me);
  const findMine = useAction(api.legacyClaim.findMine);
  const resolveMine = useAction(api.legacyClaim.resolveMine);
  const toast = useToast();
  const asked = useRef(false);
  const [offer, setOffer] = useState<{ userId: string; found: Found } | null>(null);
  // Keyed to the user it was found for, so it disappears on sign-out without resetting state in an effect.
  const found = offer && me && offer.userId === me._id ? offer.found : null;
  const [confirming, setConfirming] = useState(false);
  const [resolving, setResolving] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const discardButton = useRef<HTMLButtonElement>(null);
  const stepChanged = useRef(false);

  // Switching steps removes the focused button, so focus goes to the new step's matching control.
  useEffect(() => {
    if (!stepChanged.current) return;
    stepChanged.current = false;
    (confirming ? confirmButton : discardButton).current?.focus();
  }, [confirming]);

  const showConfirm = (next: boolean) => {
    stepChanged.current = true;
    setConfirming(next);
  };

  useEffect(() => {
    if (me === null) {
      asked.current = false;
      return;
    }
    if (me === undefined || asked.current) return;
    asked.current = true;
    const userId = me._id;
    findMine({})
      .then((result) => {
        setConfirming(false);
        setOffer(result && { userId, found: result });
      })
      .catch((cause: unknown) => console.error("Looking for old Grimify data failed", cause));
  }, [me, findMine]);

  const close = () => {
    setOffer(null);
    setConfirming(false);
  };

  const resolve = (choice: Choice) => {
    setResolving(true);
    resolveMine({ choice })
      .then((result) => {
        close();
        toast(outcome(choice, result));
      })
      .catch((cause: unknown) => {
        console.error(`Resolving old Grimify data (${choice}) failed`, cause);
        toast(FAILURE[choice]);
      })
      .finally(() => setResolving(false));
  };

  return (
    <Sheet
      open={found !== null}
      onOpenChange={(next) => {
        // Closing mid-request would hide the outcome; Escape and Close otherwise mean Not now.
        if (!next && !resolving) close();
      }}
    >
      {found && (
        <SheetContent>
          {confirming ? (
            <>
              <SheetHeader>
                <SheetTitle>Discard your old data for good?</SheetTitle>
              </SheetHeader>
              <SheetBody>
                <SheetDescription>
                  Your old paints and palettes will be deleted and can't be brought over later.
                </SheetDescription>
              </SheetBody>
              <SheetFooter className="legacy-import-prompt__footer">
                <Button
                  ref={confirmButton}
                  variant="destructive"
                  disabled={resolving}
                  onClick={() => resolve("discard")}
                >
                  Discard
                </Button>
                <Button variant="outline" disabled={resolving} onClick={() => showConfirm(false)}>
                  Cancel
                </Button>
              </SheetFooter>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>Bring over your old Grimify data?</SheetTitle>
              </SheetHeader>
              <SheetBody>
                <SheetDescription>
                  {`We found ${count(found.ownedCount, "owned paint")} and ${count(found.paletteCount, "palette")} from your old Grimify account.`}{" "}
                  Importing adds them to what you have here and changes nothing you already have.
                </SheetDescription>
              </SheetBody>
              <SheetFooter className="legacy-import-prompt__footer">
                <Button disabled={resolving} onClick={() => resolve("import")}>
                  Import
                </Button>
                <Button variant="outline" disabled={resolving} onClick={close}>
                  Not now
                </Button>
                <Button
                  ref={discardButton}
                  variant="ghost"
                  disabled={resolving}
                  onClick={() => showConfirm(true)}
                >
                  Discard
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      )}
    </Sheet>
  );
}
