import { CrudActions } from '../../support/actions/crud.actions';
import type { TestUser } from '../../support/globals';
import { CrudPage } from '../../support/pages/crud.page';

/**
 * Critical CRUD Lifecycle: Create -> Read -> Update -> Delete.
 *
 * Ported from e2e/critical-paths/crud-lifecycle.test.ts, which was permanently
 * `test.fixme` in Playwright. The Cypress version runs for real; the update and
 * delete steps go through the detail page (/examples/crud/[id]) because the
 * list page has no inline edit/delete controls.
 */
describe('Critical CRUD Lifecycle', () => {
	const crudPage = new CrudPage();
	let testUser: TestUser;

	before(() => {
		cy.createTestUser({ organizationName: 'CRUD Lifecycle Org' }).then((user) => {
			testUser = user;
		});
	});

	beforeEach(() => {
		cy.login(testUser.email, testUser.password);
	});

	it('Complete CRUD operations with data integrity validation', () => {
		const stamp = Date.now();
		const item1Name = `CRUD Test 1 ${stamp}`;
		const item1Description = 'First item description';
		const item2Name = `CRUD Test 2 ${stamp}`;
		const item2Description = 'Second item description';
		const updatedName = `Updated CRUD Test 1 ${stamp}`;
		const updatedDescription = 'Updated description';

		// STEP 1: CREATE
		CrudActions.navigateToCrudPage();
		CrudActions.createExampleObject(item1Name, item1Description);
		CrudActions.createExampleObject(item2Name, item2Description);
		CrudActions.verifyObjectExists(item1Name);
		CrudActions.verifyObjectExists(item2Name);

		// STEP 2: READ - the detail page holds the description
		crudPage.openItem(item1Name).descriptionInput().should('have.value', item1Description);
		crudPage.visit();
		crudPage.openItem(item2Name).descriptionInput().should('have.value', item2Description);
		crudPage.visit();

		// STEP 3: UPDATE the first item only
		CrudActions.updateObjectByName(item1Name, updatedName, updatedDescription);
		CrudActions.verifyObjectExists(updatedName);
		CrudActions.verifyObjectNotExists(item1Name);
		crudPage.openItem(updatedName).descriptionInput().should('have.value', updatedDescription);
		crudPage.visit();

		// Data integrity: the second item is untouched
		CrudActions.verifyObjectExists(item2Name);
		crudPage.openItem(item2Name).descriptionInput().should('have.value', item2Description);
		crudPage.visit();

		// STEP 4: DELETE both
		CrudActions.deleteObjectByName(updatedName);
		CrudActions.deleteObjectByName(item2Name);
		CrudActions.verifyObjectNotExists(updatedName);
		CrudActions.verifyObjectNotExists(item2Name);
	});

	it('rejects an empty create form', () => {
		crudPage.visit();
		crudPage.submitEmptyForm();
		// Client-side validation keeps us on the page and surfaces field errors.
		cy.url().should('include', '/examples/crud');
		cy.get('[data-fs-field-errors], [role="alert"]').should('exist');
	});
});
