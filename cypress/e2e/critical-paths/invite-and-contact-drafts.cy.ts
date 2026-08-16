/**
 * #764 / #765 / #789 / #763: a typed reviewer invite, a typed contact profile,
 * and a half-typed add-contact dialog must survive the ordinary decision to
 * look somewhere else before saving. Reopening and then reloading distinguishes
 * a browser draft from a value that merely stayed alive in the old component.
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

describe('Contact profile draft (#765, #789)', () => {
	beforeEach(() => {
		cy.createAndLogin();
	});

	function expectProfileLeavePrompt(asked: string[]) {
		cy.wrap(asked).should('have.length', 1);
		cy.wrap(asked)
			.its(0)
			.should('match', /what you typed on this profile will stay/i);
		cy.wrap(asked)
			.its(0)
			.should('match', /this browser on this device/i);
		cy.wrap(asked)
			.its(0)
			.should('match', /clearing your browser data/i);
		cy.wrap(asked).its(0).should('not.match', /saved/i);
	}

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
			expectProfileLeavePrompt(asked);

			cy.visit(path);
			cy.waitForHydration();
			cy.get('[data-testid="contact-notes"]').should('have.value', notes);
			cy.get('[data-testid="contact-notes-restored"]').should('be.visible');

			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="contact-notes"]').should('have.value', notes);
		});
	});

	/**
	 * A pasted column of tags reaches the server as a list (#831).
	 *
	 * `tagsFromFormInput` splits on `[\n,]+`, so a line break is a separator —
	 * but only if the field can hold one. Typed with `{enter}` rather than set
	 * with `.invoke('val')`: an `<input>` accepts a set value with newlines in
	 * it and quietly turns a pasted one into `speaker sponsor`, so setting the
	 * value is exactly the technique that cannot see this.
	 */
	it('turns a two-line tag paste into two tags, not one (#831)', () => {
		const stamp = Date.now();
		const first = `sponsor-${stamp}`;
		const second = `keynote-${stamp}`;

		cy.visit('/contacts');
		cy.waitForHydration();
		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').type(`Tagged ${stamp}`);
		cy.get('[data-testid="contacts-add-submit"]').click();
		cy.location('pathname').should('match', /\/contacts\/\d+/);
		cy.waitForHydration();

		cy.get('[data-testid="contact-tags"]')
			.should('have.prop', 'tagName', 'TEXTAREA')
			.clear()
			.type(`${first}{enter}${second}`);
		cy.get('[data-testid="contact-tags"]').should('have.value', `${first}\n${second}`);
		cy.get('[data-testid="contact-save"]').click();

		// Saved as two tags: the page joins them with ", " when it reads them
		// back, so one tag called "a b" and two tags called "a" and "b" are
		// distinguishable here — which they are not in the field before saving.
		cy.get('[data-testid="contact-tags"]').should('have.value', `${first}, ${second}`);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="contact-tags"]').should('have.value', `${first}, ${second}`);
	});

	it('keeps typed bio through a sidebar click and a reload', () => {
		const bio = `ORGJOURNEY-B2-${Date.now()} unsaved-bio`;

		cy.visit('/contacts');
		cy.waitForHydration();
		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').type('Ada Okonkwo');
		cy.get('[data-testid="contacts-add-submit"]').click();
		cy.location('pathname').should('match', /\/contacts\/\d+/);
		cy.waitForHydration();

		cy.location('pathname').then((path) => {
			cy.get('[data-testid="contact-bio"]').clear().type(bio);

			const asked: string[] = [];
			cy.on('window:confirm', (text: string) => {
				asked.push(text);
				return true;
			});
			cy.get('[data-testid="sidebar-home-link"]').click();
			cy.location('pathname').should('eq', '/home');
			expectProfileLeavePrompt(asked);

			cy.visit(path);
			cy.waitForHydration();
			cy.get('[data-testid="contact-bio"]').should('have.value', bio);
			cy.get('[data-testid="contact-bio-restored"]').should('be.visible');

			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="contact-bio"]').should('have.value', bio);
		});
	});
});

describe('Add-contact dialog draft (#763)', () => {
	beforeEach(() => {
		cy.createAndLogin();
	});

	it('keeps the typed name after Escape, reopen, and reload, then clears on add', () => {
		const stamp = Date.now();
		const name = `ORGJOURNEY-B-${stamp} contact`;
		const email = `add-${stamp}@example.test`;
		const company = `Acme-${stamp}`;

		cy.visit('/contacts');
		cy.waitForHydration();
		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').type(name);
		cy.get('[data-testid="contacts-add-email"]').type(email);
		cy.get('[data-testid="contacts-add-company"]').type(company);

		const asked: string[] = [];
		cy.on('window:confirm', (text: string) => {
			asked.push(text);
			return true;
		});
		cy.get('[data-testid="contacts-add-name"]').type('{esc}');
		cy.get('[data-testid="contacts-add"]').should('not.exist');
		cy.wrap(asked).should('have.length', 0);

		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').should('have.value', name);
		cy.get('[data-testid="contacts-add-email"]').should('have.value', email);
		cy.get('[data-testid="contacts-add-company"]').should('have.value', company);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').should('have.value', name);
		cy.get('[data-testid="contacts-add-email"]').should('have.value', email);
		cy.get('[data-testid="contacts-add-company"]').should('have.value', company);
		cy.get('[data-testid="contacts-add-name-restored"]').should('be.visible');

		cy.get('[data-testid="contacts-add-submit"]').click();
		cy.location('pathname').should('match', /\/contacts\/\d+/);

		cy.visit('/contacts');
		cy.waitForHydration();
		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').should('have.value', '');
		cy.get('[data-testid="contacts-add-email"]').should('have.value', '');
		cy.get('[data-testid="contacts-add-company"]').should('have.value', '');
	});

	it('keeps the typed fields when add returns fail(400)', () => {
		const stamp = Date.now();
		const email = `fail-${stamp}@example.test`;
		const company = `Hold-${stamp}`;

		cy.visit('/contacts');
		cy.waitForHydration();
		cy.get('[data-testid="contacts-add-open"]').click();
		// Spaces satisfy the HTML required attribute and still fail the action
		// after trim — the fail(400) branch Cypress only covered via the 303.
		cy.get('[data-testid="contacts-add-name"]').type('   ');
		cy.get('[data-testid="contacts-add-email"]').type(email);
		cy.get('[data-testid="contacts-add-company"]').type(company);
		cy.get('[data-testid="contacts-add-submit"]').click();

		cy.location('pathname').should('eq', '/contacts');
		cy.get('[data-testid="contacts-add"]').should('be.visible');
		cy.get('[data-testid="contacts-add-error"]')
			.should('be.visible')
			.and('contain', 'A name is required.');
		cy.get('[data-testid="contacts-add-name"]').should('have.value', '   ');
		cy.get('[data-testid="contacts-add-email"]').should('have.value', email);
		cy.get('[data-testid="contacts-add-company"]').should('have.value', company);
	});
});
