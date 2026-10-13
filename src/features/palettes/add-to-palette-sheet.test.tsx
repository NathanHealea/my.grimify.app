import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/features/feedback/toast-provider";

import { api } from "../../../convex/_generated/api";
import { AddToPaletteSheet } from "./add-to-palette-sheet";

type PaletteRow = {
  _id: string;
  name: string;
  paintCount: number;
  previewPaintIds: string[];
  updatedAt: number;
};

const nameOf = (ref: unknown) => getFunctionName(ref as FunctionReference<"query" | "mutation">);

const defaultUseMutation = vi.mocked(useMutation).getMockImplementation();

function withPalettes(palettes: PaletteRow[], { authenticated = true } = {}) {
  vi.mocked(useConvexAuth).mockReturnValue({
    isLoading: false,
    isRefreshing: false,
    isAuthenticated: authenticated,
  });
  vi.mocked(useQuery).mockImplementation(((query: unknown, args: unknown) =>
    args !== "skip" && nameOf(query) === nameOf(api.palettes.listMine)
      ? palettes
      : undefined) as typeof useQuery);
}

function mockMutations() {
  const addPaints = vi.fn<
    (args: { paletteId: string; paintIds: string[] }) => Promise<{ added: number }>
  >(() => Promise.resolve({ added: 1 }));
  const create = vi.fn<(args: { name: string }) => Promise<string>>(() =>
    Promise.resolve("palette-new"),
  );
  const other = vi.fn(() => Promise.resolve(null));
  vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
    const name = nameOf(ref);
    const fn =
      name === nameOf(api.palettes.addPaints)
        ? addPaints
        : name === nameOf(api.palettes.create)
          ? create
          : other;
    return Object.assign(fn, { withOptimisticUpdate: () => fn });
  }) as unknown as typeof useMutation);
  return { addPaints, create };
}

function Harness({
  paintIds,
  onOpenChange,
  onAdded,
}: {
  paintIds: string[];
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ToastProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Add to palette
      </button>
      <AddToPaletteSheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
        paintIds={paintIds}
        onAdded={onAdded}
      />
    </ToastProvider>
  );
}

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Add to palette" }));
  return screen.getByRole("dialog", { name: "Add to palette" });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(useMutation).mockImplementation(defaultUseMutation!);
  vi.mocked(useQuery).mockImplementation((() => undefined) as typeof useQuery);
  vi.mocked(useConvexAuth).mockReturnValue({
    isLoading: false,
    isRefreshing: false,
    isAuthenticated: false,
  });
});

describe("AddToPaletteSheet", () => {
  it("picker adds to a palette and reports the result", async () => {
    withPalettes([
      {
        _id: "palette-a",
        name: "Ultramarines",
        paintCount: 3,
        previewPaintIds: ["citadel-macragge-blue"],
        updatedAt: 2,
      },
      { _id: "palette-b", name: "Blood Angels", paintCount: 0, previewPaintIds: [], updatedAt: 1 },
    ]);
    const { addPaints } = mockMutations();
    const onOpenChange = vi.fn();
    const onAdded = vi.fn();
    const paintIds = ["citadel-macragge-blue", "citadel-mephiston-red"];
    render(<Harness paintIds={paintIds} onOpenChange={onOpenChange} onAdded={onAdded} />);

    let dialog = openPicker();
    expect(within(dialog).getByRole("button", { name: /^Ultramarines/ })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: /^Blood Angels/ })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "New palette" })).toBeEnabled();

    addPaints.mockResolvedValueOnce({ added: 1 });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Ultramarines/ }));
    expect(await screen.findByText("Added to Ultramarines")).toBeInTheDocument();
    expect(addPaints).toHaveBeenLastCalledWith({ paletteId: "palette-a", paintIds });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onAdded).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add to palette" })).not.toBeInTheDocument(),
    );

    dialog = openPicker();
    addPaints.mockResolvedValueOnce({ added: 2 });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Blood Angels/ }));
    expect(await screen.findByText("Added 2 paints to Blood Angels")).toBeInTheDocument();
    expect(addPaints).toHaveBeenLastCalledWith({ paletteId: "palette-b", paintIds });
    expect(onAdded).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add to palette" })).not.toBeInTheDocument(),
    );

    dialog = openPicker();
    addPaints.mockResolvedValueOnce({ added: 0 });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Ultramarines/ }));
    expect(await screen.findByText("Already in Ultramarines")).toBeInTheDocument();
    expect(onAdded).toHaveBeenCalledTimes(3);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add to palette" })).not.toBeInTheDocument(),
    );

    dialog = openPicker();
    onOpenChange.mockClear();
    addPaints.mockRejectedValueOnce(new ConvexError("PALETTE_FULL"));
    fireEvent.click(within(dialog).getByRole("button", { name: /^Ultramarines/ }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "This palette is full (200 paints)",
      ),
    );
    expect(screen.getByRole("dialog", { name: "Add to palette" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onAdded).toHaveBeenCalledTimes(3);
    expect(addPaints).toHaveBeenCalledTimes(4);

    cleanup();
    withPalettes([]);
    render(<Harness paintIds={paintIds} onOpenChange={vi.fn()} onAdded={vi.fn()} />);
    const empty = openPicker();
    const dismiss = [
      ...within(empty).queryAllByRole("button", { name: "Close" }),
      ...within(empty).queryAllByRole("button", { name: "Cancel" }),
    ];
    const choices = within(empty)
      .getAllByRole("button")
      .filter((button) => !dismiss.includes(button));
    expect(choices).toEqual([within(empty).getByRole("button", { name: "New palette" })]);
  });

  it("reports a failed add without closing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    withPalettes([
      { _id: "palette-a", name: "Ultramarines", paintCount: 3, previewPaintIds: [], updatedAt: 1 },
    ]);
    const { addPaints } = mockMutations();
    addPaints.mockRejectedValueOnce(new Error("network down"));
    const onOpenChange = vi.fn();
    const onAdded = vi.fn();
    render(
      <Harness
        paintIds={["citadel-macragge-blue"]}
        onOpenChange={onOpenChange}
        onAdded={onAdded}
      />,
    );

    const dialog = openPicker();
    onOpenChange.mockClear();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Ultramarines/ }));

    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Couldn't add to the palette. Check your connection and try again.",
      ),
    );
    expect(screen.getByRole("dialog", { name: "Add to palette" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("locks the picker while adding", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    withPalettes([
      { _id: "palette-a", name: "Ultramarines", paintCount: 3, previewPaintIds: [], updatedAt: 1 },
    ]);
    const { addPaints } = mockMutations();
    let finish = () => {};
    addPaints.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ added: 1 });
        }),
    );
    render(
      <Harness paintIds={["citadel-macragge-blue"]} onOpenChange={vi.fn()} onAdded={vi.fn()} />,
    );

    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Ultramarines/ }));

    expect(within(dialog).getByRole("button", { name: /^Ultramarines/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "New palette" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Add to palette" })).toBeInTheDocument();

    await act(() => Promise.resolve(finish()));
    expect(await screen.findByText("Added to Ultramarines")).toBeInTheDocument();
  });

  it("disables the picker offline and doesn't trap a pending add", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    withPalettes([
      { _id: "palette-a", name: "Ultramarines", paintCount: 3, previewPaintIds: [], updatedAt: 1 },
    ]);
    const { addPaints } = mockMutations();
    // Convex holds a mutation until the connection returns.
    addPaints.mockImplementationOnce(() => new Promise(() => {}));
    render(
      <Harness paintIds={["citadel-macragge-blue"]} onOpenChange={vi.fn()} onAdded={vi.fn()} />,
    );

    const dialog = openPicker();
    expect(within(dialog).getByRole("button", { name: /^Ultramarines/ })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Ultramarines/ }));

    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));

    expect(within(dialog).getByRole("button", { name: /^Ultramarines/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "New palette" })).toBeDisabled();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Connect to the internet to edit palettes.",
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Add to palette" })).not.toBeInTheDocument();
  });

  it("picker creates a palette and adds to it", async () => {
    withPalettes([]);
    const { addPaints, create } = mockMutations();
    addPaints.mockResolvedValueOnce({ added: 1 });
    const onAdded = vi.fn();
    const paintIds = ["citadel-death-guard-green"];
    render(<Harness paintIds={paintIds} onOpenChange={vi.fn()} onAdded={onAdded} />);

    const picker = openPicker();
    fireEvent.click(within(picker).getByRole("button", { name: "New palette" }));
    const nameSheet = await screen.findByRole("dialog", { name: "New palette" });
    fireEvent.change(within(nameSheet).getByLabelText("Palette name"), {
      target: { value: "Nurgle" },
    });
    fireEvent.click(within(nameSheet).getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Added to Nurgle")).toBeInTheDocument();
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: "Nurgle" });
    expect(addPaints).toHaveBeenCalledExactlyOnceWith({ paletteId: "palette-new", paintIds });
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(addPaints.mock.invocationCallOrder[0]);
    expect(onAdded).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("waits for Convex to know the user before listing palettes", () => {
    withPalettes(
      [
        {
          _id: "palette-a",
          name: "Ultramarines",
          paintCount: 0,
          previewPaintIds: [],
          updatedAt: 1,
        },
      ],
      { authenticated: false },
    );
    mockMutations();
    render(
      <Harness
        paintIds={["citadel-base-mephiston-red"]}
        onOpenChange={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    const picker = openPicker();
    expect(within(picker).getByText("Loading your palettes…")).toBeInTheDocument();
    expect(within(picker).queryByRole("button", { name: /^Ultramarines/ })).toBeNull();
  });
});
