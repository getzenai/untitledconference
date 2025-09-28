import { passwordSchema } from '$lib/validators/password';
import { z } from 'zod/v4';

export const completeRegistrationSchema = z.object({
	password: passwordSchema,
	token: z.string().min(1, 'Registration token is required')
});

export type CompleteRegistrationSchema = typeof completeRegistrationSchema;
