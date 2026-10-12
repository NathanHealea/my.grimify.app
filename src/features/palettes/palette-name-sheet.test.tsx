import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

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
});
