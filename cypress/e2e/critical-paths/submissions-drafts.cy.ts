/**
 * Drafts in the organizer's submissions table (#331).
 *
 * `decideSubmissions` refuses a draft — a talk the speaker has not handed in
 * cannot be accepted — but the table has no status filter, so drafts sit in the
 * default view with a checkbox like everything else. Before this, an organizer
 * could tick one, press Accept, watch it spin, and get "1 draft not submitted
 * yet, left for the speaker" back while the badge still read `draft`.
 *
 * Only a browser can check this. The bulk bar reads a client-side selection: a
 * server-rendered page has nothing ticked, so the unit suite can prove the
 * buttons exist and never what they do once a row is chosen.
 */
const uniqueSlug = () => `drafts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const WIDE = { width: 1600, height: 900 };

describe('Submissions table, drafts', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: user.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['Unfinished talk', 'Also unfinished'],
					sessionStatus: 'draft'
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.viewport(WIDE.width, WIDE.height);
		cy.visit(`/manage/${slug}/submissions`);
		// The selection is Svelte state; a click before hydration goes nowhere.
		cy.waitForHydration();
	});

	it('names the drafts in the selection and refuses to decide them', () => {
		// Precondition: both rows are really on screen, or "buttons disabled" would
		// pass on a page that simply has nothing selectable.
		cy.get('tbody tr').should('have.length', 2);

		// Nothing ticked yet: the bar says nothing about drafts.
		cy.get('[data-testid="bulk-drafts"]').should('not.exist');

		cy.contains('tbody tr', 'Unfinished talk').find('input[type="checkbox"]').check();

		cy.get('[data-testid="bulk-drafts"]')
			.should('be.visible')
			.and('contain.text', '1')
			.and('contain.text', 'draft');

		// Every ticked row is a draft, so the three decisions can only come back
		// empty-handed. They are dead controls, and they say so.
		cy.contains('button', 'Accept').should('be.disabled');
		cy.contains('button', 'Decline').should('be.disabled');
		cy.contains('button', 'Waitlist').should('be.disabled');
	});

	it('offers no decision on the draft detail page', () => {
		cy.contains('tbody tr a', 'Unfinished talk').click();

		cy.get('[data-testid="decision-draft-note"]').should('be.visible');
		cy.contains('button', 'Accept').should('not.exist');
		cy.contains('button', 'Decline').should('not.exist');
		cy.contains('button', 'Waitlist').should('not.exist');
	});
});
