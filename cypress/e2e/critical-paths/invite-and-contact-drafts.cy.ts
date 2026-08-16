/**
 * #764 / #765: a typed reviewer invite and contact notes must survive the
 * ordinary decision to look somewhere else before saving. Reopening and then
 * reloading distinguishes a browser draft from a value that merely stayed
 * alive in the old component.
 */
const uniqueSlug = () => `invite-notes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Reviewer invite draft (#764)', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();
		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('keeps a typed invite email through a sidebar click and a reload', () => {
		const email = `walk-${Date.now()}@example.test`;

		cy.visit(`/manage/${slug}/people`);
		cy.waitForHydration();
		cy.get('form[action="?/addReviewer"] input[name="email"]').type(email);

		cy.get('[data-testid="sidebar-home-link"]').click();
		cy.location('pathname').should('eq', '/home');

		cy.visit(`/manage/${slug}/people`);
		cy.waitForHydration();
		cy.get('form[action="?/addReviewer"] input[name="email"]').should('have.value', email);
		cy.get('[data-testid="people-invite-email-restored"]').should('be.visible');

		cy.reload();
		cy.waitForHydration();
		cy.get('form[action="?/addReviewer"] input[name="email"]').should('have.value', email);
	});
});

describe('Contact notes draft (#765)', () => {
	beforeEach(() => {
		cy.createAndLogin();
	});

	it('keeps typed notes through a sidebar click and a reload', () => {
		const notes = `ORGJOURNEY-B2-${Date.now()} contact-notes`;

		cy.visit('/contacts');
		cy.waitForHydration();
		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').type('Tomiwa Adeyemi');
		cy.get('[data-testid="contacts-add-submit"]').click();
		cy.location('pathname').should('match', /\/contacts\/\d+/);
		cy.waitForHydration();

		cy.location('pathname').then((path) => {
			cy.get('[data-testid="contact-notes"]').clear().type(notes);

			const asked: string[] = [];
			cy.on('window:confirm', (text: string) => {
				asked.push(text);
				return true;
			});
			cy.get('[data-testid="sidebar-home-link"]').click();
			cy.location('pathname').should('eq', '/home');
			cy.wrap(asked).should('have.length', 1);
			cy.wrap(asked)
				.its(0)
				.should('match', /this browser on this device/i);
			cy.wrap(asked)
				.its(0)
				.should('match', /cleared store/i);
			cy.wrap(asked).its(0).should('not.match', /saved/i);

			cy.visit(path);
			cy.waitForHydration();
			cy.get('[data-testid="contact-notes"]').should('have.value', notes);
			cy.get('[data-testid="contact-notes-restored"]').should('be.visible');

			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="contact-notes"]').should('have.value', notes);
		});
	});

	it('asks only about notes when notes and bio are both typed', () => {
		const notes = `ORGJOURNEY-B2-${Date.now()} notes-only-warn`;
		const bio = `ORGJOURNEY-B2-${Date.now()} unsaved-bio`;

		cy.visit('/contacts');
		cy.waitForHydration();
		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').type('Ada Okonkwo');
		cy.get('[data-testid="contacts-add-submit"]').click();
		cy.location('pathname').should('match', /\/contacts\/\d+/);
		cy.waitForHydration();

		cy.get('[data-testid="contact-notes"]').clear().type(notes);
		cy.get('[data-testid="contact-bio"]').clear().type(bio);

		const asked: string[] = [];
		cy.on('window:confirm', (text: string) => {
			asked.push(text);
			return false;
		});
		cy.get('[data-testid="sidebar-home-link"]').click();

		cy.location('pathname').should('match', /\/contacts\/\d+/);
		cy.get('[data-testid="contact-notes"]').should('have.value', notes);
		cy.get('[data-testid="contact-bio"]').should('have.value', bio);
		cy.wrap(asked).should('have.length', 1);
		cy.wrap(asked)
			.its(0)
			.should('match', /this browser on this device/i);
		cy.wrap(asked)
			.its(0)
			.should('match', /cleared store/i);
		cy.wrap(asked).its(0).should('not.match', /saved/i);
	});
});
