/**
 * #626: the speaker hands a file in on pick, sees what they attached, and
 * knows who a question goes to. The unit suite pins the three shapes; this
 * spec is the page they actually upload from.
 *
 * The first case is the chrome #640 already covered. The second picks a
 * file in the browser and checks the new deliverable, not the seeded one.
 */
const uniqueSlug = () => `task-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Handing in a file from the speaker task', () => {
	it('previews the file, hides the ceremonial Upload click, and names who reads a question', () => {
		const slug = uniqueSlug();
		const conference = 'DevFlow Conf 2028';

		cy.intercept('GET', '**/portal/files/*', (req) => {
			if (req.url.includes('download')) {
				req.continue();
				return;
			}
			req.reply({ fixture: 'slides.pdf', headers: { 'content-type': 'application/pdf' } });
		});

		cy.createAndLogin().then((speaker) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: speaker.id,
					slug,
					name: conference,
					days: ['2028-05-10'],
					sessions: ['A deck worth reading'],
					speakerUserId: speaker.id,
					contentFiles: [{ filename: 'slides.pdf', contentType: 'application/pdf' }]
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit('/portal');
		cy.waitForHydration();
		cy.contains('a', 'Upload slides.pdf').click();
		cy.waitForHydration();

		cy.contains('button', /^Upload$/).should('not.exist');
		cy.get('[data-testid="task-upload"]').should('exist');
		cy.contains('It is handed in as soon as you pick it').should('exist');

		cy.get('[data-testid="file-open"]').should('have.length', 1).click();
		cy.get('[data-testid="file-preview-sheet"]').should('be.visible');
		cy.get('[data-testid="file-preview-pdf"]').should('exist');
		cy.get('[data-testid="file-preview-download"]')
			.invoke('attr', 'href')
			.should('match', /\/portal\/files\/\d+$/);

		cy.contains(`Goes to the programme team of ${conference}`).should('exist');
		cy.contains('Their reply appears here.').should('exist');
		cy.contains('button', 'Send to the programme team').should('exist');
	});

	it('hands a newly picked file in as the latest deliverable', () => {
		const conference = 'DevFlow Conf 2028';
		const handedIn = `handoff-${Date.now()}.pdf`;

		cy.createAndLogin().then((speaker) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: speaker.id,
					slug: uniqueSlug(),
					name: conference,
					days: ['2028-05-10'],
					sessions: ['A deck worth reading'],
					speakerUserId: speaker.id,
					contentFiles: [{ filename: 'slides.pdf', contentType: 'application/pdf' }]
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit('/portal');
		cy.waitForHydration();
		cy.contains('a', 'Upload slides.pdf').click();
		cy.waitForHydration();

		cy.contains('It is handed in as soon as you pick it').should('exist');
		cy.get('[data-testid="file-open"]').should('have.length', 1);

		cy.get('[data-testid="task-upload"]').selectFile({
			contents: 'cypress/fixtures/slides.pdf',
			fileName: handedIn,
			mimeType: 'application/pdf'
		});

		cy.contains('[data-testid="file-open"]', handedIn).should('exist');
		cy.get('[data-testid="file-open"]').should('have.length', 2);
		cy.contains('li', handedIn).within(() => {
			cy.contains('Latest').should('exist');
			cy.contains('v2').should('exist');
		});
		cy.contains('[data-testid="file-open"]', 'slides.pdf').should('exist');
	});
});
