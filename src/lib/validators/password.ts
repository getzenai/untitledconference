import { z } from 'zod/v4';
import {
	PASSWORD_MIN_SCORE,
	PASSWORD_STRENGTH_LABELS,
	PASSWORD_TOO_WEAK_MESSAGE
} from './password-strength-config';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
	.string()
	.min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
	.max(PASSWORD_MAX_LENGTH, `Password must be less than ${PASSWORD_MAX_LENGTH} characters`);

/**
 * Use for passwords the user is *choosing* (registration, reset, change).
 * Sign-in keeps the plain `passwordSchema` so existing credentials that predate
 * the strength rule can still be used to log in (and to change the password).
 *
 * NOTE: this runs in the browser only. Every form using it is a superforms
 * `SPA: true` form that submits through `authClient.*`, so nothing on the
 * server ever evaluates this schema — see the "not a control" note in the PR /
 * README. It is user-facing guidance, not a password policy.
 *
 * The refinement is async so the ~787 KB of zxcvbn dictionaries load on demand
 * instead of sitting in the page's static import graph. Superforms' zod4
 * adapter validates via `safeParseAsync`, so async refinements are supported;
 * do not "simplify" this back to a sync refine with a static import.
 */
export const newPasswordSchema = passwordSchema.refine(async (value) => {
	const { isPasswordStrongEnough } = await import('./password-strength');
	return isPasswordStrongEnough(value);
}, PASSWORD_TOO_WEAK_MESSAGE);

export const passwordRequirements = [
	`Between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
	`Strength of at least "${PASSWORD_STRENGTH_LABELS[PASSWORD_MIN_SCORE]}"`
];

export function getPasswordRequirementsFromSchema(): string[] {
	return passwordRequirements;
}

export const changePasswordSchema = z
	.object({
		currentPassword: passwordSchema,
		newPassword: newPasswordSchema
	})
	.superRefine((values, ctx) => {
		if (values.newPassword === values.currentPassword) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'New password must be different from your current password',
				path: ['newPassword']
			});
		}
	});
