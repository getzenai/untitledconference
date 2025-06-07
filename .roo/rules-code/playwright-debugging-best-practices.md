# Playwright Debugging Best Practices (for AI Agents)

## 1. Root Cause Analysis

- Timeouts are Symptoms: Analyze test code and application source (Svelte components, server logic) to understand why elements might be absent, the page is not in the expected state, or locators might be incorrect.
- Verify Application State Logic: Cross-reference test expectations with server-side data handling (e.g., database schemas, API responses) and client-side state update logic (e.g., Svelte stores, `form` prop updates from actions).

## 2. Locators & Assertions

- Analyze Rendered HTML (via Logs/Traces): If direct DOM inspection isn't possible, rely on logged HTML snippets or Playwright trace files (if accessible and parsable) to determine correct locators.
  - Identify reliable attributes (IDs, `data-testid`, roles, unique text content) from HTML output.
  - Correlate Svelte component structure (`*.svelte` files) with potential rendered HTML structure.
- Incremental Assertions: Programmatically build complex assertions. If an element isn't found, attempt to locate its parent or a known landmark element first by analyzing the expected HTML structure.
- Specific Assertions with Descriptive Messages: Use precise assertions (text, attributes) and include detailed failure messages in `expect(locator, "Reason...").toBeVisible();` to aid AI analysis of test failures.

## 3. Leveraging Playwright's Output & Configuration

- Trace Files (if accessible): If `playwright.config.ts` is configured for tracing (e.g., `use: { trace: 'on-first-retry' }`) and trace files are accessible, these are primary data sources. (AI may need tools/capabilities to parse these).
- Screenshots (if accessible): If screenshots are saved on failure (e.g., via `testInfo.attach` or trace config), and the AI can access/analyze them, they provide visual context.
- When a test is failing always read the contents of ./test-results to get a full picture about the failing tests and available locators

## 4. In-Test Debugging (Code-Based)

- URL Verification: `await expect(page, "URL check: " + page.url()).toHaveURL('/expected');`
- Log HTML Programmatically: Modify tests to log `innerHTML` of relevant sections if assertions fail:
  ```typescript
  // In test code, before a potentially failing assertion:
  if (!(await myExpectedElement.isVisible({ timeout: 100 }))) {
  	const html = await page
  		.locator('body')
  		.innerHTML()
  		.catch(() => 'Failed to get body HTML');
  	console.log(`DEBUG: Element not visible. Body HTML snapshot: ${html.substring(0, 500)}...`);
  	// Potentially write full HTML to a debug file if tool allows
  }
  ```
- Strategic `console.log()`: Insert logs in test scripts to trace execution flow and variable states.

## 5. Async Operations & UI Updates

- `page.waitForLoadState('networkidle')`: Crucial after actions triggering data refetching (e.g., SvelteKit's `invalidateAll`, form submissions) before asserting UI changes that depend on new data.
- Element State Waits: Use `await expect(locator).toBeEmpty();` or `await expect(locator).toBeEnabled();` to wait for specific, observable UI state changes.
- `page.waitForFunction()`: Can be used if a specific JavaScript condition on the page needs to be met, evaluable through the browser's execution context.

## 6. Test & Server Logic Correlation

- Test Isolation: Analyze tests to ensure they set up and tear down their own state, or that `beforeEach/All` correctly establishes preconditions.
- Server Response Logic: Analyze server-side code (`+page.server.ts`, API routes) to understand expected responses, especially for form actions (`fail` objects, redirects).
- SvelteKit `formAction` Matching: Verify that `formAction` values returned in `fail` objects by server actions (e.g., `?/actionName`) precisely match the conditions checked in Svelte component templates for displaying errors.

## 7. General Strategy for AI

- Iterative Refinement: If a test fails, analyze available data (logs, code), form a hypothesis, suggest a targeted modification to the test or application code, and re-run.
- Pattern Recognition: Identify common failure patterns (e.g., consistent locator issues, problems after specific types of actions).
- Focus on Deterministic Waits: Prefer waiting for specific conditions or states (`networkidle`, element properties) over fixed-time delays.
