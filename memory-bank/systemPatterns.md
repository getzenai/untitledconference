# System Patterns _Optional_

This file documents recurring patterns and standards used in the project.
It is optional, but recommended to be updated as the project evolves.

## Coding Patterns

- **Language:** TypeScript
- **Framework:** SvelteKit
- **UI Components:** Shadcn UI (see UI Components)
- **Styling:** Tailwind CSS
- **Linting/Formatting:** ESLint, Prettier (using project's config files: `eslint.config.js`, `.prettierrc`)
- **API Interaction:** Use standard `fetch` API for backend calls.
- **Error Handling:** Implement consistent error handling for API calls and backend logic.
- **Modularity:** Break down UI and logic into reusable Svelte components.
- **HTML Rendering:** When rendering HTML from external sources (like Markdown conversion), sanitize using `DOMPurify.sanitize()` before using `{@html}`.

### UI Components

- accordion - `src/lib/components/ui/accordion`
- alert - `src/lib/components/ui/alert`
- alert-dialog - `src/lib/components/ui/alert-dialog`
- avatar - `src/lib/components/ui/avatar`
- badge - `src/lib/components/ui/badge`
- breadcrumb - `src/lib/components/ui/breadcrumb`
- button - `src/lib/components/ui/button`
- card - `src/lib/components/ui/card`
- checkbox - `src/lib/components/ui/checkbox`
- dialog - `src/lib/components/ui/dialog`
- drawer - `src/lib/components/ui/drawer`
- dropdown-menu - `src/lib/components/ui/dropdown-menu`
- form - `src/lib/components/ui/form`
- input - `src/lib/components/ui/input`
- label - `src/lib/components/ui/label`
- menubar - `src/lib/components/ui/menubar`
- pagination - `src/lib/components/ui/pagination`
- progress - `src/lib/components/ui/progress`
- radio-group - `src/lib/components/ui/radio-group`
- resizable - `src/lib/components/ui/resizable`
- scroll-area - `src/lib/components/ui/scroll-area`
- select - `src/lib/components/ui/select`
- separator - `src/lib/components/ui/separator`
- sheet - `src/lib/components/ui/sheet`
- skeleton - `src/lib/components/ui/skeleton`
- slider - `src/lib/components/ui/slider`
- sonner - `src/lib/components/ui/sonner`
- switch - `src/lib/components/ui/switch`
- table - `src/lib/components/ui/table`
- tabs - `src/lib/components/ui/tabs`
- textarea - `src/lib/components/ui/textarea`
- tooltip - `src/lib/components/ui/tooltip`

## Architectural Patterns

- **API Routes:** Use SvelteKit API routes (`src/routes/api/...`) for backend logic
- **Server-Side Logic:** Keep external API calls and sensitive logic within server-side code (`+page.server.ts`, API routes) rather than the client-side.

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

## Development Workflow Patterns

- **Version Control:** Use Git for version control.
- **Collaboration Platform:** Use GitHub CLI (`gh`) for interacting with GitHub (e.g., creating PRs).
- **Post-Iteration:** Follow checklist in `implementation-plan.md`, including `git add`, `git commit`, `git push`, and `gh pr create` where applicable.

[2025-03-30 19:21:12] - Added Development Workflow Patterns section confirming `git` and `gh` CLI usage.

[2025-03-30 19:39:08] - Added HTML Rendering pattern using DOMPurify.

**Development Principles:**

- **Feature-Sliced Development:** Implement end-to-end features incrementally.
- **Test-Driven Approach:** Write tests (primarily E2E with Playwright, supplemented by API/unit tests where valuable) for each feature slice. Ensure tests pass (`npm run test:e2e`, `npm test`) and the build completes (`npm run build`) after each feature. Rely heavily on automated tests (Playwright, terminal commands) and minimize requests for manual testing.
- **Code Quality:** Maintain readable, professional code. Use linters/formatters. Refactor as needed.
- **Configuration:** Store API keys and sensitive data in `.env` (acknowledged as pre-populated).
- **Automation Focus:** Prefer terminal commands that run non-interactively (e.g., use flags like `--yes` or avoid commands that require manual prompts) to facilitate automation.
- **Git Workflow:**

  - Before starting a feature, create a dedicated feature branch from the latest `main` (e.g., `git checkout main && git pull && git checkout -b feature/my-feature`).
  - Commit changes frequently to the feature branch.
  - Follow the Post-Iteration Checklist before creating a Pull Request.

- **Post-Iteration Checklist & PR Workflow (Run on Feature Branch):**
  1.  **Technical Checks:**
      - Run `npm run build` and ensure it completes without errors.
      - Run `npm run test:unit` (or equivalent) and ensure all tests pass.
      - Run `npm run test:e2e` and ensure all end-to-end tests pass.
      - Run `npm run lint:format` to apply consistent code formatting and lint. Fix any reported linting errors.
  2.  **Documentation:**
      - Update `README.md` with any new relevant information (e.g., setup steps, new commands, description of the app and its features).
      - Update Memory Bank files (`activeContext.md`, `progress.md`, etc.).
  3.  **Commit & Push:**
      - Run `npm run format` once more.
      - Make sure you are on a feature branch.
      - Stage relevant changes (`git add <specific files...>`). Don't use `git add .`. If in doubt check `git status`.
      - Create a commit for the feature (`git commit -m "..."`).
      - Push the feature branch (`git push -u origin <branch-name>`).
  4.  **Pull Request & Review Cycle:**
      - Create a Pull Request using the GitHub CLI (`gh pr create --title "..." --body "..."`).
      - **Review:** Review the files you changed yourself by reading them again for a review. Focus on clean code, potential bugs, security, and alignment with requirements.
      - Add the review findings as comments on the PR (e.g., using `gh pr review --comment --body "..."`).
      - **Address Feedback:** If issues are found, address them by committing and pushing fixes to the _same feature branch_.
      - Repeat the review/fix cycle until the PR is approved.
  5.  **Merge & Cleanup:**
      - Once approved, merge the Pull Request using a squash merge & delete branch (`gh pr merge --squash --delete-branch`).
      - Checkout the main branch (`git checkout main`).
      - Pull the latest changes (`git pull origin main`).
      - Delete the local feature branch (`git branch -d <branch-name>`).
- **Root Cause Analysis:** Avoid workarounds. Debug issues thoroughly to solve the root cause. Ask for support if blocked.
- **Avoid Change Comments:** Don't add comments about changes (e.g., "Added X", "Modified Y") as these comments will clutter the target files. Let version control track the changes.
- **Code Cleanup:** Remove unused code rather than commenting it out. Let version control track the history of removed code.
