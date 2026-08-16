/**
 * The filtered session list has to be an address, and the address has to keep
 * telling the truth after more than one change (#751, then the #780 regress).
 *
 * The first version derived the filters straight from `page.url` while writing
 * with `replaceState`, which does not update `page.url`. One change looked
 * fine; the second was computed from the original address and dropped the
 * first out of the URL. So the case that matters is **two writes in a row
 * without a reload**, and the assertion that matters is the address against
 * the surface — a test that only reads the URL would have passed throughout.
 */
const uniqueSlug = () => `session-url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * A published conference with one talk actually on the public list.
 *
 * The public list is built from *placements on a published agenda*, so the
 * fixture alone shows nothing — the talk has to go into a room and the agenda
 * has to be published. Same sequence as `agenda-publish-public.cy.ts`. One
 * talk is enough: the claim is that the visible count moves, not how big it is.
 */
function publishedConferenceWithOneTalk(slug: string) {
	const talk = 'Prompt injection in production';

	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [talk] }
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit(`/manage/${slug}/settings`);
	cy.waitForHydration();
	cy.get('[data-testid="settings-rooms"] textarea[name="names"]').clear();
	cy.get('[data-testid="settings-rooms"] textarea[name="names"]').type('Main Hall{enter}');
	cy.get('[data-testid="settings-room-row"][data-name="Main Hall"]').should('exist');
	cy.get('[data-testid="settings-tracks"] textarea[name="names"]').clear();
	cy.get('[data-testid="settings-tracks"] textarea[name="names"]').type('Platform{enter}');
	cy.get('[data-testid="settings-track-row"]').should('exist');
	cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]').click();
	cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

	cy.visit(`/manage/${slug}/agenda`);
	cy.waitForHydration();
	cy.contains('[data-testid="agenda-room-card"]', 'Main Hall')
		.find('[data-testid^="agenda-open-slot-"]')
		.click();
	cy.get('[data-testid="agenda-slot-editor"]').should('exist');
	cy.chooseFromAppSelect('agenda-slot-session', talk);
	cy.chooseFromAppSelect('agenda-slot-room', 'Main Hall');
	cy.chooseFromAppSelect('agenda-slot-start', '09:00');
	cy.get('[data-testid="agenda-slot-place"]').click();
	cy.get('[data-testid="agenda-slot-editor"]').should('not.exist');

	cy.get('[data-testid="agenda-publish"]').click();
	cy.get('[data-testid="agenda-publish-result"]', { timeout: 20000 }).should(
		'contain.text',
		'The public agenda now shows 1 talk.'
	);
}

describe('The public session search lives in the URL', () => {
	it('arrives already filled in from a shared link, and survives a reload', () => {
		const slug = uniqueSlug();
		publishedConferenceWithOneTalk(slug);

		cy.visit(`/c/${slug}?q=injection`);
		cy.waitForHydration();
		cy.get('#session-search').should('have.value', 'injection');

		cy.reload();
		cy.waitForHydration();
		cy.get('#session-search').should('have.value', 'injection');
	});

	it('keeps every filter in the address across three changes without a reload', () => {
		const slug = uniqueSlug();
		publishedConferenceWithOneTalk(slug);

		cy.visit(`/c/${slug}`);
		cy.waitForHydration();
		cy.location('search').should('eq', '');

		// 1. Search. The count is the point: a visitor judges the field by the
		//    list changing, not by the address bar. Without a reload.
		cy.contains('1 of 1 sessions').should('exist');
		cy.get('#session-search').type('nothing matches this');
		cy.location('search').should('include', 'q=');
		cy.contains('0 of 1 sessions').should('exist');

		// 2. A facet on top — the write that used to drop the search, because
		//    it was computed from a frozen read of the original URL.
		cy.get('[data-testid="session-facet-tracks"]').first().click();
		cy.location('search').should('include', 'q=nothing');
		cy.location('search').should('include', 'track=');

		// The address must agree with the surface, not just be non-empty.
		cy.get('[data-testid="session-facet-tracks"]')
			.first()
			.should('have.attr', 'data-state', 'checked');

		// 3. Clear the search and keep the facet — again, the list must move.
		cy.get('#session-search').clear();
		cy.location('search').should('not.include', 'q=');
		cy.location('search').should('include', 'track=');
		cy.get('[data-testid="session-facet-tracks"]')
			.first()
			.should('have.attr', 'data-state', 'checked');
	});

	it('lets Back and Forward move through the filters', () => {
		const slug = uniqueSlug();
		publishedConferenceWithOneTalk(slug);

		cy.visit(`/c/${slug}?q=injection`);
		cy.waitForHydration();
		cy.get('#session-search').should('have.value', 'injection');

		// A real navigation is the one path still allowed to write the filters
		// back from the URL, so it has to actually do it.
		cy.visit(`/c/${slug}?q=models`);
		cy.waitForHydration();
		cy.get('#session-search').should('have.value', 'models');

		cy.go('back');
		cy.waitForHydration();
		cy.get('#session-search').should('have.value', 'injection');

		cy.go('forward');
		cy.waitForHydration();
		cy.get('#session-search').should('have.value', 'models');
	});

	it('leaves no empty parameter behind when the search is cleared', () => {
		const slug = uniqueSlug();
		publishedConferenceWithOneTalk(slug);

		cy.visit(`/c/${slug}?q=injection`);
		cy.waitForHydration();
		cy.get('#session-search').clear();

		cy.location('search').should('eq', '');
	});
});
