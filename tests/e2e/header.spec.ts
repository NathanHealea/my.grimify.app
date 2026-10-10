import { expect, type Locator, type Page, test } from "@playwright/test";

type Rgba = { r: number; g: number; b: number; a: number };

const header = (page: Page) => page.getByRole("banner");
const smallTitle = (page: Page) => header(page).locator(".app-shell__title");
const largeTitle = (page: Page) => page.locator("main h1.page-title");
const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search paints" });
const bar = (page: Page) => page.locator(".app-shell__bar");
const barRow = (page: Page) => page.locator(".app-shell__bar-row");
const titleRow = (page: Page) => page.locator(".app-shell__title-row");
const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

// Copied from nav.spec.ts: any CSS colour syntax comes back as sRGB bytes once painted.
async function computedColor(target: Locator, property: string, pseudo?: string): Promise<Rgba> {
  return target.evaluate(
    (element, [prop, pseudoElt]) => {
      const value = getComputedStyle(element, pseudoElt).getPropertyValue(prop);
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d canvas context");
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    },
    [property, pseudo ?? null] as const,
  );
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

async function opacity(target: Locator): Promise<number> {
  return target.evaluate((el) => Number(getComputedStyle(el).opacity));
}

async function contentBox(target: Locator) {
  return target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      left: rect.left + parseFloat(style.paddingLeft),
      right: rect.right - parseFloat(style.paddingRight),
    };
  });
}

async function rect(target: Locator) {
  return target.evaluate((el) => {
    const { left, right } = el.getBoundingClientRect();
    return { left, right };
  });
}

async function box(target: Locator) {
  const rect = await target.boundingBox();
  if (!rect) throw new Error("element has no layout box");
  return rect;
}

function middle({ y, height }: { y: number; height: number }): number {
  return y + height / 2;
}

async function backdropFilter(target: Locator, pseudo?: string): Promise<string> {
  return target.evaluate((el, pseudoElt) => {
    const style = getComputedStyle(el, pseudoElt);
    // Safari before 18 reports only the prefixed property; an empty value means none applies.
    return style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter") || "none";
  }, pseudo ?? null);
}

// --color-glass is a color-mix(), so resolve it through a real element before reading it.
async function resolvedGlass(page: Page): Promise<Rgba> {
  const probe = page.locator("[data-test-glass-probe]");
  await bar(page).evaluate((el) => {
    const span = document.createElement("span");
    span.dataset.testGlassProbe = "";
    span.style.backgroundColor = "var(--color-glass)";
    el.append(span);
  });
  const glass = await computedColor(probe, "background-color");
  await probe.evaluate((el) => el.remove());
  return glass;
}

// Pseudo-elements have no getBoundingClientRect, so the layer's bottom comes from its used top and height.
async function layerBottom(page: Page): Promise<number> {
  return bar(page).evaluate((el) => {
    const layer = getComputedStyle(el, "::before");
    return (
      el.getBoundingClientRect().top +
      parseFloat(getComputedStyle(el).borderTopWidth) +
      parseFloat(layer.top) +
      parseFloat(layer.height)
    );
  });
}

async function expectAligned(page: Page, width: number) {
  const column = await contentBox(page.locator("main"));
  const start = await rect(header(page).locator(".app-shell__header-start"));
  const end = await rect(header(page).locator(".app-shell__header-end"));
  const large = await rect(largeTitle(page));
  const search = await rect(searchBox(page));

  expect
    .soft(Math.abs(large.left - column.left), `large title at ${width}px`)
    .toBeLessThanOrEqual(1);
  expect
    .soft(Math.abs(search.left - column.left), `search box at ${width}px`)
    .toBeLessThanOrEqual(1);
  expect
    .soft(Math.abs(start.left - column.left), `header start at ${width}px`)
    .toBeLessThanOrEqual(1);
  expect
    .soft(Math.abs(end.right - column.right), `header end at ${width}px`)
    .toBeLessThanOrEqual(1);

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const bar = await rect(header(page));
  expect.soft(bar.left, `header starts at the window edge at ${width}px`).toBeCloseTo(0, 0);
  expect
    .soft(bar.right, `header ends at the window edge at ${width}px`)
    .toBeCloseTo(viewportWidth, 0);
}

test("collapses the title and lines the header up", async ({ page, browserName }) => {
  await page.goto("/paints");
  await expect(largeTitle(page)).toHaveText("Paints");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");

  await expect(smallTitle(page)).toHaveText("Paints");
  await expect.poll(() => opacity(smallTitle(page))).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => opacity(smallTitle(page))).toBe(1);
  expect(
    await header(page).evaluate((el) => el.getBoundingClientRect().top),
    "header sticks",
  ).toBeCloseTo(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => opacity(smallTitle(page))).toBe(0);

  const device = page.viewportSize();
  if (!device) throw new Error("no viewport");
  await expectAligned(page, device.width);

  if (browserName === "chromium") {
    const filter = await header(page).evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(filter).toContain("blur(16px)");
    expect(filter).toContain("saturate(1.8)");
  }
});

test("keeps the header title readable", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/paints");
    await expect(smallTitle(page)).toHaveText("Paints");

    // A blur over one solid colour is that colour, so blending the glass over black and white
    // gives the same backdrop as a solid swatch scrolled under the header.
    const glass = await computedColor(header(page), "background-color");
    const text = await computedColor(smallTitle(page), "color");
    for (const backdrop of [
      over(glass, { r: 0, g: 0, b: 0, a: 1 }),
      over(glass, { r: 255, g: 255, b: 255, a: 1 }),
    ]) {
      expect(
        contrast(over(text, backdrop), backdrop),
        `${colorScheme} title`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("keeps the back link's focus ring visible on the glass", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/paints/citadel-base-mephiston-red");
    const back = page.getByRole("link", { name: "Back to Paints" });
    await back.focus();
    expect(await back.evaluate((el) => el.matches(":focus-visible"))).toBe(true);

    const glass = await computedColor(header(page), "background-color");
    const ring = await computedColor(back, "outline-color");
    for (const backdrop of [
      over(glass, { r: 0, g: 0, b: 0, a: 1 }),
      over(glass, { r: 255, g: 255, b: 255, a: 1 }),
    ]) {
      expect(
        contrast(over(ring, backdrop), backdrop),
        `${colorScheme} back link ring`,
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

test("keeps the back link clear of a long paint name on a narrow phone", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  // The catalog's longest name, 59 characters.
  await page.goto(
    "/paints/ak-interactive-acrylics-figure-golden-olive-waffen-spring-summer-light-green-spots-52",
  );
  const back = page.getByRole("link", { name: "Back to Paints" });
  await expect(smallTitle(page)).toHaveText(/Golden Olive/);
  const link = await back.boundingBox();
  const title = await smallTitle(page).boundingBox();
  if (!link || !title) throw new Error("missing back link or title box");
  expect(title.x, "title starts after the back link").toBeGreaterThanOrEqual(link.x + link.width);
  // Taps across the whole back link reach the link, not the title.
  for (const fraction of [0.25, 0.5, 0.9]) {
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.textContent ?? null,
      [link.x + link.width * fraction, link.y + link.height / 2],
    );
    expect(hit, `tap at ${fraction} of the back link`).toContain("Paints");
  }

  // The Offline pill takes its own room; the title truncates instead of running under it.
  await context.setOffline(true);
  const pill = page.getByRole("banner").getByRole("status").filter({ hasText: "Offline" });
  await expect(pill).toHaveText("Offline");
  const pillBox = await pill.boundingBox();
  const squeezed = await smallTitle(page).boundingBox();
  if (!pillBox || !squeezed) throw new Error("missing pill or title box");
  expect(squeezed.x + squeezed.width, "title ends before the Offline pill").toBeLessThanOrEqual(
    pillBox.x,
  );
  expect(pillBox.x + pillBox.width, "pill stays on screen").toBeLessThanOrEqual(320);

  // Both pills at once (a real pending change needs sign-in, so the text is set directly).
  await page
    .locator(".app-shell__pending")
    .evaluate((el) => (el.textContent = "3 changes waiting to sync"));
  for (const status of await page.getByRole("banner").getByRole("status").all()) {
    const right = await status.evaluate((el) => el.getBoundingClientRect().right);
    expect(right, "status pill stays on screen").toBeLessThanOrEqual(320);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    "no sideways scroll",
  ).toBeLessThanOrEqual(320);
  await context.setOffline(false);
});

test("merges the header and nav into one bar on desktop", async ({
  page,
  context,
  browserName,
}) => {
  await page.goto("/paints/citadel-base-mephiston-red");
  const back = page.getByRole("link", { name: "Back to Paints" });
  await expect(back).toBeVisible();
  await context.setOffline(true);
  const offline = page.locator(".app-shell__offline");
  await expect(offline).toHaveText("Offline");
  // A real pending change needs sign-in, so the text is set directly.
  const pending = page.locator(".app-shell__pending");
  await pending.evaluate((el) => (el.textContent = "3 changes waiting to sync"));
  const tabs = nav(page).locator(".app-shell__tab");
  await expect(tabs).toHaveCount(3);

  for (const width of [1280, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);

    const row = middle(await box(tabs.first()));
    // With both pills showing they may stack where the column is narrow (R6), so the group is
    // what shares the row.
    for (const [name, target] of [
      ["back link", back],
      ["status pills", header(page).locator(".app-shell__header-end")],
    ] as const) {
      expect
        .soft(
          Math.abs(middle(await box(target)) - row),
          `${name} shares the tabs' row at ${width}px`,
        )
        .toBeLessThanOrEqual(2);
    }

    const column = await contentBox(page.locator("main"));
    const start = await rect(header(page).locator(".app-shell__header-start"));
    const end = await rect(header(page).locator(".app-shell__header-end"));
    expect
      .soft(Math.abs(start.left - column.left), `back link at the column's left at ${width}px`)
      .toBeLessThanOrEqual(1);
    expect
      .soft(Math.abs(end.right - column.right), `pills at the column's right at ${width}px`)
      .toBeLessThanOrEqual(1);
    const large = await rect(largeTitle(page));
    expect
      .soft(Math.abs(large.left - column.left), `large title at the column's left at ${width}px`)
      .toBeLessThanOrEqual(1);

    const first = await rect(tabs.first());
    const last = await rect(tabs.last());
    expect
      .soft(
        Math.abs((first.left + last.right) / 2 - viewportWidth / 2),
        `tabs centred in the window at ${width}px`,
      )
      .toBeLessThanOrEqual(2);
    // Sized to their items: no tab is stretched beyond its icon, label and padding.
    const spare = await tabs.evaluateAll((items) =>
      items.map((tab) => {
        const style = getComputedStyle(tab);
        const icon = tab.querySelector("svg")?.getBoundingClientRect();
        const label = tab.querySelector("span")?.getBoundingClientRect();
        if (!icon || !label) throw new Error("tab without icon or label");
        return (
          tab.getBoundingClientRect().width -
          (label.right - icon.left) -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight)
        );
      }),
    );
    for (const extra of spare) {
      expect.soft(extra, `tabs sized to their items at ${width}px`).toBeLessThanOrEqual(1);
    }

    expect
      .soft((await computedColor(nav(page), "background-color")).a, `nav background at ${width}px`)
      .toBe(0);
    const navFrame = await nav(page).evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        border: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ],
        shadow: style.boxShadow,
      };
    });
    expect.soft(navFrame.border, `nav border at ${width}px`).toEqual(["0px", "0px", "0px", "0px"]);
    expect.soft(navFrame.shadow, `nav shadow at ${width}px`).toBe("none");
    expect.soft(await backdropFilter(nav(page)), `nav blur at ${width}px`).toBe("none");
    expect
      .soft(
        (await computedColor(header(page), "background-color")).a,
        `header background at ${width}px`,
      )
      .toBe(0);
    expect.soft(await backdropFilter(header(page)), `header blur at ${width}px`).toBe("none");

    await expect(bar(page)).toHaveCount(1);
    const spans = await rect(bar(page));
    expect.soft(spans.left, `bar starts at the window edge at ${width}px`).toBeCloseTo(0, 0);
    expect
      .soft(spans.right, `bar ends at the window edge at ${width}px`)
      .toBeCloseTo(viewportWidth, 0);
    if (browserName === "chromium") {
      const filter = await backdropFilter(bar(page), "::before");
      expect.soft(filter, `bar blur at ${width}px`).toContain("blur(16px)");
      // Chromium serialises saturate(180%) as saturate(1.8).
      expect.soft(filter, `bar saturation at ${width}px`).toContain("saturate(1.8)");
    }
  }
  await context.setOffline(false);
});

test("scrolls content under the desktop bar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/paints");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");
  await page.evaluate(() => window.scrollTo(0, 300));

  await expect(bar(page)).toHaveCount(1);
  const shell = await box(bar(page));
  const banner = await box(header(page));
  expect.soft(shell.y, "bar at the top of the window").toBeCloseTo(0, 0);
  // Only the bar's 12px padding above and below the row, and at most a 1px border, add height.
  expect
    .soft(shell.height, "no strip reserved above the header")
    .toBeLessThanOrEqual(banner.height + 2 * 12 + 1);

  // Between the column's left edge and the first tab: inside the bar, clear of its controls.
  const column = await contentBox(page.locator("main"));
  const firstTab = await box(nav(page).locator(".app-shell__tab").first());
  const point: [number, number] = [(column.left + firstTab.x) / 2, middle(shell)];
  const stack = await page.evaluate(([x, y]) => {
    const main = document.querySelector("main");
    const hits = document.elementsFromPoint(x, y);
    return {
      topInBar: hits[0]?.closest(".app-shell__bar") !== null,
      contentBehind: hits.some((el) => el !== main && !!main?.contains(el)),
    };
  }, point);
  expect.soft(stack.topInBar, "the bar is on top").toBe(true);
  expect.soft(stack.contentBehind, "page content is behind the bar").toBe(true);
});

test("spaces the desktop bar", async ({ page }) => {
  await page.goto("/paints");
  const tabs = nav(page).locator(".app-shell__tab");
  await expect(tabs).toHaveCount(3);

  for (const width of [1280, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(barRow(page)).toHaveCount(1);
    const space = await barRow(page).evaluate((el) => {
      const style = getComputedStyle(el);
      const { top, bottom } = el.getBoundingClientRect();
      return {
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        top,
        bottom: bottom - parseFloat(style.borderBottomWidth),
      };
    });
    expect.soft(space.paddingTop, `nav row padding-top at ${width}px`).toBe("12px");
    expect.soft(space.paddingBottom, `nav row padding-bottom at ${width}px`).toBe("12px");

    const tab = await tabs.first().evaluate((el) => {
      const { top, bottom } = el.getBoundingClientRect();
      return { top, bottom };
    });
    expect
      .soft(tab.top - space.top, `room above the tabs at ${width}px`)
      .toBeGreaterThanOrEqual(12);
    expect
      .soft(space.bottom - tab.bottom, `room below the tabs at ${width}px`)
      .toBeGreaterThanOrEqual(12);
  }
});

test("shows the title along the bottom of the desktop bar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/paints");
  await expect(largeTitle(page)).toHaveText("Paints");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");
  await expect(bar(page)).toHaveCount(1);
  await expect.poll(() => opacity(titleRow(page)), { message: "faded out at the top" }).toBe(0);

  await page.evaluate(() => window.scrollTo(0, 300));
  await expect(titleRow(page), "shown once the large title is under the bar").toBeVisible();
  await expect.poll(() => opacity(titleRow(page)), { message: "faded in" }).toBe(1);
  await expect(titleRow(page)).toHaveText("Paints");

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const barBottom = await bar(page).evaluate((el) => el.getBoundingClientRect().bottom);
  const row = await titleRow(page).evaluate((el) => {
    const { top, left, right } = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    return { top, left, right, textCentre: (text.left + text.right) / 2 };
  });
  expect
    .soft(Math.abs(row.top - barBottom), "title row starts at the bar's bottom edge")
    .toBeLessThanOrEqual(1);
  expect
    .soft(Math.abs(row.textCentre - viewportWidth / 2), "title centred in the window")
    .toBeLessThanOrEqual(2);
  expect.soft(row.left, "title row starts at the window edge").toBeCloseTo(0, 0);
  expect.soft(row.right, "title row ends at the window edge").toBeCloseTo(viewportWidth, 0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => opacity(titleRow(page)), { message: "fades out again" }).toBe(0);
});

test("doesn't move content when the title row appears", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/paints");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");
  await expect(bar(page)).toHaveCount(1);
  const firstRow = page.locator(".paint-row").first();
  await expect(firstRow).toBeVisible();

  // The title row turns on once the large title's bottom has passed the bar's bottom edge.
  const switchAt = await page.evaluate(() => {
    const title = document.querySelector("main h1.page-title");
    const shell = document.querySelector(".app-shell__bar");
    if (!title || !shell) throw new Error("missing large title or bar");
    return (
      title.getBoundingClientRect().bottom + window.scrollY - shell.getBoundingClientRect().height
    );
  });
  const measure = async () => ({
    barHeight: await bar(page).evaluate((el) => el.getBoundingClientRect().height),
    rowOffset: await firstRow.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
  });

  await page.evaluate((y) => window.scrollTo(0, y), switchAt - 8);
  await expect(header(page)).toHaveAttribute("data-scrolled", "false");
  await expect.poll(() => opacity(titleRow(page))).toBe(0);
  const before = await measure();

  await page.evaluate((y) => window.scrollTo(0, y), switchAt + 8);
  await expect(header(page)).toHaveAttribute("data-scrolled", "true");
  await expect(titleRow(page), "title row on after the switch").toBeVisible();
  await expect.poll(() => opacity(titleRow(page))).toBe(1);
  const after = await measure();

  expect.soft(after.barHeight, "bar height").toBeCloseTo(before.barHeight, 0);
  expect
    .soft(after.rowOffset, "first paint row's place in the page")
    .toBeCloseTo(before.rowOffset, 0);
});

test("switches the phone title as the large one slides under the header", async ({ page }) => {
  await page.goto("/paints");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");

  // On phones the bar has no box, so the switch point is set by the header's height alone.
  const switchAt = await page.evaluate(() => {
    const title = document.querySelector("main h1.page-title");
    const banner = document.querySelector(".app-shell__header");
    if (!title || !banner) throw new Error("missing large title or header");
    return (
      title.getBoundingClientRect().bottom + window.scrollY - banner.getBoundingClientRect().height
    );
  });

  await page.evaluate((y) => window.scrollTo(0, y), switchAt - 8);
  await expect(header(page)).toHaveAttribute("data-scrolled", "false");
  await page.evaluate((y) => window.scrollTo(0, y), switchAt + 8);
  await expect(header(page)).toHaveAttribute("data-scrolled", "true");
});

test("hides the desktop title row on phones", async ({ page }) => {
  await page.goto("/paints");
  await expect(smallTitle(page)).toHaveText("Paints");
  await expect(titleRow(page)).toHaveCSS("display", "none");
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => opacity(smallTitle(page))).toBe(1);
  await expect(titleRow(page)).toHaveCSS("display", "none");
});

test("draws the bar's line under the title row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/paints");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");
  await expect(bar(page)).toHaveCount(1);
  const border = await computedColor(bar(page), "--color-border");
  // A line shows only with width, colour and an element that isn't faded out.
  const lineShows = async (target: Locator) => {
    const [width, fade] = await target.evaluate((el) => {
      const style = getComputedStyle(el);
      return [parseFloat(style.borderBottomWidth), Number(style.opacity)];
    });
    return width > 0 && fade > 0 && (await computedColor(target, "border-bottom-color")).a > 0;
  };

  expect.soft(await lineShows(barRow(page)), "no nav row line at the top").toBe(false);
  expect.soft(await lineShows(titleRow(page)), "no title row line at the top").toBe(false);

  await page.evaluate(() => window.scrollTo(0, 300));
  await expect(titleRow(page), "title row shown after scrolling").toBeVisible();
  await expect
    .poll(() => computedColor(titleRow(page), "border-bottom-color"), {
      message: "line under the title row",
    })
    .toEqual(border);
  expect
    .soft(
      await titleRow(page).evaluate((el) => getComputedStyle(el).borderBottomWidth),
      "title row line width",
    )
    .toBe("1px");
  expect.soft(await lineShows(barRow(page)), "no line on the nav row itself").toBe(false);
});

test("lets taps through the title row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/paints");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect(titleRow(page)).toBeVisible();
  await expect.poll(() => opacity(titleRow(page))).toBe(1);

  await expect(titleRow(page)).toHaveAttribute("aria-hidden", "true");
  const row = await box(titleRow(page));
  const inMain = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x, y)?.closest("main"),
    [row.x + row.width / 2, middle(row)],
  );
  expect(inMain, "a tap on the title row reaches the content under it").toBe(true);
});

test("makes the title row a sibling of the nav row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/paints");
  await expect(largeTitle(page)).toHaveText("Paints");
  await expect(barRow(page)).toHaveCount(1);
  await expect(titleRow(page)).toHaveCount(1);

  const tree = await page.evaluate(() => {
    const navRow = document.querySelector(".app-shell__bar-row");
    const title = document.querySelector(".app-shell__title-row");
    const banner = document.querySelector("header");
    if (!navRow || !title || !banner) throw new Error("missing nav row, title row or banner");
    return {
      sameParent: title.parentElement === navRow.parentElement,
      navRowHoldsTitle: navRow.contains(title),
      titleHoldsNavRow: title.contains(navRow),
      bannerHoldsTitle: banner.contains(title),
    };
  });
  expect.soft(tree.sameParent, "same parent").toBe(true);
  expect.soft(tree.navRowHoldsTitle, "nav row doesn't contain the title row").toBe(false);
  expect.soft(tree.titleHoldsNavRow, "title row doesn't contain the nav row").toBe(false);
  expect.soft(tree.bannerHoldsTitle, "banner doesn't contain the title row").toBe(false);
});

test("puts both rows on one glass layer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/paints");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");
  await expect(bar(page)).toHaveCount(1);

  expect
    .soft(
      await computedColor(bar(page), "background-color", "::before"),
      "layer has the glass colour",
    )
    .toEqual(await resolvedGlass(page));
  expect.soft(await backdropFilter(bar(page), "::before"), "layer blur").toContain("blur(16px)");
  for (const [name, target] of [
    ["nav row", barRow(page)],
    ["title row", titleRow(page)],
  ] as const) {
    expect.soft((await computedColor(target, "background-color")).a, `${name} background`).toBe(0);
    expect.soft(await backdropFilter(target), `${name} blur`).toBe("none");
    // A backdrop-filter above either row would be its backdrop root, so the layer would blur only
    // that ancestor and the list would show through it sharp.
    const rooted = await target.evaluate((row) => {
      const roots: string[] = [];
      for (let el = row.parentElement; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        const filter = style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter");
        if (filter && filter !== "none") roots.push(el.className || el.tagName);
      }
      return roots;
    });
    expect.soft(rooted, `no backdrop filter above the ${name}`).toEqual([]);
  }

  const navRowBottom = await barRow(page).evaluate((el) => el.getBoundingClientRect().bottom);
  await expect
    .poll(async () => Math.abs((await layerBottom(page)) - navRowBottom), {
      message: "layer ends at the nav row's bottom at the top",
    })
    .toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo(0, 300));
  await expect(titleRow(page)).toBeVisible();
  // The layer slides down over --duration-title, so wait for it to settle.
  await expect
    .poll(
      async () => {
        const titleRowBottom = await titleRow(page).evaluate(
          (el) => el.getBoundingClientRect().bottom,
        );
        return Math.abs((await layerBottom(page)) - titleRowBottom);
      },
      { message: "layer ends at the title row's bottom after scrolling" },
    )
    .toBeLessThanOrEqual(1);
});

test("keeps the desktop title readable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/paints");
    await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect(titleRow(page), `${colorScheme} title row shown`).toBeVisible();

    // A blur over one solid colour is that colour, so blending the glass over black and white
    // gives the same backdrop as a solid swatch scrolled under the title row.
    const glass = await computedColor(bar(page), "background-color", "::before");
    const text = await computedColor(titleRow(page), "color");
    for (const backdrop of [
      over(glass, { r: 0, g: 0, b: 0, a: 1 }),
      over(glass, { r: 255, g: 255, b: 255, a: 1 }),
    ]) {
      expect(
        contrast(over(text, backdrop), backdrop),
        `${colorScheme} desktop title`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("keeps the desktop bar readable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/paints/citadel-base-mephiston-red");
    await expect(bar(page)).toHaveCount(1);

    // A blur over one solid colour is that colour, so blending the glass over black and white
    // gives the same backdrop as a solid swatch scrolled under the bar.
    const glass = await computedColor(bar(page), "background-color", "::before");
    const backdrops = [
      over(glass, { r: 0, g: 0, b: 0, a: 1 }),
      over(glass, { r: 255, g: 255, b: 255, a: 1 }),
    ];
    const inactive = nav(page).locator('.app-shell__tab:not([aria-current="page"]) span');
    await expect(inactive).toHaveCount(2);
    const active = nav(page).locator('.app-shell__tab[aria-current="page"]');
    await expect(active).toHaveCount(1);

    const labels = await Promise.all((await inactive.all()).map((l) => computedColor(l, "color")));
    const pill = await computedColor(active, "background-color");
    for (const backdrop of backdrops) {
      for (const label of labels) {
        expect(
          contrast(over(label, backdrop), backdrop),
          `${colorScheme} tab label`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(over(pill, backdrop), backdrop),
        `${colorScheme} active pill`,
      ).toBeGreaterThanOrEqual(3);
    }

    // WebKit doesn't Tab to links by default; a script focus with no pointer use still counts as keyboard focus.
    for (const [name, target] of [
      ["tab", inactive.first().locator("..")],
      ["back link", page.getByRole("link", { name: "Back to Paints" })],
    ] as const) {
      await target.focus();
      expect(await target.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
      const ring = await computedColor(target, "outline-color");
      for (const backdrop of backdrops) {
        expect(
          contrast(over(ring, backdrop), backdrop),
          `${colorScheme} ${name} focus ring`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  }
});

test("fits the desktop bar at 640px", async ({ page, context }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto("/paints/citadel-base-mephiston-red");
  const back = page.getByRole("link", { name: "Back to Paints" });
  await expect(back).toBeVisible();
  await context.setOffline(true);
  const offline = page.locator(".app-shell__offline");
  await expect(offline).toHaveText("Offline");
  const pending = page.locator(".app-shell__pending");
  await pending.evaluate((el) => (el.textContent = "3 changes waiting to sync"));
  await expect(bar(page)).toHaveCount(1);

  const parts = [
    ["back link", await box(back)],
    ["nav", await box(nav(page))],
    ["Offline pill", await box(offline)],
    ["pending pill", await box(pending)],
  ] as const;
  for (const [i, [name, a]] of parts.entries()) {
    expect.soft(a.x + a.width, `${name} stays on screen`).toBeLessThanOrEqual(640);
    for (const [other, b] of parts.slice(i + 1)) {
      const overlaps =
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect.soft(overlaps, `${name} clear of ${other}`).toBe(false);
    }
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    "no sideways scroll",
  ).toBeLessThanOrEqual(640);

  for (const label of await nav(page).locator(".app-shell__tab span").all()) {
    const lineHeight = await label.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect
      .soft((await box(label)).height, `${await label.innerText()} on one line`)
      .toBeLessThanOrEqual(lineHeight + 1);
  }
  await context.setOffline(false);
});

test("makes the one glass layer solid with reduced transparency", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "reduced transparency is emulated through Chromium's CDP");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/paints");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("2,837 paints");
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect(titleRow(page)).toBeVisible();

  // Playwright 1.63's emulateMedia has no reducedTransparency option, so set the media feature directly.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches),
  ).toBe(true);

  await expect(bar(page)).toHaveCount(1);
  expect(await backdropFilter(bar(page), "::before")).toBe("none");
  expect((await computedColor(bar(page), "background-color", "::before")).a).toBe(1);
});
