import { passwordSchema } from '$lib/validators/password';
import { z } from 'zod/v4';

export const registerSchema = z.object({
	email: z.string().email('Please enter a valid email address'),
	password: passwordSchema,
	invitationCode: z.string().optional()
});

export type RegisterSchema = typeof registerSchema;
