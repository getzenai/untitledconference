/**
 * The agenda feed, exercised against the design fixture.
 *
 * No database: `publicConference` answers the fixture slug from memory, and the
 * fixture is the better subject anyway — it carries the awkward cases on purpose,
 * including a session with no room, which is the one that would otherwise write an
 * empty LOCATION into somebody's calendar.
 *
 * The assertion that matters most here is the negative one: the feed must not show
 * a session the public agenda does not. It reads the same loader, so this test
 * checks the seam rather than re-deriving the filter.
 */
import { FIXTURE_CONFERENCE } from '$lib/conference/public-fixtures';
import { buildView } from '$lib/conference/public-view';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function event(slug: string) {
	const url = new URL(`https://untitled.test/c/${slug}/agenda.ics`);
	return {
		url,
		params: { slug },
		request: new Request(url),
		locals: {},
		setHeaders: () => {},
		route: { id: null }
	} as unknown as RequestEvent;
}

async function body(slug: string) {
	const response = await GET(event(slug) as never);
	return response.text();
}

describe('the agenda feed', () => {
	// The 404 for an unknown slug is next door, in the integration test: any slug
	// but the fixture's reaches the database, and this project has none.

	it('serves it as a calendar, not as a download', async () => {
		// `text/calendar` is what makes a phone offer to add it. An attachment
		// disposition — right for the CSV export — would make it a file in Downloads.
		const headers: Record<string, string> = {};
		await GET({
			...event(FIXTURE_CONFERENCE.slug),
			setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
		} as never);

		expect(headers['content-type']).toBe('text/calendar; charset=utf-8');
		expect(headers['cache-control']).toContain('public');
	});

	it('writes one event per session the public agenda shows, and no others', async () => {
		const file = await body(FIXTURE_CONFERENCE.slug);
		const sessions = buildView(FIXTURE_CONFERENCE).sessions;

		expect(file.split('BEGIN:VEVENT').length - 1).toBe(sessions.length);
		for (const session of sessions) {
			expect(file).toContain(`UID:${session.id}@untitledconference`);
		}
	});

	it('names the calendar after the conference', async () => {
		expect(await body(FIXTURE_CONFERENCE.slug)).toContain(FIXTURE_CONFERENCE.name);
	});

	it('writes the room as the location, and nothing at all when there is no room', async () => {
		const file = await body(FIXTURE_CONFERENCE.slug);
		const sessions = buildView(FIXTURE_CONFERENCE).sessions;
		const roomed = sessions.filter((s) => s.room);

		expect(roomed.length).toBeGreaterThan(0);
		for (const session of roomed) {
			expect(file).toContain(`LOCATION:${session.room}`);
		}
		// A plenary with no room column must not become `LOCATION:` — an empty
		// property is not the same as an absent one to a strict reader.
		expect(file).not.toContain('LOCATION:\r\n');
	});

	it('puts the speakers in front of the abstract', async () => {
		const file = await body(FIXTURE_CONFERENCE.slug);
		const withSpeaker = buildView(FIXTURE_CONFERENCE).sessions.find(
			(s) => s.speakers.length > 0 && s.description
		);

		expect(withSpeaker).toBeDefined();
		expect(file).toContain(`DESCRIPTION:${withSpeaker!.speakers[0].name}\\n\\n`);
	});
});
