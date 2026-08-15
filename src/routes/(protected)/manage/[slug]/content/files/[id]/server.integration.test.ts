/**
 * How a single file leaves the organizer library (#423).
 *
 * The bucket is the only stand-in. The rest is real: conference, row, scoping,
 * and the headers a preview path depends on. Inline is only for types we
 * render, and the type we send is one we chose — a stored `text/html` must
 * not become a page on this origin.
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { deliverableTable, taskTable } from '$lib/server/db/conference/content-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from './+server';

const suffix = `file-get-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const strangerId = `stranger-${suffix}`;
const slug = `conf-${suffix}`;

let conferenceId = 0;
let pdfId = 0;
let jpgId = 0;
let docxId = 0;
let htmlNamedPdfId = 0;
let foreignId = 0;

const objects = new Map<string, string>();

const bucket = {
	get: async (key: string) => {
		const body = objects.get(key);
		if (body === undefined) return null;
		return {
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(body));
					controller.close();
				}
			})
		};
	}
};

function getEvent(id: number, userId = organizerId, withBucket = true) {
	return {
		params: { slug, id: String(id) },
		locals: { user: { id: userId } },
		platform: withBucket ? { env: { UPLOADS: bucket } } : undefined
	} as unknown as Parameters<typeof GET>[0];
}

async function makeFile(taskId: number, filename: string, contentType: string, contents: string) {
	const key = `key/${suffix}/task-${taskId}/${filename}`;
	objects.set(key, contents);
	const [file] = await db
		.insert(deliverableTable)
		.values({
			taskId,
			fileUrl: key,
			filename,
			contentType,
			sizeBytes: contents.length,
			version: 1
		})
		.returning();
	return file.id;
}

beforeAll(async () => {
	await db
		.insert(organization)
		.values({ id: organizationId, name: 'File Org', slug: organizationId, createdAt: new Date() });
	await db.insert(user).values([
		{
			id: organizerId,
			email: `${organizerId}@example.test`,
			emailVerified: true,
			name: 'Jordan'
		},
		{
			id: strangerId,
			email: `${strangerId}@example.test`,
			emailVerified: true,
			name: 'Stranger'
		}
	]);
	await db.insert(member).values({
		id: `member-${suffix}`,
		organizationId,
		userId: organizerId,
		role: 'owner',
		createdAt: new Date()
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'File Conf', slug })
		.returning();
	conferenceId = conference.id;

	const [other] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Other Conf', slug: `other-${suffix}` })
		.returning();

	const [speaker] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Ada Bennett', sortName: 'Bennett, Ada' })
		.returning();

	const tasks = await db
		.insert(taskTable)
		.values([
			{ conferenceId, speakerProfileId: speaker.id, title: 'Slides', kind: 'file_request' },
			{ conferenceId, speakerProfileId: speaker.id, title: 'Headshot', kind: 'file_request' },
			{ conferenceId, speakerProfileId: speaker.id, title: 'Notes', kind: 'file_request' },
			{ conferenceId, speakerProfileId: speaker.id, title: 'Trap', kind: 'file_request' },
			{
				conferenceId: other.id,
				speakerProfileId: speaker.id,
				title: 'Not this conference',
				kind: 'file_request'
			}
		])
		.returning();

	pdfId = await makeFile(tasks[0].id, 'slides.pdf', 'application/pdf', '%PDF-1.4');
	jpgId = await makeFile(tasks[1].id, 'headshot.jpg', 'image/jpeg', 'jpeg-bytes');
	docxId = await makeFile(
		tasks[2].id,
		'notes.docx',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'docx-bytes'
	);
	htmlNamedPdfId = await makeFile(
		tasks[3].id,
		'slides.pdf',
		'text/html',
		'<script>alert(1)</script>'
	);
	foreignId = await makeFile(tasks[4].id, 'secret.pdf', 'application/pdf', 'not yours');
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
	await db.delete(user).where(eq(user.id, strangerId));
});

describe('organizer file download', () => {
	it('inlines a PDF and a JPEG as types we chose', async () => {
		const pdf = await GET(getEvent(pdfId));
		expect(pdf.status).toBe(200);
		expect(pdf.headers.get('Content-Type')).toBe('application/pdf');
		expect(pdf.headers.get('Content-Disposition')).toMatch(/^inline;/);
		expect(pdf.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(pdf.headers.get('Cache-Control')).toBe('private, no-store');

		const jpg = await GET(getEvent(jpgId));
		expect(jpg.status).toBe(200);
		expect(jpg.headers.get('Content-Type')).toBe('image/jpeg');
		expect(jpg.headers.get('Content-Disposition')).toMatch(/^inline;/);
	});

	it('keeps attachment when we cannot render the type, including a friendly name on html', async () => {
		const docx = await GET(getEvent(docxId));
		expect(docx.status).toBe(200);
		expect(docx.headers.get('Content-Disposition')).toMatch(/^attachment;/);

		const trap = await GET(getEvent(htmlNamedPdfId));
		expect(trap.status).toBe(200);
		expect(trap.headers.get('Content-Disposition')).toMatch(/^attachment;/);
		expect(trap.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('does not serve another conference’s file, even by id', async () => {
		await expect(GET(getEvent(foreignId))).rejects.toMatchObject({ status: 404 });
	});

	it('does not serve a file to someone who does not organise the conference', async () => {
		await expect(GET(getEvent(pdfId, strangerId))).rejects.toMatchObject({ status: 404 });
	});

	it('says storage is unconfigured rather than returning empty bytes', async () => {
		await expect(GET(getEvent(pdfId, organizerId, false))).rejects.toMatchObject({ status: 503 });
	});
});
