import { useUser } from "@clerk/react";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { ToastProvider } from "@/features/feedback/toast-provider";
import { catalogOf, catalogPaint } from "@/test/catalog-fixture";
import { renderRoute } from "@/test/render-route";

import { api } from "../../../convex/_generated/api";
import { usePaletteMoves } from "./palette-arrange";
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

/** Presses `handle` and moves past the mouse sensor's 5px activation distance. */
function startMouseDrag(handle: HTMLElement) {
  fireEvent.mouseDown(handle, { button: 0, clientX: 10, clientY: 10 });
  // dnd-kit blocks clicks on document during a pointer drag and lifts the block 50ms after release; a later test's clicks would be swallowed.
  onTestFinished(async () => {
    fireEvent.mouseUp(document);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  fireEvent.mouseMove(document, { clientX: 10, clientY: 30 });
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
    const moveButtons = () => [
      within(list).getByRole("button", { name: "Move Mephiston Red" }),
      within(list).getByRole("button", { name: "Move Blood Red" }),
      within(trim).getByRole("button", { name: "Move group Trim" }),
      within(trim).getByRole("button", { name: "Move Mephiston Red" }),
    ];
    expect(moveButtons().filter(isDisabled)).toHaveLength(0);

    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(moveButtons().filter((button) => !isDisabled(button))).toHaveLength(0);
    // Done stays usable offline so the user can leave arrange mode.
    expect(within(main).getByRole("button", { name: "Done" })).toBeEnabled();
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

  it("collapses every group to its heading while a group is dragged", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(twoGroups());
    renderRoute(`/palettes/${PALETTE_ID}`);
    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    const trim = () => screen.getByRole("region", { name: "Trim" });
    const highlights = () => screen.getByRole("region", { name: "Highlights" });
    expect(within(trim()).getByRole("button", { name: "Drag Mephiston Red" })).toBeVisible();

    const handle = within(trim()).getByRole("button", { name: "Drag group Trim" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });

    await waitFor(() => expect(trim()).toHaveAttribute("data-dragging"));
    expect(within(trim()).queryByRole("button", { name: "Drag Mephiston Red" })).toBeNull();
    expect(within(trim()).queryByRole("button", { name: "Drag Blood Red" })).toBeNull();
    expect(within(highlights()).queryByText("No paints in this group yet")).toBeNull();
    expect(within(trim()).getByRole("heading", { name: "Trim" })).toBeVisible();
    expect(within(highlights()).getByRole("heading", { name: "Highlights" })).toBeVisible();

    fireEvent.keyDown(handle, { code: "Escape", key: "Escape" });
    await within(trim()).findByRole("button", { name: "Drag Mephiston Red" });
    const other = within(highlights()).getByRole("button", { name: "Drag group Highlights" });
    other.focus();
    fireEvent.keyDown(other, { code: "Space", key: " " });

    await waitFor(() => expect(highlights()).toHaveAttribute("data-dragging"));
    expect(within(trim()).queryByRole("button", { name: "Drag Mephiston Red" })).toBeNull();
    expect(within(trim()).queryByRole("button", { name: "Drag Blood Red" })).toBeNull();
  });

  it("sizes the group drag overlay to the heading row", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const measure = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect")
      ?.value as (this: Element) => DOMRect;
    // jsdom has no layout: an expanded group is 240px tall and its heading row 48px.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const height = this.classList.contains("palette-groups__group")
        ? 240
        : this.classList.contains("palette-groups__heading")
          ? 48
          : null;
      if (height === null) return measure.call(this);
      return DOMRect.fromRect({ x: 0, y: 0, width: 320, height });
    });
    signedInWith(twoGroups());
    renderRoute(`/palettes/${PALETTE_ID}`);
    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    const trim = () => screen.getByRole("region", { name: "Trim" });

    const handle = within(trim()).getByRole("button", { name: "Drag group Trim" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });

    await waitFor(() => expect(document.querySelector(".drag-preview")).not.toBeNull());
    const overlay = document.querySelector(".drag-preview")?.parentElement;
    expect(overlay?.style.height).toBe("48px");
  });

  it("expands the groups again when a group drag is dropped or cancelled", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(twoGroups());
    renderRoute(`/palettes/${PALETTE_ID}`);
    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    const trim = () => screen.getByRole("region", { name: "Trim" });
    const highlights = () => screen.getByRole("region", { name: "Highlights" });
    const handle = () => within(trim()).getByRole("button", { name: "Drag group Trim" });

    for (const end of [
      { code: "Space", key: " " },
      { code: "Escape", key: "Escape" },
    ]) {
      handle().focus();
      fireEvent.keyDown(handle(), { code: "Space", key: " " });
      await waitFor(() =>
        expect(within(trim()).queryByRole("button", { name: "Drag Mephiston Red" })).toBeNull(),
      );
      fireEvent.keyDown(handle(), end);
      expect(
        await within(trim()).findByRole("button", { name: "Drag Mephiston Red" }),
      ).toBeVisible();
      expect(within(trim()).getByRole("button", { name: "Drag Blood Red" })).toBeVisible();
      expect(within(highlights()).getByText("No paints in this group yet")).toBeVisible();
    }
  });

  it("keeps groups expanded while a paint is dragged", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(twoGroups());
    renderRoute(`/palettes/${PALETTE_ID}`);
    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    const trim = () => screen.getByRole("region", { name: "Trim" });
    const highlights = () => screen.getByRole("region", { name: "Highlights" });

    const handle = within(trim()).getByRole("button", { name: "Drag Mephiston Red" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });

    await waitFor(() => expect(handle.closest("li")).toHaveAttribute("data-dragging"));
    expect(within(trim()).getByRole("button", { name: "Drag Mephiston Red" })).toBeVisible();
    expect(within(trim()).getByRole("button", { name: "Drag Blood Red" })).toBeVisible();
    expect(within(highlights()).getByText("No paints in this group yet")).toBeVisible();
  });

  it("keeps focus on the group handle when a keyboard group drag collapses the groups", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(twoGroups());
    renderRoute(`/palettes/${PALETTE_ID}`);
    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    const trim = () => screen.getByRole("region", { name: "Trim" });

    const handle = within(trim()).getByRole("button", { name: "Drag group Trim" });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });

    await waitFor(() =>
      expect(within(trim()).queryByRole("button", { name: "Drag Mephiston Red" })).toBeNull(),
    );
    expect(within(trim()).getByRole("button", { name: "Drag group Trim" })).toBe(
      document.activeElement,
    );
    // The over announcement for the group's own place replaces the pick-up in the same render.
    expect(document.querySelector('[id^="DndLiveRegion-"]')).toHaveTextContent(
      "Group Trim is over position 1 of 2.",
    );
  });

  it.each(["Drag Mephiston Red", "Move Mephiston Red"])(
    "moves focus to the dragged group's handle when a pointer group drag hides the focused paint row (%s)",
    async (focusedName) => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      signedInWith(twoGroups());
      renderRoute(`/palettes/${PALETTE_ID}`);
      const list = await screen.findByRole("list", { name: "Paints in this palette" });
      await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
      fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
      const trim = () => screen.getByRole("region", { name: "Trim" });
      const highlights = () => screen.getByRole("region", { name: "Highlights" });

      within(trim()).getByRole("button", { name: focusedName }).focus();
      const handle = within(highlights()).getByRole("button", { name: "Drag group Highlights" });
      startMouseDrag(handle);

      await waitFor(() => expect(highlights()).toHaveAttribute("data-dragging"));
      expect(document.activeElement).toBe(
        within(highlights()).getByRole("button", { name: "Drag group Highlights" }),
      );
    },
  );

  it("keeps focus on the group handle after a pointer group drag that moved it ends", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(twoGroups());
    renderRoute(`/palettes/${PALETTE_ID}`);
    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    const trim = () => screen.getByRole("region", { name: "Trim" });
    const highlights = () => screen.getByRole("region", { name: "Highlights" });

    within(trim()).getByRole("button", { name: "Drag Mephiston Red" }).focus();
    const handle = within(highlights()).getByRole("button", { name: "Drag group Highlights" });
    startMouseDrag(handle);
    await waitFor(() => expect(highlights()).toHaveAttribute("data-dragging"));
    fireEvent.mouseUp(document, { clientX: 10, clientY: 30 });

    expect(await within(trim()).findByRole("button", { name: "Drag Mephiston Red" })).toBeVisible();
    expect(document.activeElement).toBe(
      within(highlights()).getByRole("button", { name: "Drag group Highlights" }),
    );
  });

  it.each(["Done", "All paints Drag Mephiston Red"])(
    "leaves focus alone when a pointer group drag starts with focus outside the group rows (%s)",
    async (focusedName) => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      signedInWith(twoGroups());
      renderRoute(`/palettes/${PALETTE_ID}`);
      const list = await screen.findByRole("list", { name: "Paints in this palette" });
      await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
      fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
      const trim = () => screen.getByRole("region", { name: "Trim" });

      const focused =
        focusedName === "Done"
          ? screen.getByRole("button", { name: "Done" })
          : within(list).getByRole("button", { name: "Drag Mephiston Red" });
      focused.focus();
      const handle = within(trim()).getByRole("button", { name: "Drag group Trim" });
      startMouseDrag(handle);

      await waitFor(() => expect(trim()).toHaveAttribute("data-dragging"));
      expect(document.activeElement).toBe(focused);
    },
  );

  it("leaves focus alone when a pointer paint drag starts", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(twoGroups());
    renderRoute(`/palettes/${PALETTE_ID}`);
    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" });
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    const trim = () => screen.getByRole("region", { name: "Trim" });

    const move = within(trim()).getByRole("button", { name: "Move Blood Red" });
    move.focus();
    const handle = within(trim()).getByRole("button", { name: "Drag Mephiston Red" });
    startMouseDrag(handle);

    await waitFor(() => expect(handle.closest("li")).toHaveAttribute("data-dragging"));
    expect(document.activeElement).toBe(move);
  });

  it("sends every drop to its mutation and shows it at once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cached = twoGroups();
    type Updater = (store: unknown, args: Record<string, unknown>) => void;
    const calls: Record<string, { fn: ReturnType<typeof vi.fn>; updater?: Updater }> = {};
    vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
      const entry = (calls[nameOf(ref)] ??= {
        fn: vi.fn(() =>
          nameOf(ref) === nameOf(api.palettes.moveGroup)
            ? Promise.reject(new Error("network down"))
            : Promise.resolve(null),
        ),
      });
      return Object.assign(entry.fn, {
        withOptimisticUpdate: (updater: Updater) => {
          entry.updater = updater;
          return entry.fn;
        },
      });
    }) as unknown as typeof useMutation);
    const { result } = renderHook(
      () => usePaletteMoves(cached as never, (paintId) => (paintId === red.id ? red.name : "?")),
      { wrapper: ToastProvider },
    );
    const shown = (mutation: unknown) => {
      const { fn, updater } = calls[nameOf(mutation)];
      const store = { getQuery: vi.fn(() => cached), setQuery: vi.fn(), getAllQueries: vi.fn() };
      updater!(store, fn.mock.lastCall![0] as Record<string, unknown>);
      return store.setQuery.mock.lastCall![2] as ReturnType<typeof twoGroups>;
    };

    act(() => result.current({ kind: "movePaint", paintId: red.id, toIndex: 1 }));
    expect(calls[nameOf(api.palettes.movePaint)].fn).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      paintId: red.id,
      toIndex: 1,
    });
    expect(shown(api.palettes.movePaint).paintIds).toEqual([vallejo.id, red.id]);

    act(() =>
      result.current({
        kind: "moveGroupPaint",
        groupId: "group-trim",
        paintId: vallejo.id,
        toIndex: 0,
      }),
    );
    expect(shown(api.palettes.moveGroupPaint).groups[0].paintIds).toEqual([vallejo.id, red.id]);

    act(() =>
      result.current({
        kind: "addPaintToGroup",
        groupId: "group-highlights",
        paintId: red.id,
        toIndex: 0,
      }),
    );
    expect(calls[nameOf(api.palettes.addPaintToGroup)].fn).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      groupId: "group-highlights",
      paintId: red.id,
      toIndex: 0,
    });
    expect(shown(api.palettes.addPaintToGroup).groups[1].paintIds).toEqual([red.id]);

    act(() =>
      result.current({
        kind: "movePaintToGroup",
        fromGroupId: "group-trim",
        toGroupId: "group-highlights",
        paintId: vallejo.id,
        toIndex: 0,
      }),
    );
    expect(calls[nameOf(api.palettes.movePaintToGroup)].fn).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      fromGroupId: "group-trim",
      toGroupId: "group-highlights",
      paintId: vallejo.id,
      toIndex: 0,
    });
    expect(shown(api.palettes.movePaintToGroup).groups).toEqual([
      { id: "group-trim", name: "Trim", paintIds: [red.id] },
      { id: "group-highlights", name: "Highlights", paintIds: [vallejo.id] },
    ]);

    act(() => result.current({ kind: "moveGroup", groupId: "group-highlights", toIndex: 0 }));
    expect(shown(api.palettes.moveGroup).groups.map((g) => g.id)).toEqual([
      "group-highlights",
      "group-trim",
    ]);
    expect(
      await screen.findByText(
        "Couldn't move group Highlights. Check your connection and try again.",
      ),
    ).toBeVisible();
  });
});
