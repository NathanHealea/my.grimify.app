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
