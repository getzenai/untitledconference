import { passwordSchema } from '$lib/validators/password';
import { z } from 'zod/v4';

export const createUserSchema = z.object({
	email: z.string().email('Please enter a valid email address'),
	password: passwordSchema,
	role: z.enum(['user', 'admin']).default('user')
});

export const inviteUserSchema = z.object({
	email: z.string().email('Please enter a valid email address'),
	role: z.enum(['user', 'admin']).default('user')
});

export type CreateUserSchema = typeof createUserSchema;
export type InviteUserSchema = typeof inviteUserSchema;
