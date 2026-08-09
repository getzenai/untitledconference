# Verify User Journey - Visual Verification with Browser MCP

**Screen specs:** `docs/user-journey-verification/screen-{1..6}-*.md`

Walk through each screen of the user journey using Playwright MCP to verify
that observed behavior matches the expected behavior documented in the screen spec files.

## Prerequisites

The dev server must be running:

```bash
curl -sf http://localhost:5173  # SvelteKit dev server
```

If not running, start it:

```bash
npm run dev  # Starts dev server on localhost:5173
```

## MCP Tool Selection

- **Prefer Playwright MCP** -- `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_network_requests`, `browser_take_screenshot`
- Use `browser_snapshot` (accessibility tree) for programmatic verification of UI elements
- Use `browser_take_screenshot` for visual evidence (supplementary)

## Step 1: Setup

1. Open the browser to `http://localhost:5173`
2. Take a snapshot to confirm the application loads

## Step 2: Verify Each Screen

For each screen (1 through 6), follow this process:

### 2a. Read the screen spec

Read `docs/user-journey-verification/screen-{n}-{name}.md` to understand:

- Expected UI elements and their selectors
- Expected behavior on page load
- Key user interactions to test
- Expected API calls
- Navigation targets

### 2b. Navigate to the screen

Navigate to the screen's route. Some screens require authentication:

- **Screens 1-2** (login, register): no auth needed
- **Screens 3-5** (home, documents, settings): must be logged in
- **Screen 6** (admin): must be logged in as admin

### 2c. Verify components

Take a `browser_snapshot` and check the accessibility tree for each component
listed in the spec's Components section. For each component, verify:

- Visibility matches the expected condition
- State matches the expected default state
- Selectors resolve to the expected elements

### 2d. Test interactions

Perform the primary interactions from the spec:

- Click buttons, fill forms, check navigation
- After each interaction, take a new snapshot to verify the UI updated
- Check `browser_network_requests` to verify expected API calls fired

### 2e. Record results

Update the "Observed Behavior" section in the screen spec file:

1. Add a new `### Run: {YYYY-MM-DD}` entry
2. Add an observation table:

```markdown
| Component     | Expected         | Observed       | Match  |
| ------------- | ---------------- | -------------- | ------ |
| {Component A} | {expected state} | {actual state} | yes/no |
```

3. List any discrepancies in the Discrepancies section

## Screen Routes

| Screen         | Route               | Auth Required |
| -------------- | ------------------- | ------------- |
| 1. Login       | `/login`            | No            |
| 2. Register    | `/register`         | No            |
| 3. Home        | `/home`             | Yes           |
| 4. Documents   | `/documents`        | Yes           |
| 5. Settings    | `/settings/account` | Yes           |
| 6. Admin Users | `/admin/users`      | Yes (admin)   |

## Step 3: Summary Report

After verifying all screens, compile a summary table:

```
| Screen | Route | Status | Discrepancies |
|--------|-------|--------|---------------|
| 1. Login | /login | PASS/FAIL | {count} |
| 2. Register | /register | PASS/FAIL | {count} |
| 3. Home | /home | PASS/FAIL | {count} |
| 4. Documents | /documents | PASS/FAIL | {count} |
| 5. Settings | /settings/account | PASS/FAIL | {count} |
| 6. Admin Users | /admin/users | PASS/FAIL | {count} |
```

For any FAIL results, list the specific discrepancies and their severity (High/Medium/Low).
