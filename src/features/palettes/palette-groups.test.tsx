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

function palette(groups: Group[]) {
  return {
    _id: PALETTE_ID,
    _creationTime: 1,
    userId: "user-1",
    name: "Ultramarines",
    paintIds: [red.id, vallejo.id],
    groups,
    updatedAt: 1,
  };
}

const armor = (): Group => ({ id: "group-armor", name: "Armor", paintIds: [red.id, vallejo.id] });
const trim = (): Group => ({ id: "group-trim", name: "Trim", paintIds: [] });

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

describe("shows groups and creates, renames and deletes them", () => {
  it("shows each group as a section after All paints, in order", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor(), trim()]));
    renderRoute(`/palettes/${PALETTE_ID}`);

    const armorSection = await screen.findByRole("region", { name: "Armor" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "All paints",
      "Armor",
      "Trim",
    ]);

    await waitFor(() => expect(within(armorSection).getAllByRole("listitem")).toHaveLength(2));
    const [first, second] = within(armorSection).getAllByRole("listitem");
    expect(first).toHaveTextContent("Mephiston Red");
    expect(first).toHaveTextContent("Citadel");
    expect(second).toHaveTextContent("Blood Red");
    expect(second).toHaveTextContent("Vallejo");
    expect(within(armorSection).queryByRole("link")).not.toBeInTheDocument();

    const trimSection = screen.getByRole("region", { name: "Trim" });
    expect(within(trimSection).getByText("No paints in this group yet")).toBeVisible();
    expect(
      within(armorSection).getByRole("button", { name: "Actions for group Armor" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "New group" })).toBeEnabled();
  });

  it("focuses a new group that renders after its sheet has closed", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor()]));
    const createGroup = vi.fn(() => Promise.resolve("group-new"));
    mockMutations({ [nameOf(api.palettes.createGroup)]: createGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "New group" }));
    const sheet = await screen.findByRole("dialog", { name: "New group" });
    fireEvent.change(within(sheet).getByLabelText("Group name"), {
      target: { value: "Highlights" },
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    store.current = palette([armor(), { id: "group-new", name: "Highlights", paintIds: [] }]);
    await serverPushes(onLine);

    const heading = screen.getByRole("heading", { level: 2, name: "Highlights" });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("creates a group and moves focus to its heading", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor()]));
    let finish: (groupId: string) => void = () => {};
    // The new group reaches the query before the mutation's promise resolves.
    const createGroup = vi.fn((args: { paletteId: string; name: string }) => {
      store.current = palette([armor(), { id: "group-new", name: args.name, paintIds: [] }]);
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });
    mockMutations({ [nameOf(api.palettes.createGroup)]: createGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "New group" }));
    const sheet = await screen.findByRole("dialog", { name: "New group" });
    fireEvent.change(within(sheet).getByLabelText("Group name"), {
      target: { value: "  Highlights  " },
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Create" }));
    await serverPushes(onLine);
    await act(() => Promise.resolve(finish("group-new")));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(createGroup).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      name: "Highlights",
    });
    const heading = screen.getByRole("heading", { level: 2, name: "Highlights" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("region", { name: "Highlights" })).toHaveTextContent(
      "No paints in this group yet",
    );
  });

  it("renames a group inline and saves on Enter", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor(), trim()]));
    const renameGroup = vi.fn((args: { paletteId: string; groupId: string; name: string }) => {
      store.current = palette([{ ...armor(), name: args.name }, trim()]);
      return Promise.resolve(null);
    });
    mockMutations({ [nameOf(api.palettes.renameGroup)]: renameGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for group Armor" }));
    const actions = await screen.findByRole("dialog", { name: "Armor" });
    fireEvent.click(within(actions).getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const field = screen.getByRole("textbox", { name: "Group name" });
    expect(field).toHaveValue("Armor");
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "Armor" })).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: "  Armour  " } });
    fireEvent.submit(field);
    await serverPushes(onLine);

    expect(renameGroup).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      groupId: "group-armor",
      name: "Armour",
    });
    expect(await screen.findByRole("heading", { level: 2, name: "Armour" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Group name" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for group Armour" })).toHaveFocus(),
    );
  });

  it("keeps an inline rename open while its save is in flight", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor(), trim()]));
    const renameGroup = vi.fn(() => new Promise<null>(() => {}));
    mockMutations({ [nameOf(api.palettes.renameGroup)]: renameGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for group Armor" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Armor" })).getByRole("button", {
        name: "Rename",
      }),
    );
    const field = await screen.findByRole("textbox", { name: "Group name" });
    fireEvent.change(field, { target: { value: "Armour" } });
    fireEvent.submit(field);
    fireEvent.submit(field);
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("textbox", { name: "Group name" })).toBeInTheDocument();
    expect(renameGroup).toHaveBeenCalledOnce();
  });

  it("keeps focus on Delete while the group delete saves", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor(), trim()]));
    const removeGroup = vi.fn(() => new Promise(() => {}));
    mockMutations({ [nameOf(api.palettes.removeGroup)]: removeGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for group Armor" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Armor" })).getByRole("button", {
        name: "Delete group",
      }),
    );
    const confirm = await screen.findByRole("dialog", { name: 'Delete group "Armor"?' });
    const remove = within(confirm).getByRole("button", { name: "Delete" });
    remove.focus();
    fireEvent.click(remove);
    fireEvent.click(remove);

    expect(remove).toHaveFocus();
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(removeGroup).toHaveBeenCalledOnce();
  });

  it("cancels an inline rename with Escape or Cancel", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor(), trim()]));
    const renameGroup = vi.fn(() => Promise.resolve(null));
    mockMutations({ [nameOf(api.palettes.renameGroup)]: renameGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for group Armor" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Armor" })).getByRole("button", {
        name: "Rename",
      }),
    );
    const field = await screen.findByRole("textbox", { name: "Group name" });
    fireEvent.change(field, { target: { value: "Armour" } });
    fireEvent.keyDown(field, { key: "Escape" });

    expect(await screen.findByRole("heading", { level: 2, name: "Armor" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Group name" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for group Armor" })).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Actions for group Armor" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Armor" })).getByRole("button", {
        name: "Rename",
      }),
    );
    expect(await screen.findByRole("textbox", { name: "Group name" })).toHaveValue("Armor");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Armor" })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for group Armor" })).toHaveFocus(),
    );
    expect(renameGroup).not.toHaveBeenCalled();
  });

  it("refuses a blank group name when renaming", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    signedInWith(palette([armor()]));
    const renameGroup = vi.fn(() => Promise.resolve(null));
    mockMutations({ [nameOf(api.palettes.renameGroup)]: renameGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for group Armor" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Armor" })).getByRole("button", {
        name: "Rename",
      }),
    );
    const field = await screen.findByRole("textbox", { name: "Group name" });
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.submit(field);

    expect(await screen.findByRole("alert")).toHaveTextContent("Give the group a name");
    expect(renameGroup).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Group name" })).toBeInTheDocument();
  });

  it("deletes a group after confirmation and moves focus on", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const store = signedInWith(palette([armor(), trim()]));
    const removeGroup = vi.fn((args: { paletteId: string; groupId: string }) => {
      store.current = palette(store.current.groups.filter((g) => g.id !== args.groupId));
      return Promise.resolve(null);
    });
    mockMutations({ [nameOf(api.palettes.removeGroup)]: removeGroup });
    renderRoute(`/palettes/${PALETTE_ID}`);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for group Armor" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Armor" })).getByRole("button", {
        name: "Delete group",
      }),
    );
    const confirm = await screen.findByRole("dialog", { name: 'Delete group "Armor"?' });
    expect(within(confirm).getByText("Its paints stay in the palette.")).toBeVisible();
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toBeVisible();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await serverPushes(onLine);
    expect(removeGroup).toHaveBeenCalledExactlyOnceWith({
      paletteId: PALETTE_ID,
      groupId: "group-armor",
    });
    expect(await screen.findByText("Deleted group Armor")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Armor" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actions for group Trim" })).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Actions for group Trim" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Trim" })).getByRole("button", {
        name: "Delete group",
      }),
    );
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: 'Delete group "Trim"?' })).getByRole(
        "button",
        { name: "Delete" },
      ),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await serverPushes(onLine);
    expect(removeGroup).toHaveBeenLastCalledWith({ paletteId: PALETTE_ID, groupId: "group-trim" });
    await waitFor(() => expect(screen.getByRole("button", { name: "New group" })).toHaveFocus());
  });
});

it("group controls are disabled offline", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  signedInWith(palette([armor(), trim()]));
  renderRoute(`/palettes/${PALETTE_ID}`);

  const main = await screen.findByRole("main");
  const armorSection = await within(main).findByRole("region", { name: "Armor" });
  await waitFor(() => expect(within(armorSection).getAllByRole("listitem")).toHaveLength(2));
  expect(armorSection).toHaveTextContent("Mephiston Red");
  expect(within(main).getByRole("region", { name: "Trim" })).toBeVisible();

  expect(within(main).getByRole("button", { name: "New group" })).toBeDisabled();
  expect(within(main).getByRole("button", { name: "Actions for group Armor" })).toBeDisabled();
  expect(within(main).getByRole("button", { name: "Actions for group Trim" })).toBeDisabled();
  expect(within(main).getByRole("status")).toHaveTextContent(
    "Connect to the internet to edit palettes.",
  );
});
