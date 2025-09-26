import { passwordSchema } from '$lib/validators/password';
import { z } from 'zod';

export const resetPasswordSchema = z.object({
	password: passwordSchema,
	token: z.string().min(1, 'Reset token is required')
});

export type ResetPasswordSchema = typeof resetPasswordSchema;
