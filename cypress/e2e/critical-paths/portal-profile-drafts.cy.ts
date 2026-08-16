/**
 * Portal profile drafts (#789): typed fields survive reload, a successful
 * save drops the copy, a refused URL keeps it. Insert the bio, do not set it —
 * `.invoke('val')` would hide an `<input>` that cannot hold the second line.
 */
const uniqueSlug = () =>
	`portal-profile-drafts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function seedSpeakerProfile() {
	const slug = uniqueSlug();
	cy.createAndLogin().then((speaker) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: {
				userId: speaker.id,
				slug,
				name: 'DevFlow Conf 2028',
				days: ['2028-05-10'],
				sessions: ['Build systems without the wait'],
				speakerUserId: speaker.id
			}
		})
			.its('status')
			.should('eq', 200);
	});
}

/** Type the lines. Setting `.val` would hide an `<input>` that cannot hold them. */
function typeProfileBio(lines: string[]) {
	cy.get('[data-testid="profile-bio"]')
		.should('have.prop', 'tagName', 'TEXTAREA')
		.clear()
		.click()
		.type(lines.join('{enter}'));
	cy.get('[data-testid="profile-bio"]').should('have.value', lines.join('\n'));
}

describe('Portal profile drafts', () => {
	beforeEach(() => {
		seedSpeakerProfile();
	});

	it('keeps a typed name and a two-line bio through a reload', () => {
		const stamp = Date.now();
		const name = `ORGJOURNEY portal-${stamp}`;
		const lines = [`First line ${stamp}`, `Second line ${stamp}`];

		cy.visit('/portal/profile');
		cy.waitForHydration();
		cy.get('[data-testid="profile-name"]').clear().type(name);
		typeProfileBio(lines);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="profile-name"]').should('have.value', name);
		cy.get('[data-testid="profile-bio"]')
			.should('have.prop', 'tagName', 'TEXTAREA')
			.and('have.value', lines.join('\n'));
		cy.get('[data-testid="profile-name-restored"]').should('be.visible');
		cy.get('[data-testid="profile-bio-restored"]').should('be.visible');
	});

	it('clears the parked copy after a successful save', () => {
		const company = `Acme-${Date.now()}`;

		cy.visit('/portal/profile');
		cy.waitForHydration();
		cy.get('[data-testid="profile-company"]').clear().type(company);
		cy.contains('button', 'Save profile').click();
		cy.contains('Profile saved.').should('be.visible');
		cy.get('[data-testid="profile-company"]').should('have.value', company);
		cy.get('[data-testid="profile-company-restored"]').should('not.exist');

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="profile-company"]').should('have.value', company);
		cy.get('[data-testid="profile-company-restored"]').should('not.exist');
	});

	it('keeps a refused link through the error and a reload', () => {
		const bad = `not-a-url-${Date.now()}`;

		cy.visit('/portal/profile');
		cy.waitForHydration();
		cy.get('[data-testid="profile-link-url-0"]').clear().type(bad);
		cy.contains('button', 'Save profile').click();
		cy.contains('That is not a link we can publish').should('be.visible');
		cy.get('[data-testid="profile-link-url-0"]').should('have.value', bad);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="profile-link-url-0"]').should('have.value', bad);
		cy.get('[data-testid="profile-link-url-0-restored"]').should('be.visible');
	});
});
