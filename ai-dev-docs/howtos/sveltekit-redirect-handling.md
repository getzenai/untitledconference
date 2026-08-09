---
title: SvelteKit Redirect Handling Patterns
description: AI reference for properly handling redirect() in SvelteKit server actions and load functions - avoiding try-catch pitfalls and Response object confusion
tags:
  - sveltekit
  - redirect
  - server-actions
  - error-handling
  - try-catch
  - load-functions
  - form-actions
  - navigation
  - Response
  - HTTP-status
  - 303-redirect
  - fail
  - crud
  - delete-action
---

# SvelteKit Redirect Handling in Server Actions

## The Problem

In SvelteKit, `redirect()` throws a special Response object, not an error. When placed inside try-catch blocks, redirects get caught and logged as errors, breaking the expected navigation flow.

## Common Mistake

```typescript
// ❌ BAD: Redirect gets caught as error
export const actions: Actions = {
	delete: async ({ locals, params }) => {
		try {
			// ... database operations
			await db.delete(table).where(condition);

			// This redirect will be caught!
			throw redirect(303, '/success');
		} catch (error) {
			// The redirect Response gets logged as an error
			console.error('Database error:', error);
			return fail(500, { message: 'Error occurred' });
		}
	}
};
```

## Solution Patterns

### Pattern 1: Keep Redirects Outside Try-Catch (BEST)

```typescript
// ✅ BEST: Redirect after try-catch
export const actions: Actions = {
	delete: async ({ locals, params }) => {
		try {
			const result = await db.delete(table).where(condition).returning();

			if (result.length === 0) {
				return fail(404, { message: 'Not found' });
			}
		} catch (error) {
			console.error('Database error:', error);
			return fail(500, { message: 'Database error occurred' });
		}

		// Redirect only after successful operation
		throw redirect(303, '/success');
	}
};
```

### Pattern 2: Re-throw Redirects When Necessary

When redirects must be inside try-catch (e.g., multiple redirect paths based on logic):

```typescript
// ✅ GOOD: Properly re-throw redirects
export const load: PageServerLoad = async ({ locals }) => {
	try {
		const user = await getUser(locals.userId);

		if (!user) {
			throw redirect(303, '/login');
		}

		if (user.needsOnboarding) {
			throw redirect(303, '/onboarding');
		}

		return { user };
	} catch (error) {
		// Re-throw redirects
		if (error instanceof Response && error.status >= 300 && error.status < 400) {
			throw error;
		}

		// Handle actual errors
		console.error('Error loading user:', error);
		return fail(500, { message: 'Failed to load user' });
	}
};
```

## Real-World Examples

### CRUD Delete Operation

```typescript
// Before: Redirect caught as error
delete: async ({ locals, params }) => {
  try {
    const deleted = await db.delete(items).where(eq(items.id, id));
    throw redirect(303, '/items'); // Gets caught!
  } catch (error) {
    console.error('Delete error:', error); // Logs redirect
    return fail(500, { message: 'Delete failed' });
  }
}

// After: Clean separation
delete: async ({ locals, params }) => {
  try {
    const deleted = await db.delete(items).where(eq(items.id, id)).returning();
    if (!deleted.length) {
      return fail(404, { message: 'Item not found' });
    }
  } catch (error) {
    console.error('Database error:', error);
    return fail(500, { message: 'Delete failed' });
  }

  throw redirect(303, '/items');
}
```

### Form Submission with Validation

```typescript
// Complex example with multiple exit points
export const actions: Actions = {
	submit: async ({ request, locals }) => {
		const form = await superValidate(request, zod(schema));

		if (!form.valid) {
			return fail(400, { form });
		}

		let result;
		try {
			// Validation that might redirect
			const user = await getUser(locals.userId);
			if (!user) {
				throw redirect(303, '/login'); // Need to be inside try
			}

			// Database operation
			result = await db.insert(items).values(form.data).returning();

			if (!result[0]) {
				return fail(500, { form, message: 'Insert failed' });
			}
		} catch (error) {
			// Must re-throw redirects
			if (error instanceof Response && error.status >= 300 && error.status < 400) {
				throw error;
			}

			console.error('Database error:', error);
			return fail(500, { form, message: 'Operation failed' });
		}

		// Success redirect outside try-catch when possible
		throw redirect(303, `/items/${result[0].id}`);
	}
};
```

## Testing Redirects

```typescript
// cypress/e2e/critical-paths/items.cy.ts
it('deletes item and redirects', () => {
	cy.visit('/items/123');
	cy.waitForHydration();

	cy.get('button[name="delete"]').click();

	// The action redirects back to the list
	cy.url().should('include', '/items');
	cy.contains('Item deleted').should('be.visible');
});
```

## Quick Checklist

1. ✅ Keep success redirects OUTSIDE try-catch blocks
2. ✅ When redirects must be inside try-catch, ALWAYS re-throw them
3. ✅ Check for `error instanceof Response` with status 300-399
4. ✅ Use `return fail()` for errors, `throw redirect()` for navigation
5. ✅ Don't wrap redirects in try-catch unless necessary for error handling logic

## Common Patterns Reference

```typescript
// Pattern: Simple success redirect
try {
	await doOperation();
} catch (error) {
	return fail(500, { message: 'Failed' });
}
throw redirect(303, '/success');

// Pattern: Conditional redirects
try {
	const result = await checkSomething();
	if (result.needsAuth) {
		throw redirect(303, '/login');
	}
	if (result.incomplete) {
		throw redirect(303, '/complete-profile');
	}
} catch (error) {
	if (error instanceof Response && error.status >= 300 && error.status < 400) {
		throw error;
	}
	return fail(500, { message: 'Check failed' });
}

// Pattern: Delete with confirmation
try {
	const deleted = await db.delete(table).where(condition).returning();
	if (!deleted.length) {
		return fail(404, { message: 'Not found' });
	}
} catch (error) {
	console.error('Delete error:', error);
	return fail(500, { message: 'Delete failed' });
}
throw redirect(303, '/list');
```

## Related Documentation

- [SvelteKit redirect() docs](https://kit.svelte.dev/docs/modules#sveltejs-kit-redirect)
- [SvelteKit error handling](https://kit.svelte.dev/docs/errors)
- [Form actions best practices](./formsnap-superforms-with-actions.md)
