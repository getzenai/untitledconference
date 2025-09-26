import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
	.string()
	.min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
	.max(PASSWORD_MAX_LENGTH, `Password must be less than ${PASSWORD_MAX_LENGTH} characters`);

export const passwordRequirements = [
	`Between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`
];

export function getPasswordRequirementsFromSchema(): string[] {
	return passwordRequirements;
}

export const changePasswordSchema = z
	.object({
		currentPassword: passwordSchema,
		newPassword: passwordSchema
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
