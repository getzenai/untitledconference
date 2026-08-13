import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import { paraglideCompilerOptions } from './paraglide.config.mjs';

// Only override DATABASE_URL with TEST_DATABASE_URL during actual test runs
if (process.env.TEST && process.env.TEST_DATABASE_URL) {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
	plugins: [tailwindcss(), paraglideVitePlugin(paraglideCompilerOptions), sveltekit()],
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.unit.test.ts'],
					environment: 'node'
					// No globalSetup for unit tests - they don't need database
				}
			},
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['src/**/*.integration.test.ts'],
					environment: 'node',
					// The runner gives this suite its own disposable database, isolating it
					// from concurrent worktrees. Files inside this one run still share that
					// database, and cleanupTestDatabase() empties whole tables, so keep the
					// files serial too.
					fileParallelism: false,
					globalSetup: './vitest.integration.setup.ts',
					setupFiles: ['./vitest.integration.env.ts'],
					env: {
						DATABASE_URL: process.env.TEST_DATABASE_URL || '',
						ENABLE_TEST_ENDPOINTS: 'true'
					}
				}
			}
		]
	}
});
