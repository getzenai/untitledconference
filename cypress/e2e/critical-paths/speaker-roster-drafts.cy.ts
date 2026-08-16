/**
 * Speaker roster drafts: the open row survives reload, and the add and
 * import dialogs survive Escape without a question. Reopening and then
 * reloading distinguishes a browser draft from a value that merely stayed
 * alive in the old component.
 */
const uniqueSlug = () => `spk-drafts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Type the rows. Setting `.val` would hide an `<input>` that cannot hold them. */
function typeImportCsv(lines: string[]) {
	cy.get('[data-testid="import-csv"]')
		.should('have.prop', 'tagName', 'TEXTAREA')
		.click()
		.type(lines.join('{enter}'));
	cy.get('[data-testid="import-csv"]').should('have.value', lines.join('\n'));
}

describe('Speaker roster drafts', () => {
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

	it('keeps a typed row name and bio through a reload', () => {
		const stamp = Date.now();
		const name = `ORGJOURNEY row-${stamp}`;
		const bio = `ORGJOURNEY bio-${stamp}`;

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speaker-edit-toggle"]').click();
		cy.get('[data-testid="edit-name"]').clear().type(name);
		cy.get('[data-testid="edit-bio"]').clear().type(bio);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="speaker-edit-toggle"]').click();
		cy.get('[data-testid="edit-name"]').should('have.value', name);
		cy.get('[data-testid="edit-bio"]').should('have.value', bio);
		cy.get('[data-testid="edit-name-restored"]').should('be.visible');
		cy.get('[data-testid="edit-bio-restored"]').should('be.visible');
	});

	it('keeps the typed add-speaker name after Escape, reopen, and reload, then clears on add', () => {
		const stamp = Date.now();
		const name = `ORGJOURNEY add-${stamp}`;
		const email = `add-${stamp}@example.test`;
		const company = `Acme-${stamp}`;
		const bio = `ORGJOURNEY add-bio-${stamp}`;

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speakers-add"]').click();
		cy.get('[data-testid="add-name"]').type(name);
		cy.get('[data-testid="add-email"]').type(email);
		cy.get('[data-testid="add-company"]').type(company);
		cy.get('[data-testid="add-bio"]').type(bio);

		const asked: string[] = [];
		cy.on('window:confirm', (text) => {
			asked.push(text);
			return true;
		});
		cy.get('[data-testid="add-name"]').type('{esc}');
		cy.get('[data-testid="speakers-add-dialog"]').should('not.exist');
		cy.wrap(asked).should('have.length', 0);

		cy.get('[data-testid="speakers-add"]').click();
		cy.get('[data-testid="add-name"]').should('have.value', name);
		cy.get('[data-testid="add-email"]').should('have.value', email);
		cy.get('[data-testid="add-company"]').should('have.value', company);
		cy.get('[data-testid="add-bio"]').should('have.value', bio);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="speakers-add"]').click();
		cy.get('[data-testid="add-name"]').should('have.value', name);
		cy.get('[data-testid="add-email"]').should('have.value', email);
		cy.get('[data-testid="add-company"]').should('have.value', company);
		cy.get('[data-testid="add-bio"]').should('have.value', bio);
		cy.get('[data-testid="add-name-restored"]').should('be.visible');
		cy.get('[data-testid="add-bio-restored"]').should('be.visible');

		cy.get('[data-testid="add-submit"]').click();
		cy.get('[data-testid="speakers-add-dialog"]').should('not.exist');
		cy.contains('Speaker added to the roster.').should('be.visible');

		cy.get('[data-testid="speakers-add"]').click();
		cy.get('[data-testid="add-name"]').should('have.value', '');
		cy.get('[data-testid="add-email"]').should('have.value', '');
		cy.get('[data-testid="add-company"]').should('have.value', '');
		cy.get('[data-testid="add-bio"]').should('have.value', '');
	});

	it('keeps typed import rows after Escape, reopen, and reload (#789)', () => {
		const stamp = Date.now();
		const header = 'name,email';
		const person = `Walk ${stamp},walk-${stamp}@example.test`;
		const rows = `${header}\n${person}`;

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speakers-import-open"]').click();
		typeImportCsv([header, person]);

		const asked: string[] = [];
		cy.on('window:confirm', (text) => {
			asked.push(text);
			return true;
		});
		cy.get('[data-testid="import-csv"]').type('{esc}');
		cy.get('[data-testid="import-csv"]').should('not.exist');
		cy.wrap(asked).should('have.length', 0);

		cy.get('[data-testid="speakers-import-open"]').click();
		cy.get('[data-testid="import-csv"]').should('have.value', rows);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="speakers-import-open"]').click();
		cy.get('[data-testid="import-csv"]').should('have.value', rows);
		cy.get('[data-testid="import-csv-restored"]').should('be.visible');
	});

	it('clears the paste box after a successful import (#829)', () => {
		const stamp = Date.now();
		const header = 'name,email';
		const person = `Ok ${stamp},ok-${stamp}@example.test`;

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speakers-import-open"]').click();
		typeImportCsv([header, person]);
		cy.get('[data-testid="import-submit"]').click();
		cy.get('[data-testid="import-message"]').should('contain', 'Imported 1 speaker.');
		cy.get('[data-testid="import-csv"]').should('have.value', '');

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="speakers-import-open"]').click();
		cy.get('[data-testid="import-csv"]').should('have.value', '');
	});

	it('keeps the paste after a refused import (#829)', () => {
		const stamp = Date.now();
		const header = 'name,email';
		const orphan = `,orphan-${stamp}@example.test`;
		const rows = `${header}\n${orphan}`;

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speakers-import-open"]').click();
		typeImportCsv([header, orphan]);
		cy.get('[data-testid="import-submit"]').click();
		cy.get('[data-testid="import-error"]').should(
			'contain',
			'Row 2 has no name. Every speaker needs one.'
		);
		cy.get('[data-testid="import-csv"]').should('have.value', rows);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="speakers-import-open"]').click();
		cy.get('[data-testid="import-csv"]').should('have.value', rows);
		cy.get('[data-testid="import-csv-restored"]').should('be.visible');
	});
});
