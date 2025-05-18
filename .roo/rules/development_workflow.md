## Development Workflow Patterns

- **Version Control:** Use Git for version control.
- **Collaboration Platform:** Use GitHub CLI (`gh`) or the Github MCP server for interacting with GitHub (e.g., creating PRs).

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
      - Create a Pull Request using the GitHub CLI (`gh pr create --title "..." --body "..."`) or the Github MCP Server.
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
