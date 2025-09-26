# AI Development Documentation

Dense, AI-optimized documentation. Maximum information density. No fluff. Direct solutions to repeated mistakes.

## Document Requirements

**CRITICAL**: Write for AI, not humans. Dense is better. Pack information tightly.

### Optimal Format

- Lead with WRONG→RIGHT comparisons
- Use code blocks with inline ❌/✅ markers
- Group related errors together
- Include exact error messages for searchability
- No explanatory prose - let code speak

### Density Example

```typescript
// ❌ WRONG: $errors in async, setError without import, Form.Errors doesn't exist
onSubmit: async () => { $errors._errors = ['msg']; setError(form,'','msg'); }
<Form.Errors />

// ✅ RIGHT: errors.set(), destructure errors, manual display
const { errors } = form;
onSubmit: async () => { errors.set({ _errors: ['msg'] }); }
{#if $errors._errors}{#each $errors._errors as e}<p>{e}</p>{/each}{/if}
```

## Available Patterns

- **[Better Auth](./howtos/better-auth-patterns.md)** - Client auth, session management, error handling
- **[Server Actions + Forms](./howtos/formsnap-superforms-with-actions.md)** - CRUD, database ops, progressive enhancement
- **[Client-Only Forms](./howtos/formsnap-superforms-client-only.md)** - SPA forms, async operations, Svelte 5
- **[Redirect Handling](./howtos/sveltekit-redirect-handling.md)** - Proper redirect() in try-catch blocks
- **[Select Component](./howtos/shadcn-select-component.md)** - Correct Select.Root usage, value binding, common pitfalls

## Search Strategy

Check these docs BEFORE implementing. Search by:

- Error message
- Component name
- Pattern type
- Common mistake keyword
