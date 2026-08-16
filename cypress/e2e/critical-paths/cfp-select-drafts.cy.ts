/**
 * The two dropdowns on the public call must come back with the thirteen
 * text fields (#801). Typing into the hidden input is the trap — the
 * submitter uses the real control, so the spec does too.
 */
const uniqueSlug = () => `cfp-selects-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const autosaveKey = (slug: string, owner: string) =>
	`unsaved-form-draft:${encodeURIComponent(`cfp-autosave:${slug}`)}:${encodeURIComponent(owner)}`;

const FIELDS = {
	title: 'What leaving must not throw away',
	abstract: 'The two dropdowns used to vanish on reload.',
	keyTakeaway: 'Park the choice, not just the typing.',
	audienceLevel: 'Intermediate',
	speakerName: 'Ada Bennett',
	speakerSortName: 'Bennett, Ada',
	speakerEmail: 'ada@example.test',
	speakerJobTitle: 'Staff Engineer',
	speakerCompany: 'Northwind Labs',
	speakerBio: 'Works on build systems.',
	coName: 'Priya Raman',
	coEmail: 'priya@example.test',
	coRole: 'Co-presenter'
};

const publishCall = (slug: string) => {
	cy.createAndLogin().then((organizer) => {
		cy.request({
			method: 'POST',
			url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
			body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
		})
			.its('status')
			.should('eq', 200);
	});

	cy.visit(`/manage/${slug}/settings`);
	cy.waitForHydration();
	cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]').click();
	cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

	cy.get('[data-testid="settings-new-tracks"]').clear().type('Platform{enter}');
	cy.get('[data-testid="settings-track-row"][data-name="Platform"]').should('exist');
	cy.get('[data-testid="settings-new-formats"]').clear().type('Talk, 30{enter}');
	cy.get('[data-testid="settings-format-row"][data-name="Talk"]').should('exist');

	cy.visit(`/manage/${slug}/cfp`);
	cy.waitForHydration();
	cy.contains('button', 'Create the call for papers').click();
	cy.get('[data-testid="cfp-publish"]').click();
	cy.get('[data-testid="cfp-live-banner"]', { timeout: 20000 }).should('exist');
};

const fillAllFifteen = () => {
	cy.get('input[name="title"]').clear().type(FIELDS.title);
	cy.get('textarea[name="abstract"]').clear().type(FIELDS.abstract);
	cy.get('input[name="keyTakeaway"]').clear().type(FIELDS.keyTakeaway);
	cy.chooseFromAppSelect('app-select-sessionFormatId', 'Talk (30 min)');
	cy.chooseFromAppSelect('app-select-trackId', 'Platform');
	cy.get('input[name="audienceLevel"]').clear().type(FIELDS.audienceLevel);
	cy.get('input[name="speakerName"]').clear().type(FIELDS.speakerName);
	cy.get('input[name="speakerSortName"]').clear().type(FIELDS.speakerSortName);
	cy.get('input[name="speakerEmail"]').clear().type(FIELDS.speakerEmail);
	cy.get('input[name="speakerJobTitle"]').clear().type(FIELDS.speakerJobTitle);
	cy.get('input[name="speakerCompany"]').clear().type(FIELDS.speakerCompany);
	cy.get('textarea[name="speakerBio"]').clear().type(FIELDS.speakerBio);
	cy.contains('button', 'Add a co-presenter').click();
	cy.get('input[name="co-name"]').clear().type(FIELDS.coName);
	cy.get('input[name="co-email"]').clear().type(FIELDS.coEmail);
	cy.get('input[name="co-role"]').clear().type(FIELDS.coRole);
};

const expectAllFifteen = () => {
	cy.get('input[name="title"]').should('have.value', FIELDS.title);
	cy.get('textarea[name="abstract"]').should('have.value', FIELDS.abstract);
	cy.get('input[name="keyTakeaway"]').should('have.value', FIELDS.keyTakeaway);
	cy.get('[data-testid="app-select-sessionFormatId"]').should('contain.text', 'Talk (30 min)');
	cy.get('[data-testid="app-select-trackId"]').should('contain.text', 'Platform');
	cy.get('input[name="audienceLevel"]').should('have.value', FIELDS.audienceLevel);
	cy.get('input[name="speakerName"]').should('have.value', FIELDS.speakerName);
	cy.get('input[name="speakerSortName"]').should('have.value', FIELDS.speakerSortName);
	cy.get('input[name="speakerEmail"]').should('have.value', FIELDS.speakerEmail);
	cy.get('input[name="speakerJobTitle"]').should('have.value', FIELDS.speakerJobTitle);
	cy.get('input[name="speakerCompany"]').should('have.value', FIELDS.speakerCompany);
	cy.get('textarea[name="speakerBio"]').should('have.value', FIELDS.speakerBio);
	cy.get('input[name="co-name"]').should('have.value', FIELDS.coName);
	cy.get('input[name="co-email"]').should('have.value', FIELDS.coEmail);
	cy.get('input[name="co-role"]').should('have.value', FIELDS.coRole);
};

describe('Every field on the public call', () => {
	it('survives reload while signed out, including the two dropdowns', () => {
		const slug = uniqueSlug();
		publishCall(slug);
		cy.logout();

		cy.visit(`/c/${slug}/cfp`);
		cy.waitForHydration();
		cy.get('[data-testid="cfp-draft-hint"]').should(
			'contain.text',
			'Only what you filled in on this call will stay in this browser on this device.'
		);
		cy.get('[data-testid="cfp-draft-hint"]').should('not.contain.text', 'Drafts are saved');

		fillAllFifteen();

		cy.window()
			.its('localStorage')
			.should((storage: Storage) => {
				const parked = storage.getItem(autosaveKey(slug, 'anonymous'));
				expect(parked).to.contain(FIELDS.abstract);
				expect(parked).to.match(/"sessionFormatId":[1-9]/);
				expect(parked).to.match(/"trackId":[1-9]/);
			});

		cy.reload();
		cy.waitForHydration();
		expectAllFifteen();

		cy.setCookie('better-auth.session_token', 'dead-session');
		cy.reload();
		cy.waitForHydration();
		expectAllFifteen();
	});
});
