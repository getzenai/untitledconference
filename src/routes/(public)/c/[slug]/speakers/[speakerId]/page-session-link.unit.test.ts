/**
 * This conference's session title opens that talk (`?session=`).
 * *Also spoke at* stays on the other conference's grid — those ids
 * are not this conference's (#840).
 */
import { FIXTURE_CONFERENCE } from '$lib/conference/public-fixtures';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({
	page: {
		params: { speakerId: 'spk-hamilton' },
		url: new URL('https://example.test/c/untitled-2026/speakers/spk-hamilton')
	}
}));

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '+page.svelte'), 'utf8');

const elsewhereTitle = 'Serving 70B models on a budget';
const thisTitle = 'Error handling under load';

async function draw() {
	const { default: Page } = await import('./+page.svelte');
	return render(Page, {
		props: {
			data: {
				conference: FIXTURE_CONFERENCE,
				embed: false,
				appearances: [
					{
						conferenceSlug: 'devflow-conf-2027',
						conferenceName: 'DevFlow Conf 2027',
						conferenceStartsOn: '2027-05-12',
						sessions: [
							{
								id: 'other-1',
								title: elsewhereTitle,
								startsAt: '2027-05-12T09:00:00.000Z',
								endsAt: '2027-05-12T09:30:00.000Z',
								room: 'Main Stage',
								recordingUrl: null
							}
						]
					}
				]
			}
		} as never
	}).body;
}

describe('speaker page session titles', () => {
	it('builds this conference the same way as Also spoke at, plus the session address', () => {
		expect(source).toContain('agenda?session=${session.id}');
		expect(source).toContain('withEmbed(`/c/${event.conferenceSlug}/agenda`, data.embed)');
	});

	it('opens this conference talk at ?session=, and leaves Also spoke at on that agenda', async () => {
		const html = await draw();

		expect(html).toMatch(
			new RegExp(
				`<a[^>]*href="/c/untitled-2026/agenda\\?session=ses-04"[^>]*>\\s*${thisTitle}\\s*</a>`
			)
		);
		expect(html).toMatch(
			new RegExp(`<a[^>]*href="/c/devflow-conf-2027/agenda"[^>]*>\\s*${elsewhereTitle}\\s*</a>`)
		);
		expect(html).not.toMatch(new RegExp(`href="/c/untitled-2026/agenda"`));
		expect(html).not.toMatch(new RegExp(`<p[^>]*>\\s*${thisTitle}\\s*</p>`));
	});
});
