import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useAction, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/features/feedback/toast-provider";

import { LegacyImportPrompt } from "./legacy-import-prompt";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useAction: vi.fn() }));

type Found = { ownedCount: number; paletteCount: number } | null;
type Resolved = { paintsAdded: number; palettesAdded: number; palettesSkipped: number } | null;

const findMine = vi.fn<(args: object) => Promise<Found>>();
const resolveMine = vi.fn<(args: { choice: "import" | "discard" }) => Promise<Resolved>>();
let me: { _id: string } | null | undefined;

beforeEach(() => {
  me = { _id: "user-1" };
  vi.mocked(useQuery).mockImplementation(() => me);
  vi.mocked(useAction).mockImplementation(((fn: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(fn);
    if (name === "legacyClaim:findMine") return findMine;
    if (name === "legacyClaim:resolveMine") return resolveMine;
    throw new Error(`Unexpected action ${name}`);
  }) as unknown as typeof useAction);
  findMine.mockResolvedValue({ ownedCount: 120, paletteCount: 5 });
  resolveMine.mockResolvedValue({ paintsAdded: 120, palettesAdded: 5, palettesSkipped: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
  findMine.mockReset();
  resolveMine.mockReset();
});

function renderPrompt() {
  const view = render(
    <ToastProvider>
      <LegacyImportPrompt />
    </ToastProvider>,
  );
  return () =>
    view.rerender(
      <ToastProvider>
        <LegacyImportPrompt />
      </ToastProvider>,
    );
}

function findPrompt() {
  return screen.findByRole("dialog", { name: "Bring over your old Grimify data?" });
}

describe("LegacyImportPrompt", () => {
  it("prompt appears once per session with the found counts", async () => {
    me = undefined;
    const rerender = renderPrompt();
    expect(findMine).not.toHaveBeenCalled();

    me = null;
    rerender();
    expect(findMine).not.toHaveBeenCalled();

    me = { _id: "user-1" };
    rerender();
    const dialog = await findPrompt();
    expect(dialog).toHaveTextContent("120 owned paints and 5 palettes");
    rerender();
    rerender();
    expect(findMine).toHaveBeenCalledExactlyOnceWith({});

    fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    rerender();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(findMine).toHaveBeenCalledOnce();
    expect(resolveMine).not.toHaveBeenCalled();

    me = null;
    rerender();
    me = { _id: "user-1" };
    rerender();
    await findPrompt();
    expect(findMine).toHaveBeenCalledTimes(2);
  });

  it("uses singular wording for one paint and one palette", async () => {
    findMine.mockResolvedValue({ ownedCount: 1, paletteCount: 1 });
    renderPrompt();

    expect(await findPrompt()).toHaveTextContent("1 owned paint and 1 palette");
  });

  it("shows nothing when there is no old data", async () => {
    findMine.mockResolvedValue(null);
    renderPrompt();

    await waitFor(() => expect(findMine).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows nothing and logs when the lookup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    findMine.mockRejectedValue(new Error("network down"));
    renderPrompt();

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("import and discard resolve and show the outcome in the sheet", async () => {
    const rerender = renderPrompt();
    let dialog = await findPrompt();
    const status = within(dialog).getByRole("status");
    expect(status).toBeEmptyDOMElement();

    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    dialog = await screen.findByRole("dialog", { name: "Your old Grimify data" });
    expect(resolveMine).toHaveBeenCalledExactlyOnceWith({ choice: "import" });
    expect(within(dialog).getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Added 120 paints and 5 palettes.");
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Done", ""]);
    const done = within(dialog).getByRole("button", { name: "Done" });
    await waitFor(() => expect(done).toHaveFocus());
    fireEvent.click(done);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    me = null;
    rerender();
    me = { _id: "user-1" };
    rerender();
    dialog = await findPrompt();
    resolveMine.mockClear();

    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    const confirm = screen.getByRole("dialog", { name: "Discard your old data for good?" });
    expect(resolveMine).not.toHaveBeenCalled();
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(within(confirm).getByRole("button", { name: "Discard for good" })).toBeEnabled();

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    dialog = screen.getByRole("dialog", { name: "Bring over your old Grimify data?" });
    expect(within(dialog).getByRole("button", { name: "Discard" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));

    resolveMine.mockResolvedValue({ paintsAdded: 0, palettesAdded: 0, palettesSkipped: 0 });
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Discard your old data for good?" })).getByRole(
        "button",
        { name: "Discard for good" },
      ),
    );
    dialog = await screen.findByRole("dialog", { name: "Your old Grimify data" });
    expect(resolveMine).toHaveBeenCalledExactlyOnceWith({ choice: "discard" });
    expect(within(dialog).getByRole("status")).toHaveTextContent("Old Grimify data discarded.");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Done" })).toHaveFocus());
  });

  it("says how many palettes didn't fit", async () => {
    resolveMine.mockResolvedValue({ paintsAdded: 120, palettesAdded: 2, palettesSkipped: 3 });
    renderPrompt();
    const dialog = await findPrompt();

    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() =>
      expect(within(dialog).getByRole("status")).toHaveTextContent(
        "Added 120 paints and 2 palettes. 3 palettes didn't fit.",
      ),
    );
  });

  it("keeps the sheet open and shows the error in it when import fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    resolveMine.mockRejectedValue(new Error("network down"));
    renderPrompt();
    const dialog = await findPrompt();

    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() =>
      expect(within(dialog).getByRole("status")).toHaveTextContent(
        "Couldn't import your old data. Try again.",
      ),
    );
    expect(screen.getByRole("dialog", { name: "Bring over your old Grimify data?" })).toBe(dialog);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeEnabled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("keeps the sheet open and shows the error in it when discard fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    resolveMine.mockRejectedValue(new Error("network down"));
    renderPrompt();
    const dialog = await findPrompt();

    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    const confirm = screen.getByRole("dialog", { name: "Discard your old data for good?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Discard for good" }));

    await waitFor(() =>
      expect(within(confirm).getByRole("status")).toHaveTextContent(
        "Couldn't discard your old data. Try again.",
      ),
    );
    expect(within(confirm).getByRole("button", { name: "Discard for good" })).toBeEnabled();
    expect(resolveMine).toHaveBeenCalledExactlyOnceWith({ choice: "discard" });
    expect(consoleError).toHaveBeenCalled();
  });

  it("prompt is keyboard operable and labelled", async () => {
    const rerender = renderPrompt();
    const dialog = await findPrompt();

    expect(within(dialog).getByRole("status")).toBeEmptyDOMElement();
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    ["Import", "Not now", "Discard", "Close"].forEach((name, index) =>
      expect(buttons[index]).toHaveAccessibleName(name),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Import" })).toHaveFocus(),
    );

    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    rerender();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(findMine).toHaveBeenCalledOnce();
    expect(resolveMine).not.toHaveBeenCalled();
  });

  it("closes as Not now from the Close button", async () => {
    const rerender = renderPrompt();
    const dialog = await findPrompt();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    rerender();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(findMine).toHaveBeenCalledOnce();
    expect(resolveMine).not.toHaveBeenCalled();
  });
});
