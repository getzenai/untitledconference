/**
 * Leaving a half-filled creation form (#435).
 *
 * Found by walking the product: you can type a whole conference into
 * `/manage/new`, click the sidebar, and it is gone without a word. There is no
 * draft behind these forms — what is typed is the only copy.
 *
 * This has to be a browser test. The decision table is unit-tested next to the
 * component, but the thing that actually bit is a click on a real link with
 * real typed input in the fields, and the answer to it is a dialog the page
 * does not draw itself. Only here can "the navigation did not happen" be
 * observed at all.
 *
 * The other guarded form, `/settings/organization/new`, is deliberately not
 * here: `/api/v1/test/register` gives every test user an organization ("all
 * test users should have an org"), and that route sends anyone who has one to
 * their organization instead. So the page cannot be reached from this harness,
 * and the guard on it is carried by the same component this file exercises —
 * covered by construction, not by observation. Worth fixing the day the test
 * register endpoint can make a user who belongs to nothing.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Leaving a form with unsaved input', () => {
	beforeEach(() => {
		cy.createAndLogin({ organizationName: `Guard Org ${stamp()}` });
	});

	const openNewConference = () => {
		cy.visit('/manage/new');
		cy.waitForHydration();
	};

	it('asks before a sidebar click throws typed input away, and stays put on "cancel"', () => {
		openNewConference();
		cy.get('input[name="name"]').clear().type('Half-typed Conference');

		const asked: string[] = [];
		cy.on('window:confirm', (text: string) => {
			asked.push(text);
			return false;
		});

		cy.get('[data-testid="sidebar-home-link"]').click();

		cy.location('pathname').should('eq', '/manage/new');
		cy.get('input[name="name"]').should('have.value', 'Half-typed Conference');
		cy.wrap(asked).should('have.length', 1);
		cy.wrap(asked)
			.its(0)
			.should('match', /not been saved/);
	});

	it('leaves when the answer is yes', () => {
		openNewConference();
		cy.get('input[name="name"]').clear().type('Abandoned Conference');

		// Cypress answers a confirm with "yes" unless told otherwise.
		cy.get('[data-testid="sidebar-home-link"]').click();

		cy.location('pathname', { timeout: 10000 }).should('not.eq', '/manage/new');
	});

	it('says nothing when nothing was typed', () => {
		openNewConference();

		let asked = 0;
		cy.on('window:confirm', () => {
			asked += 1;
			return true;
		});

		cy.get('[data-testid="sidebar-home-link"]').click();

		cy.location('pathname', { timeout: 10000 }).should('not.eq', '/manage/new');
		cy.then(() => expect(asked).to.eq(0));
	});

	it('does not stand in the way of the form saving its own work', () => {
		const slug = `guard-${stamp()}`;
		openNewConference();

		let asked = 0;
		cy.on('window:confirm', () => {
			asked += 1;
			return true;
		});

		cy.get('input[name="name"]').clear().type('Saved Conference');
		cy.get('input[name="slug"]').clear().type(slug);
		cy.contains('button[type="submit"]', 'Create conference').click();

		cy.location('pathname', { timeout: 20000 }).should('include', `/manage/${slug}/settings`);
		cy.then(() => expect(asked, 'submitting is not losing work').to.eq(0));
	});
});
