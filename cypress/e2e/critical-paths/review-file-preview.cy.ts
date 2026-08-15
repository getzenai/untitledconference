/**
 * #423: the reviewer reads a PDF beside the submission, and an unknown type
 * stays a download. The unit suite pins the two shapes; this spec is the
 * click on the page they actually score from.
 */
const uniqueSlug = () => `rev-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('The reviewer opens an attachment without leaving the talk', () => {
	it('shows a PDF in a sheet and leaves a .docx as a download', () => {
		const slug = uniqueSlug();
		const talk = 'A deck worth reading';
		const pdfUrl = `${Cypress.config('baseUrl')}/preview-spec/slides.pdf`;
		const notesUrl = `${Cypress.config('baseUrl')}/preview-spec/notes.docx`;

		cy.intercept('GET', '**/preview-spec/slides.pdf', {
			fixture: 'slides.pdf',
			headers: { 'content-type': 'application/pdf' }
		});

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: [talk],
					sessionStatus: 'submitted',
					reviewed: [talk],
					attachments: [
						{ label: 'Slides', url: pdfUrl },
						{ label: 'Notes', url: notesUrl }
					]
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/review/${slug}`);
		cy.waitForHydration();
		cy.contains('a', talk).click();
		cy.waitForHydration();

		cy.contains('We cannot show this type here — download it instead.').should('exist');
		cy.contains('a[data-testid="file-download"]', 'notes.docx').should(
			'have.attr',
			'href',
			notesUrl
		);

		cy.get('[data-testid="file-open"]').should('have.length', 1).click();
		cy.get('[data-testid="file-preview-sheet"]').should('be.visible');
		cy.get('[data-testid="file-preview-pdf"]').should('exist');
		cy.get('[data-testid="file-preview-download"]').should('have.attr', 'href', pdfUrl);
	});
});
