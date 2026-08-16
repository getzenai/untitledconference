/**
 * A narrowed session list has to be an address (#751).
 *
 * Three claims, none of which a unit test can make, because each one is about a
 * real navigation. **Cold load**: someone else's `?q=` link arrives with the box
 * already filled — the round trip through the browser, not through the code that
 * wrote the URL. **Typing**: what is typed reaches the address bar, and does not
 * stack one history entry per keystroke, so one Back leaves the page.
 * **Clearing**: no empty `?q=` is left behind.
 *
 * It asserts on the search box and the URL rather than on which talks are
 * visible, and that is deliberate. Which sessions match is settled by
 * `session-filters.unit.test.ts` — both directions, including a round trip —
 * and by `matchesQuery`. Getting a talk onto the public list needs a room, a
 * placement through the slot editor and a published agenda, which would turn
 * this into a test of the agenda tooling that happens to end in a search box.
 */
const uniqueSlug = () => `session-url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** A conference the public can reach at all — without this, `/c/<slug>` is a 404. */
function publishedConference(slug: string) {
	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: organizer.id,
				slug,
				days: ['2028-05-10'],
				sessions: ['Prompt injection in production', 'Serving models on a budget']
			}
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit(`/manage/${slug}/settings`);
	cy.waitForHydration();
	cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]').click();
	cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');
}

describe('The public session search lives in the URL', () => {
	it('arrives already filled in from a shared link, and survives a reload', () => {
		const slug = uniqueSlug();
		publishedConference(slug);

		// Cold: this is the link someone was sent, not a filter they typed.
		cy.visit(`/c/${slug}?q=injection`);
		cy.waitForHydration();
		cy.get('#session-search').should('have.value', 'injection');

		cy.reload();
		cy.waitForHydration();
		cy.get('#session-search').should('have.value', 'injection');
	});

	it('puts what is typed into the address without filling the history', () => {
		const slug = uniqueSlug();
		publishedConference(slug);

		cy.visit(`/c/${slug}`);
		cy.waitForHydration();
		cy.location('search').should('eq', '');

		cy.get('#session-search').type('injection');
		cy.location('search').should('eq', '?q=injection');

		// Nine characters must not be nine history entries: one Back leaves.
		cy.go('back');
		cy.location('pathname').should('not.eq', `/c/${slug}`);
	});

	it('leaves no empty parameter behind when the search is cleared', () => {
		const slug = uniqueSlug();
		publishedConference(slug);

		cy.visit(`/c/${slug}?q=injection`);
		cy.waitForHydration();
		cy.get('#session-search').clear();

		cy.location('search').should('eq', '');
	});
});
