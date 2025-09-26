---
title: Formsnap + Superforms Client-Only (SPA Mode)
description: AI reference for implementing client-side forms with Superforms in SPA mode - authentication forms, async handling, store management in Svelte 5
tags:
  - forms
  - formsnap
  - superforms
  - spa
  - client-only
  - client-side
  - authentication-forms
  - login-form
  - register-form
  - password-form
  - validation
  - zod
  - zodClient
  - async
  - svelte-5
  - store-updates
  - formData
  - errors
  - cancel
  - onSubmit
  - checkbox
  - real-time-validation
  - better-auth-forms
  - spa-mode
---

# Formsnap + Superforms Client-Only (SPA Mode) - AI Reference

## When to Use Client-Only

- Authentication forms (login, register, password reset)
- Forms calling Better Auth client methods
- Real-time validation without server round-trips
- Forms that don't need progressive enhancement
- When all logic can be handled client-side

## CRITICAL RULES

```typescript
// ❌ NEVER
defaults(zodClient(schema)) // TypeScript errors
defaults(schema, zodClient) // Wrong signature
$formData/$errors in async // state_referenced_locally error
onSubmit without cancel() // Submits to server
{ setError } = form // Doesn't exist client-side
<Form.Errors /> // Component doesn't exist

// ✅ ALWAYS
{ email: '', password: '' } // Plain object init
SPA: true // Prevent server submission
cancel() // First line in onSubmit
errors.set({ _errors: [] }) // Correct error setting
{ formData: formValues } // Rename to avoid confusion
```

## Complete Pattern

### Without Server File

```typescript
// src/routes/(public)/login/+page.svelte
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { authClient } from '$lib/auth-client';
  import { createLogger } from '$lib/logger';
  import { goto } from '$app/navigation';
  import { page } from '$app/state'; // NOT $app/stores
  import { loginSchema } from './schema';

  const logger = createLogger('LoginClient');

  // Initialize with plain object matching schema shape
  const form = superForm(
    { email: '', password: '', rememberMe: true },
    {
      validators: zodClient(loginSchema),
      SPA: true, // CRITICAL: Prevents server submission
      onSubmit: async ({ formData: formValues, cancel }) => {
        // CRITICAL: Always cancel default submission
        cancel();

        // Extract form data from formValues (the parameter)
        const email = formValues.get('email') as string;
        const password = formValues.get('password') as string;
        const rememberMe = formValues.get('rememberMe') === 'on';

        try {
          // Client-side operation
          const { data, error } = await authClient.signIn.email({
            email,
            password,
            rememberMe
          });

          if (error) {
            // Use .set() not $errors in async
            errors.set({ _errors: [error.message] });
            return;
          }

          await goto('/home');
        } catch (err) {
          errors.set({ _errors: ['Unexpected error'] });
        }
      }
    }
  );

  const { form: formData, enhance, submitting, errors } = form;
</script>

<form use:enhance>
  <Form.Field {form} name="email">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Email</Form.Label>
        <Input {...props} type="email" bind:value={$formData.email} disabled={$submitting} />
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>

  <Form.Field {form} name="rememberMe">
    <Form.Control>
      {#snippet children({ props })}
        <Checkbox {...props} bind:checked={$formData.rememberMe} disabled={$submitting} />
        <Form.Label>Remember me</Form.Label>
      {/snippet}
    </Form.Control>
  </Form.Field>

  {#if $errors._errors}
    <div class="text-destructive">
      {#each $errors._errors as error}
        <p>{error}</p>
      {/each}
    </div>
  {/if}

  <Form.Button disabled={$submitting}>
    {$submitting ? 'Logging in...' : 'Login'}
  </Form.Button>
</form>
```

### With URL Parameters

```typescript
// src/routes/(public)/reset-password/+page.svelte
import { page } from '$app/state';

// Get URL params with $derived
const token = $derived(page.url.searchParams.get('token') || '');

const form = superForm(
	{ password: '', token: '' },
	{
		validators: zodClient(resetPasswordSchema),
		SPA: true,
		onSubmit: async ({ formData: formValues, cancel }) => {
			cancel();

			const password = formValues.get('password') as string;
			const token = formValues.get('token') as string;

			const { error } = await authClient.resetPassword({
				newPassword: password,
				token
			});

			if (error) {
				errors.set({ _errors: [error.message] });
			}
		}
	}
);

// Set token value when available
$effect(() => {
	if (token) {
		$formData.token = token;
	}
});
```

## ERROR HANDLING - CRITICAL

```typescript
// ❌ WRONG - Common failures
const { setError } = form; // setError doesn't exist on client
$errors._errors = ['msg']; // $ in async = "state_referenced_locally"
<Form.Errors /> // Component doesn't exist
setError(form, '', 'msg'); // setError only for server-side

// ✅ RIGHT - Client-side error patterns
const { errors } = form; // destructure errors store
// Form-level errors
errors.set({ _errors: ['Form error message'] });
errors.update(e => ({ ...e, _errors: ['Another error'] }));
// Field-level errors
errors.set({ email: ['Invalid email'], password: ['Too short'] });
// Display
{#if $errors._errors}{#each $errors._errors as e}<p class="text-destructive">{e}</p>{/each}{/if}
<Form.FieldErrors /> // Per-field errors auto-display

// Error patterns by scenario
signUpError?.message?.includes('exists') && errors.set({ _errors: ['User already exists'] });
!data && errors.set({ _errors: ['Operation failed'] });
catch(e) { errors.set({ _errors: ['Unexpected error'] }); }
```

### Store Updates in Async

```typescript
// ❌ $store in async = Svelte 5 error
async () => {
	$formData.x = 'y';
	$errors._errors = ['z'];
};

// ✅ Store methods in async
const { form: formData, errors, submitting } = form;
async () => {
	formData.set({ x: 'y' });
	errors.set({ _errors: ['z'] });
	// submitting auto-managed by superforms
};
```

## Initial Values for Common Schemas

```typescript
// Login
{ email: '', password: '', rememberMe: true }

// Register
{ email: '', password: '', invitationCode: undefined }

// Forgot Password
{ email: '' }

// Reset Password
{ password: '', token: '' }

// Change Password
{ currentPassword: '', newPassword: '', revokeOtherSessions: false }
```

## Checkbox Binding

```typescript
// Initial value MUST be boolean, not undefined
{ rememberMe: true } // ✅
{ rememberMe: undefined } // ❌ Will cause "props_invalid_value" error

// In form
<Checkbox bind:checked={$formData.rememberMe} />
```

## With Minimal Server File (When Needed)

```typescript
// +page.server.ts (only if you need server data)
export const load: PageServerLoad = async () => {
	const form = await superValidate(zod(schema));
	return { form };
};

// +page.svelte
const form = superForm(data.form, {
	validators: zodClient(schema),
	SPA: true, // Still use SPA mode
	onSubmit: async ({ formData, cancel }) => {
		cancel();
		// Client-side logic
	}
});
```

## File References

- Login: `src/routes/(public)/login/+page.svelte`
- Register: `src/routes/(public)/register/+page.svelte`
- Forgot Password: `src/routes/(public)/forgot-password/+page.svelte`
- Reset Password: `src/routes/(public)/reset-password/+page.svelte`
- Account Settings: `src/routes/(protected)/(with-sidebar)/settings/account/+page.svelte`

## Common Errors and Fixes

### "props_invalid_value"

```typescript
// Error: Cannot do `bind:checked={undefined}`
// Fix: Initialize with boolean
{
	rememberMe: true;
} // not undefined
```

### "store_invalid_scoped_subscription"

```typescript
// Error: Cannot subscribe to stores in async
// Fix: Use .set() and .update()
errors.set({ _errors: ['message'] });
```

### TypeScript errors with defaults()

```typescript
// Error: Type mismatch with defaults()
// Fix: Use plain object
superForm({ email: '', password: '' }, ...)
// NOT: superForm(defaults(schema), ...)
```

### Missing form values

```typescript
// Error: form field is undefined
// Fix: Include ALL schema fields in initial object
{ email: '', password: '', rememberMe: true } // All fields
```

## Decision Tree

- Need database access? → Use server actions
- Calling Better Auth client? → Use client-only
- Need progressive enhancement? → Use server actions
- Simple validation only? → Use client-only
- File uploads? → Use server actions
- Real-time validation? → Use client-only
