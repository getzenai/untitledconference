import { eq } from 'drizzle-orm';
import { db } from '.';
import * as table from './schema';

/**
 * Find a user by email
 * @param email User's email
 * @returns User object or undefined if not found
 */
export async function findUserByEmail(email: string) {
	const [user] = await db.select().from(table.user).where(eq(table.user.email, email));

	return user;
}
