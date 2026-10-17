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

type Step = "offer" | "confirm" | "done";

/** Asks once per signed-in session whether to bring over old Grimify data (UX_FLOWS Flow 11). */
export function LegacyImportPrompt() {
  const me = useQuery(api.users.me);
  const findMine = useAction(api.legacyClaim.findMine);
  const resolveMine = useAction(api.legacyClaim.resolveMine);
  const asked = useRef(false);
  const [offer, setOffer] = useState<{ userId: string; found: Found } | null>(null);
  // Keyed to the user it was found for, so it disappears on sign-out without resetting state in an effect.
  const found = offer && me && offer.userId === me._id ? offer.found : null;
  const [step, setStep] = useState<Step>("offer");
  const [status, setStatus] = useState("");
  const [resolving, setResolving] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const discardButton = useRef<HTMLButtonElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const stepChanged = useRef(false);

  // Switching steps removes the focused button, so focus moves to the new step. The confirm step starts
  // on Cancel so a repeated Enter can't discard by accident (WCAG 3.3.4).
  useEffect(() => {
    if (!stepChanged.current) return;
    stepChanged.current = false;
    const target = { offer: discardButton, confirm: cancelButton, done: doneButton }[step];
    target.current?.focus();
  }, [step]);

  const showStep = (next: Step) => {
    stepChanged.current = true;
    setStep(next);
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
        setStep("offer");
        setStatus("");
        setOffer(result && { userId, found: result });
      })
      .catch((cause: unknown) => console.error("Looking for old Grimify data failed", cause));
  }, [me, findMine]);

  const close = () => {
    setOffer(null);
    setStep("offer");
    setStatus("");
  };

  // The outcome is announced from inside the sheet: while it's open, Radix hides the rest of the
  // page (toasts included) from assistive tech.
  const resolve = (choice: Choice) => {
    setResolving(true);
    setStatus("");
    resolveMine({ choice })
      .then((result) => {
        setStatus(outcome(choice, result));
        showStep("done");
      })
      .catch((cause: unknown) => {
        console.error(`Resolving old Grimify data (${choice}) failed`, cause);
        setStatus(FAILURE[choice]);
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
          <SheetHeader>
            <SheetTitle>
              {step === "offer" && "Bring over your old Grimify data?"}
              {step === "confirm" && "Discard your old data for good?"}
              {step === "done" && "Your old Grimify data"}
            </SheetTitle>
          </SheetHeader>
          <SheetBody>
            {step === "offer" && (
              <SheetDescription>
                {`We found ${count(found.ownedCount, "owned paint")} and ${count(found.paletteCount, "palette")} from your old Grimify account.`}{" "}
                Importing adds them to what you have here and changes nothing you already have.
              </SheetDescription>
            )}
            {step === "confirm" && (
              <SheetDescription>
                Your old paints and palettes will be deleted and can't be brought over later.
              </SheetDescription>
            )}
            <p className="legacy-import-prompt__status" role="status">
              {status}
            </p>
          </SheetBody>
          <SheetFooter className="legacy-import-prompt__footer">
            {step === "offer" && (
              <>
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
                  onClick={() => showStep("confirm")}
                >
                  Discard
                </Button>
              </>
            )}
            {step === "confirm" && (
              <>
                <Button
                  variant="destructive"
                  disabled={resolving}
                  onClick={() => resolve("discard")}
                >
                  Discard for good
                </Button>
                <Button
                  ref={cancelButton}
                  variant="outline"
                  disabled={resolving}
                  onClick={() => showStep("offer")}
                >
                  Cancel
                </Button>
              </>
            )}
            {step === "done" && (
              <Button ref={doneButton} onClick={close}>
                Done
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      )}
    </Sheet>
  );
}
