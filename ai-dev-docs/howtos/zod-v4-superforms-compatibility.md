---
title: Zod v4 + Superforms Compatibility
description: AI reference for handling Zod v4 type incompatibilities with sveltekit-superforms - working patterns with zero type/lint errors
tags:
  - zod
  - zod-v4
  - superforms
  - type-errors
  - ts-expect-error
  - form-validation
  - better-auth
  - type-inference
  - props
  - svelte-5
---

# Zod v4 + Superforms Compatibility - AI Reference

## Why Zod v4?

Better Auth requires Zod v4. sveltekit-superforms has type incompatibilities with Zod v4's type system. This guide shows the working patterns with zero type/lint errors.

## The Type Incompatibility

```typescript
// The error you'll see without proper handling:
Error: Argument of type 'ZodObject<...>' is not assignable to parameter of type 'ZodValidationSchema'.
  Type 'ZodObject<...>' is not assignable to type '$ZodDiscriminatedUnion<...>'.
    The types of '_zod.def' are incompatible between these types.
      Type '$ZodObjectDef<...>' is missing the following properties from type '$ZodDiscriminatedUnionDef<...>': discriminator, options
```

## Working Patterns - Zero Errors

### 1. Schema Files

```typescript
// ALWAYS import from 'zod/v4'
import { z } from 'zod/v4';
import { passwordSchema } from '$lib/validators/password';

export const exampleSchema = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional(),
  isActive: z.boolean().default(true)
});

export type ExampleSchema = typeof exampleSchema;
```

### 2. Server-Side (+page.server.ts)

```typescript
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { exampleSchema } from './schema';

export const load: PageServerLoad = async () => {
  // CRITICAL: Always add @ts-expect-error before zod4() calls
  // @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
  const form = await superValidate(zod4(exampleSchema));

  // Pre-fill form data if needed (with type assertion)
  (form.data as { name?: string }).name = 'Default Name';

  return { form };
};

export const actions: Actions = {
  default: async (event) => {
    // @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
    const form = await superValidate(event, zod4(exampleSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    // Type assertion for form.data
    const { name, description } = form.data as {
      name: string;
      description?: string;
    };

    // Process data...
    return { form };
  }
};
```

### 3. Client-Side (+page.svelte)

```typescript
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import * as Form from '$lib/components/ui/form';

  // CRITICAL: No type annotation - let TypeScript infer
  let { data } = $props(); // ✅ RIGHT
  // let { data }: { data: PageData } = $props(); // ❌ WRONG - breaks inference

  const form = superForm(data.form);
  const { form: formData, enhance, submitting, errors } = form;
</script>

<form method="POST" use:enhance>
  <Form.Field {form} name="description">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Description</Form.Label>
        <Textarea
          {...props}
          <!-- Type assertion for optional/unknown fields -->
          bind:value={$formData.description as string}
          disabled={$submitting}
        />
      {/snippet}
    </Form.Control>
  </Form.Field>

  <Form.Field {form} name="isActive">
    <Form.Control>
      {#snippet children({ props })}
        <Checkbox
          {...props}
          <!-- Type assertion for booleans -->
          bind:checked={$formData.isActive as boolean}
          disabled={$submitting}
        />
      {/snippet}
    </Form.Control>
  </Form.Field>
</form>
```

### 4. SPA Mode Forms

```typescript
// Pattern 1: With server initialization (preferred)
// +page.server.ts
export const load = async () => {
  // @ts-expect-error - Zod v4 type incompatibility
  const form = await superValidate(zod4(schema));
  return { form };
};

// +page.svelte
let { data } = $props();
const form = superForm(data.form, {
  SPA: true,
  onSubmit: async ({ formData, cancel }) => {
    cancel();
    // Handle client-side submission
  }
});

// Pattern 2: Client-only initialization
const form = superForm(
  { email: '', password: '' }, // Initial values
  {
    SPA: true,
    onSubmit: async ({ formData, cancel }) => {
      cancel();
      // Handle submission
    }
  }
);
```

## Common Errors and Fixes

### Error: Property doesn't exist on type '{}'
```typescript
// ❌ Problem
bind:value={$formData.description} // Error: Property 'description' doesn't exist

// ✅ Solution
bind:value={$formData.description as string}
```

### Error: Type 'unknown' not assignable
```typescript
// ❌ Problem
bind:checked={$formData.isActive} // Error: Type 'unknown' not assignable to 'boolean'

// ✅ Solution
bind:checked={$formData.isActive as boolean}
```

### Error: Zod type not assignable to ZodValidationSchema
```typescript
// ❌ Problem
const form = await superValidate(zod4(schema)); // Type error

// ✅ Solution
// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
const form = await superValidate(zod4(schema));
```

### Error: Property missing after type annotation
```typescript
// ❌ Problem - explicit type breaks inference
interface Props {
  data: PageData;
}
let { data }: Props = $props();

// ✅ Solution - let TypeScript infer
let { data } = $props();
```

## Complete Working Examples

### CRUD Form
- `/src/routes/(protected)/(with-sidebar)/examples/crud/+page.server.ts`
- `/src/routes/(protected)/(with-sidebar)/examples/crud/+page.svelte`
- `/src/routes/(protected)/(with-sidebar)/examples/crud/schema.ts`

### SPA Authentication Form
- `/src/routes/(public)/login/+page.svelte`
- `/src/routes/(protected)/(with-sidebar)/settings/account/+page.svelte`

### Server-Validated Form
- `/src/routes/(protected)/(with-sidebar)/examples/superforms/+page.server.ts`
- `/src/routes/(protected)/(with-sidebar)/examples/superforms/+page.svelte`

## Key Rules

1. **Always import from 'zod/v4'** in schema files
2. **Always add @ts-expect-error** before `zod4(schema)` on server
3. **Never add type annotations** to `$props()` in Svelte 5
4. **Use type assertions** for form field bindings when needed
5. **No zodClient validator** needed - just `superForm(data.form)`

## Why This Works

- Zod v4 is required by Better Auth and can't be downgraded
- sveltekit-superforms expects different type structure than Zod v4 provides
- `@ts-expect-error` suppresses the known incompatibility on server-side
- Removing explicit type annotations lets TypeScript's inference work correctly
- Type assertions on bindings handle the loosely typed form data

This pattern gives you:
- ✅ Zero TypeScript errors
- ✅ Zero ESLint errors
- ✅ Full type safety where it matters
- ✅ Working forms with validation
- ✅ Better Auth compatibility