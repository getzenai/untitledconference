import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// Only override DATABASE_URL with TEST_DATABASE_URL during actual test runs
if (process.env.TEST && process.env.TEST_DATABASE_URL) {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['localStorage', 'url', 'preferredLanguage', 'baseLocale']
		}),
		sveltekit()
	],
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
					// Every integration file shares the one physical TEST_DATABASE_URL, and
					// `cleanupTestDatabase()` empties whole tables rather than only its own
					// rows. Run the files one at a time — in parallel, one file's cleanup
					// deletes another file's fixtures mid-test.
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
