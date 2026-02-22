# Screen 3: Home

**Route:** `/home`
**Step:** N/A (dashboard landing)

## Prerequisites

- User is authenticated
- With sidebar layout active

## Components

### Card Header

- **Selector:** `getByRole('heading', { name: /protected dashboard/i })`
- **Visible when:** always
- **Expected:** displays "Protected Dashboard" title and description

### Welcome Message

- **Selector:** `locator('p:has-text("Welcome")')`
- **Visible when:** session loaded
- **States:**
  - **Loading:** "Loading user information..." (when session is pending)
  - **Authenticated:** "Welcome, {email}!"
  - **Error:** "Could not load user session: {error}"
  - **Fallback:** "Welcome! (User data not available)"
- **Expected:** shows user email after session loads

### Logout Button

- **Selector:** `getByRole('button', { name: /logout/i })`
- **Visible when:** always
- **Disabled when:** session is pending
- **Action -- click:**
  1. Calls `authClient.signOut()`
  2. Redirects to `/login`
- **Expected:** logs user out and redirects

### Documents Button

- **Selector:** `getByRole('link', { name: /documents/i })`
- **Visible when:** always
- **Expected:** navigates to `/documents`

### CRUD Example Button

- **Selector:** `getByRole('link', { name: /crud example/i })`
- **Visible when:** always
- **Expected:** navigates to `/examples/crud`

### Toast Example Button

- **Selector:** `getByRole('link', { name: /toast example/i })`
- **Visible when:** always
- **Expected:** navigates to `/examples/toast`

### Drag Drop Example Button

- **Selector:** `getByRole('link', { name: /drag drop example/i })`
- **Visible when:** always
- **Expected:** navigates to `/examples/drag-drop`

## Verification Steps (MCP)

1. Navigate to `/home` (must be authenticated)
2. Take snapshot -- confirm "Protected Dashboard" heading visible
3. Confirm welcome message shows user email
4. Confirm logout button is visible
5. Confirm navigation buttons (Documents, CRUD, Toast, Drag Drop) are visible
6. Click logout -- confirm redirect to `/login`

## Observed Behavior

<!-- Filled in by the agent after MCP verification. One entry per verification run. -->
