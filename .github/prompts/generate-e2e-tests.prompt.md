---
mode: agent
tools: ['playwright']
description: Generate Playwright E2E tests for AutoBound web application
---

# Generate E2E Tests for AutoBound

You are writing Playwright end-to-end tests for the AutoBound web annotation tool.

## Instructions

1. Navigate the AutoBound website at `http://localhost:8000` using the Playwright MCP tools.
2. Explore the functionality — register, login, upload a video, interact with the annotator.
3. Generate Playwright test code in TypeScript that covers the explored user flows.

## Conventions

- Place test files in the `e2e/` directory with `.spec.ts` extension.
- Import helpers from `e2e/helpers/auth.ts` for `registerUser()` and `loginUser()`.
- Use `uniqueUser()` to generate unique usernames per test.
- Use `@playwright/test` assertions (`expect`).
- Use relative URLs (baseURL is pre-configured).
- Each test should be independent — register a fresh user in `beforeEach`.

## Example

```typescript
import { test, expect } from "@playwright/test";
import { registerUser, loginUser } from "./helpers/auth";

function uniqueUser() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("My Feature", () => {
  test.beforeEach(async ({ page }) => {
    const username = uniqueUser();
    await registerUser(page, username, "TestPass123!");
    await loginUser(page, username, "TestPass123!");
  });

  test("works correctly", async ({ page }) => {
    // Your test code here
  });
});
```
