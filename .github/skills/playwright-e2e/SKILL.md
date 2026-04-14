---
name: playwright-e2e
description: "Run, write, and debug Playwright end-to-end browser tests for the AutoBound web app. Use when: e2e test, browser test, playwright, UI test, integration test, user flow, smoke test, visual testing."
---

# Playwright E2E Tests

## When to Use

Use this skill when running, writing, or debugging browser-based end-to-end tests for the AutoBound web application. Covers authentication flows, home page interactions, and annotator canvas/panel testing.

## Prerequisites

- **Node.js ≥ 18** and **npm** (installed via conda or system)
- Install dependencies: `npm install`
- Install browser: `npx playwright install chromium`

## Test Architecture

| File | Tests | Covers |
|---|---|---|
| `e2e/auth.spec.ts` | 7 | Register, login, logout, error states, redirects |
| `e2e/home.spec.ts` | 3 | Home page UI, upload form, file selection |
| `e2e/annotator.spec.ts` | 5 | Canvas, panels, tabs, categories, bbox drawing |
| `e2e/helpers/auth.ts` | — | Shared `registerUser()` / `loginUser()` helpers |

## Commands

```bash
# Run all E2E tests (auto-starts Django server)
npm run test:e2e

# Run in headed mode (visible browser)
npm run test:e2e:headed

# Run with Playwright UI mode (interactive)
npm run test:e2e:ui

# Run a single test file
npx playwright test e2e/auth.spec.ts

# Run a single test by name
npx playwright test -g "login with valid credentials"

# Show HTML report
npm run test:e2e:report
```

## Writing New Tests

New test files go in the `e2e/` directory with the `.spec.ts` extension.

```typescript
import { test, expect } from "@playwright/test";
import { registerUser, loginUser } from "./helpers/auth";

function uniqueUser() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("Feature Name", () => {
  test.beforeEach(async ({ page }) => {
    const username = uniqueUser();
    await registerUser(page, username, "TestPass123!");
    await loginUser(page, username, "TestPass123!");
  });

  test("does something", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("AutoBound");
  });
});
```

### Key Patterns

- Use `uniqueUser()` to avoid username collisions (in-memory DB is shared within a run).
- Use the `registerUser` / `loginUser` helpers from `e2e/helpers/auth.ts`.
- `baseURL` is configured in `playwright.config.ts` — use relative paths in `page.goto()`.
- The Django server is auto-started by Playwright's `webServer` config.
- In-memory SQLite means each full test run starts with a fresh empty database.

## Playwright MCP

The Playwright MCP server is configured in `.vscode/mcp.json`. It enables AI-assisted test generation and debugging through VS Code Copilot agent mode.

To use: open Copilot agent mode and reference the `@playwright` tool or the `generate-e2e-tests` prompt.

## Debugging

```bash
# Run with Playwright inspector (step-through debugging)
npx playwright test --debug

# Run headed to see the browser
npx playwright test --headed

# View trace files after a retry failure
npx playwright show-trace test-results/*/trace.zip
```

- **Traces**: Captured on first retry (configured in `playwright.config.ts`).
- **Screenshots**: Taken on failure, saved in `test-results/`.
- **HTML Report**: Run `npm run test:e2e:report` to view results in browser.

## Key Routes

| Route | Purpose |
|---|---|
| `/accounts/login/` | Login form |
| `/accounts/register/` | Registration form |
| `/accounts/logout/` | Logout (redirects to login) |
| `/` | Home page (requires auth) |
| `/annotate/<id>/` | Annotator page |
| `/api/` | DRF API root |
| `/api/export/<id>/` | COCO JSON export |
| `/api/import/` | COCO JSON import |

## Django Server

- Auto-started by Playwright `webServer` config in `playwright.config.ts`.
- Runs `migrate --run-syncdb` before `runserver` to ensure schema is ready.
- Uses in-memory SQLite (`:memory:`) — fresh DB each server start.
- Default Category (pk=1, name="object") auto-created on first upload/import.
