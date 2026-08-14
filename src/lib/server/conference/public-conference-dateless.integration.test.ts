/**
 * The loader's half of #492: a published conference that has no dates.
 *
 * `/manage/new` creates a conference from a name alone, and Settings publishes it
 * without ever asking for dates — so `starts_on` is null in production, on a live
 * public site. The loader used to hand that on as `''`, which the header formatter
 * turned into `new Date('')` and threw on: `/c/<slug>` and every page under it
 * answered 500 while the organizer view said "Published".
 *
 * The empty string is the whole bug, so the assertion is on the null surviving —
 * a payload that says "no date" can be rendered as nothing, one that says "" cannot.
 */
import { formatDateRange } from '$lib/conference/public-view';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadPublicConference } from './public-conference';

const suffix = `dateless-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const slug = `conf-${suffix}`;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Dateless Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(conferenceTable).values({
		organizationId,
		name: 'Dateless Conf',
		slug,
		status: 'published'
	});
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('a published conference with no dates', () => {
	it('is served, with its missing dates still missing', async () => {
		const conference = await loadPublicConference(slug);

		expect(conference).not.toBeNull();
		expect(conference?.startsOn).toBeNull();
		expect(conference?.endsOn).toBeNull();
	});

	it('has no date line to render, rather than an unformattable one', async () => {
		const conference = await loadPublicConference(slug);

		expect(formatDateRange(conference!)).toBeNull();
	});
});
