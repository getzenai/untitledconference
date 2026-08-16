/**
 * #759 / #760: speaker notes and the organizer talk edit must survive the
 * ordinary decision to look somewhere else, and a refused Save must not
 * throw the parked copy away. Reopening and then reloading distinguishes a
 * browser draft from a value that merely stayed alive in the old component.
 */
const uniqueSlug = () => `talk-drafts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A tlak about tests';

describe('Speaker notes and organizer talk-edit drafts', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();
		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [TALK] }
			})
				.its('status')
				.should('eq', 200);

			// The fixture puts a speaker on the talk, not on the roster. Notes live
			// on the roster row, so add one the same way the Speakers page does.
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/manage/${slug}/speakers?/add`,
				form: true,
				headers: { Origin: Cypress.config('baseUrl') as string },
				body: { name: 'Priya Raman', email: `priya-${slug}@example.test`, status: 'invited' }
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('keeps typed notes through a rail click and a reload', () => {
		const notes = 'ORGJOURNEY speaker-notes stay put';

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speaker-edit-toggle"]').click();
		cy.get('[data-testid="edit-notes"]').clear().type(notes);

		cy.get('[data-testid="conference-nav-agenda"]').filter(':visible').first().click();
		cy.location('pathname').should('eq', `/manage/${slug}/agenda`);

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speaker-edit-toggle"]').click();
		cy.get('[data-testid="edit-notes-restored"]').should('be.visible');
		cy.get('[data-testid="edit-notes"]').should('have.value', notes);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="speaker-edit-toggle"]').click();
		cy.get('[data-testid="edit-notes"]').should('have.value', notes);
	});

	it('keeps a typed abstract through a rail click and a reload', () => {
		const abstract = 'ORGJOURNEY talk-abstract stays put';

		cy.visit(`/manage/${slug}/submissions`);
		cy.contains('a', TALK).click();
		cy.waitForHydration();
		cy.contains('button', 'Edit talk').click();
		cy.get('[data-testid="talk-abstract"]').clear().type(abstract);

		const asked: string[] = [];
		cy.on('window:confirm', (text: string) => {
			asked.push(text);
			return true;
		});
		cy.get('[data-testid="conference-nav-decisions"]').filter(':visible').first().click();
		cy.location('pathname').should('eq', `/manage/${slug}/decisions`);
		cy.wrap(asked).should('have.length', 1);
		cy.wrap(asked)
			.its(0)
			.should('match', /your talk edit will stay/i);
		cy.wrap(asked)
			.its(0)
			.should('match', /this browser on this device/i);
		cy.wrap(asked)
			.its(0)
			.should('match', /clearing your browser data/i);
		cy.wrap(asked).its(0).should('not.match', /saved/i);

		cy.visit(`/manage/${slug}/submissions`);
		cy.contains('a', TALK).click();
		cy.waitForHydration();
		cy.contains('button', 'Edit talk').click();
		cy.get('[data-testid="talk-content-restored"]').should('be.visible');
		cy.get('[data-testid="talk-abstract"]').should('have.value', abstract);

		cy.reload();
		cy.waitForHydration();
		cy.contains('button', 'Edit talk').click();
		cy.get('[data-testid="talk-abstract"]').should('have.value', abstract);
	});

	it('keeps typed notes when Save profile is refused', () => {
		const notes = 'Notes that a refused save must not throw away';

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speaker-edit-toggle"]').click();
		cy.get('[data-testid="edit-notes"]').clear().type(notes);
		cy.get('[data-testid="edit-name"]').clear();
		cy.get('[data-testid="edit-name"]').invoke('attr', 'required', false);
		cy.get('[data-testid="edit-submit"]').click();

		cy.get('[data-testid="speakers-error"]').should('contain', 'A name is required.');
		cy.get('[data-testid="edit-notes"]').should('have.value', notes);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="speaker-edit-toggle"]').click();
		cy.get('[data-testid="edit-notes"]').should('have.value', notes);
	});

	it('keeps a typed abstract when Save talk is refused', () => {
		const abstract = 'Abstract that a refused save must not throw away';

		cy.visit(`/manage/${slug}/submissions`);
		cy.contains('a', TALK).click();
		cy.waitForHydration();
		cy.contains('button', 'Edit talk').click();
		cy.get('[data-testid="talk-abstract"]').clear().type(abstract);
		cy.get('input[name="title"]').clear();
		cy.get('input[name="title"]').invoke('attr', 'required', false);
		cy.contains('button', 'Save talk').click();

		cy.contains('A title is required.').should('be.visible');
		cy.get('[data-testid="talk-abstract"]').should('have.value', abstract);
		cy.get('form[action="?/content"]').should('exist');

		cy.reload();
		cy.waitForHydration();
		cy.contains('button', 'Edit talk').click();
		cy.get('[data-testid="talk-abstract"]').should('have.value', abstract);
	});
});
