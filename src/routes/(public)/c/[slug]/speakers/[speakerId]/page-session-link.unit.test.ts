/**
 * This conference's session title is the same kind of link *Also spoke at*
 * already is (#840). A visitor who opened the speaker from the talk can go
 * back to the talk from the name of the talk.
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
	it('builds both lists the same way: withEmbed of that conference agenda', () => {
		expect(source).toContain('withEmbed(`/c/${view.conference.slug}/agenda`, data.embed)');
		expect(source).toContain('withEmbed(`/c/${event.conferenceSlug}/agenda`, data.embed)');
	});

	it('renders both titles as anchors, not a paragraph next to a link', async () => {
		const html = await draw();

		expect(html).toMatch(
			new RegExp(`<a[^>]*href="/c/untitled-2026/agenda"[^>]*>\\s*${thisTitle}\\s*</a>`)
		);
		expect(html).toMatch(
			new RegExp(`<a[^>]*href="/c/devflow-conf-2027/agenda"[^>]*>\\s*${elsewhereTitle}\\s*</a>`)
		);
		expect(html).not.toMatch(new RegExp(`<p[^>]*>\\s*${thisTitle}\\s*</p>`));
	});
});
