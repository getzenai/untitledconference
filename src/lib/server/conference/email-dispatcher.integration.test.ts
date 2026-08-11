import { db, withRequestScopedDb } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchQueuedEmails } from './email-dispatcher';

const suffix = `mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
let conferenceId: number;

function onOwnConnection<T>(fn: () => Promise<T>): Promise<T> {
	let closing: Promise<void> | undefined;
	return withRequestScopedDb(fn, (promise) => {
		closing = promise;
	}).finally(() => closing);
}

async function queuedMail() {
	const [row] = await db
		.insert(emailLogTable)
		.values({
			conferenceId,
			toEmail: `${suffix}@example.com`,
			template: 'test',
			subject: 'Test mail',
			bodyPreview: 'Hello from the outbox.'
		})
		.returning();
	return row;
}

beforeAll(async () => {
	await db
		.insert(organization)
		.values({ id: organizationId, name: 'Mail Org', slug: organizationId, createdAt: new Date() });
	const [conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Mail Conf', slug: suffix })
		.returning();
	conferenceId = conference.id;
});

beforeEach(async () => {
	await db.delete(emailLogTable).where(eq(emailLogTable.conferenceId, conferenceId));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('dispatchQueuedEmails', () => {
	it('claims a row once when two dispatchers overlap, then never resends it', async () => {
		const row = await queuedMail();
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		let started!: () => void;
		const transportStarted = new Promise<void>((resolve) => (started = resolve));
		const transport = vi.fn(async () => {
			started();
			await held;
		});

		const first = onOwnConnection(() =>
			dispatchQueuedEmails({ conferenceId, limit: 1, transport })
		);
		await transportStarted;
		const second = await onOwnConnection(() =>
			dispatchQueuedEmails({ conferenceId, limit: 1, transport })
		);
		release();
		await first;
		await dispatchQueuedEmails({ conferenceId, transport });

		expect(second.sent).toBe(0);
		expect(transport).toHaveBeenCalledOnce();
		expect(transport).toHaveBeenCalledWith(expect.objectContaining({ id: row.id }));
		const [stored] = await db.select().from(emailLogTable).where(eq(emailLogTable.id, row.id));
		expect(stored.status).toBe('sent');
		expect(stored.sentAt).toBeInstanceOf(Date);
		expect(stored.error).toBeNull();
	});

	it('persists a bounded provider error on the row', async () => {
		const row = await queuedMail();

		const result = await dispatchQueuedEmails({
			conferenceId,
			transport: async () => {
				throw new Error(`provider unavailable ${'x'.repeat(1200)}`);
			}
		});

		expect(result).toMatchObject({ sent: 0, failed: 1, remaining: 0, disabled: false });
		const [stored] = await db.select().from(emailLogTable).where(eq(emailLogTable.id, row.id));
		expect(stored.status).toBe('failed');
		expect(stored.sentAt).toBeNull();
		expect(stored.error).toHaveLength(1000);
	});

	it('dispatches only the rows attributed to the current request', async () => {
		const unrelated = await queuedMail();
		const selected = await queuedMail();
		const transport = vi.fn(async () => undefined);

		const result = await dispatchQueuedEmails({
			conferenceId,
			emailIds: [selected.id],
			transport
		});

		expect(result).toEqual({ sent: 1, failed: 0, remaining: 0, disabled: false });
		expect(transport).toHaveBeenCalledOnce();
		expect(transport).toHaveBeenCalledWith(expect.objectContaining({ id: selected.id }));
		const stored = await db
			.select({ id: emailLogTable.id, status: emailLogTable.status })
			.from(emailLogTable)
			.where(eq(emailLogTable.conferenceId, conferenceId));
		expect(stored).toEqual(
			expect.arrayContaining([
				{ id: unrelated.id, status: 'queued' },
				{ id: selected.id, status: 'sent' }
			])
		);
	});
});
