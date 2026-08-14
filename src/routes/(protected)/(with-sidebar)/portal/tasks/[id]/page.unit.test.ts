/** The task detail should lead a speaker to the real work, not just a ticket toggle. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '+page.svelte'), 'utf8');

const task = (over: Partial<Record<string, unknown>> = {}) => ({
	id: 21,
	conferenceId: 3,
	conferenceSlug: 'devflow-conf-2027',
	conferenceName: 'DevFlow Conf 2027',
	conferenceVenue: 'Kulturbrauerei Berlin',
	speakerProfileId: 9,
	title: 'Acknowledge the speaker guide',
	instructions: null,
	kind: 'action',
	status: 'open',
	dueOn: null,
	submissionTitle: 'Build systems without the wait',
	participationStatus: 'invited',
	sessionStartsAt: null,
	sessionEndsAt: null,
	sessionRoom: null,
	...over
});

const draw = (taskData: ReturnType<typeof task>, files: unknown[] = [], acceptedTalks = 1) =>
	render(Page, {
		props: { data: { task: taskData, files, acceptedTalks }, form: null } as never
	}).body;

describe('speaker task detail', () => {
	it('sends a profile task to the profile editor and keeps its completion step', () => {
		const body = draw(task({ title: 'Complete bio and profile' }));

		expect(body).toContain('Complete your speaker profile');
		expect(body).toContain('href="/portal/profile"');
		expect(body).toContain('Open my speaker profile');
		expect(body).toContain('Mark as done');
	});

	it('gives participation its own decision workflow and session context', () => {
		const body = draw(
			task({
				title: 'Confirm participation',
				dueOn: new Date('2027-05-01T12:00:00Z'),
				sessionStartsAt: new Date('2027-05-12T09:00:00Z'),
				sessionEndsAt: new Date('2027-05-12T09:45:00Z'),
				sessionRoom: 'Main Stage'
			})
		);

		expect(body).toContain('Tell the organizers whether you can take part');
		expect(body).toContain('Build systems without the wait');
		expect(body).toContain('Wednesday, 12 May 2027 · 09:00–09:45');
		expect(body).toContain('Main Stage');
		expect(body).toContain('value="confirmed"');
		expect(body).toContain('value="declined"');
		expect(body).toContain('Yes, I’ll be there');
		expect(body).toContain('I can’t take part');
		expect(body).not.toContain('Mark as done');
	});

	it('states the current participation decision and still lets it be changed', () => {
		const confirmed = draw(
			task({ title: 'Confirm participation', status: 'done', participationStatus: 'confirmed' })
		);
		const declined = draw(
			task({ title: 'Confirm participation', status: 'done', participationStatus: 'declined' })
		);

		expect(confirmed).toContain('You are confirmed for this event.');
		expect(confirmed).not.toContain('Participation confirmed');
		expect(confirmed).not.toContain('Yes, I’ll be there');
		expect(confirmed).toContain('I can’t take part');
		expect(declined).toContain('You told the organizers you cannot take part.');
		expect(declined).not.toContain('Participation declined');
		expect(declined).not.toContain('I can’t take part');
		expect(declined).toContain('Yes, I’ll be there');
	});

	/**
	 * #495: withdrawing tells the organizers to drop you from the programme, and
	 * the button for it sat among ordinary task actions that cost nothing. The
	 * dialog is a client-side control, so what is checked here is the wiring it
	 * hangs on — the named form it submits, the guard that intercepts the click,
	 * and that saying yes is not guarded.
	 */
	it('guards the withdrawal, and only that direction', () => {
		expect(source).toContain('id="withdraw-form"');
		expect(source).toContain('data-testid="withdraw-dialog"');
		expect(source).toContain('data-testid="withdraw-confirm"');
		expect(source).toContain('form="withdraw-form"');
		expect(source).toContain('confirmWithdraw = true;');
		// One guard, on one button: "Yes, I'll be there" stays a single click.
		expect(source.match(/confirmWithdraw = true;/g)).toHaveLength(1);
	});

	it('takes the dialog’s sentences from their one home', () => {
		// `withdraw-warning.ts` owns the wording and is tested there; what matters
		// here is that the page reads it rather than growing a second copy.
		expect(source).toContain('withdrawWarning(task.conferenceName, data.acceptedTalks)');
		expect(source).toContain('{warning.consequence}');
	});

	it('calls a withdrawal withdrawn rather than done', () => {
		const declined = draw(
			task({ title: 'Confirm participation', status: 'done', participationStatus: 'declined' })
		);
		const confirmed = draw(
			task({ title: 'Confirm participation', status: 'done', participationStatus: 'confirmed' })
		);

		expect(declined).toContain('Withdrawn');
		expect(declined).not.toContain('>Done<');
		expect(confirmed).toContain('Done');
	});

	it('does not present the organizer’s initial roster assumption as the speaker’s answer', () => {
		const body = draw(
			task({ title: 'Confirm participation', status: 'open', participationStatus: 'confirmed' })
		);

		expect(body).not.toContain('You are confirmed for this event.');
		expect(body).toContain('Yes, I’ll be there');
	});

	it('switches a handed-in file task from first-upload to versioning copy', () => {
		const body = draw(
			task({
				title: 'Upload headshot',
				kind: 'file_request',
				status: 'submitted',
				instructions: 'Upload the file here once it is ready.'
			}),
			[
				{
					id: 4,
					filename: 'headshot.png',
					contentType: 'image/png',
					sizeBytes: 1024,
					version: 1,
					approvalStatus: 'pending',
					uploadedAt: new Date('2027-04-01T12:00:00Z'),
					comments: []
				}
			]
		);

		expect(body).toContain('Add a new version');
		expect(body).toContain('Your file is already handed in.');
		expect(body).toContain('Waiting for a look');
		expect(body).not.toContain('Upload the file here once it is ready.');
	});

	it('says the organizers asked for a new version after a rejection', () => {
		const body = draw(
			task({
				title: 'Upload slides',
				kind: 'file_request',
				status: 'open',
				instructions: 'Upload the file here once it is ready.'
			}),
			[
				{
					id: 4,
					filename: 'slides.pdf',
					contentType: 'application/pdf',
					sizeBytes: 2048,
					version: 1,
					approvalStatus: 'rejected',
					uploadedAt: new Date('2027-04-01T12:00:00Z'),
					comments: []
				}
			]
		);

		expect(body).toContain('The organizers asked for a new version of this file.');
		expect(body).toContain('Changes requested');
		expect(body).toContain('addresses what they asked for');
		expect(body).not.toContain('Your file is already handed in.');
	});

	it('leaves an organizer-defined action on the ordinary completion path', () => {
		const body = draw(task());

		expect(body).toContain('Mark as done');
		expect(body).not.toContain('Confirm your participation');
		expect(body).not.toContain('Open my speaker profile');
	});

	it('does not call a completed task overdue', () => {
		const body = draw(task({ status: 'done', dueOn: new Date('2020-01-01T12:00:00Z') }));

		expect(body).toContain('Due Wednesday, 1 January 2020');
		expect(body).not.toContain('— overdue');
	});
});
