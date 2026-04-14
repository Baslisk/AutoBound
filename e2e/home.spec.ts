import { test, expect } from "@playwright/test";
import { registerUser, loginUser } from "./helpers/auth";

function uniqueUser() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("Home Page", () => {
  test.beforeEach(async ({ page }) => {
    const username = uniqueUser();
    await registerUser(page, username, "TestPass123!");
    await loginUser(page, username, "TestPass123!");
  });

  test("displays title and upload form", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("AutoBound");
    await expect(page.locator("#dropZone")).toBeVisible();
    await expect(page.locator("#uploadBtn")).toBeVisible();
  });

  test("upload button is disabled by default", async ({ page }) => {
    await expect(page.locator("#uploadBtn")).toBeDisabled();
  });

  test("upload button enables after selecting a file", async ({ page }) => {
    const filePath = "TestVideos/nyan.mp4";
    await page.locator("#fileInput").setInputFiles(filePath);
    await expect(page.locator("#uploadBtn")).toBeEnabled();
  });
});
