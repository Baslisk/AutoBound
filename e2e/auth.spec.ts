import { test, expect } from "@playwright/test";
import { registerUser, loginUser } from "./helpers/auth";

/** Unique user per test run to avoid conflicts. */
function uniqueUser() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("Authentication", () => {
  test("register page loads with expected fields", async ({ page }) => {
    await page.goto("/accounts/register/");
    await expect(page.locator("h2")).toHaveText("Create Account");
    await expect(page.locator("#id_username")).toBeVisible();
    await expect(page.locator("#id_password1")).toBeVisible();
    await expect(page.locator("#id_password2")).toBeVisible();
  });

  test("register creates user and redirects to login", async ({ page }) => {
    const username = uniqueUser();
    await registerUser(page, username, "TestPass123!");
    await expect(page).toHaveURL(/\/accounts\/login\//);
  });

  test("login page loads with expected fields", async ({ page }) => {
    await page.goto("/accounts/login/");
    await expect(page.locator("h2")).toHaveText("Login");
    await expect(page.locator("#id_username")).toBeVisible();
    await expect(page.locator("#id_password")).toBeVisible();
  });

  test("login with valid credentials redirects to home", async ({ page }) => {
    const username = uniqueUser();
    await registerUser(page, username, "TestPass123!");
    await loginUser(page, username, "TestPass123!");
    await expect(page).toHaveURL("/");
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/accounts/login/");
    await page.locator("#id_username").fill("nonexistent");
    await page.locator("#id_password").fill("wrongpassword");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.locator(".alert-error")).toHaveText(
      "Invalid username or password."
    );
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/accounts\/login\//);
  });

  test("logout redirects to login", async ({ page }) => {
    const username = uniqueUser();
    await registerUser(page, username, "TestPass123!");
    await loginUser(page, username, "TestPass123!");
    // Django 5+ requires POST for logout.
    await page.evaluate(() => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/accounts/logout/";
      const csrfCookie = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrftoken="));
      if (csrfCookie) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "csrfmiddlewaretoken";
        input.value = csrfCookie.split("=")[1];
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    });
    await expect(page).toHaveURL(/\/accounts\/login\//);
  });
});
