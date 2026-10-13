import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { catalogPaint } from "@/test/catalog-fixture";
import { renderWithRouter } from "@/test/render-with-router";

import { PaintRow } from "./paint-row";

function renderRow(...args: Parameters<typeof catalogPaint>) {
  const paint = catalogPaint(...args);
  return renderWithRouter(
    <ul>
      <PaintRow paint={paint} brandName="Citadel" lineName="Base" />
    </ul>,
  );
}

describe("PaintRow", () => {
  it("renders a swatch with the paint color and no color-only meaning", async () => {
    const { container } = await renderRow({
      brandId: "citadel",
      name: "Leadbelcher",
      hex: "#888D8F",
      type: "metallic",
    });

    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Leadbelcher");
    expect(row).toHaveTextContent("Citadel · Base · Metallic");
    const swatch = container.querySelector(".paint-swatch")!;
    expect(swatch).toHaveAttribute("aria-hidden", "true");
    expect(swatch.getAttribute("style")).toContain("--swatch-color: #888D8F");
    expect(screen.queryByText("Discontinued")).toBeNull();
  });

  it("marks discontinued paints in text", async () => {
    await renderRow({ brandId: "citadel", name: "Old Red", hex: "#9B130B", discontinued: true });

    expect(screen.getByText("Discontinued")).toBeInTheDocument();
  });

  it("links each row to its detail", async () => {
    await renderRow({ brandId: "citadel", name: "Mephiston Red", hex: "#9B130B" });

    const link = screen.getByRole("link", { name: /Mephiston Red/ });
    expect(link).toHaveAttribute("href", "/paints/citadel-base-mephiston-red");
  });

  it("keeps the row link and toggles separate", async () => {
    const paint = catalogPaint({ brandId: "citadel", name: "Mephiston Red", hex: "#9B130B" });
    await renderWithRouter(
      <ul>
        <PaintRow
          paint={paint}
          brandName="Citadel"
          lineName="Base"
          actions={<button type="button">Own</button>}
        />
      </ul>,
    );

    const link = screen.getByRole("link", { name: /Mephiston Red/ });
    const own = screen.getByRole("button", { name: "Own" });
    expect(link).not.toContainElement(own);
    expect(screen.getByRole("listitem")).toContainElement(own);
  });

  describe("selection variant", () => {
    async function renderSelecting(selection: { selected: boolean; disabled?: boolean }) {
      const paint = catalogPaint({ brandId: "citadel", name: "Mephiston Red", hex: "#9B130B" });
      const onToggle = vi.fn();
      await renderWithRouter(
        <ul>
          <PaintRow
            paint={paint}
            brandName="Citadel"
            lineName="Base"
            actions={<button type="button">Own</button>}
            selection={{ ...selection, onToggle }}
          />
        </ul>,
      );
      return onToggle;
    }

    it("shows a checkbox labelled with the paint name instead of a link and toggles", async () => {
      await renderSelecting({ selected: false });

      const checkbox = screen.getByRole("checkbox", { name: "Select Mephiston Red" });
      expect(checkbox).not.toBeChecked();
      // The brand tells apart paints that share a name.
      expect(checkbox).toHaveAccessibleDescription(/Citadel/);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.queryByRole("button", { name: "Own" })).toBeNull();
    });

    it("reflects the selected state", async () => {
      await renderSelecting({ selected: true });

      expect(screen.getByRole("checkbox", { name: "Select Mephiston Red" })).toBeChecked();
    });

    it("toggles once when the row text is tapped", async () => {
      const onToggle = await renderSelecting({ selected: false });

      fireEvent.click(screen.getByText("Mephiston Red"));

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("toggles once when the checkbox is tapped", async () => {
      const onToggle = await renderSelecting({ selected: false });

      fireEvent.click(screen.getByRole("checkbox", { name: "Select Mephiston Red" }));

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("ignores taps when disabled", async () => {
      const onToggle = await renderSelecting({ selected: false, disabled: true });

      const checkbox = screen.getByRole("checkbox", { name: "Select Mephiston Red" });
      expect(checkbox).toBeDisabled();
      fireEvent.click(checkbox);
      fireEvent.click(screen.getByText("Mephiston Red"));

      expect(onToggle).not.toHaveBeenCalled();
    });
  });
});
