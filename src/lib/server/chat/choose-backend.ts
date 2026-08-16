import type { LoadedOrganizationBackend } from './org-ai-settings';

export type ChatBackendChoice =
	| { source: 'mock'; modelId: 'mock' }
	| { source: 'organization'; apiKey: string; baseUrl: string; modelId: string }
	| { source: 'platform'; apiKey: string; baseUrl: string; modelId: string }
	| { source: 'missing-platform' }
	| { source: 'broken-organization' };

/**
 * Pick the chat backend for one request.
 *
 * `AI_CHAT_MODEL=mock` still wins so Cypress does not need an org row.
 * A row whose ciphertext will not unwrap is a configuration error — do not
 * fall through to the hosted pair.
 */
export function chooseChatBackend(input: {
	modelId: string;
	platformKey?: string;
	platformUrl?: string;
	org?: LoadedOrganizationBackend;
}): ChatBackendChoice {
	if (input.modelId === 'mock') {
		return { source: 'mock', modelId: 'mock' };
	}
	if (input.org?.status === 'broken') {
		return { source: 'broken-organization' };
	}
	if (input.org?.status === 'ok') {
		return {
			source: 'organization',
			apiKey: input.org.apiKey,
			baseUrl: input.org.baseUrl,
			modelId: input.org.modelId || input.modelId
		};
	}
	if (!input.platformKey || !input.platformUrl) {
		return { source: 'missing-platform' };
	}
	return {
		source: 'platform',
		apiKey: input.platformKey,
		baseUrl: input.platformUrl,
		modelId: input.modelId
	};
}
