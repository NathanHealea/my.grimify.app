import "./palette-name-sheet.css";

import { ConvexError } from "convex/values";
import { type FormEvent, type RefObject, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Matches the server's cap in convex/palettes.ts.
const MAX_NAME_LENGTH = 60;

const SERVER_MESSAGES: Record<string, string> = {
  PALETTE_LIMIT: "You can have up to 50 palettes",
  PALETTE_NAME_INVALID: "Give the palette a name",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initialName?: string;
  onSave: (name: string) => Promise<unknown>;
  /** Where focus goes when the sheet closes; Radix only does this itself for a SheetTrigger. */
  returnFocus: RefObject<HTMLElement | null>;
};

/** Names a new palette or renames one; validates like the server so most errors never round-trip. */
export function PaletteNameSheet({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialName = "",
  onSave,
  returnFocus,
}: Props) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fieldId = useId();
  const errorId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return setError("Give the palette a name");
    if (trimmed.length > MAX_NAME_LENGTH) return setError("Use 60 characters or fewer");
    setSaving(true);
    setError(null);
    onSave(trimmed)
      .then(() => onOpenChange(false))
      .catch((cause: unknown) => {
        const code =
          cause instanceof ConvexError && typeof cause.data === "string" ? cause.data : "";
        if (!SERVER_MESSAGES[code]) console.error("Saving the palette failed", cause);
        setError(
          SERVER_MESSAGES[code] ??
            "Couldn't save the palette. Check your connection and try again.",
        );
      })
      .finally(() => setSaving(false));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Closing mid-save would hide an error that arrives afterwards.
        if (saving) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        // Each opening starts from the current name, not what was typed last time.
        onOpenAutoFocus={() => {
          setName(initialName);
          setError(null);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <form className="palette-name-sheet" onSubmit={submit} noValidate>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <SheetBody className="palette-name-sheet__body">
            <label className="palette-name-sheet__label" htmlFor={fieldId}>
              Palette name
            </label>
            <Input
              id={fieldId}
              autoComplete="off"
              value={name}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {/* Stays rendered while empty: a live region that appears with its text is often not announced. */}
            <p id={errorId} className="palette-name-sheet__error" role="alert">
              {error}
            </p>
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={saving}>
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
