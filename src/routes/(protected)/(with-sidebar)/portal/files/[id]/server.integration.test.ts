/**
 * How a speaker's own file leaves the portal (#626).
 *
 * The bucket is the only stand-in. Ownership is real: the speaker who owns
 * the task gets the bytes, a stranger's id selects nothing. Inline is only
 * for types we render, and the type we send is one we chose — a stored
 * `text/html` must not become a page on this origin.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { deliverableTable, taskTable } from '$lib/server/db/conference/content-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from './+server';

const suffix = `portal-file-get-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const speakerId = `speaker-${suffix}`;
const strangerId = `stranger-${suffix}`;

let pdfId = 0;
let jpgId = 0;
let docxId = 0;
let htmlNamedPdfId = 0;

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

function getEvent(id: number, userId = speakerId, withBucket = true) {
	return {
		params: { id: String(id) },
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
	await db.insert(organization).values({
		id: organizationId,
		name: 'Portal File Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values([
		{
			id: speakerId,
			email: `${speakerId}@example.test`,
			emailVerified: true,
			name: 'Priya'
		},
		{
			id: strangerId,
			email: `${strangerId}@example.test`,
			emailVerified: true,
			name: 'Stranger'
		}
	]);

	const [conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Portal File Conf', slug: `conf-${suffix}` })
		.returning();

	const [speaker] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			userId: speakerId,
			name: 'Priya Shah',
			sortName: 'Shah, Priya'
		})
		.returning();

	const tasks = await db
		.insert(taskTable)
		.values([
			{
				conferenceId: conference.id,
				speakerProfileId: speaker.id,
				title: 'Slides',
				kind: 'file_request'
			},
			{
				conferenceId: conference.id,
				speakerProfileId: speaker.id,
				title: 'Headshot',
				kind: 'file_request'
			},
			{
				conferenceId: conference.id,
				speakerProfileId: speaker.id,
				title: 'Notes',
				kind: 'file_request'
			},
			{
				conferenceId: conference.id,
				speakerProfileId: speaker.id,
				title: 'Trap',
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
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, speakerId));
	await db.delete(user).where(eq(user.id, strangerId));
});

describe('speaker file download', () => {
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

	it('does not serve a file to someone who does not own the task', async () => {
		await expect(GET(getEvent(pdfId, strangerId))).rejects.toMatchObject({ status: 404 });
	});

	it('says storage is unconfigured rather than returning empty bytes', async () => {
		await expect(GET(getEvent(pdfId, speakerId, false))).rejects.toMatchObject({ status: 503 });
	});
});
