# Screen 2: Register

**Route:** `/register`
**Step:** N/A (entry point)

## Prerequisites

- User is not authenticated (redirects to `/home` if already logged in)
- Optional: invitation code in URL query param `?invitation=CODE`

## Components

### Email Input

- **Selector:** `getByRole('textbox', { name: /email/i })`
- **Visible when:** always
- **Disabled when:** form is submitting
- **States:**
  - **Default:** empty, placeholder "Enter your email"
  - **With invitation:** shows helper "Please use the email address associated with your invitation"
- **Expected:** accepts email input

### Password Input

- **Selector:** `locator('input[name="password"]')`
- **Visible when:** always
- **Disabled when:** form is submitting
- **Expected:** accepts password with strength indicator, shows min/max length in placeholder

### Invitation Badge

- **Selector:** `locator('.bg-muted.rounded-lg')`
- **Visible when:** invitation code is present in URL
- **Hidden when:** no invitation code
- **Expected:** displays "You'll join an existing organization after registration."

### Error Alert

- **Selector:** `getByRole('alert')`
- **Visible when:** registration fails
- **Hidden when:** no errors
- **States:**
  - **Duplicate email:** "User already exists. Use another email."
  - **Generic error:** error message from server
- **Expected:** displays error message text

### Submit Button

- **Selector:** `getByRole('button', { name: /register/i })`
- **Visible when:** always
- **Disabled when:** form is submitting
- **States:**
  - **Default:** text "Register"
  - **Submitting:** text "Creating account...", disabled
- **Action -- click:**
  1. Calls `authClient.signUp.email()` with email, password
  2. If invitation present: attempts to accept invitation
  3. On success with verified email: navigate to `/home`
  4. On success with unverified email: navigate to `/verify-email`
  5. On failure: show error alert
- **Expected:** submits registration form

### Login Link

- **Selector:** `getByRole('link', { name: /login/i })`
- **Visible when:** always
- **Expected:** navigates to `/login`

## Verification Steps (MCP)

1. Navigate to `/register`
2. Take snapshot -- confirm email input, password input, submit button visible
3. Confirm "Login" link is visible at bottom
4. Navigate to `/register?invitation=test-code`
5. Take snapshot -- confirm invitation badge is visible
6. Confirm email helper text about invitation is shown

## Observed Behavior

<!-- Filled in by the agent after MCP verification. One entry per verification run. -->
