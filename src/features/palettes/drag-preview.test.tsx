/// <reference types="node" />
// Vitest blanks CSS imports, including ?raw, so the stylesheets are read from disk.
import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import { parse, type Rgb, wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

import { catalogPaint } from "@/test/catalog-fixture";

import { DragPreview } from "./drag-preview";

function readSource(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const red = catalogPaint({ brandId: "citadel", name: "Mephiston Red", hex: "#9B130B" });

function block(css: string, opener: RegExp): string {
  const match = opener.exec(css);
  if (!match) throw new Error(`No block matching ${opener}`);
  let depth = 0;
  for (let i = match.index + match[0].length - 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(match.index, i + 1);
  }
  throw new Error(`Unclosed block for ${opener}`);
}

function token(css: string, name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!match) throw new Error(`No ${name} in block`);
  return match[1].trim();
}

function rgb(value: string): Rgb {
  const color = parse(value);
  if (!color || color.mode !== "rgb") throw new Error(`Not an sRGB color: ${value}`);
  return color;
}

// Mixing with `transparent` in srgb keeps the surface color at N% alpha; the browser then
// composites that over whatever is behind the preview.
function over(surface: Rgb, alpha: number, backdrop: Rgb): Rgb {
  const mix = (s: number, b: number) => s * alpha + b * (1 - alpha);
  return {
    mode: "rgb",
    r: mix(surface.r, backdrop.r),
    g: mix(surface.g, backdrop.g),
    b: mix(surface.b, backdrop.b),
  };
}

describe("DragPreview", () => {
  it("drag preview shows only swatch, name and brand", () => {
    const { container, unmount } = render(
      <DragPreview kind="paint" paint={red} brandName="Citadel" />,
    );
    const root = container.firstElementChild!;
    expect(root).toHaveClass("drag-preview");
    const swatch = root.querySelector(".paint-swatch");
    expect(swatch).not.toBeNull();
    expect(swatch!.getAttribute("style")).toContain("--swatch-color: #9B130B");
    expect(screen.getByText("Mephiston Red")).toBeInTheDocument();
    expect(screen.getByText("Citadel")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(root.querySelectorAll("button, a, input, select, textarea, [tabindex]")).toHaveLength(0);
    unmount();

    const unknown = render(<DragPreview kind="paint" paint={undefined} brandName={undefined} />);
    const unknownRoot = unknown.container.firstElementChild!;
    expect(unknownRoot).toHaveClass("drag-preview");
    expect(unknownRoot.querySelector(".paint-swatch")).toBeNull();
    expect(unknownRoot.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(unknownRoot).toHaveTextContent(/^Unknown paint$/);
    unknown.unmount();

    const group = render(<DragPreview kind="group" name="Armor" />);
    const groupRoot = group.container.firstElementChild!;
    expect(groupRoot).toHaveClass("drag-preview");
    expect(groupRoot).toHaveTextContent(/^Armor$/);
    expect(groupRoot.querySelector(".paint-swatch")).toBeNull();
    expect(groupRoot.querySelectorAll("button, a")).toHaveLength(0);
  });

  it("glass keeps preview text readable", () => {
    const previewCss = readSource("./drag-preview.css");
    const tokensCss = readSource("../../styles/tokens.css");
    const root = block(previewCss, /\.drag-preview\s*\{/);
    expect(root).toMatch(/background(-color)?:\s*var\(--color-glass\)/);
    expect(root).toMatch(/(^|[\s;{])color:\s*var\(--color-text\)/);
    expect(previewCss).not.toContain("--color-muted-text");

    const dark = block(tokensCss, /@media \(prefers-color-scheme: dark\)\s*\{/);
    const light = block(tokensCss.replace(dark, ""), /:root\s*\{/);

    for (const [scheme, css] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      const glass = token(css, "--color-glass");
      const percent =
        /color-mix\(in srgb, var\(--color-surface\) (\d+(?:\.\d+)?)%, transparent\)/.exec(glass);
      expect(percent, `${scheme} --color-glass shape`).not.toBeNull();
      const alpha = Number(percent![1]) / 100;
      const surface = rgb(token(css, "--color-surface"));
      const text = rgb(token(css, "--color-text"));

      for (const backdrop of ["#000", "#fff"]) {
        const composite = over(surface, alpha, rgb(backdrop));
        expect(
          wcagContrast(text, composite),
          `${scheme} text over glass on ${backdrop}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
