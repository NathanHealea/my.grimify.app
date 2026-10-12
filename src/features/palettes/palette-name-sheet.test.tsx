import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaletteNameSheet } from "./palette-name-sheet";

function CreateHarness({ onSave }: { onSave: (name: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        New palette
      </button>
      <PaletteNameSheet
        open={open}
        onOpenChange={setOpen}
        title="New palette"
        submitLabel="Create"
        onSave={onSave}
        returnFocus={trigger}
      />
    </>
  );
}

function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "New palette" }));
  return screen.getByRole("dialog", { name: "New palette" });
}

function typeName(dialog: HTMLElement, value: string) {
  fireEvent.change(within(dialog).getByLabelText("Palette name"), { target: { value } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PaletteNameSheet", () => {
  it("create sheet validates and reports server errors", async () => {
    const onSave = vi.fn<(name: string) => Promise<unknown>>();
    render(<CreateHarness onSave={onSave} />);
    const dialog = openSheet();
    const field = within(dialog).getByLabelText("Palette name");

    typeName(dialog, "   ");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    const alert = within(dialog).getByRole("alert");
    expect(alert).toHaveTextContent("Give the palette a name");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    expect(field).toHaveAccessibleDescription("Give the palette a name");

    typeName(dialog, "x".repeat(61));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Use 60 characters or fewer");
    expect(onSave).not.toHaveBeenCalled();

    onSave.mockRejectedValueOnce(new ConvexError("PALETTE_LIMIT"));
    typeName(dialog, "  Ultramarines  ");
    fireEvent.submit(field);
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent("You can have up to 50 palettes"),
    );
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Ultramarines");
    expect(screen.getByRole("dialog", { name: "New palette" })).toBeInTheDocument();

    onSave.mockRejectedValueOnce(new ConvexError("PALETTE_NAME_INVALID"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Give the palette a name"),
    );

    onSave.mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Couldn't save the palette. Check your connection and try again.",
      ),
    );
    expect(screen.getByRole("dialog", { name: "New palette" })).toBeInTheDocument();

    onSave.mockResolvedValueOnce("palette-new");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Radix restores focus after the close finishes, on a timer.
    await waitFor(() => expect(screen.getByRole("button", { name: "New palette" })).toHaveFocus());
  });

  it("disables saving offline and says why", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<CreateHarness onSave={() => Promise.resolve()} />);
    const dialog = openSheet();

    typeName(dialog, "Ultramarines");
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Connect to the internet to edit palettes.",
    );
  });

  it("lets a pending save be cancelled once the device goes offline", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const onSave = vi.fn(() => new Promise<never>(() => {}));
    render(<CreateHarness onSave={onSave} />);
    const dialog = openSheet();

    typeName(dialog, "Ultramarines");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();

    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the sheet open on Escape while a save is pending online", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<CreateHarness onSave={() => new Promise<never>(() => {})} />);
    const dialog = openSheet();

    typeName(dialog, "Ultramarines");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    fireEvent.keyDown(within(dialog).getByLabelText("Palette name"), { key: "Escape" });

    expect(screen.getByRole("dialog", { name: "New palette" })).toBeInTheDocument();
  });

  it("saves once when Create is pressed twice", () => {
    const onSave = vi.fn(() => new Promise<never>(() => {}));
    render(<CreateHarness onSave={onSave} />);
    const dialog = openSheet();

    typeName(dialog, "Ultramarines");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(onSave).toHaveBeenCalledOnce();
  });

  it("accepts a 60-character name", () => {
    const onSave = vi.fn<(name: string) => Promise<unknown>>(() => new Promise(() => {}));
    render(<CreateHarness onSave={onSave} />);
    const dialog = openSheet();

    typeName(dialog, "x".repeat(60));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith("x".repeat(60));
    expect(within(dialog).getByRole("alert")).toBeEmptyDOMElement();
  });
});
