# Screen 1: Login

**Route:** `/login`
**Step:** N/A (entry point)

## Prerequisites

- User is not authenticated (redirects to `/home` if already logged in)

## Components

### Email Input

- **Selector:** `getByRole('textbox', { name: /email/i })`
- **Visible when:** always
- **Disabled when:** form is submitting
- **States:**
  - **Default:** empty, placeholder "Enter your email"
  - **Filled:** shows email value
- **Expected:** accepts email input, bound to form data

### Password Input

- **Selector:** `locator('input[name="password"]')`
- **Visible when:** always
- **Disabled when:** form is submitting
- **Expected:** accepts password input, masked

### Forgot Password Link

- **Selector:** `getByRole('link', { name: /forgot your password/i })`
- **Visible when:** always
- **Expected:** navigates to `/forgot-password`

### Remember Me Checkbox

- **Selector:** `getByRole('checkbox', { name: /remember me/i })`
- **Visible when:** always
- **Disabled when:** form is submitting
- **States:**
  - **Default:** checked (true)
- **Expected:** toggles remember me preference

### Error Alert

- **Selector:** `getByRole('alert')`
- **Visible when:** login fails (invalid credentials)
- **Hidden when:** no errors
- **Expected:** displays error message text

### Submit Button

- **Selector:** `getByRole('button', { name: /log ?in/i })`
- **Visible when:** always
- **Disabled when:** form is submitting
- **States:**
  - **Default:** text "Login"
  - **Submitting:** text "Logging in...", disabled
- **Action -- click:**
  1. Calls `authClient.signIn.email()` with email, password, rememberMe
  2. On success: navigate to `/home` (or returnTo param)
  3. On unverified email: navigate to `/verify-email`
  4. On failure: show error alert
- **Expected:** submits login form

### Register Link

- **Selector:** `getByRole('link', { name: /register/i })`
- **Visible when:** always
- **Expected:** navigates to `/register`

## Verification Steps (MCP)

1. Navigate to `/login`
2. Take snapshot -- confirm email input, password input, submit button visible
3. Confirm "Remember me" checkbox is checked by default
4. Confirm "Forgot your password?" link is visible
5. Confirm "Register" link is visible at bottom
6. Fill email and password with invalid credentials, click submit
7. Take snapshot -- confirm error alert appears
8. Confirm submit button text returns to "Login" after error

## Observed Behavior

<!-- Filled in by the agent after MCP verification. One entry per verification run. -->
