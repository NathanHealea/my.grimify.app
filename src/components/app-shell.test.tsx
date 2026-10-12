import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CollectionState } from "@/features/collection/collection-provider";
import { triggerIntersection } from "@/test/intersection-observer";
import { renderRoute } from "@/test/render-route";

const collection = vi.hoisted(() => ({ state: undefined as CollectionState | undefined }));

vi.mock("@/features/collection/collection-provider", async (importActual) => {
  const actual = await importActual<typeof import("@/features/collection/collection-provider")>();
  return {
    ...actual,
    useCollection: () => collection.state ?? actual.useCollection(),
  };
});

afterEach(() => {
  collection.state = undefined;
});

async function findMainNav() {
  return screen.findByRole("navigation", { name: "Main" });
}

describe("AppShell", () => {
  it("renders a Main navigation with four labelled tabs", async () => {
    renderRoute("/paints");

    const links = within(await findMainNav()).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Paints", "/paints"],
      ["My Paints", "/my-paints"],
      ["Palettes", "/palettes"],
      ["Settings", "/settings"],
    ]);
  });

  it("marks only the current tab with aria-current", async () => {
    renderRoute("/my-paints");

    const nav = await findMainNav();
    await screen.findByRole("heading", { level: 1, name: "My Paints" });
    const current = within(nav)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["My Paints"]);
  });

  it("places the Main navigation before the header and main", async () => {
    renderRoute("/paints");

    const nav = await findMainNav();
    const header = screen.getByRole("banner");
    const main = screen.getByRole("main");
    expect(nav.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders exactly one Main navigation", async () => {
    renderRoute("/settings");

    await findMainNav();
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(1);
  });

  it("hides tab icons from assistive tech", async () => {
    renderRoute("/paints");

    const icons = (await findMainNav()).querySelectorAll("svg");
    expect(icons).toHaveLength(4);
    icons.forEach((icon) => expect(icon).toHaveAttribute("aria-hidden", "true"));
  });

  it("shows a back button to Palettes on a palette's screen", async () => {
    renderRoute("/palettes/some-id");

    const header = await screen.findByRole("banner");
    expect(await within(header).findByRole("link", { name: "Back to Palettes" })).toHaveAttribute(
      "href",
      "/palettes",
    );
  });

  it("shows the Offline pill in the header", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderRoute("/settings");

    const header = await screen.findByRole("banner");
    expect(within(header).getAllByRole("status")[0]).toHaveTextContent("Offline");

    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(within(header).getAllByRole("status")[0]).toBeEmptyDOMElement();
    onLine.mockRestore();
  });

  it("shows how many changes are waiting", async () => {
    const withPending = (pending: number): CollectionState => ({
      loading: false,
      flags: new Map(),
      owned: new Set(),
      wishlisted: new Set(),
      favorites: new Set(),
      pending,
    });
    const statusTexts = async () => {
      const header = await screen.findByRole("banner");
      return within(header)
        .getAllByRole("status")
        .map((region) => region.textContent);
    };

    collection.state = withPending(0);
    renderRoute("/settings");
    expect(await statusTexts()).toEqual(["", ""]);
    cleanup();

    collection.state = withPending(1);
    renderRoute("/settings");
    expect(await statusTexts()).toEqual(["", "1 change waiting to sync"]);
    cleanup();

    collection.state = withPending(3);
    renderRoute("/settings");
    expect(await statusTexts()).toEqual(["", "3 changes waiting to sync"]);
  });

  it("renders one large title and hidden copies for the header and the title row", async () => {
    renderRoute("/settings");

    const main = await screen.findByRole("main");
    const headings = await within(main).findAllByRole("heading", { level: 1 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Settings"]);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    const header = screen.getByRole("banner");
    expect(header.querySelector("h1")).toBeNull();
    const smallTitle = header.querySelector(".app-shell__title");
    expect(smallTitle).toHaveTextContent("Settings");
    expect(smallTitle).toHaveAttribute("aria-hidden", "true");

    const titleRow = document.querySelector(".app-shell__title-row");
    expect(titleRow).toHaveTextContent("Settings");
    expect(titleRow).toHaveAttribute("aria-hidden", "true");
    expect(header.contains(titleRow)).toBe(false);
    const navRow = document.querySelector(".app-shell__bar-row");
    expect(navRow).not.toBeNull();
    expect(titleRow?.parentElement).toBe(navRow?.parentElement);
    expect(navRow?.contains(titleRow)).toBe(false);
  });

  it("shows the small title once the large one scrolls away", async () => {
    renderRoute("/settings");

    await within(await screen.findByRole("main")).findByRole("heading", {
      level: 1,
      name: "Settings",
    });
    const header = screen.getByRole("banner");
    const titleRow = document.querySelector(".app-shell__title-row");
    const bar = document.querySelector(".app-shell__bar");
    expect(header).toHaveAttribute("data-scrolled", "false");
    expect(titleRow).toHaveAttribute("data-scrolled", "false");
    expect(bar).toHaveAttribute("data-scrolled", "false");

    act(() => triggerIntersection(false));
    expect(header).toHaveAttribute("data-scrolled", "true");
    expect(titleRow).toHaveAttribute("data-scrolled", "true");
    expect(bar).toHaveAttribute("data-scrolled", "true");

    act(() => triggerIntersection(true));
    expect(header).toHaveAttribute("data-scrolled", "false");
    expect(titleRow).toHaveAttribute("data-scrolled", "false");
    expect(bar).toHaveAttribute("data-scrolled", "false");
  });
});
