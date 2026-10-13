import { useUser } from "@clerk/react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { catalogOf, catalogPaint } from "@/test/catalog-fixture";
import { renderRoute } from "@/test/render-route";

import { api } from "../../../convex/_generated/api";

const red = catalogPaint({ brandId: "citadel", name: "Mephiston Red", hex: "#9B130B" });
const vallejo = catalogPaint({ brandId: "vallejo", name: "Blood Red", hex: "#A11B1F" });
const catalog = catalogOf([red, vallejo]);

const PALETTE_ID = "palette-1";
const NO_ROWS: never[] = [];
const ME = { _id: "user-1" };

function palette(paintIds: string[]) {
  return {
    _id: PALETTE_ID,
    _creationTime: 1,
    userId: "user-1",
    name: "Ultramarines",
    paintIds,
    groups: [],
    updatedAt: 1,
  };
}

const defaultUseMutation = vi.mocked(useMutation).getMockImplementation();

const nameOf = (ref: unknown) => getFunctionName(ref as FunctionReference<"query" | "mutation">);

function signedInWith(stored: ReturnType<typeof palette> | null | undefined) {
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

function mockMutations() {
  const remove = vi.fn(() => Promise.resolve(null));
  const other = vi.fn(() => Promise.resolve(null));
  vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
    const fn = nameOf(ref) === nameOf(api.palettes.remove) ? remove : other;
    return Object.assign(fn, { withOptimisticUpdate: () => fn });
  }) as unknown as typeof useMutation);
  return { remove };
}

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

describe("PaletteDetail", () => {
  it("renders paints in order and unknown IDs", async () => {
    signedInWith(palette([red.id, "retired-paint-id", vallejo.id]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Ultramarines" })).toBeVisible();
    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(3));
    const [first, second, third] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Mephiston Red");
    expect(first).toHaveTextContent("Citadel");
    expect(second).toHaveTextContent("Unknown paint");
    expect(second).not.toHaveTextContent("Citadel");
    expect(second).not.toHaveTextContent("Vallejo");
    expect(third).toHaveTextContent("Blood Red");
    expect(third).toHaveTextContent("Vallejo");

    cleanup();
    signedInWith(null);
    renderRoute(`/palettes/${PALETTE_ID}`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Palette not found" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "All palettes" })).toHaveAttribute("href", "/palettes");
  });

  it("removes a paint from the palette screen", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([red.id, "retired-paint-id", vallejo.id]));
    const removePaint = vi.fn<(args: { paletteId: string; paintId: string }) => Promise<null>>(() =>
      Promise.resolve(null),
    );
    vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
      const fn =
        nameOf(ref) === nameOf(api.palettes.removePaint)
          ? removePaint
          : vi.fn(() => Promise.resolve(null));
      return Object.assign(fn, { withOptimisticUpdate: () => fn });
    }) as unknown as typeof useMutation);
    renderRoute(`/palettes/${PALETTE_ID}`);

    const list = await screen.findByRole("list", { name: "Paints in this palette" });
    fireEvent.click(
      await within(list).findByRole("button", { name: "Remove Mephiston Red from palette" }),
    );

    expect(removePaint).toHaveBeenCalledExactlyOnceWith({ paletteId: PALETTE_ID, paintId: red.id });
    expect(await screen.findByText("Removed Mephiston Red")).toBeVisible();

    fireEvent.click(
      within(list).getByRole("button", { name: "Remove unknown paint from palette" }),
    );
    expect(removePaint).toHaveBeenLastCalledWith({
      paletteId: PALETTE_ID,
      paintId: "retired-paint-id",
    });

    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    const main = screen.getByRole("main");
    const removeBloodRed = within(list).getByRole("button", {
      name: "Remove Blood Red from palette",
    });
    expect(removeBloodRed).toBeDisabled();
    expect(
      within(list).getByRole("button", { name: "Remove unknown paint from palette" }),
    ).toBeDisabled();
    expect(within(main).getByRole("status")).toHaveTextContent(
      "Connect to the internet to edit palettes.",
    );
    fireEvent.click(removeBloodRed);
    expect(removePaint).toHaveBeenCalledTimes(2);
  });

  it("delete asks for confirmation", async () => {
    signedInWith(palette([red.id]));
    const { remove } = mockMutations();
    const router = renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Palette actions" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete palette" }),
    );
    let confirm = await screen.findByRole("dialog", { name: 'Delete "Ultramarines"?' });
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Ultramarines" })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/palettes/${PALETTE_ID}`);

    fireEvent.click(screen.getByRole("button", { name: "Palette actions" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete palette" }),
    );
    confirm = await screen.findByRole("dialog", { name: 'Delete "Ultramarines"?' });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/palettes"));
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith({ paletteId: PALETTE_ID });
  });

  it("disables editing offline", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    signedInWith(palette([red.id]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const main = await screen.findByRole("main");
    expect(
      await within(main).findByRole("heading", { level: 1, name: "Ultramarines" }),
    ).toBeVisible();
    expect(within(main).getByRole("button", { name: "Palette actions" })).toBeDisabled();
    const notice = within(main).getByRole("status");
    expect(notice).toHaveTextContent("Connect to the internet to edit palettes.");

    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(within(main).getByRole("button", { name: "Palette actions" })).toBeEnabled();
    expect(notice).toBeEmptyDOMElement();
  });

  it("disables Delete in the confirmation once offline", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([red.id]));
    const { remove } = mockMutations();
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Palette actions" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete palette" }),
    );
    const confirm = await screen.findByRole("dialog", { name: 'Delete "Ultramarines"?' });
    expect(within(confirm).getByRole("button", { name: "Delete" })).toBeEnabled();

    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    const deleteButton = within(confirm).getByRole("button", { name: "Delete" });
    expect(deleteButton).toBeDisabled();
    expect(within(confirm).getByRole("status")).toHaveTextContent(
      "Connect to the internet to edit palettes.",
    );
    fireEvent.click(deleteButton);
    expect(remove).not.toHaveBeenCalled();
  });

  it("names the page Palette while signed out", async () => {
    renderRoute(`/palettes/${PALETTE_ID}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Palette" })).toBeVisible();
    expect(screen.getByText("Sign in to keep color palettes on any device.")).toBeInTheDocument();
  });

  it("names the page Palette while loading", async () => {
    signedInWith(undefined);
    renderRoute(`/palettes/${PALETTE_ID}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Palette" })).toBeVisible();
    expect(screen.getByText("Loading palette…")).toBeInTheDocument();
  });

  it("goes back to Palettes after a delete without showing Palette not found", async () => {
    let stored: ReturnType<typeof palette> | null = palette([red.id]);
    signedInWith(stored);
    vi.mocked(useQuery).mockImplementation(((query: unknown) => {
      const name = nameOf(query);
      if (name === nameOf(api.palettes.get)) return stored;
      if (name === nameOf(api.palettes.listMine)) return NO_ROWS;
      if (name === nameOf(api.userPaints.listMine)) return NO_ROWS;
      return ME;
    }) as typeof useQuery);
    // Convex updates the subscribed query to null before the mutation's promise resolves.
    const remove = vi.fn(() => {
      stored = null;
      return Promise.resolve(null);
    });
    vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
      const fn =
        nameOf(ref) === nameOf(api.palettes.remove) ? remove : vi.fn(() => Promise.resolve(null));
      return Object.assign(fn, { withOptimisticUpdate: () => fn });
    }) as unknown as typeof useMutation);
    const router = renderRoute(`/palettes/${PALETTE_ID}`);
    let sawNotFound = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes("Palette not found")) sawNotFound = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    fireEvent.click(await screen.findByRole("button", { name: "Palette actions" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete palette" }),
    );
    const confirm = await screen.findByRole("dialog", { name: 'Delete "Ultramarines"?' });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/palettes"));
    observer.disconnect();
    expect(remove).toHaveBeenCalledOnce();
    expect(sawNotFound).toBe(false);
  });

  it("moves focus to the name field when Rename is chosen", async () => {
    signedInWith(palette([red.id]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Palette actions" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rename" }));
    const rename = await screen.findByRole("dialog", { name: "Rename palette" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ultramarines" })).not.toBeInTheDocument(),
    );

    expect(within(rename).getByLabelText("Palette name")).toHaveFocus();
  });

  it("renames the palette with the typed name", async () => {
    signedInWith(palette([red.id]));
    const rename = vi.fn<(args: { paletteId: string; name: string }) => Promise<null>>(() =>
      Promise.resolve(null),
    );
    vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
      const fn =
        nameOf(ref) === nameOf(api.palettes.rename) ? rename : vi.fn(() => Promise.resolve(null));
      return Object.assign(fn, { withOptimisticUpdate: () => fn });
    }) as unknown as typeof useMutation);
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Palette actions" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rename" }));
    const sheet = await screen.findByRole("dialog", { name: "Rename palette" });
    const field = within(sheet).getByLabelText("Palette name");
    expect(field).toHaveValue("Ultramarines");
    fireEvent.change(field, { target: { value: "  Ultramarines 2nd Co.  " } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(rename).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      name: "Ultramarines 2nd Co.",
    });
  });

  it("stays on the palette and says so when the delete fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedInWith(palette([red.id]));
    const { remove } = mockMutations();
    remove.mockImplementation(() => Promise.reject(new Error("network down")));
    const router = renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Palette actions" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete palette" }),
    );
    const confirm = await screen.findByRole("dialog", { name: 'Delete "Ultramarines"?' });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(within(confirm).getByRole("alert")).toHaveTextContent(
        "Couldn't delete the palette. Check your connection and try again.",
      ),
    );
    expect(remove).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe(`/palettes/${PALETTE_ID}`);

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { level: 1, name: "Ultramarines" })).toBeVisible();
  });

  it("lets a pending delete be cancelled once the device goes offline", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([red.id]));
    const { remove } = mockMutations();
    remove.mockImplementation(() => new Promise<never>(() => {}));
    const router = renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Palette actions" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete palette" }),
    );
    const confirm = await screen.findByRole("dialog", { name: 'Delete "Ultramarines"?' });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledOnce();
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toBeDisabled();

    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    const cancel = within(confirm).getByRole("button", { name: "Cancel" });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe(`/palettes/${PALETTE_ID}`);
  });

  it("keeps the confirmation open on Escape while a delete is pending online", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([red.id]));
    const { remove } = mockMutations();
    remove.mockImplementation(() => new Promise<never>(() => {}));
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Palette actions" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete palette" }),
    );
    const confirm = await screen.findByRole("dialog", { name: 'Delete "Ultramarines"?' });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    fireEvent.keyDown(confirm, { key: "Escape" });

    expect(screen.getByRole("dialog", { name: 'Delete "Ultramarines"?' })).toBeInTheDocument();
  });

  it("shows Palette not found if the palette disappears after a failed delete", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    let stored: ReturnType<typeof palette> | null = palette([red.id]);
    signedInWith(stored);
    vi.mocked(useQuery).mockImplementation(((query: unknown) => {
      const name = nameOf(query);
      if (name === nameOf(api.palettes.get)) return stored;
      if (name === nameOf(api.palettes.listMine)) return NO_ROWS;
      if (name === nameOf(api.userPaints.listMine)) return NO_ROWS;
      return ME;
    }) as typeof useQuery);
    const { remove } = mockMutations();
    remove.mockImplementation(() => Promise.reject(new Error("network down")));
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Palette actions" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete palette" }),
    );
    const confirm = await screen.findByRole("dialog", { name: 'Delete "Ultramarines"?' });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(within(confirm).getByRole("alert")).toHaveTextContent("Couldn't delete the palette."),
    );

    // Deleted on another device; the connection dropping and returning re-renders the screen.
    stored = null;
    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Palette not found" }),
    ).toBeVisible();
  });
});
