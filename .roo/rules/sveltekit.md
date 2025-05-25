# SvelteKit Best Practices

## Authentication and Security

### Server-Side Authentication Checks

- **Always perform authentication checks on the server side** using `+page.server.ts` or `+layout.server.ts` files
- **Never rely solely on client-side authentication checks** for security-critical operations
- Use [`auth.api.getSession({ headers: requestHeaders })`](src/lib/auth.ts) in server-side load functions to verify authentication status
- Server-side checks prevent bypassing authentication through client-side manipulation

### Redirect Patterns

- **Use server-side redirects** with [`throw redirect(303, '/target-url')`](<src/routes/(protected)/+layout.server.ts:25>) for authentication-based navigation
- Server-side redirects are more secure and cannot be bypassed by disabling JavaScript
- Client-side redirects should only be used for UX enhancements, not security

### Route Protection

- **Protected routes**: Use `+layout.server.ts` in route groups like `(protected)` to check authentication
- **Public routes**: Use `+page.server.ts` to redirect authenticated users away from auth pages (login/register)
- **API routes**: Protect API endpoints in `hooks.server.ts` with authentication middleware

## Load Functions

### Server Load Functions (`+page.server.ts`, `+layout.server.ts`)

- Use for authentication checks, database queries, and server-side data fetching
- Return data that should be available during SSR
- Handle redirects for authentication flows
- Access request headers, cookies, and server-side resources

### Universal Load Functions (`+page.ts`, `+layout.ts`)

- Use for client-side data fetching and transformations
- Run on both server and client
- Should not contain sensitive authentication logic

## Security Principles

- **Defense in depth**: Combine server-side checks with client-side UX improvements
- **Fail secure**: Default to denying access when authentication status is unclear
- **Minimize client-side secrets**: Keep sensitive logic and checks on the server
