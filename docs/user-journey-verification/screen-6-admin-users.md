# Screen 6: Admin Users

**Route:** `/admin/users`
**Step:** N/A

## Prerequisites

- User is authenticated with admin role
- Admin layout active

## Components

### Page Header

- **Selector:** `getByRole('heading', { name: /system admin dashboard/i })`
- **Visible when:** always
- **Expected:** displays "System Admin Dashboard" with Shield icon

### Statistics Cards

- **Selector:** grid of 3 cards (md:grid-cols-3)
- **Visible when:** always

#### Total Users Card

- **Selector:** `getByText(/total users/i)` card
- **Expected:** shows count of all users

#### Admin Users Card

- **Selector:** `getByText(/admin users/i)` card
- **Expected:** shows count of admin users

#### Banned Users Card

- **Selector:** `getByText(/banned users/i)` card
- **Expected:** shows count of banned users

### Create User Button

- **Selector:** `getByRole('button', { name: /create user/i })`
- **Visible when:** always
- **Action -- click:** opens create user dialog
- **Expected:** triggers dialog with email, password, role fields

### Invite User Button

- **Selector:** `getByRole('button', { name: /invite user/i })`
- **Visible when:** always
- **Action -- click:** opens invite user dialog
- **Expected:** triggers dialog with email and role fields

### Search Input

- **Selector:** `getByRole('textbox', { name: /search users/i })`
- **Visible when:** always
- **Expected:** filters user table in real-time as user types

### Users Table

- **Selector:** `getByRole('table')` (first table)
- **Visible when:** always
- **Columns:** Email, Name, Role, E-Mail Verified, Login, Created, Actions
- **Expected:** shows all system users with management controls

#### Role Select (per row)

- **Selector:** Select component per user row (not for current user)
- **Visible when:** user is not the current admin
- **Options:** "user", "admin"
- **Action -- change:** calls `updateUserRole()`, optimistic update
- **Expected:** changes user role

#### Email Verification Switch (per row)

- **Selector:** Switch component per user row
- **Visible when:** always
- **States:**
  - **Verified:** checked, green UserCheck icon, "Verified"
  - **Unverified:** unchecked, muted UserX icon, "Unverified"
  - **Loading:** spinning Loader2 icon, "Updating..."
- **Action -- toggle:** calls `updateEmailVerificationStatus()`
- **Expected:** toggles email verified status

#### Action Buttons (per row)

- **Visible when:** user is not the current admin
- **Buttons:**
  - **Impersonate:** outline button, opens confirm dialog, calls `authClient.admin.impersonateUser()`
  - **Ban/Unban:** outline button, "Ban" opens confirm dialog / "Unban" calls directly
  - **Delete:** ghost button, opens confirm dialog with destructive action
- **Expected:** admin management actions with confirmation

### System Invitations Card

- **Selector:** card with "System Invitations" or invitations table
- **Visible when:** always

#### Invitations Empty State

- **Selector:** `getByText(/no invitations sent yet/i)`
- **Visible when:** no invitations exist
- **Expected:** shows Mail icon and helper text

#### Invitations Table

- **Selector:** `getByRole('table')` (second table)
- **Visible when:** invitations exist
- **Columns:** Email, Role, Status, Invited By, Expires, Created, Actions
- **Status badges:**
  - **Accepted:** green badge
  - **Expired:** secondary badge
  - **Pending:** outline badge with Clock icon
- **Action -- regenerate (pending only):** refreshes invitation link
- **Expected:** displays all system invitations with status

## Verification Steps (MCP)

1. Navigate to `/admin/users` (must be authenticated as admin)
2. Take snapshot -- confirm "System Admin Dashboard" heading
3. Confirm 3 stats cards (Total Users, Admin Users, Banned Users) with counts
4. Confirm "Create User" and "Invite User" buttons visible
5. Confirm search input visible
6. Confirm users table with correct columns
7. Type in search box -- confirm table filters
8. Click "Create User" -- confirm dialog opens with email, password, role fields
9. Click "Invite User" -- confirm dialog opens with email and role fields

## Observed Behavior

<!-- Filled in by the agent after MCP verification. One entry per verification run. -->
