import "./paint-row.css";

import { Link } from "@tanstack/react-router";
import { type ReactNode, useId } from "react";

import type { CatalogPaint } from "@/features/catalog/schema";
import type { MatchLabel } from "@/features/matching/delta-e";

import { PaintSwatch } from "./paint-swatch";

type Props = {
  paint: CatalogPaint;
  brandName: string;
  lineName: string;
  match?: MatchLabel;
  /** Extra muted text under the meta line, e.g. "You own this". */
  note?: string;
  /** Controls beside the row's link, e.g. Own/Want toggles; kept outside the link so taps never open the paint. */
  actions?: ReactNode;
  /** Select mode: the whole row becomes the checkbox's label, with no link and no actions. */
  selection?: { selected: boolean; disabled?: boolean; onToggle: () => void };
};

export function PaintRow({ paint, brandName, lineName, match, note, actions, selection }: Props) {
  const type = paint.type.charAt(0).toUpperCase() + paint.type.slice(1);
  const metaId = useId();

  const content = (
    <>
      <PaintSwatch hex={paint.hex} type={paint.type} />
      <div className="paint-row__text">
        <p className="paint-row__name">{paint.name}</p>
        <p id={metaId} className="paint-row__meta">
          {brandName} · {lineName} · {type}
        </p>
        {note && <p className="paint-row__note">{note}</p>}
      </div>
      {(match ?? paint.discontinued) && (
        <div className="paint-row__badges">
          {match && <span className="paint-row__match">{match}</span>}
          {paint.discontinued && <span className="paint-row__badge">Discontinued</span>}
        </div>
      )}
    </>
  );

  if (selection) {
    return (
      <li className="paint-row">
        <label className="paint-row__link" data-disabled={selection.disabled || undefined}>
          <input
            type="checkbox"
            className="paint-row__checkbox"
            aria-label={`Select ${paint.name}`}
            // Many names repeat across brands; brand, line and type tell the ticks apart (WCAG 2.4.6).
            aria-describedby={metaId}
            checked={selection.selected}
            disabled={selection.disabled}
            // jsdom still fires change on a disabled box, so this doesn't rely on the browser to block it.
            onChange={() => {
              if (!selection.disabled) selection.onToggle();
            }}
          />
          {content}
        </label>
      </li>
    );
  }

  return (
    <li className="paint-row">
      <Link to="/paints/$paintId" params={{ paintId: paint.id }} className="paint-row__link">
        {content}
      </Link>
      {actions}
    </li>
  );
}
