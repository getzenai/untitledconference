# Server-Side Code

Everything under `$lib/server/...` is server-only and never bundled to the client.
`conference/` holds the domain (CFP, review rounds, decisions, agenda, speaker portal);
`db/`, `jobs/` and the API routes have their own CLAUDE.md.

## Environment variables

Two files, and it matters which one you touch:

- `src/lib/env/server-env-schema.ts` — the inventory. A Zod schema, free of `$env` imports so
  it can be unit-tested. Adding a variable means adding it here.
- `src/lib/server/env.ts` — `serverEnv()` binds that schema to the running process, validates
  once, and throws a single aggregated error listing every problem.

```typescript
import { serverEnv } from '$lib/server/env';

export async function load() {
	const { RESEND_API_KEY } = serverEnv(); // inside a function, never at module scope
}
```

**Call it lazily.** `vite build` evaluates the server bundle with no secrets present, so a
call at module scope aborts the build for everyone. Same reason to prefer an optional
variable over a required one: a new required variable breaks every build until it is set
everywhere.

## Logging

```typescript
import { createLogger } from '$lib/server/logger';

const logger = createLogger('MyService'); // one per module, named after the module

logger.info('Did the thing', { userId, conferenceId });
logger.error('Failed', error as Error, { userId }); // error is the 2nd positional arg
```

`LOG_LEVEL`: `error | warn (default) | info | debug`. `LOG_FORMAT`: `human (default) | json`.
During `vite build` logging is forced to `warn` and silenced — don't rely on it at build time.
`otel-logs.ts` ships these records to an OTLP collector when one is configured, redacting
attributes whose key names a credential.

## Email

**There are two paths, and they do not share a transport.**

Conference mail is an outbox: every message is a row in `emailLogTable`, and
`conference/email-dispatcher.ts` drains it through Resend. Without `RESEND_API_KEY` and
`RESEND_FROM` there is no transport and the dispatcher returns `disabled: true` with the rows
left queued — that is how the app runs locally and in CI with no mail credentials, and why a
missing key loses nothing.

Auth mail — verification, password reset, invitations — goes the other way: `sendEmail()` in
`services/email-service.ts` calls SendGrid directly from `src/lib/auth.ts`, with no queue.
`SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG` gates it, and production has it **off**, so those messages
are logged and never sent. Anything new that mails a user belongs in the outbox, not here.

Templates are plain functions in `email-templates.ts` returning `{ subject, text, html }`.

## Ownership checks

Mutations re-check ownership in their own `where` clause (`eq(table.userId, userId)`) rather
than trusting that a caller checked. Conference-scoped access goes through `conference/access.ts`.
There is no separate authorization layer that would catch a missed check.
