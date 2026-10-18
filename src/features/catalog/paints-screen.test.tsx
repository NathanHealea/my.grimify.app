import { useUser } from "@clerk/react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { catalogOf, catalogPaint } from "@/test/catalog-fixture";
import { triggerIntersection } from "@/test/intersection-observer";
import { renderRoute } from "@/test/render-route";

import { api } from "../../../convex/_generated/api";
import type { Catalog } from "./schema";

const rowRenders = vi.hoisted(() => new Map<string, number>());

// Counts renders per paint so a memoized row that skips re-rendering is visible without test hooks.
vi.mock("@/components/paint-row", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/paint-row")>();
  return {
    ...actual,
    PaintRow: (props: ComponentProps<typeof actual.PaintRow>) => {
      rowRenders.set(props.paint.id, (rowRenders.get(props.paint.id) ?? 0) + 1);
      return <actual.PaintRow {...props} />;
    },
  };
});

const NAMED = [
  catalogPaint({ brandId: "citadel", name: "Mephiston Red", hex: "#9B130B" }),
  catalogPaint({ brandId: "citadel", name: "Macragge Blue", hex: "#193A79" }),
  catalogPaint({ brandId: "vallejo", name: "Dark Blue", hex: "#1D3557" }),
  catalogPaint({ brandId: "vallejo", name: "Blood Red", hex: "#A11B1F" }),
];

const GREYS = Array.from({ length: 96 }, (_, i) =>
  catalogPaint({
    brandId: "army-painter",
    name: `Grey ${String(i).padStart(3, "0")}`,
    hex: "#808080",
  }),
);

function serve(catalog: Catalog) {
  const fetch = vi.fn(() => Promise.resolve(Response.json(catalog)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const rows = () =>
  screen.queryAllByRole("listitem").filter((li) => li.classList.contains("paint-row"));

const nameOf = (ref: unknown) => getFunctionName(ref as FunctionReference<"query" | "mutation">);

const defaultUseMutation = vi.mocked(useMutation).getMockImplementation();

function signIn() {
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
}

const selectionBar = () => screen.getByRole("region", { name: "Selection" });

const rowLinks = () => rows().flatMap((row) => within(row).queryAllByRole("link"));

describe("PaintsScreen", () => {
  it("shows loading, then error with retry, then the list", async () => {
    let failFirst: (response: Response) => void = () => {};
    const fetch = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((resolve) => (failFirst = resolve)))
      .mockResolvedValueOnce(Response.json(catalogOf(NAMED)));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderRoute("/paints");

    expect(await screen.findByText("Downloading paint catalog…")).toBeInTheDocument();
    act(() => failFirst(new Response("down", { status: 503 })));
    expect(await screen.findByText(/Connect to the internet once/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Mephiston Red")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("main")).getByRole("status")).toHaveTextContent("4 paints");
  });

  it("shows chips, hue dots and suggestions", async () => {
    serve(catalogOf(NAMED));
    const router = renderRoute("/paints?q=vallejo");

    const chip = await screen.findByRole("button", { name: "Remove Brand: Vallejo" });
    expect(rows().map((row) => row.querySelector(".paint-row__name")?.textContent)).toEqual([
      "Blood Red",
      "Dark Blue",
    ]);
    expect(screen.queryByRole("list", { name: "Browse by color" })).toBeNull();

    fireEvent.click(chip);
    const dots = await screen.findByRole("list", { name: "Browse by color" });
    expect(within(dots).getAllByRole("button")).toHaveLength(13);
    expect(within(dots).getByRole("button", { name: "Red-Orange" })).toBeInTheDocument();

    fireEvent.click(within(dots).getByRole("button", { name: "Blue" }));
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ q: "blue" }));
    expect(screen.getByRole("searchbox", { name: "Search paints" })).toHaveValue("blue");

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "gree" } });
    const suggestions = screen.getByLabelText("Suggestions");
    expect(
      within(suggestions)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Green", "Green Stuff World"]);
  });

  it("renders 60 rows, then more, and an empty state", async () => {
    serve(catalogOf([...NAMED, ...GREYS]));
    renderRoute("/paints");

    await screen.findByText("Blood Red");
    expect(rows()).toHaveLength(60);
    act(() => triggerIntersection());
    expect(rows()).toHaveLength(100);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzzqq" } });
    expect(await screen.findByText("No paints match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await vi.waitFor(() => expect(rows()).toHaveLength(60));
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("restores the query from the URL", async () => {
    serve(catalogOf(NAMED));
    renderRoute("/paints?q=blue");

    expect(await screen.findByRole("searchbox")).toHaveValue("blue");
    expect(rows().map((row) => row.querySelector(".paint-row__name")?.textContent)).toEqual([
      "Macragge Blue",
      "Dark Blue",
    ]);
  });

  it("shows filter chips and clears everything", async () => {
    serve(
      catalogOf([
        ...NAMED,
        catalogPaint({ brandId: "vallejo", name: "Silver", hex: "#C0C0C0", type: "metallic" }),
      ]),
    );
    const router = renderRoute("/paints?brand=vallejo&type=metallic");

    expect(await screen.findByRole("button", { name: "Filters, 2 active" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Brand: Vallejo" })).toBeInTheDocument();
    expect(rows().map((row) => row.querySelector(".paint-row__name")?.textContent)).toEqual([
      "Silver",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Type: Metallic" }));
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ brand: "vallejo" }));
    await vi.waitFor(() => expect(rows()).toHaveLength(3));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "citadel" } });
    expect(await screen.findByText("No paints match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await vi.waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("keeps a numeric query as text", async () => {
    serve(catalogOf(NAMED));
    renderRoute("/paints?q=123");

    expect(await screen.findByRole("searchbox")).toHaveValue("123");
    expect(await screen.findByText("No paints match")).toBeInTheDocument();
  });

  describe("select mode", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.mocked(useMutation).mockImplementation(defaultUseMutation!);
      vi.mocked(useQuery).mockImplementation((() => undefined) as typeof useQuery);
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
    });

    it("select mode ticks paints and keeps them across searches", async () => {
      serve(catalogOf(NAMED));
      signIn();
      renderRoute("/paints");

      await screen.findByText("Blood Red");
      expect(screen.getByRole("button", { name: "Mark Blood Red as owned" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Selection" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Add to palette" }));

      // The button that started select mode is gone; the only "Add to palette" left is the bar's.
      expect(screen.getAllByRole("button", { name: "Add to palette" })).toEqual([
        within(selectionBar()).getByRole("button", { name: "Add to palette" }),
      ]);
      expect(screen.getAllByRole("checkbox", { name: /^Select / })).toHaveLength(4);
      expect(screen.queryAllByRole("button", { name: /^Mark / })).toHaveLength(0);
      expect(rowLinks()).toHaveLength(0);
      const count = within(selectionBar()).getByText("0 selected");
      expect(count.closest('[role="status"]')).not.toBeNull();
      expect(within(selectionBar()).getByRole("button", { name: "Add to palette" })).toBeDisabled();

      const macragge = rows().find((row) => row.textContent?.includes("Macragge Blue"))!;
      fireEvent.click(macragge.querySelector(".paint-row__name")!);
      expect(screen.getByRole("checkbox", { name: "Select Macragge Blue" })).toBeChecked();
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Mephiston Red" }));
      expect(within(selectionBar()).getByText("2 selected")).toBeInTheDocument();
      expect(within(selectionBar()).getByRole("button", { name: "Add to palette" })).toBeEnabled();

      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "vallejo" } });
      await vi.waitFor(() =>
        expect(rows().map((row) => row.querySelector(".paint-row__name")?.textContent)).toEqual([
          "Blood Red",
          "Dark Blue",
        ]),
      );
      expect(within(selectionBar()).getByText("2 selected")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Dark Blue" }));
      expect(within(selectionBar()).getByText("3 selected")).toBeInTheDocument();

      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
      await vi.waitFor(() => expect(rows()).toHaveLength(4));
      expect(screen.getByRole("checkbox", { name: "Select Macragge Blue" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Select Mephiston Red" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Select Dark Blue" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Select Blood Red" })).not.toBeChecked();

      fireEvent.click(within(selectionBar()).getByRole("button", { name: "Done" }));

      expect(screen.queryByRole("region", { name: "Selection" })).toBeNull();
      expect(screen.queryAllByRole("checkbox", { name: /^Select / })).toHaveLength(0);
      expect(
        screen.getByRole("button", { name: "Mark Macragge Blue as owned" }),
      ).toBeInTheDocument();
      expect(rowLinks()).toHaveLength(4);

      fireEvent.click(screen.getByRole("button", { name: "Add to palette" }));
      expect(within(selectionBar()).getByText("0 selected")).toBeInTheDocument();
      expect(
        screen
          .getAllByRole("checkbox", { name: /^Select / })
          .filter((box) => box.matches(":checked")),
      ).toHaveLength(0);
    });

    it("select mode re-renders only the ticked row", async () => {
      const [mephiston, macragge, darkBlue, bloodRed] = NAMED;
      serve(catalogOf(NAMED));
      signIn();
      renderRoute("/paints");

      await screen.findByText("Blood Red");
      fireEvent.click(screen.getByRole("button", { name: "Add to palette" }));
      expect(screen.getAllByRole("checkbox", { name: /^Select / })).toHaveLength(4);
      const before = new Map(rowRenders);

      fireEvent.click(screen.getByRole("checkbox", { name: "Select Macragge Blue" }));

      expect(screen.getByRole("checkbox", { name: "Select Macragge Blue" })).toBeChecked();
      const increase = (id: string) => (rowRenders.get(id) ?? 0) - (before.get(id) ?? 0);
      expect(increase(macragge.id)).toBeGreaterThan(0);
      expect({
        [mephiston.id]: increase(mephiston.id),
        [darkBlue.id]: increase(darkBlue.id),
        [bloodRed.id]: increase(bloodRed.id),
      }).toEqual({ [mephiston.id]: 0, [darkBlue.id]: 0, [bloodRed.id]: 0 });
    });

    // 201 rows and 200 ticks: the screen still re-renders per tick, which runs past 5 s in the full
    // parallel suite; drop this timeout once #29 fixes that.
    it("select mode caps the selection at 200", { timeout: 15_000 }, async () => {
      const many = Array.from({ length: 201 }, (_, i) =>
        catalogPaint({
          brandId: "army-painter",
          name: `Grey ${String(i).padStart(3, "0")}`,
          hex: "#808080",
        }),
      );
      serve(catalogOf(many));
      signIn();
      renderRoute("/paints");

      await screen.findByText("Grey 000");
      fireEvent.click(screen.getByRole("button", { name: "Add to palette" }));
      for (let page = 0; page < 3; page++) act(() => triggerIntersection());
      await vi.waitFor(() => expect(rows()).toHaveLength(201));

      const boxes = screen.getAllByRole("checkbox", { name: /^Select / });
      for (const box of boxes.slice(0, 200)) fireEvent.click(box);

      expect(within(selectionBar()).getByText("200 selected")).toBeInTheDocument();
      expect(
        within(selectionBar()).getByText("You can add up to 200 paints at once."),
      ).toBeInTheDocument();
      const last = boxes[200];
      expect(last).not.toBeChecked();
      expect(last).toBeDisabled();
      fireEvent.click(last);
      expect(last).not.toBeChecked();
      expect(within(selectionBar()).getByText("200 selected")).toBeInTheDocument();
      expect(boxes[0]).toBeChecked();
      expect(boxes[0]).toBeEnabled();

      fireEvent.click(boxes[0]);
      expect(within(selectionBar()).getByText("199 selected")).toBeInTheDocument();
      expect(last).toBeEnabled();
    });

    it("moves focus into the list and back to the entry button", async () => {
      serve(catalogOf(NAMED));
      signIn();
      renderRoute("/paints");

      await screen.findByText("Blood Red");
      fireEvent.click(screen.getByRole("button", { name: "Add to palette" }));

      expect(screen.getAllByRole("checkbox", { name: /^Select / })[0]).toHaveFocus();

      fireEvent.click(within(selectionBar()).getByRole("button", { name: "Done" }));

      expect(screen.getByRole("button", { name: "Add to palette" })).toHaveFocus();
    });

    it("returns focus to the search box when select mode ends with no results", async () => {
      serve(catalogOf(NAMED));
      signIn();
      renderRoute("/paints");

      await screen.findByText("Blood Red");
      fireEvent.click(screen.getByRole("button", { name: "Add to palette" }));
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzzqq" } });
      await screen.findByText("No paints match");
      fireEvent.click(within(selectionBar()).getByRole("button", { name: "Done" }));

      expect(screen.getByRole("searchbox", { name: "Search paints" })).toHaveFocus();
    });

    it("selection bar adds the selection", async () => {
      const [mephiston, macragge, darkBlue] = NAMED;
      serve(catalogOf(NAMED));
      signIn();
      vi.mocked(useQuery).mockImplementation(((query: unknown) =>
        nameOf(query) === nameOf(api.palettes.listMine)
          ? [
              {
                _id: "palette-a",
                name: "Ultramarines",
                paintCount: 0,
                previewPaintIds: [],
                updatedAt: 1,
              },
            ]
          : undefined) as typeof useQuery);
      const addPaints = vi.fn<
        (args: { paletteId: string; paintIds: string[] }) => Promise<{ added: number }>
      >(() => Promise.resolve({ added: 3 }));
      const other = vi.fn(() => Promise.resolve(null));
      vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
        const fn = nameOf(ref) === nameOf(api.palettes.addPaints) ? addPaints : other;
        return Object.assign(fn, { withOptimisticUpdate: () => fn });
      }) as unknown as typeof useMutation);
      renderRoute("/paints");

      await screen.findByText("Blood Red");
      fireEvent.click(screen.getByRole("button", { name: "Add to palette" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Dark Blue" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Mephiston Red" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Macragge Blue" }));
      expect(within(selectionBar()).getByText("3 selected")).toBeInTheDocument();

      fireEvent.click(within(selectionBar()).getByRole("button", { name: "Add to palette" }));
      const picker = screen.getByRole("dialog", { name: "Add to palette" });
      fireEvent.click(within(picker).getByRole("button", { name: /^Ultramarines/ }));

      await waitFor(() =>
        expect(addPaints).toHaveBeenCalledExactlyOnceWith({
          paletteId: "palette-a",
          paintIds: [darkBlue.id, mephiston.id, macragge.id],
        }),
      );
      expect(await screen.findByText("Added 3 paints to Ultramarines")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("region", { name: "Selection" })).toBeNull());
      expect(screen.queryAllByRole("checkbox", { name: /^Select / })).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Mark Dark Blue as owned" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add to palette" })).toBeInTheDocument();

      cleanup();
      const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      renderRoute("/paints");

      await screen.findByText("Blood Red");
      fireEvent.click(screen.getByRole("button", { name: "Add to palette" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Blood Red" }));
      expect(within(selectionBar()).getByRole("button", { name: "Add to palette" })).toBeEnabled();

      onLine.mockReturnValue(false);
      act(() => void window.dispatchEvent(new Event("offline")));

      expect(within(selectionBar()).getByRole("button", { name: "Add to palette" })).toBeDisabled();
      const note = screen.getByText("Connect to the internet to edit palettes.");
      expect(note.closest('[role="status"]')).not.toBeNull();
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Dark Blue" }));
      expect(screen.getByRole("checkbox", { name: "Select Dark Blue" })).toBeChecked();
      expect(within(selectionBar()).getByText("2 selected")).toBeInTheDocument();

      cleanup();
      onLine.mockReturnValue(true);
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
      renderRoute("/paints");

      await screen.findByText("Blood Red");
      expect(screen.queryByRole("button", { name: "Add to palette" })).toBeNull();
      expect(screen.queryAllByRole("checkbox", { name: /^Select / })).toHaveLength(0);
    });
  });
});
