import { describe, expect, it } from 'vitest';
import { serverEnvSchema } from './server-env-schema';

// The two truly-required vars; every case starts from these so we isolate the
// behaviour under test.
const base = {
	DATABASE_URL: 'postgres://root:pw@localhost:5432/dev',
	BETTER_AUTH_SECRET: 'a-secret'
};

const issuePaths = (result: ReturnType<typeof serverEnvSchema.safeParse>) =>
	result.success ? [] : result.error.issues.map((i) => i.path.join('.'));

describe('serverEnvSchema — required fields & defaults', () => {
	it('accepts the minimal required set and applies coerced defaults', () => {
		const result = serverEnvSchema.safeParse({ ...base });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.BETTER_AUTH_URL).toBe('http://localhost:5173');
			expect(result.data.REQUIRE_EMAIL_VERIFICATION).toBe(true);
			expect(result.data.LOG_LEVEL).toBe('warn');
			expect(result.data.LOG_FORMAT).toBe('human');
			expect(result.data.SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG).toBe(false);
			expect(result.data.ENABLE_TEST_ENDPOINTS).toBe(false);
			expect(result.data.FEATURE_EXAMPLE_FEATURE).toBe(false);
			expect(result.data.FEATURE_INAPP_CHAT).toBe(false);
			expect(result.data.AI_CHAT_MODEL).toBe('openai/gpt-4o-mini');
		}
	});

	it('reports every missing required var (aggregated, not fail-fast)', () => {
		const result = serverEnvSchema.safeParse({});
		expect(result.success).toBe(false);
		const paths = issuePaths(result);
		expect(paths).toContain('DATABASE_URL');
		expect(paths).toContain('BETTER_AUTH_SECRET');
	});
});

describe('serverEnvSchema — SendGrid conditional requirement', () => {
	it('requires both SendGrid fields when SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG=true', () => {
		const result = serverEnvSchema.safeParse({
			...base,
			SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG: 'true'
		});
		expect(result.success).toBe(false);
		const paths = issuePaths(result);
		expect(paths).toContain('SENDGRID_API_KEY');
		expect(paths).toContain('SENDGRID_FROM');
	});

	it('passes when sending emails and both SendGrid fields are present', () => {
		const result = serverEnvSchema.safeParse({
			...base,
			SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG: 'true',
			SENDGRID_API_KEY: 'key',
			SENDGRID_FROM: 'no-reply@example.com'
		});
		expect(result.success).toBe(true);
	});

	it('does not require SendGrid fields when email sending is off', () => {
		const result = serverEnvSchema.safeParse({
			...base,
			SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG: 'false'
		});
		expect(result.success).toBe(true);
	});
});

describe('serverEnvSchema — GitHub OAuth pairing', () => {
	it('rejects a half-configured provider', () => {
		const result = serverEnvSchema.safeParse({ ...base, GITHUB_CLIENT_ID: 'id' });
		expect(result.success).toBe(false);
		expect(issuePaths(result)).toContain('GITHUB_CLIENT_SECRET');
	});

	it('accepts both set or both unset', () => {
		expect(
			serverEnvSchema.safeParse({ ...base, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' })
				.success
		).toBe(true);
		expect(serverEnvSchema.safeParse({ ...base }).success).toBe(true);
	});
});
