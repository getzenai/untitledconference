import { passwordSchema } from '$lib/validators/password';
import { z } from 'zod';

export const loginSchema = z.object({
	email: z.string().email('Please enter a valid email address'),
	password: passwordSchema,
	rememberMe: z.boolean().default(true)
});

export type LoginSchema = typeof loginSchema;
