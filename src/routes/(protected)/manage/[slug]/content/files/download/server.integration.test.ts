/**
 * The bulk download, driven through the handler with a stand-in bucket.
 *
 * The bucket is the only thing faked — a `get` that hands back bytes is the whole
 * contract this route has with R2, and faking it is what lets the rest be real:
 * a real conference, real rows, real scoping, and a real ZIP at the end that the
 * system `unzip` opens.
 *
 * The scoping test is the one that matters. Ids arrive from a form, so a
 * selection naming another conference's file is not a strange case, it is the
 * shape an attack takes.
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { deliverableTable, taskTable } from '$lib/server/db/conference/content-schema';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from './+server';

const suffix = `zip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const slug = `conf-${suffix}`;

let conferenceId = 0;
let adaFileId = 0;
let priyaFileId = 0;
let goneFileId = 0;
let foreignFileId = 0;

/** What each stored key holds. A key with no entry is an object that is gone. */
const objects = new Map<string, string>();

const bucket = {
	get: async (key: string) => {
		const body = objects.get(key);
		if (body === undefined) return null;
		return { arrayBuffer: async () => new TextEncoder().encode(body).buffer };
	}
};

function downloadEvent(ids: number[], group?: 'speaker' | 'flat', withBucket = true) {
	const body = new FormData();
	for (const id of ids) body.append('id', String(id));
	if (group) body.append('group', group);

	return {
		request: new Request(`http://localhost/manage/${slug}/content/files/download`, {
			method: 'POST',
			body
		}),
		params: { slug },
		locals: { user: { id: organizerId } },
		platform: withBucket ? { env: { UPLOADS: bucket } } : undefined,
		url: new URL(`http://localhost/manage/${slug}/content/files/download`)
	} as unknown as Parameters<typeof POST>[0];
}

async function makeFile(taskId: number, filename: string, contents: string | null, version = 1) {
	// The key has to carry the task: two speakers who both called their deck
	// `slides.pdf` would otherwise share one object, and the fixture would be
	// testing something other than what it says.
	const key = `key/${suffix}/task-${taskId}/v${version}/${filename}`;
	if (contents !== null) objects.set(key, contents);

	const [file] = await db
		.insert(deliverableTable)
		.values({
			taskId,
			fileUrl: key,
			filename,
			contentType: 'application/pdf',
			sizeBytes: contents?.length ?? 0,
			version
		})
		.returning();
	return file.id;
}

beforeAll(async () => {
	await db
		.insert(organization)
		.values({ id: organizationId, name: 'Zip Org', slug: organizationId, createdAt: new Date() });
	await db.insert(user).values({
		id: organizerId,
		email: `${organizerId}@example.test`,
		emailVerified: true,
		name: 'Jordan'
	});
	await db.insert(member).values({
		id: `member-${suffix}`,
		organizationId,
		userId: organizerId,
		role: 'owner',
		createdAt: new Date()
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Zip Conf', slug })
		.returning();
	conferenceId = conference.id;

	const [other] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Other Conf', slug: `other-${suffix}` })
		.returning();

	const speakers = await db
		.insert(speakerProfileTable)
		.values([
			{ organizationId, name: 'Ada Bennett', sortName: 'Bennett, Ada' },
			{ organizationId, name: 'Priya Raman', sortName: 'Raman, Priya' }
		])
		.returning();

	const tasks = await db
		.insert(taskTable)
		.values([
			{
				conferenceId,
				speakerProfileId: speakers[0].id,
				title: 'Upload slides',
				kind: 'file_request'
			},
			{
				conferenceId,
				speakerProfileId: speakers[1].id,
				title: 'Upload slides',
				kind: 'file_request'
			},
			{
				conferenceId,
				speakerProfileId: speakers[1].id,
				title: 'Upload headshot',
				kind: 'file_request'
			},
			{
				conferenceId: other.id,
				speakerProfileId: speakers[0].id,
				title: 'Not this conference',
				kind: 'file_request'
			}
		])
		.returning();

	// Both speakers called their deck the same thing, which is what actually happens.
	adaFileId = await makeFile(tasks[0].id, 'slides.pdf', 'ada deck');
	priyaFileId = await makeFile(tasks[1].id, 'slides.pdf', 'priya deck');
	// A row whose object is not in the bucket: a real inconsistency, not a permission.
	goneFileId = await makeFile(tasks[2].id, 'headshot.png', null);
	foreignFileId = await makeFile(tasks[3].id, 'secret.pdf', 'not yours');
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
});

/** The archive, on disk, where a real extractor can be asked about it. */
function extract(zip: ArrayBuffer): string {
	const dir = mkdtempSync(join(tmpdir(), 'zipdl-'));
	writeFileSync(join(dir, 'files.zip'), new Uint8Array(zip));
	execFileSync('unzip', ['-q', join(dir, 'files.zip'), '-d', dir]);
	return dir;
}

describe('bulk file download', () => {
	it('packs the selection into a folder per speaker, and unzip agrees', async () => {
		const response = await POST(downloadEvent([adaFileId, priyaFileId]));

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/zip');
		expect(response.headers.get('Content-Disposition')).toContain(`${slug}-files-`);
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');

		const dir = extract(await response.arrayBuffer());
		// Two files with one name, kept apart by the folders — which is the whole
		// reason grouping is the default.
		expect(readFileSync(join(dir, 'Ada Bennett', 'slides.pdf'), 'utf8')).toBe('ada deck');
		expect(readFileSync(join(dir, 'Priya Raman', 'slides.pdf'), 'utf8')).toBe('priya deck');
	});

	it('numbers a collision when the organizer asks for no folders', async () => {
		const response = await POST(downloadEvent([adaFileId, priyaFileId], 'flat'));

		const dir = extract(await response.arrayBuffer());
		expect(readFileSync(join(dir, 'slides.pdf'), 'utf8')).toBe('ada deck');
		// Not overwritten, not dropped: the second one is still in there under a name
		// that says it is a second one.
		expect(readFileSync(join(dir, 'slides (2).pdf'), 'utf8')).toBe('priya deck');
	});

	it('never packs a file from another conference, even when asked by id', async () => {
		const response = await POST(downloadEvent([adaFileId, foreignFileId]));

		const dir = extract(await response.arrayBuffer());
		expect(readFileSync(join(dir, 'Ada Bennett', 'slides.pdf'), 'utf8')).toBe('ada deck');
		expect(() => readFileSync(join(dir, 'Ada Bennett', 'secret.pdf'))).toThrow();
	});

	it('refuses a selection made entirely of other people’s ids', async () => {
		await expect(POST(downloadEvent([foreignFileId]))).rejects.toMatchObject({ status: 404 });
	});

	it('refuses an empty selection', async () => {
		await expect(POST(downloadEvent([]))).rejects.toMatchObject({ status: 400 });
	});

	it('delivers the rest when one object has gone missing, and says how many', async () => {
		const response = await POST(downloadEvent([adaFileId, goneFileId]));

		expect(response.headers.get('X-Files-Missing')).toBe('1');
		const dir = extract(await response.arrayBuffer());
		expect(readFileSync(join(dir, 'Ada Bennett', 'slides.pdf'), 'utf8')).toBe('ada deck');
	});

	it('says storage is unconfigured rather than returning an empty archive', async () => {
		await expect(POST(downloadEvent([adaFileId], undefined, false))).rejects.toMatchObject({
			status: 503
		});
	});
});
