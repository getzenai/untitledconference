---
title: Better Auth Implementation Patterns
description: AI reference for implementing Better Auth in SvelteKit - client authentication, server validation, session management, and error handling patterns
tags:
  - authentication
  - better-auth
  - authClient
  - signIn
  - signUp
  - signOut
  - login
  - register
  - logout
  - password-reset
  - password-change
  - forgot-password
  - session
  - cookies
  - email-verification
  - organization
  - invitation
  - hooks
  - api-auth
  - session-validation
  - error-handling
  - client-side-auth
  - server-side-validation
---

# Better Auth Patterns - AI Reference

## Critical Rules

- NEVER use `auth.api.signInEmail()` for creating sessions - it only validates existing sessions
- ALWAYS use client-side `authClient` methods for authentication operations
- Session cookies automatically handled via `/api/auth/*` routes - no manual management
- Server-side `auth` only for validation/verification, not authentication

## Client-Side Authentication (`authClient`)

### Import

```typescript
import { authClient } from '$lib/auth-client';
import { createLogger } from '$lib/logger';
```

### Login Pattern

```typescript
// src/routes/(public)/login/+page.svelte
const { data: sessionData, error: signInError } = await authClient.signIn.email({
	email,
	password,
	rememberMe
});

if (signInError) {
	if (signInError.status === 403 && signInError.message?.includes('Email not verified')) {
		await goto(`/verify-email?email=${email}`);
		return;
	}
	errors.set({ _errors: [signInError.message || 'Invalid credentials.'] });
	return;
}

if (sessionData?.user) {
	if (!sessionData.user.emailVerified) {
		await goto('/verify-email');
		return;
	}
	await goto('/home');
}
```

### Registration Pattern

```typescript
// src/routes/(public)/register/+page.svelte
const { data: signUpData, error: signUpError } = await authClient.signUp.email({
	email,
	password,
	name: '' // Better Auth requires name field
});

if (signUpError) {
	if (signUpError.message?.includes('already') || signUpError.message?.includes('exists')) {
		errors.set({ _errors: ['User already exists. Use another email.'] });
	} else {
		errors.set({ _errors: [signUpError.message || 'Registration failed.'] });
	}
	return;
}

// Handle invitation if present
if (invitationCode) {
	await authClient.organization.acceptInvitation({ invitationId: invitationCode });
}

// Check email verification requirement
if (signUpData.user && !signUpData.user.emailVerified) {
	await goto('/verify-email');
} else {
	await goto('/home');
}
```

### Password Reset Flow

```typescript
// Forgot password - src/routes/(public)/forgot-password/+page.svelte
const { error: requestError } = await authClient.requestPasswordReset({
	email,
	redirectTo: `${origin}/reset-password`
});
// Always show success for security - don't reveal if email exists

// Reset password - src/routes/(public)/reset-password/+page.svelte
const { data: resetData, error: resetError } = await authClient.resetPassword({
	newPassword: password,
	token
});

if (resetError) {
	errors.set({ _errors: [resetError.message || 'This reset link is invalid or expired.'] });
	return;
}
```

### Password Change (Authenticated)

```typescript
// src/routes/(protected)/(with-sidebar)/settings/account/+page.svelte
// Returns result object, NOT destructured {data, error}
const result = await authClient.changePassword({
	currentPassword,
	newPassword,
	revokeOtherSessions
});

if (result?.error) {
	errors.set({ _errors: [result.error.message || 'Unable to update password.'] });
	return;
}
```

### Sign Out

```typescript
await authClient.signOut();
await goto('/login');
```

## Server-Side Session Validation (`auth`)

### Import

```typescript
import { auth } from '$lib/auth';
```

### Session Check in Hooks

```typescript
// src/hooks.server.ts
const requestHeaders = new Headers(event.request.headers);
const session = await auth.api.getSession({ headers: requestHeaders });

if (session?.session && session.user) {
	event.locals.user = session.user;
	event.locals.session = session.session;

	// Get active organization member
	if (session.session.activeOrganizationId) {
		const orgMembers = await auth.api.listMembers({
			headers: requestHeaders,
			query: { organizationId: session.session.activeOrganizationId }
		});
		const member = orgMembers?.find((m) => m.userId === session.user.id);
		if (member) {
			event.locals.organizationRole = member.role;
		}
	}
}
```

### Load Function Protection

```typescript
// src/routes/(protected)/+page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}
	// Protected page logic
};
```

### Organization API Calls (Server)

```typescript
// List organizations
const organizations = await auth.api.listOrganizations({ headers });

// Get active member
const activeMember = await auth.api.getActiveMember({ headers });

// List members
const members = await auth.api.listMembers({
	headers,
	query: { organizationId }
});

// Set active organization
await auth.api.setActiveOrganization({
	headers,
	body: { organizationId }
});
```

## Error Patterns

### Email Verification Required

```typescript
if (error.status === 403 && error.message?.includes('Email not verified')) {
	// Redirect to verification
}
```

### Duplicate User

```typescript
if (error.message?.includes('already') || error.message?.includes('exists')) {
	// User exists error
}
```

### Invalid Credentials

```typescript
if (error.message?.includes('Invalid')) {
	// Wrong password/email
}
```

### Token Expired

```typescript
if (error.message?.includes('expired') || error.message?.includes('invalid')) {
	// Reset token expired
}
```

## File References

- Client auth config: `src/lib/auth-client.ts`
- Server auth config: `src/lib/auth.ts`
- Login: `src/routes/(public)/login/+page.svelte`
- Register: `src/routes/(public)/register/+page.svelte`
- Password reset: `src/routes/(public)/reset-password/+page.svelte`
- Password change: `src/routes/(protected)/(with-sidebar)/settings/account/+page.svelte`
- Hooks: `src/hooks.server.ts`

## Common Mistakes

- Using `auth.api.signInEmail()` to create sessions (it only validates)
- Trying to use `authClient` methods on server (needs browser context)
- Manual cookie management (handled automatically)
- Using `$page` from `$app/stores` (deprecated, use `page` from `$app/state`)
- Not checking `emailVerified` status after login/signup
