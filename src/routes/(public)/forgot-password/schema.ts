import { z } from 'zod/v4';

export const forgotPasswordSchema = z.object({
	email: z.string().email('Please enter a valid email address')
});

export type ForgotPasswordSchema = typeof forgotPasswordSchema;
