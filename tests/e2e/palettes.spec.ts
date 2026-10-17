import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import { E2E_EMAIL } from "./global-setup";

test("creates, renames and deletes a palette", async ({ page }, info) => {
  // The device profiles run in parallel on one shared user, so each journey names its own palette.
  const name = `E2E ${info.project.name} ${Date.now()}`;
  const renamed = `${name} renamed`;
  const main = page.getByRole("main");

  await page.goto("/palettes");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
  await page.goto("/palettes");

  await main.getByRole("button", { name: "New palette" }).click();
  const createSheet = page.getByRole("dialog", { name: "New palette" });
  await createSheet.getByLabel("Palette name").fill(name);
  await createSheet.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/palettes\/[^/]+$/);
  await expect(main.getByRole("heading", { level: 1, name })).toBeVisible();

  await main.getByRole("button", { name: "Palette actions" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
  const renameSheet = page.getByRole("dialog", { name: "Rename palette" });
  await renameSheet.getByLabel("Palette name").fill(renamed);
  await renameSheet.getByRole("button", { name: "Save" }).click();
  await expect(main.getByRole("heading", { level: 1, name: renamed })).toBeVisible();

  await page.getByRole("link", { name: "Back to Palettes" }).click();
  const row = main.getByRole("link", { name: new RegExp(`^${renamed}`) });
  await expect(row).toContainText("0 paints");

  await row.click();
  await main.getByRole("button", { name: "Palette actions" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete palette" }).click();
  await page
    .getByRole("dialog", { name: `Delete "${renamed}"?` })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/palettes$/);
  await expect(main.getByRole("link", { name: new RegExp(`^${renamed}`) })).toHaveCount(0);

  await page.reload();
  await expect(main.getByRole("button", { name: "New palette" })).toBeVisible();
  await expect(main.getByRole("link", { name: new RegExp(`^${renamed}`) })).toHaveCount(0);
});

test("adds paints to a palette and removes one", async ({ page }, info) => {
  const name = `E2E paints ${info.project.name} ${Date.now()}`;
  const main = page.getByRole("main");
  const picker = page.getByRole("dialog", { name: "Add to palette" });
  const choose = () => picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();

  await page.goto("/palettes");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
  await page.goto("/palettes");
  await main.getByRole("button", { name: "New palette" }).click();
  const createSheet = page.getByRole("dialog", { name: "New palette" });
  await createSheet.getByLabel("Palette name").fill(name);
  await createSheet.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/palettes\/[^/]+$/);
  const paletteUrl = page.url();

  await page.goto("/paints/citadel-base-mephiston-red");
  await main.getByRole("button", { name: "Add to palette" }).click();
  await choose();
  await expect(page.getByText(`Added to ${name}`)).toBeVisible();

  await page.goto("/paints?q=evil sunz scarlet");
  await main.getByRole("button", { name: "Add to palette" }).click();
  await main.getByRole("checkbox", { name: "Select Evil Sunz Scarlet" }).first().check();
  await main.getByRole("searchbox", { name: "Search paints" }).fill("abaddon black");
  await main.getByRole("checkbox", { name: "Select Abaddon Black" }).first().check();
  const bar = main.getByRole("region", { name: "Selection" });
  await expect(bar.getByRole("status").first()).toHaveText("2 selected");
  await bar.getByRole("button", { name: "Add to palette" }).click();
  await choose();
  await expect(page.getByText(`Added 2 paints to ${name}`)).toBeVisible();
  await expect(bar).toHaveCount(0);

  await page.goto(paletteUrl);
  const paints = main.getByRole("list", { name: "Paints in this palette" }).getByRole("listitem");
  await expect(paints).toHaveCount(3);
  await expect(paints.nth(0)).toContainText("Mephiston Red");
  await expect(paints.nth(1)).toContainText("Evil Sunz Scarlet");
  await expect(paints.nth(2)).toContainText("Abaddon Black");

  await main.getByRole("button", { name: "Remove Mephiston Red from palette" }).click();
  await expect(page.getByText("Removed Mephiston Red")).toBeVisible();
  await expect(paints).toHaveCount(2);
  await page.reload();
  await expect(paints).toHaveCount(2);
  await expect(paints.nth(0)).toContainText("Evil Sunz Scarlet");

  await main.getByRole("button", { name: "Palette actions" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete palette" }).click();
  await page
    .getByRole("dialog", { name: `Delete "${name}"?` })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/palettes$/);
});

test("groups a palette's paints", async ({ page }, info) => {
  const name = `E2E groups ${info.project.name} ${Date.now()}`;
  const main = page.getByRole("main");
  const picker = page.getByRole("dialog", { name: "Add to palette" });

  await page.goto("/palettes");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
  await page.goto("/palettes");
  await main.getByRole("button", { name: "New palette" }).click();
  const createSheet = page.getByRole("dialog", { name: "New palette" });
  await createSheet.getByLabel("Palette name").fill(name);
  await createSheet.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/palettes\/[^/]+$/);
  const paletteUrl = page.url();

  await page.goto("/paints/citadel-base-mephiston-red");
  await main.getByRole("button", { name: "Add to palette" }).click();
  await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByText(`Added to ${name}`)).toBeVisible();
  await page.goto(paletteUrl);

  for (const group of ["Armor", "Trim", "Highlights"]) {
    await main.getByRole("button", { name: "New group" }).click();
    const sheet = page.getByRole("dialog", { name: "New group" });
    await sheet.getByLabel("Group name").fill(group);
    await sheet.getByRole("button", { name: "Create" }).click();
    await expect(main.getByRole("heading", { level: 2, name: group })).toBeFocused();
  }

  await main.getByRole("button", { name: "Groups for Mephiston Red" }).click();
  const membership = page.getByRole("dialog", { name: "Groups for Mephiston Red" });
  for (const group of ["Armor", "Trim"]) {
    await membership.getByRole("checkbox", { name: group }).check();
    await expect(membership.getByRole("checkbox", { name: group })).toBeChecked();
  }
  await membership.getByRole("button", { name: "Done" }).click();

  const armor = main.getByRole("region", { name: "Armor" });
  const trim = main.getByRole("region", { name: "Trim" });
  const highlights = main.getByRole("region", { name: "Highlights" });
  await expect(armor).toContainText("Mephiston Red");
  await expect(trim).toContainText("Mephiston Red");
  await armor.getByRole("button", { name: "Actions for Mephiston Red in Armor" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to group…" }).click();
  const moveTo = page.getByRole("dialog", { name: "Move Mephiston Red to" });
  await expect(moveTo.getByRole("button", { name: "Trim (already in it)" })).toBeDisabled();
  await moveTo.getByRole("button", { name: "Highlights" }).click();
  await expect(page.getByText("Moved to Highlights")).toBeVisible();
  await expect(armor).toContainText("No paints in this group yet");
  await expect(highlights).toContainText("Mephiston Red");
  await expect(trim).toContainText("Mephiston Red");

  await trim.getByRole("button", { name: "Actions for group Trim" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete group" }).click();
  await page
    .getByRole("dialog", { name: 'Delete group "Trim"?' })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByText("Deleted group Trim")).toBeVisible();
  await expect(trim).toHaveCount(0);
  await page.reload();
  await expect(
    main.getByRole("list", { name: "Paints in this palette" }).getByRole("listitem"),
  ).toContainText("Mephiston Red");
  await expect(main.getByRole("heading", { level: 2, name: "Armor" })).toBeVisible();

  await main.getByRole("button", { name: "Palette actions" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete palette" }).click();
  await page
    .getByRole("dialog", { name: `Delete "${name}"?` })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/palettes$/);
});

test("arranges a palette by keyboard and mouse", async ({ page }, info) => {
  const name = `E2E arrange ${info.project.name} ${Date.now()}`;
  const main = page.getByRole("main");
  const picker = page.getByRole("dialog", { name: "Add to palette" });
  const choose = () => picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  // dnd-kit's MouseSensor only starts after 5px of travel, and needs intermediate moves to track the pointer.
  const mouseDrag = async (
    handle: ReturnType<typeof page.locator>,
    target: ReturnType<typeof page.locator>,
  ) => {
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("Drag handle or target is not visible");
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + 10, { steps: 2 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
  };

  await page.goto("/palettes");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
  await page.goto("/palettes");
  await main.getByRole("button", { name: "New palette" }).click();
  const createSheet = page.getByRole("dialog", { name: "New palette" });
  await createSheet.getByLabel("Palette name").fill(name);
  await createSheet.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/palettes\/[^/]+$/);
  const paletteUrl = page.url();

  await page.goto("/paints/citadel-base-mephiston-red");
  await main.getByRole("button", { name: "Add to palette" }).click();
  await choose();
  await expect(page.getByText(`Added to ${name}`)).toBeVisible();

  await page.goto("/paints?q=evil sunz scarlet");
  await main.getByRole("button", { name: "Add to palette" }).click();
  await main.getByRole("checkbox", { name: "Select Evil Sunz Scarlet" }).first().check();
  await main.getByRole("searchbox", { name: "Search paints" }).fill("abaddon black");
  await main.getByRole("checkbox", { name: "Select Abaddon Black" }).first().check();
  const bar = main.getByRole("region", { name: "Selection" });
  await expect(bar.getByRole("status").first()).toHaveText("2 selected");
  await bar.getByRole("button", { name: "Add to palette" }).click();
  await choose();
  await expect(page.getByText(`Added 2 paints to ${name}`)).toBeVisible();

  await page.goto(paletteUrl);
  for (const group of ["Armor", "Trim"]) {
    await main.getByRole("button", { name: "New group" }).click();
    const sheet = page.getByRole("dialog", { name: "New group" });
    await sheet.getByLabel("Group name").fill(group);
    await sheet.getByRole("button", { name: "Create" }).click();
    await expect(main.getByRole("heading", { level: 2, name: group })).toBeFocused();
  }

  await main.getByRole("button", { name: "Groups for Mephiston Red" }).click();
  const membership = page.getByRole("dialog", { name: "Groups for Mephiston Red" });
  await membership.getByRole("checkbox", { name: "Armor" }).check();
  await expect(membership.getByRole("checkbox", { name: "Armor" })).toBeChecked();
  await membership.getByRole("button", { name: "Done" }).click();

  const allPaints = main.getByRole("list", { name: "Paints in this palette" });
  const paints = allPaints.getByRole("listitem");
  const armor = main.getByRole("region", { name: "Armor" });
  const trim = main.getByRole("region", { name: "Trim" });
  const groupHeadings = main.getByRole("heading", { level: 2 });
  await expect(paints).toHaveCount(3);
  await expect(paints.nth(0)).toContainText("Mephiston Red");
  await expect(paints.nth(1)).toContainText("Evil Sunz Scarlet");
  await expect(paints.nth(2)).toContainText("Abaddon Black");
  await expect(armor).toContainText("Mephiston Red");

  await main.getByRole("button", { name: "Arrange" }).click();
  await expect(main.getByRole("button", { name: "Done" })).toBeVisible();

  await allPaints.getByRole("button", { name: "Drag Mephiston Red" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText(
    /Dropped .* at position \d+ of \d+ in All paints\./,
  );
  await expect(paints.nth(0)).toContainText("Evil Sunz Scarlet");
  await expect(paints.nth(1)).toContainText("Mephiston Red");
  await expect(paints.nth(2)).toContainText("Abaddon Black");

  await mouseDrag(
    allPaints.getByRole("button", { name: "Drag Evil Sunz Scarlet" }),
    trim.getByText("No paints in this group yet"),
  );
  await expect(trim.getByRole("listitem")).toHaveCount(1);
  await expect(trim.getByRole("listitem").nth(0)).toContainText("Evil Sunz Scarlet");
  await expect(paints).toHaveCount(3);
  await expect(allPaints).toContainText("Evil Sunz Scarlet");

  await mouseDrag(
    armor.getByRole("button", { name: "Drag Mephiston Red" }),
    trim.getByRole("listitem").filter({ hasText: "Evil Sunz Scarlet" }),
  );
  await expect(armor).toContainText("No paints in this group yet");
  await expect(trim.getByRole("listitem")).toHaveCount(2);
  await expect(trim.getByRole("listitem").nth(0)).toContainText("Mephiston Red");
  await expect(trim.getByRole("listitem").nth(1)).toContainText("Evil Sunz Scarlet");

  await trim.getByRole("button", { name: "Move group Trim" }).click();
  await page
    .getByRole("dialog", { name: "Move group Trim" })
    .getByRole("button", { name: "Move up" })
    .click();
  await expect(groupHeadings).toHaveText(["All paints", "Trim", "Armor"]);

  await main.getByRole("button", { name: "Done" }).click();
  await expect(main.getByRole("button", { name: "Arrange" })).toBeVisible();
  await page.reload();
  await expect(paints).toHaveCount(3);
  await expect(paints.nth(0)).toContainText("Evil Sunz Scarlet");
  await expect(paints.nth(1)).toContainText("Mephiston Red");
  await expect(paints.nth(2)).toContainText("Abaddon Black");
  await expect(groupHeadings).toHaveText(["All paints", "Trim", "Armor"]);
  await expect(trim.getByRole("listitem")).toHaveCount(2);
  await expect(trim.getByRole("listitem").nth(0)).toContainText("Mephiston Red");
  await expect(trim.getByRole("listitem").nth(1)).toContainText("Evil Sunz Scarlet");
  await expect(armor).toContainText("No paints in this group yet");

  await main.getByRole("button", { name: "Palette actions" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete palette" }).click();
  await page
    .getByRole("dialog", { name: `Delete "${name}"?` })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/palettes$/);
});

test("keeps a dragged group under the pointer when picking it up shortens the page", async ({
  page,
}, info) => {
  const name = `E2E group drag ${info.project.name} ${Date.now()}`;
  const main = page.getByRole("main");
  const paintNames = ["Mephiston Red", "Evil Sunz Scarlet", "Abaddon Black", "Macragge Blue"];

  await page.goto("/palettes");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
  await page.goto("/palettes");
  await main.getByRole("button", { name: "New palette" }).click();
  const createSheet = page.getByRole("dialog", { name: "New palette" });
  await createSheet.getByLabel("Palette name").fill(name);
  await createSheet.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/palettes\/[^/]+$/);
  const paletteUrl = page.url();

  await page.goto("/paints");
  await main.getByRole("button", { name: "Add to palette" }).click();
  const search = main.getByRole("searchbox", { name: "Search paints" });
  for (const paint of paintNames) {
    await search.fill(paint.toLowerCase());
    await main
      .getByRole("checkbox", { name: `Select ${paint}` })
      .first()
      .check();
  }
  const bar = main.getByRole("region", { name: "Selection" });
  await expect(bar.getByRole("status").first()).toHaveText("4 selected");
  await bar.getByRole("button", { name: "Add to palette" }).click();
  await page
    .getByRole("dialog", { name: "Add to palette" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
  await expect(page.getByText(`Added 4 paints to ${name}`)).toBeVisible();

  await page.goto(paletteUrl);
  for (const group of ["Alpha", "Beta", "Gamma"]) {
    await main.getByRole("button", { name: "New group" }).click();
    const sheet = page.getByRole("dialog", { name: "New group" });
    await sheet.getByLabel("Group name").fill(group);
    await sheet.getByRole("button", { name: "Create" }).click();
    await expect(main.getByRole("heading", { level: 2, name: group })).toBeFocused();
  }
  for (const paint of paintNames) {
    await main.getByRole("button", { name: `Groups for ${paint}` }).click();
    const membership = page.getByRole("dialog", { name: `Groups for ${paint}` });
    for (const group of ["Alpha", "Beta"]) {
      await membership.getByRole("checkbox", { name: group }).check();
      await expect(membership.getByRole("checkbox", { name: group })).toBeChecked();
    }
    await membership.getByRole("button", { name: "Done" }).click();
  }
  const alpha = main.getByRole("region", { name: "Alpha" });
  const gamma = main.getByRole("region", { name: "Gamma" });
  const groupHeadings = main.getByRole("heading", { level: 2 });
  await expect(alpha.getByRole("listitem")).toHaveCount(4);
  await expect(main.getByRole("region", { name: "Beta" }).getByRole("listitem")).toHaveCount(4);

  await main.getByRole("button", { name: "Arrange" }).click();
  await expect(main.getByRole("button", { name: "Done" })).toBeVisible();

  // Scrolled this far, collapsing the groups shortens the page below the scroll position, so the browser clamps it.
  // Alpha sits just under the sticky app header, which would otherwise take the press.
  const header = await page.getByRole("banner").boundingBox();
  if (!header) throw new Error("The app header is not visible");
  await alpha.evaluate((section, headerBottom) => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    window.scrollBy(0, Math.min(0, section.getBoundingClientRect().top - headerBottom));
  }, header.y + header.height);
  const scrolledTo = await page.evaluate(() => window.scrollY);
  const handle = alpha.getByRole("button", { name: "Drag group Alpha" });
  const from = await handle.boundingBox();
  const groupBox = await alpha.boundingBox();
  if (!from || !groupBox) throw new Error("Alpha is not visible");
  const x = from.x + from.width / 2;
  const pressY = from.y + from.height / 2;
  const grabOffset = pressY - groupBox.y;
  // The preview only moves on pointer moves after the 5px activation, so the last move must come after it.
  const pointerY = pressY + 20;

  await page.mouse.move(x, pressY);
  await page.mouse.down();
  await page.mouse.move(x, pressY + 10, { steps: 2 });
  await page.mouse.move(x, pointerY, { steps: 2 });
  const preview = page.locator(".drag-preview");
  await expect(preview).toBeVisible();
  // Unless the collapse shortens the page below the scroll position, dnd-kit's own compensation works and this
  // journey wouldn't cover #23.
  await expect
    .poll(() =>
      page.evaluate(
        (y) => document.documentElement.scrollHeight - window.innerHeight < y,
        scrolledTo,
      ),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      Math.abs(((await preview.boundingBox())?.y ?? Infinity) - (pointerY - grabOffset)),
    )
    .toBeLessThanOrEqual(2);

  const to = await gamma.boundingBox();
  if (!to) throw new Error("Gamma is not visible");
  await page.mouse.move(x, to.y + grabOffset, { steps: 15 });
  await page.mouse.up();
  await expect(groupHeadings).toHaveText(["All paints", "Beta", "Gamma", "Alpha"]);

  await main.getByRole("button", { name: "Done" }).click();
  await main.getByRole("button", { name: "Palette actions" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete palette" }).click();
  await page
    .getByRole("dialog", { name: `Delete "${name}"?` })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/palettes$/);
});
