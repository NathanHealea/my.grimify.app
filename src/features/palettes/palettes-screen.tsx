import "./palettes-screen.css";

import { useUser } from "@clerk/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";

import { PaintSwatch } from "@/components/paint-swatch";
import { Button } from "@/components/ui/button";
import { useSignIn } from "@/features/auth/sign-in-provider";
import type { CatalogPaint } from "@/features/catalog/schema";
import { useOnlineStatus } from "@/features/pwa/use-online-status";

import { api } from "../../../convex/_generated/api";
import { OFFLINE_EDIT_NOTE, PaletteNameSheet } from "./palette-name-sheet";
import { usePaintLookup } from "./use-paint-lookup";

/** The signed-in user's palettes; online only, so nothing is kept on the device. */
export function PalettesScreen() {
  const { isLoaded, isSignedIn } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const palettes = useQuery(api.palettes.listMine, isAuthenticated ? {} : "skip");
  const create = useMutation(api.palettes.create);
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const findPaint = usePaintLookup();

  if (isLoaded && !isSignedIn) return <PalettesSignedOut />;
  if (palettes === undefined) return <PalettesLoading online={online} />;

  return (
    <div className="palettes">
      <div className="palettes__toolbar">
        <Button ref={newButton} disabled={!online} onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          New palette
        </Button>
        <p className="palettes__note" role="status">
          {!online && OFFLINE_EDIT_NOTE}
        </p>
      </div>
      {palettes.length === 0 ? (
        <p className="palettes__empty">No palettes yet</p>
      ) : (
        <ul className="palettes__list">
          {palettes.map((palette) => (
            <PaletteRow key={palette._id} palette={palette} findPaint={findPaint} />
          ))}
        </ul>
      )}
      <PaletteNameSheet
        open={creating}
        onOpenChange={setCreating}
        title="New palette"
        submitLabel="Create"
        returnFocus={newButton}
        onSave={async (name) => {
          const paletteId = await create({ name });
          await navigate({ to: "/palettes/$paletteId", params: { paletteId } });
        }}
      />
    </div>
  );
}

type PaletteSummary = {
  _id: string;
  name: string;
  paintCount: number;
  previewPaintIds: string[];
};

function PaletteRow({
  palette,
  findPaint,
}: {
  palette: PaletteSummary;
  findPaint: (paintId: string) => CatalogPaint | undefined;
}) {
  const preview = palette.previewPaintIds.map(findPaint).filter((paint) => paint !== undefined);

  return (
    <li className="palettes__row">
      <Link
        to="/palettes/$paletteId"
        params={{ paletteId: palette._id }}
        className="palettes__link"
      >
        <span className="palettes__text">
          <span className="palettes__name">{palette.name}</span>
          <span className="palettes__count">
            {palette.paintCount} {palette.paintCount === 1 ? "paint" : "paints"}
          </span>
        </span>
        {preview.length > 0 && (
          <span className="palettes__preview" aria-hidden="true">
            {preview.map((paint) => (
              <PaintSwatch key={paint.id} hex={paint.hex} />
            ))}
          </span>
        )}
      </Link>
    </li>
  );
}

export function PalettesSignedOut() {
  const online = useOnlineStatus();
  const openSignIn = useSignIn();

  return (
    <section className="palettes__message">
      <p>Sign in to keep color palettes on any device.</p>
      {online ? (
        <Button onClick={() => openSignIn()}>Sign in</Button>
      ) : (
        <p className="palettes__note">Signing in needs an internet connection.</p>
      )}
    </section>
  );
}

/** Convex keeps results only in memory, so offline with nothing loaded there is nothing to show. */
export function PalettesLoading({ online, label }: { online: boolean; label?: string }) {
  return (
    <p className="palettes__message" role="status">
      {online ? (label ?? "Loading your palettes…") : "Palettes need an internet connection."}
    </p>
  );
}
