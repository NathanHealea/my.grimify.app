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
