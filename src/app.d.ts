// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

// Brings in `App.Platform` (`ctx`, `caches`, `cf`) as adapter-cloudflare
// actually supplies it. SvelteKit's generated tsconfig does not pick an
// adapter's ambient types up on its own; this reference is the documented way
// to opt in, and without it `platform.ctx` — which `hooks.server.ts` needs to
// scope a database connection to one request — does not typecheck.
/// <reference types="@sveltejs/adapter-cloudflare" />

declare global {
	namespace App {
		/**
		 * `env` is not declared by the adapter's ambient types on purpose — it is
		 * where a project names its own bindings. `UPLOADS` is the R2 bucket that
		 * holds speaker deliverables.
		 */
		interface Platform {
			env?: {
				UPLOADS?: import('@cloudflare/workers-types').R2Bucket;
			};
		}

		interface Locals {
			user: import('$lib/server/auth').SessionValidationResult['user'];
			session: import('$lib/server/auth').SessionValidationResult['session'];
			isAdmin?: boolean;
			organizationId?: string | null;
			organizationRole?: string | null;
			impersonating?: {
				originalUserId: string;
				originalUserEmail: string;
			} | null;
			locale?: import('$lib/paraglide/runtime').Locale;
			ip?: string;
			userAgent?: string;
		}
	}
}

export {};
