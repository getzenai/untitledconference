/**
 * Chasing speakers about open deliverables (CNT-08).
 *
 * The cases worth a database are the ones a reading of the code does not settle: that
 * "outstanding" means an open task and not a file already waiting on the organizer,
 * that a second click does not stack a second unsent email while a first still sits
 * queued, that a *sent* reminder does not block next week's chase, and that a speaker
 * profile id belonging to another conference selects nothing — the tenancy lives on
 * `task`, because a speaker profile belongs to the organization rather than to one
 * conference.
 *
 * Hermetic: the fixture states its own preconditions rather than leaning on the seed.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import {
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { taskTable } from '$lib/server/db/conference/content-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queueDeliverableReminders } from './deliverable-reminders';

const suffix = `deliv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

let conference: Conference;
let otherConference: Conference;
/** Has an open task and an address: the ordinary case. */
let behind: number;
/** Handed in already — waiting on the organizer, not behind on anything. */
let handedIn: number;
/** Open task, no address to send to. */
let unreachable: number;
/** Behind, but in another conference. */
let stranger: number;

const speaker = async (name: string, email: string | null) => {
	const [row] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name, sortName: name, email })
		.returning({ id: speakerProfileTable.id });
	return row.id;
};

const task = (conferenceId: number, speakerProfileId: number, status: 'open' | 'submitted') =>
	db.insert(taskTable).values({
		conferenceId,
		speakerProfileId,
		title: `Upload slides (${status})`,
		kind: 'file_request',
		status
	});

const reminders = () =>
	db
		.select()
		.from(emailLogTable)
		.where(
			and(
				eq(emailLogTable.conferenceId, conference.id),
				eq(emailLogTable.template, 'task_reminder')
			)
		);

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Deliverables Org',
		slug: organizationId,
		createdAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Deliverables Conf', slug: suffix })
		.returning();
	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Other Conf', slug: `${suffix}-other` })
		.returning();

	behind = await speaker('Behind Bella', `behind-${suffix}@example.test`);
	handedIn = await speaker('Handed Hana', `handed-${suffix}@example.test`);
	unreachable = await speaker('Unreachable Uli', null);
	stranger = await speaker('Stranger Sam', `stranger-${suffix}@example.test`);

	await task(conference.id, behind, 'open');
	await task(conference.id, behind, 'open');
	await task(conference.id, handedIn, 'submitted');
	await task(conference.id, unreachable, 'open');
	await task(otherConference.id, stranger, 'open');
});

beforeEach(async () => {
	await db.delete(emailLogTable).where(eq(emailLogTable.conferenceId, conference.id));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('queueDeliverableReminders', () => {
	it('queues one reminder naming how many tasks are open', async () => {
		expect(await queueDeliverableReminders(conference, [behind])).toMatchObject({ queued: 1 });

		const rows = await reminders();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			toEmail: `behind-${suffix}@example.test`,
			template: 'task_reminder',
			relatedType: 'speaker',
			relatedId: behind
		});
		// Two open tasks, so the subject has to say two — a reminder that does not
		// say how much is left is a reminder the speaker has to come and count.
		expect(rows[0].subject).toContain('2 ');
	});

	it('skips a speaker whose file is already in and waiting on the organizer', async () => {
		expect(await queueDeliverableReminders(conference, [handedIn])).toMatchObject({
			nothing_outstanding: 1
		});
		expect(await reminders()).toHaveLength(0);
	});

	it('skips a speaker with no address rather than writing a row nothing can send', async () => {
		expect(await queueDeliverableReminders(conference, [unreachable])).toMatchObject({
			no_email: 1
		});
		expect(await reminders()).toHaveLength(0);
	});

	it('refuses a speaker whose open task belongs to another conference', async () => {
		expect(await queueDeliverableReminders(conference, [stranger])).toMatchObject({
			nothing_outstanding: 1
		});
		expect(await reminders()).toHaveLength(0);
	});

	it('reports every category from one mixed selection and mails only the reachable one', async () => {
		expect(
			await queueDeliverableReminders(conference, [behind, handedIn, unreachable, stranger])
		).toEqual({ queued: 1, already_queued: 0, nothing_outstanding: 2, no_email: 1 });
		expect(await reminders()).toHaveLength(1);
	});

	it('counts a repeated id once', async () => {
		expect(await queueDeliverableReminders(conference, [behind, behind])).toMatchObject({
			queued: 1,
			already_queued: 0
		});
		expect(await reminders()).toHaveLength(1);
	});

	it('does not stack a second unsent reminder', async () => {
		expect(await queueDeliverableReminders(conference, [behind])).toMatchObject({ queued: 1 });
		expect(await queueDeliverableReminders(conference, [behind])).toMatchObject({
			already_queued: 1
		});
		expect(await reminders()).toHaveLength(1);
	});

	/**
	 * The one rule that differs from the reviewer reminder: deliverables are chased
	 * until the file arrives, so last week's delivered reminder must not make this
	 * week's impossible.
	 */
	it('allows a new reminder once the previous one has been sent', async () => {
		expect(await queueDeliverableReminders(conference, [behind])).toMatchObject({ queued: 1 });
		const [first] = await reminders();
		await db
			.update(emailLogTable)
			.set({ status: 'sent', sentAt: new Date() })
			.where(eq(emailLogTable.id, first.id));

		expect(await queueDeliverableReminders(conference, [behind])).toMatchObject({ queued: 1 });
		expect(await reminders()).toHaveLength(2);
	});
});
