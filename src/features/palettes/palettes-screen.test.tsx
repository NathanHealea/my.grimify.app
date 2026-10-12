import { useUser } from "@clerk/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { catalogOf, catalogPaint } from "@/test/catalog-fixture";
import { renderRoute } from "@/test/render-route";

import { api } from "../../../convex/_generated/api";

const red = catalogPaint({ brandId: "citadel", name: "Mephiston Red", hex: "#9B130B" });
const blue = catalogPaint({ brandId: "citadel", name: "Macragge Blue", hex: "#193A79" });
const catalog = catalogOf([red, blue]);

type PaletteRow = {
  _id: string;
  name: string;
  paintCount: number;
  previewPaintIds: string[];
  updatedAt: number;
};

function signedInWith(palettes: PaletteRow[] | undefined) {
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
  vi.mocked(useQuery).mockImplementation(((query: unknown) =>
    getFunctionName(query as FunctionReference<"query">) === getFunctionName(api.palettes.listMine)
      ? palettes
      : undefined) as typeof useQuery);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json(catalog))),
  );
}

const defaultMutation = vi.mocked(useMutation).getMockImplementation();

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(useMutation).mockImplementation(defaultMutation!);
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
});

describe("PalettesScreen", () => {
  it("lists palettes as links with name and paint count", async () => {
    signedInWith([
      {
        _id: "palette-a",
        name: "Ultramarines",
        paintCount: 3,
        previewPaintIds: [blue.id, red.id, "unknown-paint"],
        updatedAt: 3,
      },
      {
        _id: "palette-b",
        name: "Blood Angels",
        paintCount: 1,
        previewPaintIds: [red.id],
        updatedAt: 2,
      },
      { _id: "palette-c", name: "Empty one", paintCount: 0, previewPaintIds: [], updatedAt: 1 },
    ]);
    renderRoute("/palettes");

    const main = await screen.findByRole("main");
    const list = await within(main).findByRole("list");
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(3);

    expect(links[0]).toHaveAttribute("href", "/palettes/palette-a");
    expect(links[0]).toHaveTextContent("Ultramarines");
    expect(links[0]).toHaveTextContent("3 paints");
    expect(links[1]).toHaveAttribute("href", "/palettes/palette-b");
    expect(links[1]).toHaveTextContent("Blood Angels");
    expect(links[1]).toHaveTextContent("1 paint");
    expect(links[1]).not.toHaveTextContent("1 paints");
    expect(links[2]).toHaveAttribute("href", "/palettes/palette-c");
    expect(links[2]).toHaveTextContent("Empty one");
    expect(links[2]).toHaveTextContent("0 paints");

    expect(within(main).getByRole("button", { name: "New palette" })).toBeEnabled();
  });

  it("shows an empty state with a New palette button", async () => {
    signedInWith([]);
    renderRoute("/palettes");

    const main = await screen.findByRole("main");
    expect(await within(main).findByText("No palettes yet")).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "New palette" })).toBeEnabled();
    expect(within(main).queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows a loading status while the palettes load", async () => {
    signedInWith(undefined);
    renderRoute("/palettes");

    const main = await screen.findByRole("main");
    const statuses = await within(main).findAllByRole("status");
    expect(statuses.some((el) => el.textContent?.includes("Loading your palettes…"))).toBe(true);
  });

  it("says palettes need a connection when nothing has loaded offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    signedInWith(undefined);
    renderRoute("/palettes");

    const main = await screen.findByRole("main");
    expect(
      await within(main).findByText("Palettes need an internet connection."),
    ).toBeInTheDocument();
    expect(within(main).queryByText("Loading your palettes…")).not.toBeInTheDocument();
  });

  it("explains sign-in when signed out", async () => {
    renderRoute("/palettes");

    const main = await screen.findByRole("main");
    expect(
      await within(main).findByText("Sign in to keep color palettes on any device."),
    ).toBeInTheDocument();
    fireEvent.click(within(main).getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the offline note instead of Sign in when signed out offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderRoute("/palettes");

    const main = await screen.findByRole("main");
    expect(
      await within(main).findByText("Signing in needs an internet connection."),
    ).toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("creates a palette and opens it", async () => {
    const create = vi.fn<(args: { name: string }) => Promise<string>>(() =>
      Promise.resolve("palette-1"),
    );
    vi.mocked(useMutation).mockImplementation(((fn: FunctionReference<"mutation">) =>
      getFunctionName(fn) === getFunctionName(api.palettes.create)
        ? create
        : defaultMutation!(fn)) as unknown as typeof useMutation);
    signedInWith([]);
    const router = renderRoute("/palettes");

    const main = await screen.findByRole("main");
    fireEvent.click(await within(main).findByRole("button", { name: "New palette" }));
    const dialog = screen.getByRole("dialog", { name: "New palette" });
    fireEvent.change(within(dialog).getByLabelText("Palette name"), {
      target: { value: "Ultramarines" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/palettes/palette-1"));
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: "Ultramarines" });
  });

  it("disables editing offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    signedInWith([
      { _id: "palette-a", name: "Ultramarines", paintCount: 0, previewPaintIds: [], updatedAt: 1 },
    ]);
    renderRoute("/palettes");

    const main = await screen.findByRole("main");
    expect(await within(main).findByRole("link", { name: /Ultramarines/ })).toHaveAttribute(
      "href",
      "/palettes/palette-a",
    );
    expect(within(main).getByRole("button", { name: "New palette" })).toBeDisabled();
    const notice = within(main).getByText("Connect to the internet to edit palettes.");
    expect(notice.closest('[role="status"]')).not.toBeNull();
  });
});
