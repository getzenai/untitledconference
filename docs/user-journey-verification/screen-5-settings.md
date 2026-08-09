# Screen 5: Settings

**Route:** `/settings/account`, `/settings/organization/**`
**Step:** N/A

## Prerequisites

- User is authenticated
- With sidebar layout active

## Components (Account: `/settings/account`)

### Page Header

- **Selector:** `getByRole('heading', { name: /account settings/i })`
- **Visible when:** always
- **Expected:** displays "Account settings" title

### Profile Overview Card

- **Selector:** first Card component
- **Visible when:** always

#### Email Display

- **Selector:** `getByText(user.email)`
- **Visible when:** always
- **Expected:** shows user email address

#### Verification Badge

- **Selector:** `locator('.rounded-full')` near email
- **Visible when:** always
- **States:**
  - **Verified:** green badge "Verified"
  - **Unverified:** amber badge "Unverified"
- **Expected:** reflects email verification status

#### Resend Verification Link

- **Selector:** `getByRole('link', { name: /resend verification/i })`
- **Visible when:** email is not verified
- **Hidden when:** email is verified
- **Expected:** links to `/verify-email`

#### Role Display

- **Selector:** `getByText(/role/i)` section
- **Visible when:** always
- **Expected:** shows capitalized user role

#### Member Since

- **Selector:** `getByText(/member since/i)` section
- **Visible when:** always
- **Expected:** shows formatted account creation date

### Change Password Card

- **Selector:** second Card component
- **Visible when:** always

#### Current Password Input

- **Selector:** `locator('input[name="currentPassword"]')`
- **Visible when:** always
- **Disabled when:** form is submitting
- **Expected:** accepts current password

#### New Password Input

- **Selector:** `locator('input[name="newPassword"]')`
- **Visible when:** always
- **Disabled when:** form is submitting
- **Expected:** accepts new password with strength indicator

#### Password Requirements

- **Selector:** `locator('ul')` within password card
- **Visible when:** always
- **Expected:** lists password requirements including "Different from your current password"

#### Revoke Sessions Checkbox

- **Selector:** `getByRole('checkbox', { name: /sign out of other sessions/i })`
- **Visible when:** always
- **Disabled when:** form is submitting
- **Expected:** toggles session revocation preference

#### Error Alert

- **Selector:** `getByRole('alert')`
- **Visible when:** password change fails
- **Expected:** displays error message

#### Success Message

- **Selector:** `locator('[aria-live="polite"]')`
- **Visible when:** password change succeeds
- **Expected:** displays success text

#### Submit Button

- **Selector:** `getByRole('button', { name: /update password/i })`
- **Visible when:** always
- **Disabled when:** form is submitting
- **States:**
  - **Default:** "Update password"
  - **Submitting:** "Updating password..."
- **Action -- click:**
  1. Calls `authClient.changePassword()`
  2. On success: clears fields, shows success message, toast notification
  3. On failure: shows error alert, toast notification
- **Expected:** updates password

## Components (Organization: `/settings/organization/[slug]`)

### Organization Detail

- **Visible when:** user has an active organization
- **Expected:** shows org name, members list, pending invitations

### Member Management Actions

- POST `inviteMember`, `updateMemberRole`, `removeMember`, `cancelInvitation`, `leaveOrganization`, `acceptInvitation`, `rejectInvitation`

## Verification Steps (MCP)

1. Navigate to `/settings/account` (must be authenticated)
2. Take snapshot -- confirm "Account settings" heading
3. Confirm email and verification badge are visible
4. Confirm role and member since date are displayed
5. Confirm change password form with current/new password fields
6. Confirm "Update password" button is visible
7. Fill and submit password form with invalid current password
8. Take snapshot -- confirm error alert appears

## Observed Behavior

<!-- Filled in by the agent after MCP verification. One entry per verification run. -->
