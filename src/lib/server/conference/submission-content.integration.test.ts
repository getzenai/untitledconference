/**
 * The organizer's write into someone else's talk.
 *
 * The submission id arrives from the URL, so — as with `recordings` — the only thing
 * between an organizer of conference A and conference B's talk is the conference in
 * the WHERE clause. Beyond that, two things are worth a test of their own because the
 * screen cannot enforce them: a submitted talk must keep an abstract, and every
 * accepted edit must leave behind what it replaced.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { contentRevisionTable } from '$lib/server/db/conference/content-schema';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editSubmissionContent, lastContentEdit } from './submission-content';

const suffix = `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const editorId = `editor-${suffix}`;

let conference: Conference;
let other: Conference;

async function addSubmission(
	target: Conference,
	title: string,
	status: 'draft' | 'submitted' = 'submitted'
) {
	const [row] = await db
		.insert(submissionTable)
		.values({
			conferenceId: target.id,
			title,
			abstract: 'The abstract as the speaker wrote it.',
			keyTakeaway: 'Take this away.',
			audienceLevel: 'Intermediate',
			status
		})
		.returning();
	return row.id;
}

const storedContent = async (id: number) => {
	const [row] = await db
		.select({
			title: submissionTable.title,
			abstract: submissionTable.abstract,
			keyTakeaway: submissionTable.keyTakeaway,
			audienceLevel: submissionTable.audienceLevel
		})
		.from(submissionTable)
		.where(eq(submissionTable.id, id));
	return row;
};

const revisions = async (id: number) =>
	db
		.select({ snapshot: contentRevisionTable.snapshot, editedBy: contentRevisionTable.editedBy })
		.from(contentRevisionTable)
		.where(
			and(eq(contentRevisionTable.entityType, 'submission'), eq(contentRevisionTable.entityId, id))
		)
		.orderBy(desc(contentRevisionTable.id));

const edit = (conferenceId: number, id: number, input: Partial<Record<string, string | null>>) =>
	editSubmissionContent(conferenceId, id, editorId, {
		title: (input.title as string) ?? 'A talk about tests',
		abstract: input.abstract === undefined ? 'A new abstract.' : input.abstract,
		keyTakeaway: input.keyTakeaway === undefined ? 'Take this away.' : input.keyTakeaway,
		audienceLevel: input.audienceLevel === undefined ? 'Intermediate' : input.audienceLevel
	});

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Content Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: editorId,
		name: 'Olivia Organizer',
		email: `${editorId}@example.com`,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Content Conf', slug: suffix })
		.returning();
	[other] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Neighbour Conf', slug: `${suffix}-other` })
		.returning();
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, editorId));
});

describe('editing a talk as the organizer', () => {
	it('rewrites all four fields and keeps what it replaced', async () => {
		const id = await addSubmission(conference, 'A tlak about tests');

		const result = await edit(conference.id, id, {
			title: 'A talk about tests',
			abstract: 'A new abstract.',
			keyTakeaway: 'Something else',
			audienceLevel: 'Advanced'
		});

		expect(result).toEqual({ ok: true, changed: true });
		expect(await storedContent(id)).toEqual({
			title: 'A talk about tests',
			abstract: 'A new abstract.',
			keyTakeaway: 'Something else',
			audienceLevel: 'Advanced'
		});

		const [revision] = await revisions(id);
		expect(revision.editedBy).toBe(editorId);
		// The snapshot is the BEFORE, which is what makes it a history rather than a
		// second copy of the row we can already read.
		expect(JSON.parse(revision.snapshot)).toEqual({
			title: 'A tlak about tests',
			abstract: 'The abstract as the speaker wrote it.',
			keyTakeaway: 'Take this away.',
			audienceLevel: 'Intermediate'
		});
	});

	it('writes nothing, and no revision, when the text is unchanged', async () => {
		const id = await addSubmission(conference, 'Nothing moves here');

		const result = await edit(conference.id, id, {
			title: 'Nothing moves here',
			abstract: 'The abstract as the speaker wrote it.'
		});

		expect(result).toEqual({ ok: true, changed: false });
		expect(await revisions(id)).toHaveLength(0);
	});

	it('treats a whitespace-only field as empty rather than storing the blanks', async () => {
		const id = await addSubmission(conference, 'Trimmed', 'draft');

		await edit(conference.id, id, { title: '  Trimmed  ', abstract: '   ', keyTakeaway: '  ' });

		const stored = await storedContent(id);
		expect(stored.title).toBe('Trimmed');
		expect(stored.abstract).toBeNull();
		expect(stored.keyTakeaway).toBeNull();
	});

	it('refuses an empty title, and changes nothing', async () => {
		const id = await addSubmission(conference, 'Keeps its name');

		const result = await edit(conference.id, id, { title: '   ' });

		expect(result).toEqual({
			ok: false,
			reason: 'invalid',
			errors: { title: 'A title is required.' }
		});
		expect((await storedContent(id)).title).toBe('Keeps its name');
		expect(await revisions(id)).toHaveLength(0);
	});

	it('refuses to empty the abstract of a submitted talk', async () => {
		// `validateForSubmit` will not let a speaker submit without one, so an organizer
		// emptying it afterwards would produce a state the product says cannot exist —
		// on the public programme, of all places.
		const id = await addSubmission(conference, 'Has an abstract');

		const result = await edit(conference.id, id, { abstract: '' });

		expect(result).toEqual({
			ok: false,
			reason: 'invalid',
			errors: { abstract: 'A submitted talk needs an abstract.' }
		});
		expect((await storedContent(id)).abstract).toBe('The abstract as the speaker wrote it.');
	});

	it('still fixes the title of a talk that never had an abstract', async () => {
		// The rule is about removing the speaker's text, not about the field being
		// empty. Reading it the other way would hold a typo on the public programme
		// hostage to a gap the organizer did not create.
		const [row] = await db
			.insert(submissionTable)
			.values({
				conferenceId: conference.id,
				title: 'Bare tlak',
				abstract: null,
				status: 'accepted'
			})
			.returning();

		const result = await editSubmissionContent(conference.id, row.id, editorId, {
			title: 'Bare talk',
			abstract: '',
			keyTakeaway: null,
			audienceLevel: null
		});

		expect(result).toEqual({ ok: true, changed: true });
		expect((await storedContent(row.id)).title).toBe('Bare talk');
	});

	it('lets a draft keep an empty abstract, exactly as the speaker’s own form does', async () => {
		const id = await addSubmission(conference, 'Still a draft', 'draft');

		expect(await edit(conference.id, id, { abstract: '' })).toEqual({ ok: true, changed: true });
		expect((await storedContent(id)).abstract).toBeNull();
	});

	it('refuses a talk belonging to another conference, and changes nothing', async () => {
		// The same organization owns both, so ownership alone would let this through.
		const id = await addSubmission(other, 'Their talk');

		expect(await edit(conference.id, id, { title: 'Hijacked' })).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect((await storedContent(id)).title).toBe('Their talk');
	});

	it('reports not_found for a talk that does not exist', async () => {
		expect(await edit(conference.id, 999_999_999, {})).toEqual({ ok: false, reason: 'not_found' });
	});
});

describe('the trail the screen shows', () => {
	it('names the latest editor, and nobody before an edit', async () => {
		const id = await addSubmission(conference, 'Untouched so far');
		expect(await lastContentEdit(id)).toBeNull();

		await edit(conference.id, id, { title: 'Touched once' });
		await edit(conference.id, id, { title: 'Touched twice' });

		const trail = await lastContentEdit(id);
		expect(trail?.editorName).toBe('Olivia Organizer');
		// Two edits, one line: the screen says who changed it last, not a changelog.
		expect(await revisions(id)).toHaveLength(2);
	});
});
