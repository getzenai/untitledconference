---
title: Formsnap + Superforms with Server Actions
description: AI reference for implementing forms with SvelteKit server actions - database operations, validation, CRUD patterns, and progressive enhancement
tags:
  - forms
  - formsnap
  - superforms
  - server-actions
  - page-actions
  - crud
  - database
  - drizzle
  - validation
  - zod
  - schema
  - superValidate
  - fail
  - redirect
  - progressive-enhancement
  - form-submission
  - error-handling
  - organization-scope
  - page-server
  - load-function
  - actions
  - post-request
---

# Formsnap + Superforms with Server Actions - AI Reference

## ⚠️ CRITICAL: Zod v4 + Superforms Configuration

**This project uses Zod v4 (required by Better Auth). Known type incompatibility with sveltekit-superforms requires specific patterns:**

```typescript
// ❌ WRONG - Causes errors
import { z } from 'zod'; // Wrong import path
import { zod } from 'sveltekit-superforms/adapters'; // Wrong adapter
const form = await superValidate(zod4(schema)); // Missing @ts-expect-error
let { data }: { data: PageData } = $props(); // Breaks type inference

// ✅ RIGHT - Working pattern
import { z } from 'zod/v4'; // Always use zod/v4
import { zod4 } from 'sveltekit-superforms/adapters'; // Use zod4 adapter
// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
const form = await superValidate(zod4(schema)); // Server-side needs @ts-expect-error
let { data } = $props(); // Let TypeScript infer types
```

**Server-side pattern (+page.server.ts):**
```typescript
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod/v4';

// ALWAYS add @ts-expect-error before zod4() calls
// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
const form = await superValidate(zod4(schema));

// In actions too
// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
const form = await superValidate(event, zod4(schema));
```

**Client-side pattern (+page.svelte):**
```typescript
import { zod4Client } from 'sveltekit-superforms/adapters';

// ❌ WRONG - Breaks type inference
interface Props {
  data: PageData;
}
let { data }: Props = $props();

// ✅ RIGHT - Let TypeScript infer
let { data } = $props(); // No explicit type annotation

// When using validators, add @ts-expect-error
const form = superForm(data.form, {
  // @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
  validators: zod4Client(schema)
}); // Works with inferred types
const { form: formData, enhance, submitting, errors } = form;

// For field bindings that need type hints
bind:value={$formData.description as string} // Type assertion if needed
bind:checked={$formData.rememberMe as boolean} // For checkboxes
```

## When to Use Server Actions

- Database operations (CRUD)
- Organization/user management
- File uploads
- Email sending
- Any operation requiring server-side validation or resources
- When you need progressive enhancement (works without JS)

## Complete Pattern

### Schema File Structure

```typescript
// src/routes/(protected)/examples/crud/schema.ts
import { z } from 'zod/v4';

export const exampleFormSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
	description: z.string().max(500, 'Description must be 500 characters or less').optional()
});

export type ExampleFormSchema = typeof exampleFormSchema;
```

### +page.server.ts Pattern

```typescript
import { db } from '$lib/server/db';
import { fail, redirect, error as svelteKitError } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import { exampleFormSchema } from './schema';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	// For edit pages - load existing data
	if (params.id) {
		const [record] = await db
			.select()
			.from(table)
			.where(and(eq(table.id, params.id), eq(table.userId, locals.user.id)));

		if (!record) {
			throw svelteKitError(404, 'Not found');
		}

		const form = await superValidate(
			{ name: record.name, description: record.description },
			zod(exampleFormSchema)
		);

		return { form, record };
	}

	// For create pages - empty form
	const form = await superValidate(zod4(exampleFormSchema));
	return { form };
};

export const actions: Actions = {
	// Single action (default)
	default: async (event) => {
		const form = await superValidate(event, zod4(exampleFormSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { name, description } = form.data;

		try {
			// Database operation
			const [result] = await db
				.insert(table)
				.values({
					name,
					description,
					userId: event.locals.user.id,
					organizationId: event.locals.session?.activeOrganizationId
				})
				.returning();

			if (!result) {
				form.errors._errors = ['Failed to create record'];
				return fail(500, { form });
			}

			// Success - redirect or return form
			throw redirect(303, `/path/${result.id}`);
			// OR
			return { form, success: true };
		} catch (error) {
			if (error instanceof Response && error.status >= 300 && error.status < 400) {
				throw error; // Re-throw redirects
			}
			console.error('Database error:', error);
			form.errors._errors = ['An unexpected error occurred'];
			return fail(500, { form });
		}
	},

	// Multiple named actions
	update: async (event) => {
		const form = await superValidate(event, zod4(exampleFormSchema));
		// Similar pattern
	},

	delete: async ({ locals, params }) => {
		// No form validation needed for delete
		const deleted = await db
			.delete(table)
			.where(and(eq(table.id, params.id), eq(table.userId, locals.user.id)))
			.returning();

		if (deleted.length === 0) {
			return fail(404, { message: 'Not found' });
		}

		throw redirect(303, '/list');
	}
};
```

### +page.svelte Pattern

```typescript
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { zod4Client } from 'sveltekit-superforms/adapters';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import type { PageData, ActionData } from './$types';
  import { exampleFormSchema } from './schema';

  interface Props {
    data: PageData;
    form: ActionData;
  }

  let { data, form: actionForm }: Props = $props();

  const form = superForm(data.form, {
    validators: zod4Client(exampleFormSchema),
    onResult: ({ result }) => {
      if (result.type === 'success') {
        // Handle success
      }
      if (result.type === 'failure' && $errors._errors?.[0]) {
        toast.error($errors._errors[0]);
      }
    }
  });

  const { form: formData, enhance, submitting, errors } = form;
</script>

<form method="POST" use:enhance>
  <!-- For named actions -->
  <!-- <form method="POST" action="?/update" use:enhance> -->

  <Form.Field {form} name="name">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Name</Form.Label>
        <Input {...props} bind:value={$formData.name} disabled={$submitting} />
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>

  <Form.Field {form} name="description">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Description</Form.Label>
        <Textarea {...props} bind:value={$formData.description} disabled={$submitting} />
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>

  {#if $errors._errors}
    <div class="text-destructive">
      {#each $errors._errors as error}
        <p>{error}</p>
      {/each}
    </div>
  {/if}

  <Form.Button disabled={$submitting}>
    {$submitting ? 'Saving...' : 'Save'}
  </Form.Button>
</form>

<!-- Delete form example -->
<form method="POST" action="?/delete" use:enhance>
  <button type="submit">Delete</button>
</form>
```

## Organization-Scoped Queries

```typescript
// Get user's active organization
const userMembership = await db.select().from(member).where(eq(member.userId, user.id)).limit(1);

const organizationId = userMembership[0]?.organizationId || null;

// Build where conditions
const whereConditions = organizationId
	? and(eq(table.id, id), eq(table.userId, user.id), eq(table.organizationId, organizationId))
	: and(eq(table.id, id), eq(table.userId, user.id));
```

## Error Handling Patterns

```typescript
// Field-specific errors
form.errors.email = ['Email already exists'];

// General errors
form.errors._errors = ['Operation failed'];

// Always return fail() with form
return fail(400, { form });

// Re-throw redirects
if (error instanceof Response && error.status >= 300 && error.status < 400) {
	throw error;
}
```

## File References

- CRUD example: `src/routes/(protected)/(with-sidebar)/examples/crud/[id]/+page.server.ts`
- Organization settings: `src/routes/(protected)/(with-sidebar)/settings/organization/[slug]/+page.server.ts`
- Documents: `src/routes/(protected)/documents/[id]/+page.server.ts`

## Svelte 5 State Management

```typescript
// ❌ WRONG - Using stores in Svelte 5
import { page } from '$app/stores';
$page.data.user // Will error

// ✅ RIGHT - Using state in Svelte 5
import { page } from '$app/state';
page.url.origin // Direct access
data.user // Access from props

// ❌ WRONG - Type annotations on $props()
let { data, form }: Props = $props();

// ✅ RIGHT - Let TypeScript infer
let { data, form } = $props();
```

## Common Patterns

- Always validate with `superValidate(event, zod4(schema))` with `@ts-expect-error`
- Set `form.errors._errors` before returning `fail()`
- Use `throw redirect()` for success navigation
- Return `{ form, success: true }` to stay on page
- Check `locals.user` for authentication
- Use `locals.session?.activeOrganizationId` for org context
- Re-throw redirect responses in catch blocks
- Use named actions for multiple operations on same page
- Always import from `'zod/v4'` not `'zod'`
