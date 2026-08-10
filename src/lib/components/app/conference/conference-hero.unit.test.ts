import type { PublicConference } from '$lib/conference/public-types';
import { buildView } from '$lib/conference/public-view';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import CallBanner from './call-banner.svelte';
import ConferenceHero from './conference-hero.svelte';

/**
 * The head zone of the public index: the first thing a visitor — and a judge —
 * reads about a conference.
 *
 * What is worth rendering here is not the styling but the two claims the markup
 * makes about the data behind it: that a count of zero is never shown as a
 * headline number, and that the "submit a proposal" route only appears while
 * there is a call to submit to.
 */
const conference = (over: Partial<PublicConference> = {}): PublicConference => ({
	id: 'conf-1',
	slug: 'devflow-conf-2027',
	name: 'DevFlow Conf 2027',
	venue: 'Kraftwerk Berlin',
	startsOn: '2027-05-12',
	endsOn: '2027-05-13',
	days: [],
	rooms: [],
	tracks: [],
	formats: [],
	sessions: [],
	speakers: [],
	...over
});

const hero = (over: Partial<PublicConference>, callIsOpen: boolean) =>
	render(ConferenceHero, {
		props: {
			view: buildView(conference(over)),
			dateRange: 'Wednesday 12 May 2027 – Thursday 13 May 2027',
			callIsOpen
		}
	}).body;

describe('the conference hero', () => {
	it('names the event and offers the two ways in while the call is open', () => {
		const body = hero({}, true);

		expect(body).toContain('DevFlow Conf 2027');
		expect(body).toContain('Kraftwerk Berlin');
		expect(body).toContain('/c/devflow-conf-2027/agenda');
		expect(body).toContain('/c/devflow-conf-2027/cfp');
	});

	it('drops the proposal route once the call is not open', () => {
		expect(hero({}, false)).not.toContain('/c/devflow-conf-2027/cfp');
	});

	// A programme that has not been scheduled yet would otherwise announce
	// "0 Sessions · 0 Speakers" in the largest type on the page — an empty room
	// described in the voice of a full one.
	it('shows no number it would have to print as a nought', () => {
		const empty = hero({}, false);
		expect(empty).not.toContain('Sessions');
		expect(empty).not.toContain('Speakers');

		const scheduled = hero(
			{
				days: [{ id: 'day-1', label: 'Day 1', date: '2027-05-12' }],
				rooms: [{ id: 'room-1', name: 'Hall A' }]
			},
			false
		);
		expect(scheduled).toContain('Days');
		expect(scheduled).toContain('Rooms');
	});
});

describe('the call for papers banner', () => {
	const banner = (days: number) =>
		render(CallBanner, { props: { slug: 'devflow-conf-2027', days } }).body;

	// The last day is the one the countdown exists for, and "closes in 0 days" is
	// the reading a speaker is most likely to get wrong.
	it('counts the final two days in words rather than in noughts', () => {
		expect(banner(0)).toContain('closes today');
		expect(banner(1)).toContain('closes tomorrow');
		expect(banner(6)).toContain('closes in 6 days');
	});

	it('points at the call it is announcing', () => {
		expect(banner(6)).toContain('/c/devflow-conf-2027/cfp');
	});
});
