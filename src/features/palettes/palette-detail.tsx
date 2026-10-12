import "./palette-detail.css";

import { useUser } from "@clerk/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Ellipsis } from "lucide-react";
import { useRef, useState } from "react";

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
import type { Doc } from "../../../convex/_generated/dataModel";
import { PaletteNameSheet } from "./palette-name-sheet";
import { OFFLINE_EDIT_NOTE, PalettesLoading, PalettesSignedOut } from "./palettes-screen";

type Sheets = "actions" | "rename" | "delete" | null;

export function PaletteDetail({ paletteId }: { paletteId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const palette = useQuery(api.palettes.get, isAuthenticated ? { paletteId } : "skip");
  const online = useOnlineStatus();

  if (isLoaded && !isSignedIn) return <PalettesSignedOut />;
  if (palette === undefined) return <PalettesLoading online={online} label="Loading palette…" />;
  if (palette === null) {
    return (
      <div className="palette-detail__missing">
        <PageTitle>Palette not found</PageTitle>
        <Link to="/palettes">All palettes</Link>
      </div>
    );
  }
  return <PaletteContent palette={palette} online={online} />;
}

function PaletteContent({ palette, online }: { palette: Doc<"palettes">; online: boolean }) {
  const rename = useMutation(api.palettes.rename);
  const remove = useMutation(api.palettes.remove);
  const navigate = useNavigate();
  const toast = useToast();
  const [sheet, setSheet] = useState<Sheets>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const actionsButton = useRef<HTMLButtonElement>(null);

  const confirmDelete = () => {
    setDeleting(true);
    setDeleteError(null);
    remove({ paletteId: palette._id })
      .then(() => {
        setSheet(null);
        void navigate({ to: "/palettes" });
        toast("Palette deleted");
      })
      .catch((cause: unknown) => {
        console.error("Deleting the palette failed", cause);
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
        {(catalog) => <PaintList paintIds={palette.paintIds} catalog={catalog} />}
      </CatalogGate>

      <Sheet open={sheet === "actions"} onOpenChange={(open) => setSheet(open ? "actions" : null)}>
        <SheetContent onCloseAutoFocus={(event) => sheet === null && returnFocus(event)}>
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
          if (deleting) return;
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
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline" disabled={deleting}>
                Cancel
              </Button>
            </SheetClose>
            <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>
              Delete
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PaintList({ paintIds, catalog }: { paintIds: string[]; catalog: Catalog }) {
  if (paintIds.length === 0) {
    return <p className="palette-detail__empty">No paints in this palette yet</p>;
  }
  const paints = new Map(catalog.paints.map((paint) => [paint.id, paint]));
  const brands = new Map(catalog.brands.map((brand) => [brand.id, brand.name]));

  return (
    <ul className="palette-detail__paints" aria-label="Paints in this palette">
      {paintIds.map((paintId) => {
        const paint = paints.get(paintId);
        if (!paint) {
          return (
            <li key={paintId} className="palette-detail__paint">
              <span className="palette-detail__unknown-swatch" aria-hidden="true" />
              <span className="palette-detail__name">Unknown paint</span>
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
          </li>
        );
      })}
    </ul>
  );
}
