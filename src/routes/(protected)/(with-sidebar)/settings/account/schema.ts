import { passwordSchema } from '$lib/validators/password';
import { z } from 'zod/v4';

export const accountSettingsSchema = z.object({
	currentPassword: passwordSchema,
	newPassword: passwordSchema,
	revokeOtherSessions: z.boolean().default(true)
});
