import { registrationEmailSchema } from '$lib/validators/email';
import { newPasswordSchema } from '$lib/validators/password';
import { z } from 'zod/v4';

export const registerSchema = z.object({
	email: registrationEmailSchema,
	password: newPasswordSchema,
	invitationCode: z.string().optional()
});

export type RegisterSchema = typeof registerSchema;
