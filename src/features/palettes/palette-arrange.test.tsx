import { useUser } from "@clerk/react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { catalogOf, catalogPaint } from "@/test/catalog-fixture";
import { renderRoute } from "@/test/render-route";

import { api } from "../../../convex/_generated/api";
import { OFFLINE_EDIT_NOTE } from "./palette-name-sheet";

const red = catalogPaint({ brandId: "citadel", name: "Mephiston Red", hex: "#9B130B" });
const vallejo = catalogPaint({ brandId: "vallejo", name: "Blood Red", hex: "#A11B1F" });
const catalog = catalogOf([red, vallejo]);

const PALETTE_ID = "palette-1";
const NO_ROWS: never[] = [];
const ME = { _id: "user-1" };

function palette(paintIds: string[], trimPaintIds: string[] = []) {
  return {
    _id: PALETTE_ID,
    _creationTime: 1,
    userId: "user-1",
    name: "Ultramarines",
    paintIds,
    // A group makes each All paints row render its Groups button.
    groups: [{ id: "group-trim", name: "Trim", paintIds: trimPaintIds }],
    updatedAt: 1,
  };
}

const defaultUseMutation = vi.mocked(useMutation).getMockImplementation();

const nameOf = (ref: unknown) => getFunctionName(ref as FunctionReference<"query" | "mutation">);

function signedInWith(stored: ReturnType<typeof palette>) {
  vi.mocked(useUser).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    user: { id: "user_test" },
  } as unknown as ReturnType<typeof useUser>);
  vi.mocked(useConvexAuth).mockReturnValue({
    isLoading: false,
    isRefreshing: false,
    isAuthenticated: true,
  });
  vi.mocked(useQuery).mockImplementation(((query: unknown) => {
    const name = nameOf(query);
    if (name === nameOf(api.palettes.get)) return stored;
    if (name === nameOf(api.palettes.listMine)) return NO_ROWS;
    if (name === nameOf(api.userPaints.listMine)) return NO_ROWS;
    return ME;
  }) as typeof useQuery);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json(catalog))),
  );
}

function twoGroups() {
  return {
    ...palette([red.id, vallejo.id]),
    groups: [
      { id: "group-trim", name: "Trim", paintIds: [red.id, vallejo.id] },
      { id: "group-highlights", name: "Highlights", paintIds: [] },
    ],
  };
}

function mockMutations(handlers: Record<string, (...args: never[]) => Promise<unknown>>) {
  vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
    const fn = handlers[nameOf(ref)] ?? vi.fn(() => Promise.resolve(null));
    return Object.assign(fn, { withOptimisticUpdate: () => fn });
  }) as unknown as typeof useMutation);
}

const isDisabled = (element: HTMLElement) =>
  (element as HTMLButtonElement).disabled || element.getAttribute("aria-disabled") === "true";

afterEach(() => {
  vi.mocked(useUser).mockReturnValue({
    isLoaded: true,
    isSignedIn: false,
    user: null,
  } as unknown as ReturnType<typeof useUser>);
  vi.mocked(useConvexAuth).mockReturnValue({
    isLoading: false,
    isRefreshing: false,
    isAuthenticated: false,
  });
  vi.mocked(useQuery).mockImplementation((() => undefined) as typeof useQuery);
  vi.mocked(useMutation).mockImplementation(defaultUseMutation as typeof useMutation);
  vi.restoreAllMocks();
});

describe("Arrange mode", () => {
  it("arrange mode swaps row controls for handles", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([red.id, "retired-paint-id", vallejo.id], [red.id]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    expect(within(list).getAllByRole("link")).toHaveLength(2);
    expect(within(list).queryAllByRole("button", { name: /^Drag / })).toHaveLength(0);
    // Arrange mode renders the groups afresh, so the region is looked up each time.
    const trim = () => screen.getByRole("region", { name: "Trim" });
    await within(trim()).findByRole("button", { name: "Actions for Mephiston Red in Trim" });
    expect(within(trim()).getByRole("button", { name: "Actions for group Trim" })).toBeVisible();
    expect(within(trim()).queryAllByRole("button", { name: /^Drag / })).toHaveLength(0);
    expect(screen.getByRole("button", { name: "New group" })).toBeVisible();

    const arrange = screen.getByRole("button", { name: "Arrange" });
    fireEvent.click(arrange);

    expect(arrange).toHaveAccessibleName("Done");
    const handles = [
      within(list).getByRole("button", { name: "Drag Mephiston Red" }),
      within(list).getByRole("button", { name: "Drag unknown paint" }),
      within(list).getByRole("button", { name: "Drag Blood Red" }),
    ];
    for (const handle of handles) {
      expect(handle).toHaveAccessibleDescription(expect.stringContaining("Space"));
    }
    expect(within(list).queryAllByRole("link")).toHaveLength(0);
    expect(within(list).queryAllByRole("button", { name: /^Groups for / })).toHaveLength(0);
    expect(within(list).queryAllByRole("button", { name: /^Remove / })).toHaveLength(0);

    const groupHandles = [
      within(trim()).getByRole("button", { name: "Drag group Trim" }),
      within(trim()).getByRole("button", { name: "Drag Mephiston Red" }),
    ];
    for (const handle of groupHandles) {
      expect(handle).toHaveAccessibleDescription(expect.stringContaining("Space"));
    }
    expect(within(trim()).queryByRole("button", { name: "Actions for group Trim" })).toBeNull();
    expect(
      within(trim()).queryByRole("button", { name: "Actions for Mephiston Red in Trim" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "New group" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(within(list).queryAllByRole("button", { name: /^Drag / })).toHaveLength(0);
    expect(within(list).getAllByRole("link")).toHaveLength(2);
    expect(within(list).getByRole("button", { name: "Groups for Mephiston Red" })).toBeVisible();
    expect(within(list).getByRole("button", { name: "Groups for unknown paint" })).toBeVisible();
    expect(within(list).getByRole("button", { name: "Groups for Blood Red" })).toBeVisible();
    expect(
      within(list).getByRole("button", { name: "Remove Mephiston Red from palette" }),
    ).toBeVisible();
    expect(
      within(list).getByRole("button", { name: "Remove unknown paint from palette" }),
    ).toBeVisible();
    expect(
      within(list).getByRole("button", { name: "Remove Blood Red from palette" }),
    ).toBeVisible();
    expect(within(trim()).queryAllByRole("button", { name: /^Drag / })).toHaveLength(0);
    expect(within(trim()).getByRole("button", { name: "Actions for group Trim" })).toBeVisible();
    expect(
      within(trim()).getByRole("button", { name: "Actions for Mephiston Red in Trim" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "New group" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Arrange" })).toHaveFocus();
  });

  it("arrange is disabled offline", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    signedInWith(palette([red.id, vallejo.id], [red.id]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const main = await screen.findByRole("main");
    const list = await within(main).findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    expect(within(main).getByRole("button", { name: "Arrange" })).toBeDisabled();
    expect(within(main).getByText(OFFLINE_EDIT_NOTE)).toHaveAttribute("role", "status");

    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    const arrange = within(main).getByRole("button", { name: "Arrange" });
    expect(arrange).toBeEnabled();
    fireEvent.click(arrange);
    const handles = [
      within(list).getByRole("button", { name: "Drag Mephiston Red" }),
      within(list).getByRole("button", { name: "Drag Blood Red" }),
    ];
    expect(handles.filter(isDisabled)).toHaveLength(0);
    const trim = within(main).getByRole("region", { name: "Trim" });
    const groupHandles = [
      within(trim).getByRole("button", { name: "Drag group Trim" }),
      within(trim).getByRole("button", { name: "Drag Mephiston Red" }),
    ];
    expect(groupHandles.filter(isDisabled)).toHaveLength(0);

    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(isDisabled(within(list).getByRole("button", { name: "Drag Mephiston Red" }))).toBe(true);
    expect(isDisabled(within(list).getByRole("button", { name: "Drag Blood Red" }))).toBe(true);
    expect(isDisabled(within(trim).getByRole("button", { name: "Drag group Trim" }))).toBe(true);
    expect(isDisabled(within(trim).getByRole("button", { name: "Drag Mephiston Red" }))).toBe(true);
    expect(within(main).getByText(OFFLINE_EDIT_NOTE)).toHaveAttribute("role", "status");
  });

  it("Move sheet moves a paint or group by one or to an end", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(twoGroups());
    const movePaint = vi.fn(() => Promise.resolve(null));
    const moveGroup = vi.fn(() => Promise.resolve(null));
    const moveGroupPaint = vi.fn(() => Promise.resolve(null));
    mockMutations({
      [nameOf(api.palettes.movePaint)]: movePaint,
      [nameOf(api.palettes.moveGroup)]: moveGroup,
      [nameOf(api.palettes.moveGroupPaint)]: moveGroupPaint,
    });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    expect(screen.queryAllByRole("button", { name: /^Move / })).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    const trim = () => screen.getByRole("region", { name: "Trim" });
    const highlights = () => screen.getByRole("region", { name: "Highlights" });
    expect(within(list).getByRole("button", { name: "Move Mephiston Red" })).toBeVisible();
    expect(within(list).getByRole("button", { name: "Move Blood Red" })).toBeVisible();
    expect(within(trim()).getByRole("button", { name: "Move group Trim" })).toBeVisible();
    expect(within(trim()).getByRole("button", { name: "Move Mephiston Red" })).toBeVisible();
    expect(within(trim()).getByRole("button", { name: "Move Blood Red" })).toBeVisible();
    expect(
      within(highlights()).getByRole("button", { name: "Move group Highlights" }),
    ).toBeVisible();

    fireEvent.click(within(list).getByRole("button", { name: "Move Mephiston Red" }));
    let sheet = await screen.findByRole("dialog", { name: "Move Mephiston Red" });
    expect(within(sheet).getByRole("button", { name: "Move to top" })).toBeDisabled();
    expect(within(sheet).getByRole("button", { name: "Move up" })).toBeDisabled();
    fireEvent.click(within(sheet).getByRole("button", { name: "Move to bottom" }));
    expect(movePaint).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      paintId: red.id,
      toIndex: 1,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(within(list).getByRole("button", { name: "Move Mephiston Red" })).toHaveFocus(),
    );

    fireEvent.click(within(highlights()).getByRole("button", { name: "Move group Highlights" }));
    sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Move up" }));
    expect(moveGroup).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      groupId: "group-highlights",
      toIndex: 0,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(
        within(highlights()).getByRole("button", { name: "Move group Highlights" }),
      ).toHaveFocus(),
    );

    fireEvent.click(within(trim()).getByRole("button", { name: "Move Mephiston Red" }));
    sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Move down" }));
    expect(moveGroupPaint).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      groupId: "group-trim",
      paintId: red.id,
      toIndex: 1,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(within(trim()).getByRole("button", { name: "Move Mephiston Red" })).toHaveFocus(),
    );
  });

  it("a move shows at once and reverts on failure", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedInWith(twoGroups());
    const movePaint = vi.fn(() => Promise.reject(new Error("network down")));
    mockMutations({ [nameOf(api.palettes.movePaint)]: movePaint });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    fireEvent.click(within(list).getByRole("button", { name: "Move Mephiston Red" }));
    const sheet = await screen.findByRole("dialog", { name: "Move Mephiston Red" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Move down" }));

    expect(movePaint).toHaveBeenCalledOnce();
    expect(
      await screen.findByText("Couldn't move Mephiston Red. Check your connection and try again."),
    ).toBeVisible();
  });
});
