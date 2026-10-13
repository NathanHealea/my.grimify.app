import { useUser } from "@clerk/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { catalogOf, catalogPaint } from "@/test/catalog-fixture";
import { renderRoute } from "@/test/render-route";

import { api } from "../../../convex/_generated/api";

const red = catalogPaint({
  brandId: "citadel",
  name: "Mephiston Red",
  hex: "#9B130B",
  aliases: ["Old Red"],
});
const leadbelcher = catalogPaint({
  brandId: "citadel",
  name: "Leadbelcher",
  hex: "#888D8F",
  type: "metallic",
  finish: "metallic",
});
const catalog = catalogOf([
  red,
  leadbelcher,
  catalogPaint({ brandId: "vallejo", name: "Blood Red", hex: "#A11B1F" }),
  catalogPaint({ brandId: "vallejo", name: "Red Ink", hex: "#9B130C", type: "ink" }),
  catalogPaint({ brandId: "army-painter", name: "Pure Red", hex: "#9C140C" }),
  catalogPaint({
    brandId: "vallejo",
    name: "Gunmetal",
    hex: "#7A7F82",
    type: "metallic",
    finish: "metallic",
  }),
]);

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

function serve() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json(catalog))),
  );
}

describe("PaintDetail", () => {
  afterEach(() => {
    document.title = "";
  });

  it("titles the paint page with the paint's name", async () => {
    serve();
    const router = renderRoute(`/paints/${red.id}`);

    const title = await screen.findByRole("heading", { level: 1, name: "Mephiston Red" });
    expect(title).toHaveClass("page-title");
    await vi.waitFor(() => expect(document.title).toBe("Mephiston Red · Grimify"));

    await router.navigate({ to: "/paints/$paintId", params: { paintId: "not-a-paint" } });
    const missing = await screen.findByRole("heading", {
      level: 1,
      name: "This paint isn't in the catalog",
    });
    expect(missing).toHaveClass("page-title");
    await vi.waitFor(() => expect(document.title).toBe("Paint not found · Grimify"));
  });

  it("shows the paint and copies its hex", async () => {
    serve();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderRoute(`/paints/${red.id}`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Mephiston Red" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Citadel · Base · Base")).toBeInTheDocument();
    expect(screen.getByText("Also known as Old Red")).toBeInTheDocument();
    expect(screen.getByText("Colors are approximate.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy hex #9B130B" }));
    expect(writeText).toHaveBeenCalledWith("#9B130B");
    expect(await screen.findByText("Copied #9B130B")).toHaveAttribute("role", "status");
  });

  it("lists equivalents and toggles all types", async () => {
    serve();
    const router = renderRoute(`/paints/${red.id}`);

    const section = await screen.findByRole("region", { name: "Equivalents" });
    expect(
      within(section)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["The Army Painter", "Vallejo"]);
    expect(within(section).queryByText("Red Ink")).toBeNull();
    expect(within(section).getAllByText("Very close").length).toBeGreaterThan(0);

    fireEvent.click(within(section).getByRole("checkbox", { name: "Show all types" }));
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ types: "all" }));
    expect(await within(section).findByText("Red Ink")).toBeInTheDocument();
  });

  it("warns that metallic matches are rough", async () => {
    serve();
    renderRoute(`/paints/${leadbelcher.id}`);

    expect(await screen.findByText(/metallic sheen/)).toBeInTheDocument();
    expect(screen.getByText("Gunmetal")).toBeInTheDocument();
  });

  it("handles unknown paints and back navigation", async () => {
    serve();
    const router = renderRoute("/paints/not-a-paint");

    expect(
      await screen.findByRole("heading", { name: "This paint isn't in the catalog" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Back to Paints" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/paints"));
  });

  it("marks owned equivalents", async () => {
    serve();
    const bloodRed = catalog.paints.find((p) => p.name === "Blood Red")!;
    vi.mocked(useQuery).mockImplementation(((query: unknown) =>
      getFunctionName(query as FunctionReference<"query">) ===
      getFunctionName(api.userPaints.listMine)
        ? [{ paintId: bloodRed.id, owned: true, wishlisted: false, favorite: false, updatedAt: 1 }]
        : undefined) as typeof useQuery);
    renderRoute(`/paints/${red.id}`);

    const section = await screen.findByRole("region", { name: "Equivalents" });
    const owned = within(section).getAllByText("You own this");
    expect(owned).toHaveLength(1);
    expect(owned[0].closest("li")).toHaveTextContent("Blood Red");
    expect(
      within(section).getByRole("button", { name: "Mark Blood Red as owned" }),
    ).toHaveAttribute("aria-pressed", "true");
    vi.mocked(useQuery).mockImplementation((() => undefined) as typeof useQuery);
  });

  describe("paint detail offers Add to palette", () => {
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

    it("opens the picker for this paint when signed in", async () => {
      serve();
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
      >(() => Promise.resolve({ added: 1 }));
      const other = vi.fn(() => Promise.resolve(null));
      vi.mocked(useMutation).mockImplementation(((ref: unknown) => {
        const fn = nameOf(ref) === nameOf(api.palettes.addPaints) ? addPaints : other;
        return Object.assign(fn, { withOptimisticUpdate: () => fn });
      }) as unknown as typeof useMutation);
      renderRoute(`/paints/${red.id}`);

      fireEvent.click(await screen.findByRole("button", { name: "Add to palette" }));

      const picker = screen.getByRole("dialog", { name: "Add to palette" });
      fireEvent.click(within(picker).getByRole("button", { name: /^Ultramarines/ }));
      await waitFor(() =>
        expect(addPaints).toHaveBeenCalledExactlyOnceWith({
          paletteId: "palette-a",
          paintIds: [red.id],
        }),
      );
    });

    it("opens sign-in instead of the picker when signed out", async () => {
      serve();
      renderRoute(`/paints/${red.id}`);

      fireEvent.click(await screen.findByRole("button", { name: "Add to palette" }));

      expect(screen.getByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Add to palette" })).not.toBeInTheDocument();
    });

    it("is disabled with a note when offline", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      serve();
      signIn();
      renderRoute(`/paints/${red.id}`);

      expect(await screen.findByRole("button", { name: "Add to palette" })).toBeDisabled();
      const note = screen.getByText("Connect to the internet to edit palettes.");
      expect(note.closest('[role="status"]')).not.toBeNull();
    });
  });
});
