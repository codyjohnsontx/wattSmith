import { expect, test } from "@playwright/test";

test("public demo exposes the complete analysis workspace", async ({ page }, testInfo) => {
  await page.goto("/demo");
  await page.getByRole("link", { name: /Analyze Riverfront Summer Criterium/ }).click();
  await expect(page.getByRole("heading", { name: "Riverfront Summer Criterium" })).toBeVisible();
  const powerToggle = page.getByRole("button", { name: "Power" });
  await expect(powerToggle).toHaveAttribute("aria-pressed", "true");
  await powerToggle.click();
  await expect(powerToggle).toHaveAttribute("aria-pressed", "false");
  for (const heading of ["Power zones", "Peak efforts", "First vs final third", "Data quality & calculations"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  const fiveMinuteRow = page.getByRole("row", { name: /5 min 237W 28:13/i });
  await fiveMinuteRow.getByRole("button", { name: "Select" }).click();
  await expect(page.getByRole("heading", { name: "Rehearse the 5 min peak" })).toBeVisible();
  await expect(page.getByText("225W · 84% FTP")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create unsaved workout" })).toBeVisible();
  await page.screenshot({ path: `output/playwright/demo-${testInfo.project.name}.png`, fullPage: true });
});
