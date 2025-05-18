## Testing Patterns

- **E2E Tests:** Use Playwright (setup present in `e2e/`) for end-to-end testing
- **Unit/Integration Tests:** Consider Vitest for testing individual components or backend logic modules if needed. Focus on testing core logic like API interactions and data processing.
- **Test Coverage:** Aim for good coverage of critical paths and core functionality. Run tests frequently (`npm test` or specific Playwright commands).

### Playwright Best Practices

See: https://playwright.dev/docs/best-practices

- **Test User-Visible Behavior:**

  - Focus on testing what users see and interact with
  - Avoid testing implementation details
  - Test against rendered output rather than internal state

- **Test Isolation:**

  - Each test should be completely independent
  - Use `beforeEach` hooks for common setup
  - Avoid test dependencies
  - Consider using setup projects for shared state (e.g., authentication)

- **Locator Best Practices:**

  - Use built-in locators with auto-waiting capabilities
  - Prefer user-facing attributes over CSS/XPath selectors
  - Chain and filter locators for precise element selection
  - Use the Playwright Inspector or VS Code extension for generating reliable locators, ask the user to help out if you can't find the correct locator.
  - Note that Shadcn `button` components automatically render as `a` elements when provided with an `href` prop

- **Assertions:**

  - Use web-first assertions that auto-wait for conditions
  - Implement soft assertions for non-critical checks
  - Focus on user-visible outcomes

- **Browser Testing:**

  - Test across all major browsers (Chromium, Firefox, WebKit)
  - Use device emulation for mobile testing
  - Configure browser-specific projects in `playwright.config.ts`

- **CI/CD Integration:**

  - Run tests on every commit and PR
  - Use Linux for CI environments
  - Optimize browser installations (only install needed browsers)
  - Consider test sharding for parallel execution

- **Debugging:**

  - Use Playwright Inspector for step-by-step debugging
  - Leverage trace viewer for CI failures
  - Use VS Code extension for enhanced debugging experience

- **Performance:**
  - Keep Playwright dependencies up to date
  - Use TypeScript for better IDE integration
  - Implement proper test isolation to prevent cascading failures
  - Use parallel test execution where appropriate
