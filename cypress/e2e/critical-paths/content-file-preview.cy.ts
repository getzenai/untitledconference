/**
 * #423: the organizer opens a PDF on speaker materials without leaving the
 * page, and an unknown type stays a download. The unit suite pins the two
 * shapes; this spec is the click on the library they actually collect from.
 */
const uniqueSlug = () => `content-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('The organizer opens a speaker file without leaving the library', () => {
	it('shows a PDF in a sheet and leaves a .docx as a download', () => {
		const slug = uniqueSlug();

		cy.intercept('GET', `**/manage/${slug}/content/files/*`, (req) => {
			if (req.url.includes('download')) {
				req.continue();
				return;
			}
			req.reply({ fixture: 'slides.pdf', headers: { 'content-type': 'application/pdf' } });
		});

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['A deck worth reading'],
					contentFiles: [
						{ filename: 'slides.pdf', contentType: 'application/pdf' },
						{
							filename: 'notes.docx',
							contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
						}
					]
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/content/files`);
		cy.waitForHydration();

		cy.contains('We cannot show this type here — download it instead.').should('exist');
		cy.contains('a[data-testid="file-download"]', 'notes.docx').should('exist');

		cy.get('[data-testid="file-open"]').should('have.length', 1).click();
		cy.get('[data-testid="file-preview-sheet"]').should('be.visible');
		cy.get('[data-testid="file-preview-pdf"]').should('exist');
		cy.get('[data-testid="file-preview-download"]')
			.invoke('attr', 'href')
			.should('match', new RegExp(`/manage/${slug}/content/files/\\d+$`));
	});
});
