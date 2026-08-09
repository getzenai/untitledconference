import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

async function freshEnvModule() {
	vi.resetModules();
	return import('./env');
}

describe('serverEnv', () => {
	beforeEach(() => {
		for (const key of Object.keys(mockEnv)) delete mockEnv[key];
	});

	it('returns the coerced environment when the required vars are present', async () => {
		mockEnv.DATABASE_URL = 'postgres://root:pw@localhost:5432/dev';
		mockEnv.BETTER_AUTH_SECRET = 'a-secret';

		const { serverEnv } = await freshEnvModule();
		const parsed = serverEnv();

		expect(parsed.DATABASE_URL).toBe('postgres://root:pw@localhost:5432/dev');
		expect(parsed.LOG_LEVEL).toBe('warn');
		expect(parsed.REQUIRE_EMAIL_VERIFICATION).toBe(true);
	});

	it('throws one aggregated error naming every missing variable', async () => {
		const { serverEnv } = await freshEnvModule();

		expect(() => serverEnv()).toThrow(/DATABASE_URL/);
		expect(() => serverEnv()).toThrow(/BETTER_AUTH_SECRET/);
	});

	it('caches the parsed result', async () => {
		mockEnv.DATABASE_URL = 'postgres://root:pw@localhost:5432/dev';
		mockEnv.BETTER_AUTH_SECRET = 'a-secret';

		const { serverEnv } = await freshEnvModule();
		const first = serverEnv();
		delete mockEnv.DATABASE_URL;

		expect(serverEnv()).toBe(first);
	});
});
