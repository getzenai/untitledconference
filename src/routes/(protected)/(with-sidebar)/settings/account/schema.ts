import { passwordSchema } from '$lib/validators/password';
import { z } from 'zod';

// We can't use changePasswordSchema.safeExtend() because changePasswordSchema
// uses .superRefine() which returns ZodEffects, not ZodObject.
// Instead, we define the full schema and reuse the validation logic.
export const accountSettingsSchema = z
	.object({
		currentPassword: passwordSchema,
		newPassword: passwordSchema,
		revokeOtherSessions: z.boolean().default(true)
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

export type AccountSettingsSchema = typeof accountSettingsSchema;
