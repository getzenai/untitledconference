/**
 * What the front door advertises, and a way to take one down (#426).
 *
 * `listedPublicly` is editable in exactly one place: the per-conference settings
 * page, by an organizer of that conference. That was fine until a conference
 * outlived everyone who could reach it — a fixture called
 * `grok-juror-1786581216747` sat on the front page with no account left that
 * could unlist it, and the only other answer was a hand-written statement
 * against production.
 *
 * So this is the platform admin's one-way valve: it can take a conference **off**
 * the directory, never put one on. Listing is the organizer's decision about
 * their own event; removing something the product is advertising to strangers is
 * the platform's. A toggle here would quietly hand an admin the first, which is
 * not the hole that needed filling.
 */
import { setConferenceListing } from '$lib/server/conference/visibility';
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { createLogger } from '$lib/server/logger';
import { fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

const logger = createLogger('AdminConferences');

export const load: PageServerLoad = async () => {
	// `(admin)/+layout.server.ts` has already turned away anyone who is not an
	// admin; the action below re-checks anyway, because a load is not a guard.
	const conferences = await db
		.select({
			id: conferenceTable.id,
			name: conferenceTable.name,
			slug: conferenceTable.slug,
			status: conferenceTable.status,
			listedPublicly: conferenceTable.listedPublicly,
			organizationName: organization.name
		})
		.from(conferenceTable)
		.leftJoin(organization, eq(organization.id, conferenceTable.organizationId))
		.where(eq(conferenceTable.listedPublicly, true))
		.orderBy(asc(conferenceTable.name));

	// Published *and* listed is what a visitor actually sees; a listed draft is
	// invisible to them. Both are shown, and the page says which is which, so an
	// admin hunting for "why is this on the front page" is not told about rows
	// that are not.
	return { conferences };
};

export const actions: Actions = {
	unlist: async ({ locals, request }) => {
		if (!locals.isAdmin) return fail(403, { error: 'Admins only.' });

		const form = await request.formData();
		const id = Number(form.get('conferenceId'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Unknown conference.' });

		const [conference] = await db
			.select({
				id: conferenceTable.id,
				name: conferenceTable.name,
				status: conferenceTable.status,
				listedPublicly: conferenceTable.listedPublicly
			})
			.from(conferenceTable)
			.where(eq(conferenceTable.id, id))
			.limit(1);

		if (!conference) return fail(404, { error: 'Unknown conference.' });

		const result = await setConferenceListing(conference, false);
		logger.info(
			`Admin ${locals.user?.email} unlisted conference ${conference.name} (changed=${result.changed})`
		);

		return {
			success: true,
			message: result.changed
				? `${conference.name} is no longer on the front page.`
				: `${conference.name} was already off the front page.`
		};
	}
};
