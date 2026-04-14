import { test, expect } from "@playwright/test";
import { registerUser, loginUser } from "./helpers/auth";
import path from "path";

function uniqueUser() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Register, login, upload a video, and land on the annotator page.
 */
async function setupAnnotator(page: import("@playwright/test").Page) {
  const username = uniqueUser();
  await registerUser(page, username, "TestPass123!");
  await loginUser(page, username, "TestPass123!");

  const videoPath = path.resolve("TestVideos", "nyan.mp4");
  await page.locator("#fileInput").setInputFiles(videoPath);
  await page.locator("#uploadBtn").click();

  await page.waitForURL(/\/annotate\/\d+\//, { timeout: 15_000 });
}

test.describe("Annotator Page", () => {
  test("loads with canvas and panels", async ({ page }) => {
    await setupAnnotator(page);
    await expect(page.locator("#annotationCanvas")).toBeVisible();
    await expect(page.locator("#bboxOverlay")).toBeVisible();
    await expect(page.locator(".right-panel")).toBeVisible();
    await expect(page.locator("#saveBtn")).toBeVisible();
  });

  test("panel tabs switch correctly", async ({ page }) => {
    await setupAnnotator(page);
    const tabs = ["Annotations", "Tracks", "Categories", "Files"];
    for (const tabName of tabs) {
      await page.locator(`.panel-tab:text("${tabName}")`).click();
      await expect(
        page.locator(`.panel-tab:text("${tabName}")`)
      ).toHaveClass(/active/);
    }
  });

  test("frame indicator displays", async ({ page }) => {
    await setupAnnotator(page);
    await expect(page.locator("#frameIndicator")).toContainText(/Frame \d+ \/ \d+/);
  });

  test("can create a new category", async ({ page }) => {
    await setupAnnotator(page);
    // Switch to Categories tab.
    await page.locator('.panel-tab:text("Categories")').click();
    await page.locator("#addCategoryBtn").click();

    // Fill the new category modal.
    await page.locator("#newCatName").fill("TestCategory");
    await page.locator("#newCatSaveBtn").click();

    // Verify the category appears in the list.
    await expect(page.locator("#catList")).toContainText("TestCategory");
  });

  test("can draw a bounding box on the canvas", async ({ page }) => {
    await setupAnnotator(page);
    // Wait for the overlay canvas to be ready.
    const canvas = page.locator("#bboxOverlay");
    await expect(canvas).toBeVisible();

    // Wait for frame to load (frame indicator shows non-zero).
    await expect(page.locator("#frameIndicator")).toContainText(/Frame \d+ \/ \d+/);

    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas bounding box not found");

    // Draw a rectangle by dragging on the canvas.
    const startX = box.x + box.width * 0.25;
    const startY = box.y + box.height * 0.25;
    const endX = box.x + box.width * 0.75;
    const endY = box.y + box.height * 0.75;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.mouse.up();

    // After drawing, the category picker modal should appear.
    const pickerModal = page.locator("#categoryPickerModal");
    await expect(pickerModal).toBeVisible();

    // Click the first category (default "object") to save the bbox.
    await pickerModal.locator(".cat-picker-item").first().click();

    // After selecting a category, the annotation count should increase.
    await expect(page.locator("#bboxCount")).not.toHaveText("0 annotations");
  });

  test("left and right activity bars are visible", async ({ page }) => {
    await setupAnnotator(page);
    await expect(page.locator(".activity-bar-left")).toBeVisible();
    await expect(page.locator(".activity-bar-right")).toBeVisible();
  });

  test("left panel collapse button toggles sidebar", async ({ page }) => {
    await setupAnnotator(page);
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible();
    await expect(sidebar).not.toHaveClass(/collapsed/);

    // Collapse
    await page.locator("#leftPanelCollapseBtn").click();
    await expect(sidebar).toHaveClass(/collapsed/);

    // Expand
    await page.locator("#leftPanelCollapseBtn").click();
    await expect(sidebar).not.toHaveClass(/collapsed/);
  });

  test("right activity bar icons switch right panel tabs", async ({ page }) => {
    await setupAnnotator(page);
    // Click the tracks icon in the right activity bar
    await page.locator('.activity-bar-right .activity-icon[data-panel="tracks"]').click();
    await expect(page.locator('.panel-tab[data-tab="tracks"]')).toHaveClass(/active/);

    // Click the categories icon
    await page.locator('.activity-bar-right .activity-icon[data-panel="categories"]').click();
    await expect(page.locator('.panel-tab[data-tab="categories"]')).toHaveClass(/active/);
  });
});
