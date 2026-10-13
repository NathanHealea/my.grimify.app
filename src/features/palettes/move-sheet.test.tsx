import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MoveSheet } from "./move-sheet";
import { OFFLINE_EDIT_NOTE } from "./palette-name-sheet";

const ACTIONS = ["Move to top", "Move up", "Move down", "Move to bottom"];

function Harness({
  index,
  count,
  online = true,
  onMove,
}: {
  index: number;
  count: number;
  online?: boolean;
  onMove: (toIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        Move Macragge Blue
      </button>
      <MoveSheet
        open={open}
        onOpenChange={setOpen}
        title="Move Macragge Blue"
        index={index}
        count={count}
        online={online}
        returnFocus={trigger}
        onMove={onMove}
      />
    </>
  );
}

function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Move Macragge Blue" }));
  return screen.getByRole("dialog", { name: "Move Macragge Blue" });
}

function disabledActions(dialog: HTMLElement) {
  return ACTIONS.filter(
    (name) => within(dialog).getByRole<HTMLButtonElement>("button", { name }).disabled,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MoveSheet", () => {
  it("Move sheet moves a paint or group by one or to an end", async () => {
    const choices: [string, number][] = [
      ["Move to top", 0],
      ["Move up", 1],
      ["Move down", 3],
      ["Move to bottom", 4],
    ];
    for (const [action, toIndex] of choices) {
      const onMove = vi.fn<(toIndex: number) => void>();
      const { unmount } = render(<Harness index={2} count={5} onMove={onMove} />);
      const dialog = openSheet();
      expect(within(dialog).getByText("Position 3 of 5")).toBeVisible();
      expect(disabledActions(dialog)).toEqual([]);

      fireEvent.click(within(dialog).getByRole("button", { name: action }));

      expect(onMove).toHaveBeenCalledExactlyOnceWith(toIndex);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      // Radix restores focus after the close finishes, on a timer.
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Move Macragge Blue" })).toHaveFocus(),
      );
      unmount();
    }

    const first = render(<Harness index={0} count={3} onMove={vi.fn()} />);
    let dialog = openSheet();
    expect(within(dialog).getByText("Position 1 of 3")).toBeVisible();
    expect(disabledActions(dialog)).toEqual(["Move to top", "Move up"]);
    first.unmount();

    const last = render(<Harness index={2} count={3} onMove={vi.fn()} />);
    dialog = openSheet();
    expect(within(dialog).getByText("Position 3 of 3")).toBeVisible();
    expect(disabledActions(dialog)).toEqual(["Move down", "Move to bottom"]);
    last.unmount();

    const only = render(<Harness index={0} count={1} onMove={vi.fn()} />);
    dialog = openSheet();
    expect(within(dialog).getByText("Position 1 of 1")).toBeVisible();
    expect(disabledActions(dialog)).toEqual(ACTIONS);
    only.unmount();
  });

  it("disables every move offline and says why", () => {
    const onMove = vi.fn<(toIndex: number) => void>();
    render(<Harness index={1} count={3} online={false} onMove={onMove} />);
    const dialog = openSheet();

    expect(disabledActions(dialog)).toEqual(ACTIONS);
    expect(within(dialog).getByRole("status")).toHaveTextContent(OFFLINE_EDIT_NOTE);
    fireEvent.click(within(dialog).getByRole("button", { name: "Move up" }));
    expect(onMove).not.toHaveBeenCalled();
  });
});
