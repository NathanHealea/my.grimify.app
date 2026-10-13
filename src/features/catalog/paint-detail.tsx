import "./paint-detail.css";

import { useUser } from "@clerk/react";
import { Link } from "@tanstack/react-router";
import { Copy, SwatchBook } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { PageTitle } from "@/components/page-title";
import { PaintRow } from "@/components/paint-row";
import { PaintSwatch } from "@/components/paint-swatch";
import { Button } from "@/components/ui/button";
import { useSignIn } from "@/features/auth/sign-in-provider";
import { usePaintFlags } from "@/features/collection/collection-provider";
import { PaintToggles } from "@/features/collection/paint-toggles";
import type { MatchLabel } from "@/features/matching/delta-e";
import { findEquivalents } from "@/features/matching/find-equivalents";
import { type TypeFamily, typeFamily } from "@/features/matching/type-families";
import { AddToPaletteSheet } from "@/features/palettes/add-to-palette-sheet";
import { OFFLINE_EDIT_NOTE } from "@/features/palettes/palette-name-sheet";
import { useOnlineStatus } from "@/features/pwa/use-online-status";

import { CatalogGate } from "./catalog-gate";
import type { Catalog, CatalogPaint } from "./schema";

type Props = {
  paintId: string;
  allTypes: boolean;
  onAllTypesChange: (allTypes: boolean) => void;
};

// Hex can't carry sheen or transparency (DECISIONS 008), so these families get a warning.
const FAMILY_NOTES: Partial<Record<TypeFamily, string>> = {
  metallic: "Hex can't show metallic sheen, so these matches are rough.",
  wash: "Washes and inks change with what's under them, so these matches are rough.",
  tint: "Contrast-style paints depend on the undercoat, so these matches are rough.",
};

export function PaintDetail(props: Props) {
  return (
    <CatalogGate>{(catalog) => <PaintDetailContent {...props} catalog={catalog} />}</CatalogGate>
  );
}

function PaintDetailContent({
  paintId,
  allTypes,
  onAllTypesChange,
  catalog,
}: Props & { catalog: Catalog }) {
  const paint = catalog.paints.find((p) => p.id === paintId);
  if (!paint) {
    return (
      <div className="paint-detail__missing">
        <PageTitle documentTitle="Paint not found">This paint isn't in the catalog</PageTitle>
        <Link to="/paints">Browse paints</Link>
      </div>
    );
  }
  return (
    <PaintFacts
      paint={paint}
      catalog={catalog}
      allTypes={allTypes}
      onAllTypesChange={onAllTypesChange}
    />
  );
}

function PaintFacts({
  paint,
  catalog,
  allTypes,
  onAllTypesChange,
}: {
  paint: CatalogPaint;
  catalog: Catalog;
  allTypes: boolean;
  onAllTypesChange: (allTypes: boolean) => void;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const brandNames = useMemo(() => new Map(catalog.brands.map((b) => [b.id, b.name])), [catalog]);
  const lineNames = useMemo(() => new Map(catalog.lines.map((l) => [l.id, l.name])), [catalog]);
  const equivalents = useMemo(
    () => findEquivalents(paint, catalog, { allTypes }),
    [paint, catalog, allTypes],
  );

  const brandName = brandNames.get(paint.brandId) ?? paint.brandId;
  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const facts = [brandName, lineNames.get(paint.lineId) ?? paint.lineId, capitalize(paint.type)];
  if (paint.finish && paint.finish !== paint.type) facts.push(capitalize(paint.finish));
  const note = FAMILY_NOTES[typeFamily(paint)];

  const copyHex = () => {
    navigator.clipboard.writeText(paint.hex).then(
      () => setCopyStatus(`Copied ${paint.hex}`),
      (error: unknown) => {
        console.error(error);
        setCopyStatus("Couldn't copy; select the hex instead.");
      },
    );
  };

  const row = (match: CatalogPaint, label?: MatchLabel) => (
    <EquivalentRow
      key={match.id}
      paint={match}
      brandName={brandNames.get(match.brandId) ?? match.brandId}
      lineName={lineNames.get(match.lineId) ?? match.lineId}
      match={label}
    />
  );

  return (
    <article className="paint-detail">
      <div>
        <PaintSwatch hex={paint.hex} type={paint.type} size="hero" />
        <p className="paint-detail__disclaimer">Colors are approximate.</p>
      </div>

      <div className="paint-detail__facts">
        <PageTitle>{paint.name}</PageTitle>
        <p className="paint-detail__meta">{facts.join(" · ")}</p>
        {paint.discontinued && <p className="paint-detail__badge">Discontinued</p>}
        {paint.aliases && paint.aliases.length > 0 && (
          <p className="paint-detail__meta">Also known as {paint.aliases.join(", ")}</p>
        )}
        <button
          type="button"
          className="paint-detail__hex"
          aria-label={`Copy hex ${paint.hex}`}
          onClick={copyHex}
        >
          {paint.hex}
          <Copy aria-hidden="true" />
        </button>
        <PaintToggles paintId={paint.id} paintName={paint.name} />
        <AddToPalette paintId={paint.id} />
        <p className="paint-detail__copied" role="status">
          {copyStatus}
        </p>
      </div>

      <section className="paint-detail__equivalents" aria-labelledby="equivalents-heading">
        <h2 id="equivalents-heading">Equivalents</h2>

        {!equivalents.special && (
          <label className="paint-detail__toggle">
            <input
              type="checkbox"
              checked={allTypes}
              onChange={(event) => onAllTypesChange(event.target.checked)}
            />
            Show all types
          </label>
        )}
        {note && <p className="paint-detail__note">{note}</p>}

        {equivalents.curated.length > 0 && (
          <section className="paint-detail__brand">
            <h3>Curated matches</h3>
            <ul className="paint-detail__list">{equivalents.curated.map((match) => row(match))}</ul>
          </section>
        )}

        {equivalents.special && equivalents.curated.length === 0 && (
          <p className="paint-detail__note">
            No automatic equivalents for technical and special paints.
          </p>
        )}

        {equivalents.groups.map(({ brand, noCloseMatch, matches }) => (
          <section key={brand.id} className="paint-detail__brand">
            <h3>{brand.name}</h3>
            {noCloseMatch && <p className="paint-detail__note">No close match in {brand.name}</p>}
            <ul className="paint-detail__list" data-muted={noCloseMatch || undefined}>
              {matches.map(({ paint: match, label }) => row(match, label))}
            </ul>
          </section>
        ))}
      </section>
    </article>
  );
}

/** Palettes need an account, so signed out this opens sign-in; it doesn't add afterwards. */
function AddToPalette({ paintId }: { paintId: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const openSignIn = useSignIn();
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={button}
        variant="outline"
        // Before Clerk loads, isSignedIn is undefined; a tap then would open sign-in for a signed-in user.
        disabled={!online || !isLoaded}
        onClick={() => (isSignedIn ? setOpen(true) : openSignIn())}
      >
        <SwatchBook aria-hidden="true" />
        Add to palette
      </Button>
      <p className="paint-detail__note" role="status">
        {!online && OFFLINE_EDIT_NOTE}
      </p>
      <AddToPaletteSheet
        open={open}
        onOpenChange={setOpen}
        paintIds={[paintId]}
        returnFocus={button}
      />
    </>
  );
}

/** PRD Feature 2: equivalents the painter already owns say so. */
function EquivalentRow({
  paint,
  brandName,
  lineName,
  match,
}: {
  paint: CatalogPaint;
  brandName: string;
  lineName: string;
  match?: MatchLabel;
}) {
  const { owned } = usePaintFlags(paint.id);
  return (
    <PaintRow
      paint={paint}
      brandName={brandName}
      lineName={lineName}
      match={match}
      note={owned ? "You own this" : undefined}
      actions={<PaintToggles paintId={paint.id} paintName={paint.name} />}
    />
  );
}
