/**
 * Roster surface: list, search, add, status controls (SPK-01/02/04).
 */
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/manage/devflow-conf-2027/speakers') }
}));

vi.mock('$app/forms', () => ({
	enhance: () => ({})
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	beforeNavigate: vi.fn()
}));

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'DevFlow Conf',
	slug: 'devflow-conf-2027',
	status: 'published' as const,
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const speaker = {
	conferenceSpeakerId: 10,
	speakerProfileId: 5,
	status: 'invited' as const,
	logistics: null,
	name: 'Priya Raman',
	sortName: 'Raman, Priya',
	email: 'priya@example.com',
	jobTitle: 'Staff Engineer',
	company: 'Acme',
	headshotUrl: null,
	bio: 'Builds things.',
	notes: null,
	hasAccount: false
};

describe('speaker roster page', () => {
	it('lists speakers at rest — roster and filters visible, writes behind dialogs', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [speaker],
					filters: {},
					counts: {
						total: 1,
						invited: 1,
						confirmed: 0,
						declined: 0,
						cancelled: 0
					},
					statuses: ['invited', 'confirmed', 'declined', 'cancelled']
				} as never,
				form: null
			}
		});

		expect(body).toContain('data-testid="speakers-table"');
		expect(body).toContain('data-testid="speakers-filters"');
		// The write entry points are present as triggers…
		expect(body).toContain('data-testid="speakers-add"');
		expect(body).toContain('data-testid="speaker-mail-open"');
		expect(body).toContain('data-testid="speakers-import-open"');
		expect(body).toContain('Priya Raman');
		expect(body).toContain('priya@example.com');
		expect(body).toContain('Staff Engineer');
		expect(body).toContain('Acme');
		expect(body).toContain('action="?/setStatus"');
		expect(body).toContain('data-testid="speaker-status-select"');
		expect(body).toContain('data-testid="speakers-search"');
		expect(body).toContain('data-testid="speakers-status-filter"');
		// …but at rest the write forms themselves are behind dialogs, not in the DOM.
		expect(body).not.toContain('action="?/add"');
		expect(body).not.toContain('action="?/compose"');
		expect(body).not.toContain('action="?/import"');
		expect(body).not.toContain('data-testid="add-name"');
		expect(body).not.toContain('data-testid="speaker-mail-body"');
		expect(body).not.toContain('data-testid="import-csv"');
		expect(body).not.toContain('Send to 1 speaker');
		// #263: the page still scrolls the roster vertically; the table is not
		// a nested height box. Sideways scroll is ScrollTable's job (#897).
		expect(source).toContain('ScrollTable');
		expect(body).toContain('data-testid="speakers-table-head"');
		const tableWrapper = body.match(/<div\b[^>]*data-testid="speakers-table"[^>]*>/);
		expect(tableWrapper?.[0]).toBeDefined();
		expect(tableWrapper?.[0]).not.toMatch(/\bmax-h-/);
		expect(tableWrapper?.[0]).not.toMatch(/\boverflow-auto\b/);
	});

	it('gives each row one status control, and the filter one mechanism (#552)', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [speaker, { ...speaker, speakerProfileId: 6, status: 'confirmed' as const }],
					filters: {},
					counts: {
						total: 2,
						invited: 1,
						confirmed: 1,
						declined: 0,
						cancelled: 0
					},
					statuses: ['invited', 'confirmed', 'declined', 'cancelled']
				} as never,
				form: null
			}
		});

		// One control per row: the badge that repeated the select is gone, and with
		// it the raw enum casing beside a Title Case word.
		expect(body).not.toContain('data-slot="status-badge"');
		const selects = body.match(/data-testid="speaker-status-select"/g) ?? [];
		expect(selects).toHaveLength(2);
		expect(body).toContain('>Confirmed<');
		expect(body).not.toContain('>confirmed<');

		// One filter mechanism: the chip row is gone and its counts moved into the
		// options of the control that stayed.
		expect(body).not.toContain('data-testid="speakers-status-chips"');
		expect(body).toContain('All statuses (2)');
		// The chips' one piece of real information — the counts — survives as prose
		// in the subtitle, where it filters nothing. Empty statuses stay out.
		const text = body.replace(/\s+/g, ' ');
		expect(text).toContain('2 on the roster');
		expect(text).toContain('1 Invited');
		expect(text).toContain('1 Confirmed');
		expect(text).not.toContain('0 declined');

		// It applies itself, like the submissions filter row — no Apply button, and
		// a real submit only for the no-JavaScript case.
		expect(body).not.toContain('>Apply<');
		expect(body).toContain('<noscript>');
	});

	it('shows empty state when the roster has no rows', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [],
					filters: {},
					counts: {
						total: 0,
						invited: 0,
						confirmed: 0,
						declined: 0,
						cancelled: 0
					},
					statuses: ['invited', 'confirmed', 'declined', 'cancelled']
				} as never,
				form: null
			}
		});

		expect(body).toContain('data-testid="speakers-empty"');
		expect(body).toContain('No speakers on this conference yet');
		expect(body).not.toContain('data-testid="speakers-table"');
	});

	it('renders a rejected write as a red alert, not a green success', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [],
					filters: {},
					counts: {
						total: 0,
						invited: 0,
						confirmed: 0,
						declined: 0,
						cancelled: 0
					},
					statuses: ['invited', 'confirmed', 'declined', 'cancelled']
				} as never,
				form: { error: 'A name is required.' }
			}
		});

		expect(body).toContain('data-testid="speakers-error"');
		expect(body).toContain('role="alert"');
		expect(body).toContain('text-status-bad');
		expect(body).toContain('A name is required.');
		expect(body).not.toContain('data-testid="speakers-message"');
		expect(body).not.toContain('text-status-good');
	});

	it('never shows a dialog-scoped answer on the page banner — it lives beside the click', () => {
		// Import answers inside its own dialog.
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					speakers: [],
					filters: {},
					counts: {
						total: 0,
						invited: 0,
						confirmed: 0,
						declined: 0,
						cancelled: 0
					},
					statuses: ['invited', 'confirmed', 'declined', 'cancelled']
				} as never,
				form: { scope: 'import', message: 'Imported 12 speakers.' }
			}
		});

		expect(body).not.toContain('data-testid="speakers-message"');
		expect(body).not.toContain('data-testid="speakers-error"');
		expect(body).not.toContain('Imported 12 speakers.');

		// Compose and add scoped failures must not surface here either: the dialog
		// stays open on failure, so a page banner would sit behind the overlay —
		// the double-confirmation this class of bug is about (#220 review round 2).
		for (const scope of ['add', 'compose'] as const) {
			const failed = render(Page, {
				props: {
					data: {
						user: { id: 'organizer-1', name: 'Jordan' },
						impersonating: null,
						analytics: { apiKey: undefined, host: undefined },
						conference,
						speakers: [],
						filters: {},
						counts: {
							total: 0,
							invited: 0,
							confirmed: 0,
							declined: 0,
							cancelled: 0
						},
						statuses: ['invited', 'confirmed', 'declined', 'cancelled']
					} as never,
					form: { scope, error: `A ${scope} error.` }
				}
			});

			expect(failed.body).not.toContain('data-testid="speakers-message"');
			expect(failed.body).not.toContain('data-testid="speakers-error"');
			expect(failed.body).not.toContain('A add error.');
			expect(failed.body).not.toContain('A compose error.');
		}
	});

	it('parks the open row through the extracted form and a leave prompt, the dialog without one', () => {
		expect(source).toContain('SpeakerRowEditForm');
		expect(source).toContain('clearSpeakerRowDrafts');
		expect(source).toContain('SPEAKER_ROW_LEAVE_PROMPT');
		expect(source).toContain('UnsavedGuard');
		expect(source).toContain('addCommit');
		expect(source).toContain('speakerImportCsvScope');
		expect(source).toContain("result.type === 'success'");
		expect(source).not.toContain('BrowserDraftInput');
	});
});
