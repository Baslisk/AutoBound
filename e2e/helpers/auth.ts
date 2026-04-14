import { type Page, expect } from "@playwright/test";

/**
 * Register a new user via the registration form.
 * After success the browser lands on the login page.
 */
export async function registerUser(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto("/accounts/register/");
  await page.locator("#id_username").fill(username);
  await page.locator("#id_password1").fill(password);
  await page.locator("#id_password2").fill(password);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/accounts\/login\//);
}

/**
 * Log in an existing user via the login form.
 * After success the browser lands on the home page (/).
 */
export async function loginUser(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto("/accounts/login/");
  await page.locator("#id_username").fill(username);
  await page.locator("#id_password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
}
