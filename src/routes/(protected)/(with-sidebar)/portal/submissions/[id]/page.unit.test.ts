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
	conferenceStatus: 'published',
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

const draw = (
	over: Partial<Record<string, unknown>> = {},
	closesAt: Date | null = null,
	call: {
		callState?: 'open' | 'not_yet_open' | 'closed';
		closedByOrganizer?: boolean;
		canWithdraw?: boolean;
		canDelete?: boolean;
	} = {}
) =>
	render(Page, {
		props: {
			data: {
				submission: submission(over),
				closesAt,
				callState: call.callState ?? 'open',
				closedByOrganizer: call.closedByOrganizer ?? false,
				canWithdraw: call.canWithdraw ?? false,
				canDelete: call.canDelete ?? false
			},
			form: null
		} as never
	}).body;

describe('speaker submission detail', () => {
	it('renders boolean answers as Yes and No', () => {
		const body = draw();

		expect(body).toContain('Have you given this talk before?');
		// The stored value is the string the dropdown posted, so what has to be
		// asserted is the word, not the tag it sits in (#477 moved the tag).
		expect(body).toContain('>Yes</span>');
		expect(body).toContain('>No</span>');
		expect(body).not.toContain('>true<');
		expect(body).not.toContain('>false<');
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

	it('says why an accepted talk can no longer be edited, instead of removing the button in silence', () => {
		const body = draw();

		// The affordance stays and carries its reason: a control that vanishes reads
		// as a bug at the one moment the speaker cares most about the words (#496).
		expect(body).toContain('Editing closed');
		expect(body).toContain('the organizers accepted these words');
		expect(body).toContain('ask the organizers');
		expect(body).not.toContain(`/portal/submissions/${submission().id}/edit`);
	});

	it('keeps the edit link while the proposal is still the speaker’s to change', () => {
		const body = draw({ status: 'in_review' });

		expect(body).toContain(`/portal/submissions/${submission().id}/edit`);
		expect(body).not.toContain('Editing closed');
	});

	it('does not promise an edit the loader would bounce (#514)', () => {
		const closed = draw({ status: 'in_review' }, new Date('2027-02-15T23:59:00.000Z'), {
			callState: 'closed',
			closedByOrganizer: true
		});

		expect(closed).toContain('The organizers have closed this call.');
		expect(closed).toContain('Editing closed');
		expect(closed).not.toContain('until 15 Feb 2027');
		expect(closed).not.toContain(`/portal/submissions/${submission().id}/edit`);

		const early = draw({ status: 'draft' }, new Date('2027-02-15T23:59:00.000Z'), {
			callState: 'not_yet_open'
		});
		expect(early).toContain('The call is not open yet.');
		expect(early).toContain('Editing closed');
		expect(early).not.toContain(`/portal/submissions/${submission().id}/edit`);
		expect(early).not.toContain('any time before 15 Feb 2027');
	});

	it('names the close instant and the receipt zone (#498)', () => {
		const open = draw({ status: 'in_review' }, new Date('2027-02-15T23:59:00.000Z'));

		expect(open).toContain('until 15 Feb 2027, 23:59 UTC');
		expect(open).toContain('Received 10 Mar 2027, 09:00 UTC');
		expect(open).toContain('href="/c/devflow-conf-2027"');

		const draft = draw({ status: 'draft' }, new Date('2027-02-15T23:59:00.000Z'));
		expect(draft).toContain('any time before 15 Feb 2027, 23:59 UTC');
	});

	it('does not tell the speaker nobody has seen a draft (#614)', () => {
		const body = draw({ status: 'draft' }, new Date('2027-02-15T23:59:00.000Z'));

		expect(body).toContain('This is still a draft.');
		expect(body).toContain('It has not been submitted.');
		expect(body).not.toContain('nobody has seen it');
		expect(body).not.toContain('Nobody has seen it');
	});

	it('does not link an archived conference to a 404 (#498)', () => {
		const body = draw({ conferenceStatus: 'archived' });

		expect(body).toContain('DevFlow Conf 2027');
		expect(body).not.toContain('href="/c/devflow-conf-2027"');
	});

	it('names a rejection so the speaker does not have to infer it from a badge', () => {
		const body = draw({ status: 'rejected' });

		expect(body).toContain('Not accepted.');
		expect(body).toContain('decided not to include this proposal');
		expect(body).not.toContain('Your proposal is in.');
	});

	it('names a waitlist the same way', () => {
		const body = draw({ status: 'waitlisted' });

		expect(body).toContain('Waitlisted.');
		expect(body).toContain('reserve list');
	});

	it('offers delete on a draft the speaker owns, and not on a submitted one (#742)', () => {
		const draft = draw({ status: 'draft' }, null, { canDelete: true });
		expect(draft).toContain('data-testid="delete-draft"');
		expect(draft).toContain('action="?/deleteDraft"');
		expect(draft).toContain('Delete this draft');

		const submitted = draw({ status: 'submitted' }, null, { canWithdraw: true, canDelete: false });
		expect(submitted).not.toContain('data-testid="delete-draft"');
		expect(submitted).not.toContain('action="?/deleteDraft"');
	});

	it('offers withdraw on an open submitted talk, and not on an accepted one (#663)', () => {
		const open = draw({ status: 'submitted' }, null, { canWithdraw: true });
		expect(open).toContain('data-testid="withdraw-proposal"');
		expect(open).toContain('action="?/withdraw"');
		expect(open).toContain('Withdraw this proposal');

		const accepted = draw({ status: 'accepted' }, null, { canWithdraw: false });
		expect(accepted).not.toContain('data-testid="withdraw-proposal"');
		expect(accepted).not.toContain('action="?/withdraw"');
	});

	it('names a withdrawn proposal instead of leaving only the badge', () => {
		const body = draw({ status: 'withdrawn' });

		expect(body).toContain('This proposal is withdrawn.');
		expect(body).toContain('will not review it');
		expect(body).not.toContain('Your proposal is in.');
		expect(body).not.toContain('data-testid="withdraw-proposal"');
	});
});

describe('speaker expenses in the portal (#512)', () => {
	const policy = {
		admission: 'free' as const,
		travel: { kind: 'up_to' as const, amount: 'an economy flight' },
		accommodation: { kind: 'case_by_case' as const, domesticNights: 2, internationalNights: 3 },
		conditions: 'for selected speakers'
	};

	const drawWith = (status: string, support: typeof policy | Record<string, never>) =>
		render(Page, {
			props: {
				data: {
					submission: submission({ status }),
					closesAt: null,
					callState: 'closed',
					closedByOrganizer: true,
					canWithdraw: false,
					canDelete: false,
					support
				},
				form: null
			} as never
		}).body;

	it('repeats the public statement to an accepted speaker after the call has closed', () => {
		const body = drawWith('accepted', policy);
		expect(body).toContain('data-testid="speaker-support"');
		expect(body).toContain('Free for speakers');
		expect(body).toContain('Covered up to an economy flight');
		expect(body).toContain('2 nights domestic, 3 nights international, covered case by case');
		expect(body).toContain('for selected speakers');
		// Under the talk text, not above it (#591).
		expect(body.indexOf('A practical session.')).toBeLessThan(
			body.indexOf('data-testid="speaker-support"')
		);
	});

	it('renders nothing when the call never answered, and nothing to a speaker who was not accepted', () => {
		expect(drawWith('accepted', {})).not.toContain('data-testid="speaker-support"');
		expect(drawWith('submitted', policy)).not.toContain('data-testid="speaker-support"');
		expect(drawWith('rejected', policy)).not.toContain('data-testid="speaker-support"');
	});
});
