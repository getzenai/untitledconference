import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

// The route's own guard is what is under test here, so everything behind it is
// stubbed: importing the real modules would open a database connection, and a
// signed-out request must never reach them anyway.
const requireOrganizer = vi.fn();
const exportSubmissions = vi.fn();

vi.mock('$lib/server/conference/access', () => ({
	requireOrganizer: (...args: unknown[]) => requireOrganizer(...args)
}));
vi.mock('$lib/server/conference/organizer-submissions', () => ({
	exportSubmissions: (...args: unknown[]) => exportSubmissions(...args)
}));

import { GET } from './+server';

const URL_WITH_QUERY =
	'https://app.example.com/manage/devflow/submissions/export.csv?status=submitted&sort=score';

async function anonymousRequest() {
	return GET({
		locals: {},
		params: { slug: 'devflow' },
		url: new URL(URL_WITH_QUERY)
	} as never);
}

describe('the export route without a session', () => {
	it('sends the visitor to the login page instead of crashing', async () => {
		// A `+server.ts` does not run the layout load, so `locals.user` is simply
		// absent here — reaching for `.id` on it is a 500 on an unauthenticated
		// endpoint, which is how this was found in review.
		const thrown = await anonymousRequest().then(
			() => undefined,
			(e: unknown) => e
		);

		expect(thrown).toBeDefined();
		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { status: number }).status).toBe(303);
	});

	it('carries the filters and the order into the return trip', async () => {
		// The link they clicked was a filtered, sorted export. Coming back from
		// /login to an unfiltered one would silently answer a different question.
		const thrown = (await anonymousRequest().catch((e: unknown) => e)) as { location: string };

		expect(thrown.location).toBe(
			`/login?returnTo=${encodeURIComponent('/manage/devflow/submissions/export.csv?status=submitted&sort=score')}`
		);
	});

	it('does not look anything up before it knows who is asking', async () => {
		await anonymousRequest().catch(() => undefined);

		expect(requireOrganizer).not.toHaveBeenCalled();
		expect(exportSubmissions).not.toHaveBeenCalled();
	});
});
