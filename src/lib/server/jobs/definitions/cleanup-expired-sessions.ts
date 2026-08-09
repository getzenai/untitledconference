import { lt } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '../../db';
import { session } from '../../db/auth-schema';
import { createLogger } from '../../logger';
import { defineJob } from '../index';

const logger = createLogger('Job:cleanup-expired-sessions');

export const cleanupExpiredSessionsSchema = z.object({
	/** When true, logs how many sessions would be deleted without deleting them. */
	dryRun: z.boolean().optional().default(false)
});

/**
 * Deletes Better Auth sessions whose `expiresAt` is in the past. Safe to run
 * repeatedly and safe to run concurrently with itself (a delete of an
 * already-deleted row is a no-op).
 */
export const cleanupExpiredSessionsJob = defineJob({
	name: 'cleanup-expired-sessions',
	schema: cleanupExpiredSessionsSchema,
	cron: '0 3 * * *',
	handler: async ({ dryRun }) => {
		const now = new Date();

		if (dryRun) {
			const expired = await db
				.select({ id: session.id })
				.from(session)
				.where(lt(session.expiresAt, now));
			logger.info('Dry run: sessions eligible for cleanup', { count: expired.length });
			return;
		}

		const deleted = await db
			.delete(session)
			.where(lt(session.expiresAt, now))
			.returning({ id: session.id });
		logger.info('Deleted expired sessions', { count: deleted.length });
	}
});
