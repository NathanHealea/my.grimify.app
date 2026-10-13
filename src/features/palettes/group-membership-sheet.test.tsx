import { useUser } from "@clerk/react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
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

async function allPaints() {
  const section = await screen.findByRole("region", { name: "All paints" });
  await waitFor(() => expect(within(section).getAllByRole("listitem").length).toBeGreaterThan(0));
  return section;
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

describe("Groups sheet adds and removes a paint from groups", () => {
  it("gives each main-list row a Groups button when the palette has groups", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor(), trim()], [red.id, "retired-paint-id", vallejo.id]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await allPaints();
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(3));
    const [first, second, third] = within(section).getAllByRole("listitem");
    expect(within(first).getByRole("button", { name: "Groups for Mephiston Red" })).toBeEnabled();
    expect(
      within(first).getByRole("button", { name: "Remove Mephiston Red from palette" }),
    ).toBeVisible();
    expect(within(second).getByRole("button", { name: "Groups for unknown paint" })).toBeEnabled();
    expect(within(third).getByRole("button", { name: "Groups for Blood Red" })).toBeEnabled();
  });

  it("hides the Groups button when the palette has no groups", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await allPaints();
    expect(
      within(section).getByRole("button", { name: "Remove Mephiston Red from palette" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Groups for / })).not.toBeInTheDocument();
  });

  it("lists one labelled checkbox per group, ticked where the paint is", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor([red.id]), trim([vallejo.id])]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await allPaints();
    fireEvent.click(within(section).getByRole("button", { name: "Groups for Mephiston Red" }));
    const sheet = await screen.findByRole("dialog", { name: "Groups for Mephiston Red" });

    const boxes = within(sheet).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBe(within(sheet).getByRole("checkbox", { name: "Armor" }));
    expect(boxes[1]).toBe(within(sheet).getByRole("checkbox", { name: "Trim" }));
    expect(within(sheet).getByRole("checkbox", { name: "Armor" })).toBeChecked();
    expect(within(sheet).getByRole("checkbox", { name: "Trim" })).not.toBeChecked();
    expect(within(sheet).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Done" })).toBeVisible();
  });

  it("stays open while a change is saving", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor([red.id]), trim()]));
    mockMutations({ [nameOf(api.palettes.addPaintToGroup)]: vi.fn(() => new Promise(() => {})) });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await allPaints();
    fireEvent.click(within(section).getByRole("button", { name: "Groups for Mephiston Red" }));
    const sheet = await screen.findByRole("dialog", { name: "Groups for Mephiston Red" });
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Trim" }));
    fireEvent.keyDown(sheet, { key: "Escape" });

    expect(screen.getByRole("dialog", { name: "Groups for Mephiston Red" })).toBeVisible();
    expect(within(sheet).getByRole("button", { name: "Done" })).toBeDisabled();
  });

  it("ticking a group adds the paint to it straight away", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor([red.id]), trim()]));
    const addPaintToGroup = vi.fn(() => {
      store.current = palette([armor([red.id]), trim([red.id])]);
      return Promise.resolve(null);
    });
    const removePaintFromGroup = vi.fn(() => Promise.resolve(null));
    mockMutations({
      [nameOf(api.palettes.addPaintToGroup)]: addPaintToGroup,
      [nameOf(api.palettes.removePaintFromGroup)]: removePaintFromGroup,
    });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await allPaints();
    fireEvent.click(within(section).getByRole("button", { name: "Groups for Mephiston Red" }));
    const sheet = await screen.findByRole("dialog", { name: "Groups for Mephiston Red" });
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Trim" }));
    await serverPushes(onLine);

    expect(addPaintToGroup).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      groupId: "group-trim",
      paintId: red.id,
    });
    expect(removePaintFromGroup).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(within(sheet).getByRole("checkbox", { name: "Trim" })).toBeChecked(),
    );
    expect(within(sheet).getByRole("checkbox", { name: "Armor" })).toBeChecked();
    expect(screen.getByRole("dialog", { name: "Groups for Mephiston Red" })).toBeVisible();
  });

  it("unticking a group removes the paint from it straight away", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor([red.id, vallejo.id]), trim()]));
    const addPaintToGroup = vi.fn(() => Promise.resolve(null));
    const removePaintFromGroup = vi.fn(() => {
      store.current = palette([armor([red.id]), trim()]);
      return Promise.resolve(null);
    });
    mockMutations({
      [nameOf(api.palettes.addPaintToGroup)]: addPaintToGroup,
      [nameOf(api.palettes.removePaintFromGroup)]: removePaintFromGroup,
    });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await allPaints();
    fireEvent.click(within(section).getByRole("button", { name: "Groups for Blood Red" }));
    const sheet = await screen.findByRole("dialog", { name: "Groups for Blood Red" });
    expect(within(sheet).getByRole("checkbox", { name: "Armor" })).toBeChecked();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Armor" }));
    await serverPushes(onLine);

    expect(removePaintFromGroup).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      groupId: "group-armor",
      paintId: vallejo.id,
    });
    expect(addPaintToGroup).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(within(sheet).getByRole("checkbox", { name: "Armor" })).not.toBeChecked(),
    );
  });

  it("explains a failed change and puts the box back", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedInWith(palette([armor([red.id]), trim()]));
    const addPaintToGroup = vi.fn(() => Promise.reject(new Error("network down")));
    mockMutations({ [nameOf(api.palettes.addPaintToGroup)]: addPaintToGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await allPaints();
    fireEvent.click(within(section).getByRole("button", { name: "Groups for Mephiston Red" }));
    const sheet = await screen.findByRole("dialog", { name: "Groups for Mephiston Red" });
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Trim" }));

    await waitFor(() =>
      expect(within(sheet).getByRole("alert")).toHaveTextContent(
        "Couldn't update Trim. Check your connection and try again.",
      ),
    );
    expect(addPaintToGroup).toHaveBeenCalledOnce();
    expect(within(sheet).getByRole("checkbox", { name: "Trim" })).not.toBeChecked();
  });

  it("returns focus to the row's Groups button on Done or Escape", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor(), trim()]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await allPaints();
    const button = within(section).getByRole("button", { name: "Groups for Blood Red" });

    fireEvent.click(button);
    const sheet = await screen.findByRole("dialog", { name: "Groups for Blood Red" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(button).toHaveFocus());

    fireEvent.click(button);
    const again = await screen.findByRole("dialog", { name: "Groups for Blood Red" });
    fireEvent.keyDown(again, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("disables the Groups buttons offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    signedInWith(palette([armor(), trim()]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const section = await allPaints();
    expect(
      within(section).getByRole("button", { name: "Groups for Mephiston Red" }),
    ).toBeDisabled();
    expect(within(section).getByRole("button", { name: "Groups for Blood Red" })).toBeDisabled();
  });
});
