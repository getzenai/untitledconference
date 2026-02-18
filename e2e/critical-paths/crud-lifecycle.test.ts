import { createLogger } from '../../src/lib/server/logger';
import { CrudActions } from '../actions/crud.actions';
import { expect, test } from '../fixtures/test';

const logger = createLogger('CrudLifecycleTest');

/**
 * Critical CRUD Lifecycle Test
 *
 * This E2E test covers the complete CRUD lifecycle: Create → Read → Update → Delete.
 * This replaces multiple validation-focused tests with one comprehensive workflow test.
 *
 * Target Execution Time: ~15 seconds
 */
test.describe('Critical CRUD Lifecycle', () => {
	test.fixme('Complete CRUD operations with data integrity validation', async ({
		page,
		crudPage
	}) => {
		const timestamp = Date.now();
		const item1Name = `CRUD Test 1 ${timestamp}`;
		const item1Description = 'First item description';
		const item2Name = `CRUD Test 2 ${timestamp}`;
		const item2Description = 'Second item description';
		const updatedName = `Updated ${item1Name}`;
		const updatedDescription = 'Updated description';

		const crudActions = new CrudActions(page);

		logger.debug('STEP 1: CREATE - Multiple Items');
		await crudPage.goto();
		await crudPage.waitForPageLoad();

		// Create multiple items
		await crudActions.createExampleObject(item1Name, item1Description);
		await crudActions.createExampleObject(item2Name, item2Description);

		// Verify both exist on the page
		expect(await crudPage.isItemVisible(item1Name)).toBeTruthy();
		expect(await crudPage.isItemVisible(item2Name)).toBeTruthy();

		logger.debug('STEP 2: READ - Verify Details');
		// Read and verify first item exists with correct details
		await crudActions.verifyObjectExists(item1Name);
		const item1Data = await crudActions.findExampleObjectByName(item1Name);
		expect(item1Data).toBeTruthy();

		// Read and verify second item exists with correct details
		await crudActions.verifyObjectExists(item2Name);
		const item2Data = await crudActions.findExampleObjectByName(item2Name);
		expect(item2Data).toBeTruthy();

		logger.debug('STEP 3: UPDATE - First Item Only');
		// Update only the first item
		await crudActions.updateExampleObject(item1Name, updatedName, updatedDescription);

		// Verify update was successful
		expect(await crudPage.isItemVisible(updatedName)).toBeTruthy();
		expect(await crudPage.isItemVisible(item1Name)).toBeFalsy(); // Old name should not exist

		// Read updated item to verify changes
		await crudActions.verifyObjectExists(updatedName);
		const updatedItem = await crudActions.findExampleObjectByName(updatedName);
		expect(updatedItem).toBeTruthy();

		// Verify second item is unchanged (data integrity check)
		expect(await crudPage.isItemVisible(item2Name)).toBeTruthy();
		await crudActions.verifyObjectExists(item2Name);

		logger.debug('STEP 4: DELETE - Both Items');
		// Delete both items
		await crudActions.deleteObjectByName(updatedName);
		await crudActions.deleteObjectByName(item2Name);

		// Verify both items are deleted
		expect(await crudPage.isItemVisible(updatedName)).toBeFalsy();
		expect(await crudPage.isItemVisible(item2Name)).toBeFalsy();

		logger.debug('Complete CRUD operations with data integrity test passed successfully');
	});
});
