import { expect, type Locator, type Page, test } from "@playwright/test";

type Rgba = { r: number; g: number; b: number; a: number };

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

// Any CSS colour syntax (rgb, color(srgb …), oklab from color-mix) comes back as sRGB bytes once painted.
async function computedColor(target: Locator, property: string): Promise<Rgba> {
  return target.evaluate((element, prop) => {
    const value = getComputedStyle(element).getPropertyValue(prop);
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d canvas context");
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  }, property);
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, u: number) => t * top.a + u * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

// WCAG 2.1 relative luminance and contrast ratio (Understanding SC 1.4.3).
function luminance({ r, g, b }: Rgba): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("frosts the bar where it can", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "reduced transparency is emulated through Chromium's CDP");
  const bar = nav(page);
  for (const [colorScheme, alpha] of [
    ["light", 0.5],
    ["dark", 0.62],
  ] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/paints");
    await expect(bar).toBeVisible();

    // Chromium serialises saturate(180%) as saturate(1.8).
    const filter = await bar.evaluate((el) => getComputedStyle(el).backdropFilter);
    expect.soft(filter, `${colorScheme} blur`).toContain("blur(16px)");
    expect.soft(filter, `${colorScheme} saturation`).toContain("saturate(1.8)");
    expect
      .soft((await computedColor(bar, "background-color")).a, `${colorScheme} glass alpha`)
      .toBeCloseTo(alpha, 2);
  }

  // Playwright 1.63's emulateMedia has no reducedTransparency option, so set the media feature directly.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches),
  ).toBe(true);

  expect(await bar.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
  expect((await computedColor(bar, "background-color")).a).toBe(1);
});

test("keeps the phone bar plain glass", async ({ page }) => {
  const bar = nav(page);
  for (const [colorScheme, alpha] of [
    ["light", 0.5],
    ["dark", 0.62],
  ] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/paints");
    await expect(bar).toBeVisible();

    const look = await bar.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        borders: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ],
        shadow: style.boxShadow,
      };
    });
    expect.soft(look.borders, `${colorScheme} border widths`).toEqual(["0px", "0px", "0px", "0px"]);
    expect.soft(look.shadow, `${colorScheme} shadow`).toBe("none");
    expect
      .soft((await computedColor(bar, "background-color")).a, `${colorScheme} glass alpha`)
      .toBeCloseTo(alpha, 2);

    const active = bar.locator('.app-shell__tab[aria-current="page"]');
    await expect(active).toHaveCount(1);
    expect
      .soft((await computedColor(active, "background-color")).a, `${colorScheme} active pill alpha`)
      .toBe(1);
  }
});

test("keeps nav text readable over any swatch", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/paints");
    const bar = nav(page);
    await expect(bar).toBeVisible();

    // A blur over one solid colour is that colour, so blending the glass over black and white
    // gives the same backdrop as rendering a solid swatch behind the bar.
    const glass = await computedColor(bar, "background-color");
    const backdrops = [
      over(glass, { r: 0, g: 0, b: 0, a: 1 }),
      over(glass, { r: 255, g: 255, b: 255, a: 1 }),
    ];
    const inactive = bar.locator('.app-shell__tab:not([aria-current="page"]) span');
    await expect(inactive).toHaveCount(2);
    const active = bar.locator('.app-shell__tab[aria-current="page"]');
    await expect(active).toHaveCount(1);

    const labels = await Promise.all((await inactive.all()).map((l) => computedColor(l, "color")));
    const pill = await computedColor(active, "background-color");

    for (const backdrop of backdrops) {
      for (const label of labels) {
        expect(
          contrast(over(label, backdrop), backdrop),
          `${colorScheme} label`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(over(pill, backdrop), backdrop),
        `${colorScheme} pill`,
      ).toBeGreaterThanOrEqual(3);
    }

    // The focus ring is drawn outside the item, on the glass, so it needs 3:1 against the same blends.
    const target = inactive.first().locator("..");
    // WebKit doesn't Tab to links by default; a script focus with no pointer use still counts as keyboard focus.
    await target.focus();
    expect(await target.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    const ring = await computedColor(target, "outline-color");
    for (const backdrop of backdrops) {
      expect(
        contrast(over(ring, backdrop), backdrop),
        `${colorScheme} focus ring`,
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

const SPACE_3 = 12;

async function box(target: Locator) {
  const rect = await target.boundingBox();
  if (!rect) throw new Error("element has no layout box");
  return rect;
}

async function expectOneLineItems(page: Page, width: number) {
  const tabs = nav(page).locator(".app-shell__tab");
  await expect(tabs).toHaveCount(3);
  const overflow = await nav(page)
    .locator(".app-shell__tab-list")
    .evaluate((list) => list.scrollWidth - list.clientWidth);
  expect.soft(overflow, `items fit inside the bar at ${width}px`).toBeLessThanOrEqual(0);
  for (const tab of await tabs.all()) {
    const name = `${await tab.innerText()} at ${width}px`;
    const icon = await box(tab.locator("svg.app-shell__tab-icon"));
    const labelEl = tab.locator("span");
    const label = await box(labelEl);
    const lineHeight = await labelEl.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    const item = await box(tab);
    expect.soft(item.width, `${name}: target width`).toBeGreaterThanOrEqual(44);
    expect.soft(item.height, `${name}: target height`).toBeGreaterThanOrEqual(44);
    expect.soft(icon.width, `${name}: icon width`).toBeCloseTo(24, 0);
    expect.soft(icon.height, `${name}: icon height`).toBeCloseTo(24, 0);

    expect
      .soft(
        Math.abs(icon.y + icon.height / 2 - (label.y + label.height / 2)),
        `${name}: shared row`,
      )
      .toBeLessThanOrEqual(2);
    expect.soft(icon.x + icon.width, `${name}: icon left of label`).toBeLessThanOrEqual(label.x);
    expect.soft(label.height, `${name}: label on one line`).toBeLessThanOrEqual(lineHeight + 1);
  }
}

async function expectBottomBar(page: Page, width: number) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  const bar = await box(nav(page));
  expect.soft(bar.x, `left inset at ${width}px`).toBeCloseTo(SPACE_3, 0);
  expect
    .soft(viewport.width - (bar.x + bar.width), `right inset at ${width}px`)
    .toBeCloseTo(SPACE_3, 0);
  expect
    .soft(viewport.height - (bar.y + bar.height), `bottom inset at ${width}px`)
    .toBeCloseTo(SPACE_3, 0);
}

test("lays the nav out per screen size", async ({ page }) => {
  await page.goto("/paints");
  await expect(nav(page)).toBeVisible();

  const device = page.viewportSize();
  if (!device) throw new Error("no viewport");
  await expectOneLineItems(page, device.width);
  await expectBottomBar(page, device.width);

  // R1 says every width; 320px is the narrowest phone and the tightest fit (risk 3).
  await page.setViewportSize({ width: 320, height: 640 });
  await expectOneLineItems(page, 320);
  await expectBottomBar(page, 320);

  // The desktop layout is the shared bar, checked in header.spec.ts.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expectOneLineItems(page, 1280);
});
