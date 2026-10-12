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
});
