import { describe, expect, it } from 'vitest';
import { chooseChatBackend } from './choose-backend';

const platform = {
	modelId: 'openai/gpt-4o-mini',
	platformKey: 'platform-key',
	platformUrl: 'https://gateway.example.test/compat'
};

describe('chooseChatBackend', () => {
	it('lets AI_CHAT_MODEL=mock win over an org row and the hosted pair', () => {
		expect(
			chooseChatBackend({
				...platform,
				modelId: 'mock',
				org: {
					status: 'ok',
					baseUrl: 'https://org.example.test/v1',
					apiKey: 'sk-org',
					modelId: 'org-model'
				}
			})
		).toEqual({ source: 'mock', modelId: 'mock' });
	});

	it('uses the organization backend when a row unwraps', () => {
		expect(
			chooseChatBackend({
				...platform,
				org: {
					status: 'ok',
					baseUrl: 'https://org.example.test/v1',
					apiKey: 'sk-org',
					modelId: 'org-model'
				}
			})
		).toEqual({
			source: 'organization',
			baseUrl: 'https://org.example.test/v1',
			apiKey: 'sk-org',
			modelId: 'org-model'
		});
	});

	it('falls back to the org-row model id when the org left it blank', () => {
		expect(
			chooseChatBackend({
				...platform,
				org: {
					status: 'ok',
					baseUrl: 'https://org.example.test/v1',
					apiKey: 'sk-org',
					modelId: null
				}
			})
		).toMatchObject({ source: 'organization', modelId: 'openai/gpt-4o-mini' });
	});

	it('falls back to the hosted pair when the org has no row', () => {
		expect(chooseChatBackend({ ...platform, org: { status: 'none' } })).toEqual({
			source: 'platform',
			apiKey: 'platform-key',
			baseUrl: 'https://gateway.example.test/compat',
			modelId: 'openai/gpt-4o-mini'
		});
		expect(chooseChatBackend(platform)).toEqual({
			source: 'platform',
			apiKey: 'platform-key',
			baseUrl: 'https://gateway.example.test/compat',
			modelId: 'openai/gpt-4o-mini'
		});
	});

	it('does not fall through to the hosted pair when the row will not unwrap', () => {
		expect(
			chooseChatBackend({
				...platform,
				org: { status: 'broken' }
			})
		).toEqual({ source: 'broken-organization' });
	});

	it('names a missing hosted pair only when there is no org row', () => {
		expect(
			chooseChatBackend({
				modelId: 'openai/gpt-4o-mini',
				org: { status: 'none' }
			})
		).toEqual({ source: 'missing-platform' });
		expect(
			chooseChatBackend({
				modelId: 'openai/gpt-4o-mini',
				org: { status: 'broken' }
			})
		).toEqual({ source: 'broken-organization' });
	});
});
