import { useCallback, useSyncExternalStore } from "react";

/** Select mode's ticked paint IDs, outside React state so a tick re-renders only the rows it changes. */
export type Selection = {
  /** Ticks or unticks; a tick past the cap is ignored. */
  toggle: (id: string) => void;
  clear: () => void;
  /** Tick order; the same array until the selection changes. */
  ids: () => readonly string[];
  count: () => number;
  isTicked: (id: string) => boolean;
  atCap: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

export function createSelection(max: number): Selection {
  let ids: readonly string[] = [];
  let ticked = new Set<string>();
  const listeners = new Set<() => void>();

  const set = (next: readonly string[]) => {
    ids = next;
    ticked = new Set(next);
    for (const listener of listeners) listener();
  };

  return {
    toggle(id) {
      if (ticked.has(id)) set(ids.filter((other) => other !== id));
      else if (ids.length < max) set([...ids, id]);
    },
    clear() {
      if (ids.length > 0) set([]);
    },
    ids: () => ids,
    count: () => ids.length,
    isTicked: (id) => ticked.has(id),
    atCap: () => ids.length >= max,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Each hook returns a primitive or the shared array, so React skips the re-render when its answer didn't change.
export function useTicked(selection: Selection, id: string): boolean {
  const isTicked = useCallback(() => selection.isTicked(id), [selection, id]);
  return useSyncExternalStore(selection.subscribe, isTicked);
}

export function useSelectedIds(selection: Selection): readonly string[] {
  return useSyncExternalStore(selection.subscribe, selection.ids);
}

export function useAtCap(selection: Selection): boolean {
  return useSyncExternalStore(selection.subscribe, selection.atCap);
}
