import { execSync } from 'child_process';
import 'dotenv/config';

export default function setup() {
	console.log('Setting up integration tests...');
	console.log('Pushing database schema to test database...');

	execSync('npx drizzle-kit push --force', {
		stdio: 'inherit',
		env: {
			...process.env,
			DATABASE_URL: process.env.TEST_DATABASE_URL
		}
	});

	console.log('Integration test setup complete.');
}
