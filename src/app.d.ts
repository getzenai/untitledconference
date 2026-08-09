// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
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
