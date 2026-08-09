import { defineConfig } from 'drizzle-kit';
if (!process.env.DATABASE_URL) {
	throw new Error(
		'DATABASE_URL is not set. For tests, use: DATABASE_URL="$TEST_DATABASE_URL" npm run db:push'
	);
}

export default defineConfig({
	schema: './src/lib/server/db/**/**-schema.ts',

	dbCredentials: {
		url: process.env.DATABASE_URL
	},

	verbose: true,
	strict: true,
	dialect: 'postgresql'
});
