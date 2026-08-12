/** The submission detail should translate stored values into speaker-facing copy. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const submission = (over: Partial<Record<string, unknown>> = {}) => ({
	id: 75,
	title: 'Build systems without the wait',
	abstract: 'A practical session.',
	keyTakeaway: 'Queues are product decisions.',
	audienceLevel: 'intermediate',
	status: 'accepted',
	submittedAt: new Date('2027-03-10T09:00:00Z'),
	decidedAt: new Date('2027-03-20T09:00:00Z'),
	conferenceId: 3,
	conferenceSlug: 'devflow-conf-2027',
	conferenceName: 'DevFlow Conf 2027',
	formatName: 'Talk',
	trackName: 'Platform engineering',
	answers: [
		{ label: 'Have you given this talk before?', kind: 'boolean', value: 'true' },
		{ label: 'Can we publish the recording?', kind: 'boolean', value: 'false' },
		{ label: 'Anything else?', kind: 'long_text', value: 'I need a lectern.' }
	],
	speakers: [
		{ name: 'Priya Raman', isPrimary: true, roleLabel: null },
		{ name: 'Marcus Okafor', isPrimary: false, roleLabel: 'Co-presenter' }
	],
	...over
});

const draw = (over: Partial<Record<string, unknown>> = {}) =>
	render(Page, {
		props: { data: { submission: submission(over) } } as never
	}).body;

describe('speaker submission detail', () => {
	it('renders boolean answers as Yes and No', () => {
		const body = draw();

		expect(body).toContain('Have you given this talk before?');
		expect(body).toContain('>Yes</dd>');
		expect(body).toContain('>No</dd>');
		expect(body).not.toContain('>true</dd>');
		expect(body).not.toContain('>false</dd>');
		expect(body).toContain('I need a lectern.');
	});

	it('keeps spaces around speaker role dashes', () => {
		const body = draw();

		expect(body).toContain('Priya Raman</span> — presenting');
		expect(body).toContain('Marcus Okafor</span> — Co-presenter');
	});

	it('does not send an accepted speaker in a circle back to the portal root', () => {
		const body = draw();

		expect(body).toContain('Anything else the organizers need from you appears under Your tasks');
		// The only portal-root link left is the explicit breadcrumb above the page.
		expect(body.match(/href="\/portal"/g)).toHaveLength(1);
	});
});
