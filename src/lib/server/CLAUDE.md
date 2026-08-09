# Server-Side Code

Everything here is server-only (imported via `$lib/server/...`, never bundled to the client).

## Layout

```
server/
    config.ts           # Centralized, lazily-validated env var access
    logger.ts            # Winston wrapper — createLogger(context)
    email-templates.ts   # Plain functions returning { subject, text, html }
    ai/                  # AI provider factory (mock / Azure OpenAI)
    db/                  # Drizzle schemas + client — see db/CLAUDE.md
    documents/            # Document CRUD + AI text transform (Tiptap JSON)
    services/             # Thin wrappers around external APIs (SendGrid, ...)
    utils/                 # One-off server helpers (e.g. organization-transfer)
```

## `config.ts` — Environment Variables

All server env var access goes through the `config` object, not `$env/dynamic/private` directly:

```typescript
import { config } from '$lib/server/config';

config.databaseUrl; // throws at first access if DATABASE_URL is missing
config.sendgridApiKey; // undefined if not set (optional)
```

- `required(name)` throws `Missing required env var: ${name}` on first access.
- `optional(name, fallback?)` returns `string | undefined`.
- The whole `config` object is a lazy `Proxy` — nothing is read or validated until a property is
  first accessed. This matters because `vite build` runs without a `.env`/secrets present; adding a
  new **required** var here breaks the build for everyone, so prefer `optional()` unless the app
  truly cannot run without it.
- When you add a new env var, add it to the `Config` type and to `resolve()` in `config.ts`. There
  is no separate schema file for this (unlike some sibling projects) — `config.ts` is the single
  source of truth here.

## `logger.ts` — Logging

```typescript
import { createLogger } from '$lib/server/logger';

const logger = createLogger('MyService'); // context tag, shows as [MyService]

logger.debug('Debug detail', { userId }); // only emitted when LOG_LEVEL=debug
logger.info('Did the thing', { userId, orgId });
logger.warn('Unexpected but handled', { reason });
logger.error('Failed', error as Error, { userId }); // error is the 2nd positional arg
```

- `LOG_LEVEL`: `error | warn (default) | info | debug`. `LOG_FORMAT`: `human (default) | json`.
- During `vite build`, logging is forced to `warn` and silenced (`building` from `$app/environment`)
  — don't rely on logger output at build time.
- One `createLogger()` call per module, named after the module/service, not per function call.

## `ai/` — AI Provider Factory

```typescript
import { AIProviderFactory } from '$lib/server/ai/factory';

const provider = AIProviderFactory.create();
if (provider.transformText) {
	const result = await provider.transformText(text, action);
}
```

- `AIProviderFactory.create()` selects a provider: explicit `AI_PROVIDER=mock|azure`, otherwise
  auto-detects Azure OpenAI from `AZURE_OPENAI_API_KEY` + `AZURE_RESOURCE_NAME` +
  `AZURE_OPENAI_DEPLOYMENT_NAME`, and falls back to `MockProvider` if none of that is configured.
  This means **the app runs with no AI credentials at all** — new code that calls the AI provider
  must tolerate the mock provider's behavior, not assume a real model is behind it.
- `AIProviderFactory.createByType('azure' | 'mock')` bypasses detection when a specific provider is
  required (e.g. in a test).
- Provider methods are optional on the `AIProvider` interface (e.g. `transformText?`) — check for
  the method before calling it, as `documents/operations.ts` does, rather than assuming every
  provider implements every capability.

## `documents/` — Document Operations

Plain async functions operating on `documentsTable` (see `db/CLAUDE.md`), not a class. Each
exported function (`createDocument`, `loadDocument`, `updateDocument`, `deleteDocument`,
`transformDocumentText`) follows the same shape:

```typescript
export async function updateDocument(documentId: number, userId: string, data: {...}) {
	if (!userId) return fail(401, { error: 'Unauthorized' });
	if (!documentId) return fail(400, { error: 'Invalid document ID' });

	try {
		// ... ownership check (userId must match), validation, db call
		return { success: true, document: updatedDocument };
	} catch (error) {
		return fail(500, { error: 'Failed to update document', details: error instanceof Error ? error.message : undefined });
	}
}
```

- Returns SvelteKit's `fail(status, data)` for error cases instead of throwing — callers (form
  actions, API routes) forward the return value directly. `loadDocument` is the one exception: it
  returns `null` on any failure instead of a `fail()` object, because it's meant to be read
  directly by a `load` function.
- Every mutation re-checks `eq(documentsTable.userId, userId)` in its `where` clause — ownership is
  enforced per-query, not by a separate authorization layer. Follow this pattern for new
  document-scoped operations rather than trusting the caller already checked ownership.
- Validation constants and helpers (`MAX_TITLE_LENGTH`, `validateContentSize`, `validateJsonDepth`,
  `VALIDATION_ERRORS`) live in `validation-constants.ts` — reuse them instead of inlining limits.

## `services/` — External Integrations

Plain function modules that wrap a single external API:

```typescript
import { config } from '../config';
import { createLogger } from '../logger';

const logger = createLogger('EmailService');

export async function sendEmail({ to, subject, text, html }: EmailData): Promise<void> {
	if (!config.sendEmails) {
		logger.info('Email (console mode)', { to, subject });
		return; // dev/test default: log instead of sending
	}
	// ... real send, logged and re-thrown on failure
}
```

- `config.sendEmails` (from `SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG`) gates whether a service actually
  calls out or just logs — this is how the app runs without SendGrid credentials in dev/CI. New
  services that call paid/external APIs should offer the same kind of no-op/log fallback where
  practical.
- Errors are logged with structured context and then re-thrown (fail closed) — the caller decides
  how to present the failure; services don't swallow errors themselves.

## `utils/`

Small, single-purpose server helpers that don't fit `services/` or `documents/` (e.g.
`organization-transfer.ts`). If a helper grows enough logic or external dependencies to need its
own tests and docs, consider promoting it to `services/` instead.
