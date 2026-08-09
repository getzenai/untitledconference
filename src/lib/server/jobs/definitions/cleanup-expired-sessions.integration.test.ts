import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as authSchema from '../../db/auth-schema';
import { closeTestDatabase, createTestDatabase, createTestUser } from '../../db/test-utils';
import { serverEnv } from '../../env';
import { startWorker, stopBoss } from '../index';
import { cleanupExpiredSessionsJob } from './cleanup-expired-sessions';

const CONNECTION_ID = 'jobs-cleanup-expired-sessions';

describe('cleanup-expired-sessions job', () => {
	beforeAll(async () => {
		// The handler writes through the app's `db`, the assertions read through
		// the test-utils connection — they must point at the same database.
		expect(serverEnv().DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
		await startWorker([cleanupExpiredSessionsJob]);
	});

	afterAll(async () => {
		await stopBoss();
		await closeTestDatabase(CONNECTION_ID);
	});

	it('deletes expired sessions and leaves active ones untouched', async () => {
		const db = createTestDatabase(CONNECTION_ID);
		const user = await createTestUser(
			{ email: `cleanup-expired-${Date.now()}@example.com` },
			CONNECTION_ID
		);

		const expiredId = `expired_${Date.now()}`;
		const activeId = `active_${Date.now()}`;

		await db.insert(authSchema.session).values([
			{
				id: expiredId,
				token: `${expiredId}_token`,
				userId: user.id,
				expiresAt: new Date(Date.now() - 60_000),
				createdAt: new Date(),
				updatedAt: new Date()
			},
			{
				id: activeId,
				token: `${activeId}_token`,
				userId: user.id,
				expiresAt: new Date(Date.now() + 60_000),
				createdAt: new Date(),
				updatedAt: new Date()
			}
		]);

		await cleanupExpiredSessionsJob.enqueue({});

		await expect
			.poll(
				async () => {
					const rows = await db
						.select({ id: authSchema.session.id })
						.from(authSchema.session)
						.where(eq(authSchema.session.id, expiredId));
					return rows.length;
				},
				{ timeout: 15_000, interval: 250 }
			)
			.toBe(0);

		const remaining = await db
			.select({ id: authSchema.session.id })
			.from(authSchema.session)
			.where(eq(authSchema.session.id, activeId));
		expect(remaining).toHaveLength(1);
	});
});
