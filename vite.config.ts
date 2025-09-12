import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// Set DATABASE_URL for integration tests at config time
if (process.env.TEST_DATABASE_URL) {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglide({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		})
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
