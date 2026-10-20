import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createSelection, useAtCap, useTicked } from "./selection-store";

describe("selection store", () => {
  it("keeps ticks in order and toggles off", () => {
    const selection = createSelection(10);

    selection.toggle("a");
    selection.toggle("b");
    selection.toggle("c");
    selection.toggle("b");

    expect(selection.ids()).toEqual(["a", "c"]);
    expect(selection.count()).toBe(2);
  });

  it("stops calling a listener after it unsubscribes", () => {
    const selection = createSelection(10);
    const listener = vi.fn();

    const unsubscribe = selection.subscribe(listener);
    selection.toggle("a");
    unsubscribe();
    selection.toggle("b");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores a tick past the cap", () => {
    const selection = createSelection(2);

    selection.toggle("a");
    selection.toggle("b");
    selection.toggle("c");
    expect(selection.ids()).toEqual(["a", "b"]);
    expect(selection.isTicked("c")).toBe(false);

    selection.toggle("a");
    expect(selection.ids()).toEqual(["b"]);
  });

  it("re-renders only the hooks whose answer changed", () => {
    const selection = createSelection(2);
    const renders = { a: 0, b: 0, atCap: 0 };
    const rowA = renderHook(() => {
      renders.a++;
      return useTicked(selection, "a");
    });
    const rowB = renderHook(() => {
      renders.b++;
      return useTicked(selection, "b");
    });
    const cap = renderHook(() => {
      renders.atCap++;
      return useAtCap(selection);
    });
    const initial = { ...renders };

    act(() => selection.toggle("b"));
    expect(rowB.result.current).toBe(true);
    expect(renders.b).toBe(initial.b + 1);
    expect(rowA.result.current).toBe(false);
    expect(renders.a).toBe(initial.a);
    expect(cap.result.current).toBe(false);
    expect(renders.atCap).toBe(initial.atCap);

    act(() => selection.toggle("c"));
    expect(cap.result.current).toBe(true);
    expect(renders.atCap).toBe(initial.atCap + 1);
    expect(renders.a).toBe(initial.a);
    expect(renders.b).toBe(initial.b + 1);

    act(() => selection.toggle("c"));
    expect(cap.result.current).toBe(false);
    expect(renders.atCap).toBe(initial.atCap + 2);

    act(() => selection.toggle("d"));
    expect(cap.result.current).toBe(true);
    expect(renders.atCap).toBe(initial.atCap + 3);
    expect(renders.a).toBe(initial.a);
    expect(renders.b).toBe(initial.b + 1);
  });

  it("clear empties the selection", () => {
    const selection = createSelection(10);
    const rowA = renderHook(() => useTicked(selection, "a"));
    const rowB = renderHook(() => useTicked(selection, "b"));
    act(() => {
      selection.toggle("a");
      selection.toggle("b");
    });
    expect(rowA.result.current).toBe(true);
    expect(rowB.result.current).toBe(true);

    act(() => selection.clear());

    expect(selection.ids()).toEqual([]);
    expect(rowA.result.current).toBe(false);
    expect(rowB.result.current).toBe(false);
  });
});
