import { emailSchema } from '$lib/validators/email';
import { passwordSchema } from '$lib/validators/password';
import { z } from 'zod/v4';

export const loginSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
	rememberMe: z.boolean().default(true)
});

export type LoginSchema = typeof loginSchema;
