import { test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestUser } from './db';

// Get the directory name using import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File to store the authenticated state
const authFile = path.join(__dirname, '.auth/user.json');

// Create a standard test user that will be used across tests
const testEmail = `e2e-test-user@example.com`;
const testPassword = 'password123';

// This will run before tests and set up authentication
setup('authenticate', async ({ page }) => {
	console.log('Setting up authentication...');

	// Create a test user
	await createTestUser(testEmail, testPassword);

	// Navigate to the login page
	await page.goto('/login');

	// Fill in login form and submit
	await page.getByLabel('Email').fill(testEmail);
	await page.getByLabel('Password').fill(testPassword);

	// Click login button
	await page.getByRole('button', { name: 'Login' }).click();

	// Wait for redirect to home page after successful login
	await page.waitForURL('/home', { timeout: 100 });

	// Verify we stay on home page when already authenticated
	await page.goto('/home');
	await page.waitForURL('/home');

	// Save the authentication state to be used across tests
	await page.context().storageState({ path: authFile });
});
