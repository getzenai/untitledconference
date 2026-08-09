/// <reference types="cypress" />
import { CrudPage } from '../pages/crud.page';

const crudPage = new CrudPage();

export interface ExampleObject {
	name: string;
	description: string;
}

/** Ported from e2e/actions/crud.actions.ts. */
export const CrudActions = {
	navigateToCrudPage(): void {
		crudPage.visit();
	},

	createExampleObject(name: string, description: string): void {
		if (!name || !description) {
			throw new Error(
				`createExampleObject requires both fields: name="${name}", description="${description}"`
			);
		}
		crudPage.createItem(name, description);
	},

	createMultipleObjects(objects: ExampleObject[]): void {
		objects.forEach((obj) => CrudActions.createExampleObject(obj.name, obj.description));
	},

	/** Open an object's detail page, rewrite both fields, save, return to the list. */
	updateObjectByName(currentName: string, newName: string, newDescription: string): void {
		if (!currentName || !newName || !newDescription) {
			throw new Error(
				`updateObjectByName requires all fields: currentName="${currentName}", newName="${newName}", newDescription="${newDescription}"`
			);
		}
		const detail = crudPage.openItem(currentName);
		detail.update(newName, newDescription);
		crudPage.visit();
		crudPage.shouldHaveItem(newName);
	},

	deleteObjectByName(name: string): void {
		const detail = crudPage.openItem(name);
		detail.deleteObject();
		cy.url({ timeout: 20000 }).should('match', /\/examples\/crud\/?$/);
		crudPage.waitForPageLoad();
		crudPage.shouldNotHaveItem(name);
	},

	verifyObjectExists(name: string): void {
		crudPage.shouldHaveItem(name);
	},

	verifyObjectNotExists(name: string): void {
		crudPage.shouldNotHaveItem(name);
	},

	verifyObjectCount(expected: number): void {
		crudPage.itemCount().should('eq', expected);
	}
};
