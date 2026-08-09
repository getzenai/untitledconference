Run visual verification for user journey screens affected by recent changes.

1. Check which screen spec files were modified: `git diff --name-only HEAD -- docs/user-journey-verification/screen-*.md`
2. If no specs were modified, check which source files changed (`git diff --name-only HEAD`) and identify affected screens using the file-to-screen mapping in CLAUDE.md "Spec-First Workflow" section
3. Verify the dev server is running: `curl -sf http://localhost:5173`
4. For each affected screen spec:
   a. Read the spec file (`docs/user-journey-verification/screen-{n}-{name}.md`)
   b. Follow the Verification Steps (MCP) section using Playwright MCP
   c. For each component in the Components section, verify visibility conditions and test actions
   d. Check network requests match expected API calls
   e. Fill in the Observed Behavior table with today's date, recording observed vs expected for each component
   f. Note any discrepancies in the Discrepancies section
5. Report a summary table: screen name, status (PASS/FAIL), number of discrepancies
