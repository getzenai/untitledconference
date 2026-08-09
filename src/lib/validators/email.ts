import { z } from 'zod/v4';
import { isDisposableEmail } from './disposable-email';

/**
 * Email address for sign-in and general use.
 *
 * Normalizes before validating so `  Ada@Example.COM ` and `ada@example.com`
 * resolve to the same stored identity.
 */
export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.email('Please enter a valid email address');

/**
 * Email address for registration and invitations.
 *
 * Adds a throwaway-provider check on top of {@link emailSchema}. Kept separate
 * so sign-in never locks out an existing account whose provider was added to
 * the blocklist after they registered.
 */
export const registrationEmailSchema = emailSchema.refine(
	(email) => !isDisposableEmail(email),
	'Please use a permanent email address'
);
