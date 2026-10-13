import "./palette-detail.css";

import { useUser } from "@clerk/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Ellipsis, X } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { PageTitle } from "@/components/page-title";
import { PaintSwatch } from "@/components/paint-swatch";
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
import { CatalogGate } from "@/features/catalog/catalog-gate";
import type { Catalog } from "@/features/catalog/schema";
import { useToast } from "@/features/feedback/toast-provider";
import { useOnlineStatus } from "@/features/pwa/use-online-status";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { OFFLINE_EDIT_NOTE, PaletteNameSheet } from "./palette-name-sheet";
import { PalettesLoading, PalettesSignedOut } from "./palettes-screen";

type Sheets = "actions" | "rename" | "delete" | null;

export function PaletteDetail({ paletteId }: { paletteId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const palette = useQuery(api.palettes.get, isAuthenticated ? { paletteId } : "skip");
  const online = useOnlineStatus();
  const [removing, setRemoving] = useState(false);

  // The route has no static title, so these states name the page themselves (WCAG 2.4.2).
  if (isLoaded && !isSignedIn) {
    return (
      <>
        <PageTitle>Palette</PageTitle>
        <PalettesSignedOut />
      </>
    );
  }
  if (palette === undefined) {
    return (
      <>
        <PageTitle>Palette</PageTitle>
        <PalettesLoading online={online} label="Loading palette…" />
      </>
    );
  }
  // Convex resolves the delete after this query sees null; navigation is a tick behind, so skip "not found".
  if (palette === null && removing) return null;
  if (palette === null) {
    return (
      <div className="palette-detail__missing">
        <PageTitle>Palette not found</PageTitle>
        <Link to="/palettes">All palettes</Link>
      </div>
    );
  }
  return <PaletteContent palette={palette} online={online} onRemoving={setRemoving} />;
}

function PaletteContent({
  palette,
  online,
  onRemoving,
}: {
  palette: Doc<"palettes">;
  online: boolean;
  onRemoving: (removing: boolean) => void;
}) {
  const rename = useMutation(api.palettes.rename);
  const remove = useMutation(api.palettes.remove);
  const navigate = useNavigate();
  const toast = useToast();
  const [sheet, setSheet] = useState<Sheets>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const actionsButton = useRef<HTMLButtonElement>(null);
  // Convex holds a mutation until the connection returns, so offline a pending delete mustn't trap the user.
  const locked = deleting && online;

  const confirmDelete = () => {
    setDeleting(true);
    setDeleteError(null);
    onRemoving(true);
    remove({ paletteId: palette._id })
      .then(() => {
        setSheet(null);
        void navigate({ to: "/palettes" });
        toast("Palette deleted");
      })
      .catch((cause: unknown) => {
        console.error("Deleting the palette failed", cause);
        onRemoving(false);
        setDeleteError("Couldn't delete the palette. Check your connection and try again.");
      })
      .finally(() => setDeleting(false));
  };

  // Radix only refocuses a SheetTrigger; these sheets open from state, so focus is put back by hand.
  const returnFocus = (event: Event) => {
    event.preventDefault();
    actionsButton.current?.focus();
  };

  return (
    <div className="palette-detail">
      <div className="palette-detail__heading">
        <PageTitle>{palette.name}</PageTitle>
        <Button
          ref={actionsButton}
          variant="ghost"
          size="icon"
          aria-label="Palette actions"
          disabled={!online}
          onClick={() => setSheet("actions")}
        >
          <Ellipsis aria-hidden="true" />
        </Button>
      </div>
      <p className="palette-detail__note" role="status">
        {!online && OFFLINE_EDIT_NOTE}
      </p>

      <CatalogGate>
        {(catalog) => (
          <PaintList
            paletteId={palette._id}
            paintIds={palette.paintIds}
            catalog={catalog}
            online={online}
            lastFocus={actionsButton}
          />
        )}
      </CatalogGate>

      <Sheet open={sheet === "actions"} onOpenChange={(open) => setSheet(open ? "actions" : null)}>
        <SheetContent
          // Moving on to Rename or Delete hands focus to that sheet, so only a plain close returns it.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (sheet === null) actionsButton.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>{palette.name}</SheetTitle>
          </SheetHeader>
          <SheetBody className="palette-detail__actions">
            <Button variant="outline" onClick={() => setSheet("rename")}>
              Rename
            </Button>
            <Button variant="destructive" onClick={() => setSheet("delete")}>
              Delete palette
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <PaletteNameSheet
        open={sheet === "rename"}
        onOpenChange={(open) => setSheet(open ? "rename" : null)}
        title="Rename palette"
        submitLabel="Save"
        initialName={palette.name}
        returnFocus={actionsButton}
        onSave={(name) => rename({ paletteId: palette._id, name })}
      />

      <Sheet
        open={sheet === "delete"}
        onOpenChange={(open) => {
          // Closing mid-deletion would hide a failure that arrives afterwards.
          if (locked) return;
          setSheet(open ? "delete" : null);
          setDeleteError(null);
        }}
      >
        <SheetContent onCloseAutoFocus={returnFocus}>
          <SheetHeader>
            <SheetTitle>{`Delete "${palette.name}"?`}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <p>This deletes the palette. Your paints and collection aren&rsquo;t affected.</p>
            <p className="palette-detail__error" role="alert">
              {deleteError}
            </p>
            <p className="palette-detail__note" role="status">
              {!online && OFFLINE_EDIT_NOTE}
            </p>
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline" disabled={locked}>
                Cancel
              </Button>
            </SheetClose>
            <Button variant="destructive" disabled={deleting || !online} onClick={confirmDelete}>
              Delete
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PaintList({
  paletteId,
  paintIds,
  catalog,
  online,
  lastFocus,
}: {
  paletteId: Id<"palettes">;
  paintIds: string[];
  catalog: Catalog;
  online: boolean;
  /** Where focus goes once the last paint is removed. */
  lastFocus: RefObject<HTMLElement | null>;
}) {
  const removePaint = useMutation(api.palettes.removePaint);
  const toast = useToast();
  const paints = useMemo(() => new Map(catalog.paints.map((p) => [p.id, p])), [catalog]);
  const brands = useMemo(() => new Map(catalog.brands.map((b) => [b.id, b.name])), [catalog]);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // The focused Remove button leaves with its row, so focus moves to a neighbour's (WCAG 2.4.3).
  const focusAfter = useRef<{ removed: string; next: string | undefined } | null>(null);

  useEffect(() => {
    const plan = focusAfter.current;
    if (!plan || paintIds.includes(plan.removed)) return;
    focusAfter.current = null;
    const target = plan.next === undefined ? undefined : buttons.current.get(plan.next);
    (target ?? lastFocus.current)?.focus();
  }, [paintIds, lastFocus]);

  if (paintIds.length === 0) {
    return <p className="palette-detail__empty">No paints in this palette yet</p>;
  }

  const remove = (paintId: string, name: string) => {
    const index = paintIds.indexOf(paintId);
    focusAfter.current = { removed: paintId, next: paintIds[index + 1] ?? paintIds[index - 1] };
    setPending((current) => new Set(current).add(paintId));
    removePaint({ paletteId, paintId })
      .then(() => toast(`Removed ${name}`))
      .catch((cause: unknown) => {
        focusAfter.current = null;
        console.error("Removing the paint failed", cause);
        toast(`Couldn't remove ${name}. Check your connection and try again.`);
      })
      .finally(() =>
        setPending((current) => {
          const next = new Set(current);
          next.delete(paintId);
          return next;
        }),
      );
  };

  const removeButton = (paintId: string, name: string) => (
    <Button
      variant="ghost"
      size="icon"
      ref={(element) => {
        if (element) buttons.current.set(paintId, element);
        else buttons.current.delete(paintId);
      }}
      aria-label={`Remove ${name} from palette`}
      disabled={!online || pending.has(paintId)}
      onClick={() => remove(paintId, name)}
    >
      <X aria-hidden="true" />
    </Button>
  );

  return (
    <ul className="palette-detail__paints" aria-label="Paints in this palette">
      {paintIds.map((paintId) => {
        const paint = paints.get(paintId);
        if (!paint) {
          return (
            <li key={paintId} className="palette-detail__paint">
              <span className="palette-detail__unknown-swatch" aria-hidden="true" />
              <span className="palette-detail__name">Unknown paint</span>
              {removeButton(paintId, "unknown paint")}
            </li>
          );
        }
        return (
          <li key={paintId} className="palette-detail__paint">
            <Link to="/paints/$paintId" params={{ paintId }} className="palette-detail__paint-link">
              <PaintSwatch hex={paint.hex} type={paint.type} />
              <span className="palette-detail__text">
                <span className="palette-detail__name">{paint.name}</span>
                <span className="palette-detail__brand">{brands.get(paint.brandId)}</span>
              </span>
            </Link>
            {removeButton(paintId, paint.name)}
          </li>
        );
      })}
    </ul>
  );
}
