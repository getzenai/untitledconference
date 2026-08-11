/**
 * The `?/import` action, measured through the door an organizer actually uses.
 *
 * `importSpeakers` has its own suite; what is only true here is the wiring: an
 * attached file and a pasted block reach the same reader, the answer comes back
 * addressed to the import section rather than the page banner, and a file that is
 * the wrong kind of thing entirely is refused before it is read.
 *
 * The assertion after a refusal is always the roster, never the message. A wrong
 * sentence is a nuisance; a refusal that wrote half a file is the thing that makes
 * "fix it and send it again" bad advice.
 */
import { listConferenceSpeakers } from '$lib/server/conference/speakers';
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actions } from './+page.server';

const suffix = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const slug = `conf-${suffix}`;

let conference: Conference;

/** One submit of the import form. `file` when a file was attached, `csv` when it was pasted. */
function importEvent(fields: { csv?: string; file?: File }) {
	const body = new FormData();
	if (fields.csv !== undefined) body.append('csv', fields.csv);
	if (fields.file) body.append('file', fields.file);

	return {
		request: new Request(`http://localhost/manage/${slug}/speakers?/import`, {
			method: 'POST',
			body
		}),
		params: { slug },
		locals: { user: { id: organizerId } }
	} as unknown as Parameters<typeof actions.import>[0];
}

const csvFor = (name: string, email: string) => `name,email\n${name},${email}\n`;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Import Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values({
		id: organizerId,
		email: `${organizerId}@example.test`,
		emailVerified: true,
		name: 'An Organizer'
	});

	// requireOrganizer resolves the right from an org-wide seat; without it every
	// call below would 404 and the test would pass for the wrong reason.
	await db.insert(member).values({
		id: `member-${suffix}`,
		organizationId,
		userId: organizerId,
		role: 'owner',
		createdAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Import Conf', slug })
		.returning();
});

beforeEach(async () => {
	await db
		.delete(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.conferenceId, conference.id));
	await db
		.delete(speakerProfileTable)
		.where(eq(speakerProfileTable.organizationId, organizationId));
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
});

describe('speakers ?/import', () => {
	it('takes an attached file', async () => {
		const file = new File([csvFor('Ada Bennett', `ada-${suffix}@example.com`)], 'speakers.csv', {
			type: 'text/csv'
		});

		const result = await actions.import(importEvent({ file }));

		expect(result).toEqual({ scope: 'import', message: 'Imported 1 speaker.' });
		expect((await listConferenceSpeakers(conference.id)).map((r) => r.name)).toEqual([
			'Ada Bennett'
		]);
	});

	it('takes the same rows pasted, for anybody without a file to attach', async () => {
		const result = await actions.import(
			importEvent({ csv: csvFor('Ada Bennett', `ada-${suffix}@example.com`) })
		);

		expect(result).toEqual({ scope: 'import', message: 'Imported 1 speaker.' });
		expect((await listConferenceSpeakers(conference.id)).length).toBe(1);
	});

	it('prefers the file when both arrive, rather than importing twice', async () => {
		const file = new File([csvFor('From The File', `file-${suffix}@example.com`)], 'speakers.csv');

		const result = await actions.import(
			importEvent({ file, csv: csvFor('From The Box', `box-${suffix}@example.com`) })
		);

		expect(result).toMatchObject({ scope: 'import' });
		expect((await listConferenceSpeakers(conference.id)).map((r) => r.name)).toEqual([
			'From The File'
		]);
	});

	it('says what to do when neither arrives', async () => {
		const result = await actions.import(importEvent({ csv: '   ' }));

		expect(result).toMatchObject({
			status: 400,
			data: { scope: 'import', error: 'Choose a CSV file, or paste the rows.' }
		});
	});

	it('refuses a file that is not a speaker list, and leaves the roster alone', async () => {
		// A PDF renamed to .csv, which is what an attachment picked in a hurry is.
		const file = new File(['%PDF-1.7\n%âãÏÓ\nnot a spreadsheet'], 'slides.csv');

		const result = await actions.import(importEvent({ file }));

		expect(result).toMatchObject({ status: 400, data: { scope: 'import' } });
		expect(await listConferenceSpeakers(conference.id)).toEqual([]);
	});

	it('refuses an oversized file before reading it', async () => {
		const file = new File(['x'.repeat(1024 * 1024 + 1)], 'huge.csv');

		const result = await actions.import(importEvent({ file }));

		expect(result).toMatchObject({ status: 413, data: { scope: 'import' } });
		expect(await listConferenceSpeakers(conference.id)).toEqual([]);
	});

	it('names the row it refused and writes none of the file', async () => {
		const result = await actions.import(
			importEvent({
				csv:
					`name,email\n` +
					`Ada Bennett,ada-${suffix}@example.com\n` +
					`,orphan-${suffix}@example.com\n`
			})
		);

		expect(result).toMatchObject({
			status: 400,
			data: { scope: 'import', error: 'Row 3 has no name. Every speaker needs one.' }
		});
		expect(await listConferenceSpeakers(conference.id)).toEqual([]);
	});
});
