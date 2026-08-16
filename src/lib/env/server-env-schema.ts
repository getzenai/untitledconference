/**
 * Server environment schema — the single source of truth for every server-side
 * environment variable this app reads.
 *
 * This module is intentionally free of any `$env`/runtime imports so it can be
 * unit-tested directly (`serverEnvSchema.safeParse({...})`). The runtime wiring
 * — reading `$env/dynamic/private` and validating — lives in
 * `src/lib/server/env.ts`.
 *
 * Each variable is declared once with its scope, whether it's required, its
 * default, and a one-line description. The starter exposes no client-side
 * `PUBLIC_*` variables; when you add some, mirror this file with a public schema
 * read from `$env/dynamic/public`.
 */
import { z } from 'zod';
import {
	boolWithDefault,
	lowerEnumWithDefault,
	optionalStr,
	requiredStr,
	strWithDefault
} from './coerce';

export const serverEnvSchema = z
	.object({
		// --- Core ---------------------------------------------------------------
		/** Postgres connection string. Local Docker: postgres://root:mysecretpassword@localhost:5432/dev */
		DATABASE_URL: requiredStr('DATABASE_URL is required (Postgres connection string).'),
		/** Test database URL — used by integration tests and the E2E setup. */
		TEST_DATABASE_URL: optionalStr(),
		/** Standard Node environment flag. */
		NODE_ENV: optionalStr(),

		// --- Authentication (Better Auth) --------------------------------------
		/** Signing secret for Better Auth sessions/cookies. */
		BETTER_AUTH_SECRET: requiredStr('BETTER_AUTH_SECRET is required (auth signing secret).'),
		/** Canonical base URL of the app. Local dev: http://localhost:5173 */
		BETTER_AUTH_URL: strWithDefault('http://localhost:5173'),
		/** Comma-separated list of additional trusted origins. */
		BETTER_AUTH_TRUSTED_ORIGINS: optionalStr(),
		/** Require a verified email before sign-in is allowed. */
		REQUIRE_EMAIL_VERIFICATION: boolWithDefault(true),
		/**
		 * WebAuthn relying-party ID for passkeys. Derived from BETTER_AUTH_URL's
		 * hostname (minus "www.") when unset. Changing it invalidates every
		 * passkey already registered.
		 */
		BETTER_AUTH_PASSKEY_RP_ID: optionalStr(),
		/**
		 * E2E-only escape hatch that relaxes Better Auth's 3-per-10s limit on
		 * /sign-in* and /sign-up*. Never set this in a deployed environment.
		 */
		RELAX_AUTH_RATE_LIMIT: optionalStr(),

		// --- OAuth providers ----------------------------------------------------
		/**
		 * Allow OAuth clients to self-register (RFC 7591). Off by default: it lets
		 * unauthenticated callers create clients.
		 */
		OAUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION: boolWithDefault(false),
		/** GitHub OAuth client ID. Both GitHub vars are needed to enable the provider. */
		GITHUB_CLIENT_ID: optionalStr(),
		/** GitHub OAuth client secret. */
		GITHUB_CLIENT_SECRET: optionalStr(),

		// --- Email (SendGrid) ---------------------------------------------------
		/** When true, send real emails via SendGrid instead of logging to console. */
		SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG: boolWithDefault(false),
		/** SendGrid API key. Required when SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG=true. */
		SENDGRID_API_KEY: optionalStr(),
		/** Verified sender address. Required when SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG=true. */
		SENDGRID_FROM: optionalStr(),
		/** Resend API key for the durable conference-mail outbox. */
		RESEND_API_KEY: optionalStr(),
		/** Verified Resend sender, including optional display name. */
		RESEND_FROM: optionalStr(),

		// --- Feature flags ------------------------------------------------------
		// One `FEATURE_*` variable per flag; see src/lib/server/feature-flags.ts.
		/** Example flag shipped with the starter — replace with your own. */
		FEATURE_EXAMPLE_FEATURE: boolWithDefault(false),
		/** In-app reviewer chat. Off unless explicitly set; production stays off. */
		FEATURE_INAPP_CHAT: boolWithDefault(false),

		// --- In-app chat (AI Gateway) ------------------------------------------
		/**
		 * Cloudflare AI Gateway token. Worker secret (`wrangler secret put`), never
		 * a `wrangler.jsonc` var. Optional so the flag-off build and stubbed tests
		 * do not require it.
		 */
		AI_GATEWAY_API_KEY: optionalStr(),
		/**
		 * Cloudflare AI Gateway OpenAI-compatible base URL
		 * (`https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/compat`).
		 * Not a secret.
		 */
		AI_GATEWAY_BASE_URL: optionalStr(),
		/**
		 * Model id the Gateway should route. `mock` is a local/test stub that
		 * still runs the real tools. Default is a small OpenAI-compatible model.
		 */
		AI_CHAT_MODEL: strWithDefault('openai/gpt-4o-mini'),
		/**
		 * 32-byte AES-256-GCM wrapping key for organization chat API keys
		 * (hex or standard base64). Worker secret, never a wrangler.jsonc var.
		 * Unset: saving an org backend fails closed; the hosted fallback still works.
		 */
		ORG_AI_WRAP_KEY: optionalStr(),

		// --- Logging ------------------------------------------------------------
		/** Minimum log level. */
		LOG_LEVEL: lowerEnumWithDefault(['debug', 'info', 'warn', 'error'] as const, 'warn'),
		/** Log output format. */
		LOG_FORMAT: lowerEnumWithDefault(['human', 'json'] as const, 'human'),

		// --- Testing --------------------------------------------------------------
		/** Enables the E2E test-data endpoints under /api/v1/test. Never enable in production. */
		ENABLE_TEST_ENDPOINTS: boolWithDefault(false),

		// --- Runtime / platform (injected by adapter-node) -----------------------
		/** Public origin used by adapter-node. */
		ORIGIN: optionalStr(),
		/** Request body size limit for adapter-node (e.g. "10M"). */
		BODY_SIZE_LIMIT: optionalStr()
	})
	// Conditional requirements that mirror the throw-sites in the codebase.
	.superRefine((env, ctx) => {
		if (env.SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG) {
			for (const key of ['SENDGRID_API_KEY', 'SENDGRID_FROM'] as const) {
				if (!env[key]) {
					ctx.addIssue({
						code: 'custom',
						path: [key],
						message: `${key} is required when SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG=true.`
					});
				}
			}
		}
		if (Boolean(env.GITHUB_CLIENT_ID) !== Boolean(env.GITHUB_CLIENT_SECRET)) {
			ctx.addIssue({
				code: 'custom',
				path: ['GITHUB_CLIENT_SECRET'],
				message: 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set together.'
			});
		}
	});

/** Fully-typed, validated server environment. */
export type ServerEnv = z.infer<typeof serverEnvSchema>;
