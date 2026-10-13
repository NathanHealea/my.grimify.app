import { useUser } from "@clerk/react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { catalogOf, catalogPaint } from "@/test/catalog-fixture";
import { renderRoute } from "@/test/render-route";

import { api } from "../../../convex/_generated/api";

const red = catalogPaint({ brandId: "citadel", name: "Mephiston Red", hex: "#9B130B" });
const vallejo = catalogPaint({ brandId: "vallejo", name: "Blood Red", hex: "#A11B1F" });
const catalog = catalogOf([red, vallejo]);

const PALETTE_ID = "palette-1";
const NO_ROWS: never[] = [];
const ME = { _id: "user-1" };

type Group = { id: string; name: string; paintIds: string[] };

function palette(groups: Group[], paintIds: string[] = [red.id, vallejo.id]) {
  return {
    _id: PALETTE_ID,
    _creationTime: 1,
    userId: "user-1",
    name: "Ultramarines",
    paintIds,
    groups,
    updatedAt: 1,
  };
}

const armor = (paintIds: string[] = [red.id]): Group => ({
  id: "group-armor",
  name: "Armor",
  paintIds,
});
const trim = (paintIds: string[] = []): Group => ({ id: "group-trim", name: "Trim", paintIds });
const highlights = (paintIds: string[] = []): Group => ({
  id: "group-highlights",
  name: "Highlights",
  paintIds,
});

const defaultUseMutation = vi.mocked(useMutation).getMockImplementation();

const nameOf = (ref: unknown) => getFunctionName(ref as FunctionReference<"query" | "mutation">);

// The palette query reads `store.current` on every render, so a mutation mock can change it.
function signedInWith(initial: ReturnType<typeof palette>) {
  const store = { current: initial };
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
    if (name === nameOf(api.palettes.get)) return store.current;
    if (name === nameOf(api.palettes.listMine)) return NO_ROWS;
    if (name === nameOf(api.userPaints.listMine)) return NO_ROWS;
    return ME;
  }) as typeof useQuery);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json(catalog))),
  );
  return store;
}

// The palette query is mocked, so a connection flip stands in for Convex pushing the new palette.
async function serverPushes(onLine: MockInstance<() => boolean>) {
  await act(() => Promise.resolve());
  onLine.mockReturnValue(false);
  act(() => void window.dispatchEvent(new Event("offline")));
  onLine.mockReturnValue(true);
  act(() => void window.dispatchEvent(new Event("online")));
}

function mockMutations(handlers: Record<string, (...args: never[]) => Promise<unknown>>) {
  vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
    const fn = handlers[nameOf(ref)] ?? vi.fn(() => Promise.resolve(null));
    return Object.assign(fn, { withOptimisticUpdate: () => fn });
  }) as unknown as typeof useMutation);
}

// Waits for the catalog too, so paint names have resolved before a test looks for them.
async function groupSection(name: string) {
  const section = await screen.findByRole("region", { name });
  await within(section).findAllByRole("button", { name: /^Actions for (?!group )/ });
  return section;
}

async function openActions(paint: string, group: string) {
  const section = await groupSection(group);
  const button = within(section).getByRole("button", { name: `Actions for ${paint} in ${group}` });
  fireEvent.click(button);
  const sheet = await screen.findByRole("dialog", { name: `${paint} in ${group}` });
  return { section, button, sheet };
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

describe("group paint actions move, copy and remove", () => {
  it("reopens on the first view after a copy", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor([red.id]), trim()]));
    const addPaintToGroup = vi.fn(() => {
      store.current = palette([armor([red.id]), trim([red.id])]);
      return Promise.resolve(null);
    });
    mockMutations({ [nameOf(api.palettes.addPaintToGroup)]: addPaintToGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { button, sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Copy to group…" }));
    const list = await screen.findByRole("dialog", { name: "Copy Mephiston Red to" });
    fireEvent.click(within(list).getByRole("button", { name: "Trim" }));
    await serverPushes(onLine);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(button);
    const reopened = await screen.findByRole("dialog", { name: "Mephiston Red in Armor" });
    await waitFor(() =>
      expect(within(reopened).getByRole("button", { name: "Move to group…" })).toHaveFocus(),
    );
  });

  it("keeps focus on Remove from group while it saves", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor([red.id]), trim()]));
    const removePaintFromGroup = vi.fn(() => new Promise(() => {}));
    mockMutations({ [nameOf(api.palettes.removePaintFromGroup)]: removePaintFromGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { sheet } = await openActions("Mephiston Red", "Armor");
    const remove = within(sheet).getByRole("button", { name: "Remove from group" });
    remove.focus();
    fireEvent.click(remove);
    fireEvent.click(remove);

    expect(remove).toHaveFocus();
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(removePaintFromGroup).toHaveBeenCalledOnce();
  });

  it("gives each row in a group an actions button named for the paint and group", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(
      palette(
        [armor([red.id, "retired-paint-id"]), trim([vallejo.id])],
        [red.id, "retired-paint-id", vallejo.id],
      ),
    );
    renderRoute(`/palettes/${PALETTE_ID}`);

    const armorSection = await groupSection("Armor");
    const [first, second] = within(armorSection).getAllByRole("listitem");
    expect(
      within(first).getByRole("button", { name: "Actions for Mephiston Red in Armor" }),
    ).toBeEnabled();
    expect(
      within(second).getByRole("button", { name: "Actions for unknown paint in Armor" }),
    ).toBeEnabled();
    const trimSection = await groupSection("Trim");
    expect(
      within(trimSection).getByRole("button", { name: "Actions for Blood Red in Trim" }),
    ).toBeEnabled();
  });

  it("disables the row actions buttons offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    signedInWith(palette([armor([red.id, vallejo.id]), trim()]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await groupSection("Armor");
    expect(
      within(section).getByRole("button", { name: "Actions for Mephiston Red in Armor" }),
    ).toBeDisabled();
    expect(
      within(section).getByRole("button", { name: "Actions for Blood Red in Armor" }),
    ).toBeDisabled();
  });

  it("opens a sheet with Move, Copy and Remove from group", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor(), trim()]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { sheet } = await openActions("Mephiston Red", "Armor");
    expect(within(sheet).getByRole("button", { name: "Move to group…" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Copy to group…" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Remove from group" })).toBeEnabled();
  });

  it("disables Move and Copy when the palette has no other group", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor()]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { sheet } = await openActions("Mephiston Red", "Armor");
    expect(within(sheet).getByRole("button", { name: "Move to group…" })).toBeDisabled();
    expect(within(sheet).getByRole("button", { name: "Copy to group…" })).toBeDisabled();
    expect(within(sheet).getByRole("button", { name: "Remove from group" })).toBeEnabled();
  });

  it("lists the other groups to move to, disabling one that already holds the paint", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([trim([red.id]), armor([red.id]), highlights()]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Move to group…" }));

    const list = await screen.findByRole("dialog", { name: "Move Mephiston Red to" });
    const held = within(list).getByRole("button", { name: "Trim (already in it)" });
    const open = within(list).getByRole("button", { name: "Highlights" });
    expect(within(list).getAllByRole("button", { name: /^(Armor|Trim|Highlights)/ })).toEqual([
      held,
      open,
    ]);
    expect(held).toBeDisabled();
    expect(open).toBeEnabled();
    expect(within(list).queryByRole("button", { name: /^Armor/ })).not.toBeInTheDocument();

    fireEvent.click(within(list).getByRole("button", { name: "Back" }));
    const back = await screen.findByRole("dialog", { name: "Mephiston Red in Armor" });
    expect(within(back).getByRole("button", { name: "Move to group…" })).toBeVisible();
  });

  it("lists the other groups to copy to, disabling one that already holds the paint", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor([red.id]), trim(), highlights([red.id])]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Copy to group…" }));

    const list = await screen.findByRole("dialog", { name: "Copy Mephiston Red to" });
    const open = within(list).getByRole("button", { name: "Trim" });
    const held = within(list).getByRole("button", { name: "Highlights (already in it)" });
    expect(within(list).getAllByRole("button", { name: /^(Armor|Trim|Highlights)/ })).toEqual([
      open,
      held,
    ]);
    expect(open).toBeEnabled();
    expect(held).toBeDisabled();

    fireEvent.click(within(list).getByRole("button", { name: "Back" }));
    const back = await screen.findByRole("dialog", { name: "Mephiston Red in Armor" });
    expect(within(back).getByRole("button", { name: "Copy to group…" })).toBeVisible();
  });

  it("moves the paint, toasts and focuses the next row's actions button", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor([red.id, vallejo.id]), trim()]));
    const movePaintToGroup = vi.fn(() => {
      store.current = palette([armor([vallejo.id]), trim([red.id])]);
      return Promise.resolve(null);
    });
    mockMutations({ [nameOf(api.palettes.movePaintToGroup)]: movePaintToGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { section, sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Move to group…" }));
    const list = await screen.findByRole("dialog", { name: "Move Mephiston Red to" });
    fireEvent.click(within(list).getByRole("button", { name: "Trim" }));
    await serverPushes(onLine);

    expect(movePaintToGroup).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      paintId: red.id,
      fromGroupId: "group-armor",
      toGroupId: "group-trim",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Moved to Trim")).toBeVisible();
    await waitFor(() =>
      expect(
        within(section).getByRole("button", { name: "Actions for Blood Red in Armor" }),
      ).toHaveFocus(),
    );
  });

  it("copies the paint, toasts and returns focus to the same row", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor([red.id]), trim()]));
    const addPaintToGroup = vi.fn(() => {
      store.current = palette([armor([red.id]), trim([red.id])]);
      return Promise.resolve(null);
    });
    mockMutations({ [nameOf(api.palettes.addPaintToGroup)]: addPaintToGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { section, sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Copy to group…" }));
    const list = await screen.findByRole("dialog", { name: "Copy Mephiston Red to" });
    fireEvent.click(within(list).getByRole("button", { name: "Trim" }));
    await serverPushes(onLine);

    expect(addPaintToGroup).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      groupId: "group-trim",
      paintId: red.id,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Copied to Trim")).toBeVisible();
    await waitFor(() =>
      expect(
        within(section).getByRole("button", { name: "Actions for Mephiston Red in Armor" }),
      ).toHaveFocus(),
    );
  });

  it("removes the last row from the group, toasts and focuses the previous row", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor([red.id, vallejo.id]), trim()]));
    const removePaintFromGroup = vi.fn(() => {
      store.current = palette([armor([red.id]), trim()]);
      return Promise.resolve(null);
    });
    mockMutations({ [nameOf(api.palettes.removePaintFromGroup)]: removePaintFromGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { section, sheet } = await openActions("Blood Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove from group" }));
    await serverPushes(onLine);

    expect(removePaintFromGroup).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      groupId: "group-armor",
      paintId: vallejo.id,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Removed from Armor")).toBeVisible();
    await waitFor(() =>
      expect(
        within(section).getByRole("button", { name: "Actions for Mephiston Red in Armor" }),
      ).toHaveFocus(),
    );
  });

  it("focuses the group's actions button when removing its only paint", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor([red.id]), trim()]));
    const removePaintFromGroup = vi.fn(() => {
      store.current = palette([armor([]), trim()]);
      return Promise.resolve(null);
    });
    mockMutations({ [nameOf(api.palettes.removePaintFromGroup)]: removePaintFromGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { section, sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove from group" }));
    await serverPushes(onLine);

    expect(removePaintFromGroup).toHaveBeenCalledOnce();
    expect(await screen.findByText("Removed from Armor")).toBeVisible();
    expect(within(section).getByText("No paints in this group yet")).toBeVisible();
    await waitFor(() =>
      expect(
        within(section).getByRole("button", { name: "Actions for group Armor" }),
      ).toHaveFocus(),
    );
  });

  it("returns focus to the row's actions button on Escape", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor([red.id, vallejo.id]), trim()]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { button, sheet } = await openActions("Blood Red", "Armor");
    fireEvent.keyDown(sheet, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("explains a paint that left the palette and keeps the sheet open", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor(), trim()]));
    const movePaintToGroup = vi.fn(() => Promise.reject(new ConvexError("PAINT_NOT_IN_PALETTE")));
    mockMutations({ [nameOf(api.palettes.movePaintToGroup)]: movePaintToGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Move to group…" }));
    const list = await screen.findByRole("dialog", { name: "Move Mephiston Red to" });
    fireEvent.click(within(list).getByRole("button", { name: "Trim" }));

    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
        "This paint is no longer in the palette.",
      ),
    );
    expect(movePaintToGroup).toHaveBeenCalledOnce();
    expect(screen.queryByText("Moved to Trim")).not.toBeInTheDocument();
  });

  it("explains a failed move", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedInWith(palette([armor(), trim()]));
    const movePaintToGroup = vi.fn(() => Promise.reject(new Error("network down")));
    mockMutations({ [nameOf(api.palettes.movePaintToGroup)]: movePaintToGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Move to group…" }));
    const list = await screen.findByRole("dialog", { name: "Move Mephiston Red to" });
    fireEvent.click(within(list).getByRole("button", { name: "Trim" }));

    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
        "Couldn't move Mephiston Red. Check your connection and try again.",
      ),
    );
    expect(screen.queryByText("Moved to Trim")).not.toBeInTheDocument();
  });

  it("explains a failed copy", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedInWith(palette([armor(), trim()]));
    const addPaintToGroup = vi.fn(() => Promise.reject(new Error("network down")));
    mockMutations({ [nameOf(api.palettes.addPaintToGroup)]: addPaintToGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Copy to group…" }));
    const list = await screen.findByRole("dialog", { name: "Copy Mephiston Red to" });
    fireEvent.click(within(list).getByRole("button", { name: "Trim" }));

    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
        "Couldn't copy Mephiston Red. Check your connection and try again.",
      ),
    );
    expect(screen.queryByText("Copied to Trim")).not.toBeInTheDocument();
  });

  it("explains a failed remove", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedInWith(palette([armor(), trim()]));
    const removePaintFromGroup = vi.fn(() => Promise.reject(new Error("network down")));
    mockMutations({ [nameOf(api.palettes.removePaintFromGroup)]: removePaintFromGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const { sheet } = await openActions("Mephiston Red", "Armor");
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove from group" }));

    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
        "Couldn't remove Mephiston Red. Check your connection and try again.",
      ),
    );
    expect(screen.queryByText("Removed from Armor")).not.toBeInTheDocument();
  });
});
