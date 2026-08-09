# SvelteKit Best Practices

## Project Architecture

- Route organization: Use route groups `(protected)`, `(auth)`, `(admin)` for related pages
- API structure: Place backend logic in [`src/routes/api/...`](src/routes/api/) for separation
- Server-side logic: Keep external API calls and sensitive operations in server-side files ([`+page.server.ts`](src/routes/+page.server.ts), API routes)
- Component organization: Structure by feature rather than type

## Route Organization and Protection

### Route Groups

- Protected routes: Use [`+layout.server.ts`](<src/routes/(protected)/+layout.server.ts>) in `(protected)` group for authentication
- Public routes: Use [`+page.server.ts`](src/routes/+page.server.ts) to redirect authenticated users from auth pages
- Admin routes: Create separate `(admin)` group with role-based access checks

### Route Protection Patterns

- Layout-level protection: Use [`+layout.server.ts`](src/routes/+layout.server.ts) for route group authentication. This is the primary gatekeeper for protected sections.
- Page-level checks: Use [`+page.server.ts`](src/routes/+page.server.ts) for specific page requirements beyond basic authentication.
- API protection: Implement authentication middleware in [`hooks.server.ts`](src/hooks.server.ts)

## Load Functions

### Server Load Functions

- Use for: Authentication checks (if not fully handled by layout), database queries, server-side data fetching.
- Benefits: Available during SSR, access to request headers and cookies.
- Security: Handle redirects and sensitive operations server-side.
- Performance: Reduce client-side API calls by pre-loading data.
- Error Handling: Use `throw error(status, message)` for unrecoverable states that should display an error page.

### Universal Load Functions

- Use for: Client-side data transformations and non-sensitive fetching
- Behavior: Run on both server and client environments
- Limitations: Avoid sensitive authentication logic or server-only operations

## Authentication and Security

### Server-Side Authentication

- Always verify on server: Use [`hooks.server.ts`](src/hooks.server.ts) to populate `event.locals.user` and [`+layout.server.ts`](src/routes/+layout.server.ts) within protected route groups for primary authentication checks.
- Redundancy: If `event.locals.user` is reliably populated by hooks and access to a route group is guarded by its layout server file, further checks for `locals.user` existence within individual `load` functions or `actions` inside that protected group are often redundant.
- Never trust client-side: Client-side checks are for UX only, not security.
- Prevent bypass: Server-side checks cannot be disabled or manipulated.

### Secure Redirect Patterns

- Server-side redirects: Use [`throw redirect(303, '/target-url')`](<src/routes/(protected)/+layout.server.ts:25>) for authentication flows
- Security advantage: Cannot be bypassed by disabling JavaScript
- Client redirects: Use only for UX enhancements, never for security

### Security Principles

- Defense in depth: Layer server-side security with client-side UX
- Fail secure: Default to denying access when authentication is unclear
- Minimize exposure: Keep sensitive logic and secrets server-side only.
- Validate inputs: Sanitize and validate all user inputs on the server. This includes explicitly parsing and type-validating data from sources like `request.formData()` or `event.params` (e.g., using `parseInt()`, Zod schemas) before use in database queries or other logic.

## API Design

### API Route Structure

- RESTful patterns: Use HTTP methods appropriately (GET, POST, PUT, DELETE).
- Page-Specific CRUD: For operations tightly coupled with a specific page, prefer SvelteKit Form Actions (see "Form Actions and Progressive Enhancement" section) over general-purpose API endpoints.
- Error handling: Return consistent error responses with proper status codes.
- Input validation: Validate request bodies and parameters server-side.
- Response format: Use consistent JSON response structures.

### API Security

- Authentication: Verify user sessions in API route handlers
- Authorization: Check user permissions for specific operations
- Rate limiting: Implement rate limiting for API endpoints
- CORS handling: Configure CORS appropriately for deployment

## Form Actions and Progressive Enhancement

SvelteKit's form actions provide a robust way to handle server-side logic for form submissions, keeping related UI and server code colocated.

### Prefer Form Actions for Page-Specific Operations

- For operations like Create, Read (often via `load`), Update, and Delete that are tightly coupled with a specific page or component, prefer using SvelteKit form actions over creating separate, general-purpose API endpoints.
- This approach simplifies state management, enhances co-location of client and server logic, and aligns well with SvelteKit's progressive enhancement model.

### Progressive Enhancement with `use:enhance`

- When using `enhance` for form submissions to enable client-side navigation and updates without a full page reload:
  - Always call `await update()` within the callback provided to `use:enhance`. This function is crucial for processing the server's response from the form action, updating the `form` prop in the Svelte component, and correctly handling outcomes like redirects or `fail` objects.
  - Use the `result` object (also provided to the callback) to conditionally perform client-side actions (e.g., showing toast notifications, invalidating data caches via `invalidateAll()` or more specific invalidation functions) based on the success or failure of the server action.
  - Manage a `submitting` state variable to provide user feedback (e.g., disabling buttons, showing spinners) during the form submission process.

### Structured Error Handling and Feedback in Actions

- **`fail(status, data)`**: Use SvelteKit's `fail()` function in form actions to return structured error messages (e.g., validation errors from Zod) or operational failures back to the client. This data populates the `form` prop in your Svelte component.
  - Example: `return fail(400, { data: { name, email }, errors: validationResult.error.flatten().fieldErrors });`
- **`throw redirect(status, location)`**: Use for navigation after a successful action (e.g., after creating or deleting an item). Ensure `catch` blocks in your actions do not misinterpret these `Redirect` objects as unexpected errors. The `use:enhance` mechanism will handle the client-side redirect if `await update()` is called.
- **`throw error(status, message)`**: Reserve for critical, unrecoverable errors within an action that should halt execution and display a dedicated error page.

### Distinguishing `ActionData` for Multiple Forms or Actions

- If a Svelte page handles `ActionData` from multiple forms or distinct named actions (e.g., `action="?/update"` and `action="?/anotherAction"` on the same page):
  - Return a unique identifier within the `ActionData` object from the server (e.g., `{ formAction: 'update', ... }` or `{ formAction: 'anotherAction', ... }`).
  - This allows client-side Svelte logic (e.g., reactive statements like `$: if (form?.formAction === 'update') { /* handle update result */ }`) to differentiate between them and update the UI or display errors more precisely for the specific action that was invoked.
