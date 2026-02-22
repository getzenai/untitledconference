Run the comprehensive test suite using `npm run test:all` (which calls `scripts/test-all.sh`). This starts the Docker test DB if not running, then executes all test suites in order:

1. Lint (Prettier + ESLint)
2. Type check (svelte-check)
3. Build
4. Unit tests
5. Integration tests
6. E2E tests (Playwright)

Use `Bash(npm run test:all, timeout: 300000)` to run with a 5-minute timeout.

Report a summary table showing which suites passed and which failed. If any suite fails, investigate the failures and fix them.
