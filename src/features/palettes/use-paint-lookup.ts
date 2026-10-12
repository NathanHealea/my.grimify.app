import { useMemo } from "react";

import type { CatalogPaint } from "@/features/catalog/schema";
import { useCatalog } from "@/features/catalog/use-catalog";

/** Finds a catalog paint by ID; `undefined` for an ID the catalog doesn't have or while it loads. */
export function usePaintLookup(): (paintId: string) => CatalogPaint | undefined {
  const state = useCatalog();
  const catalog = state.status === "ready" ? state.catalog : null;
  return useMemo(() => {
    const byId = new Map(catalog?.paints.map((paint) => [paint.id, paint]));
    return (paintId) => byId.get(paintId);
  }, [catalog]);
}
