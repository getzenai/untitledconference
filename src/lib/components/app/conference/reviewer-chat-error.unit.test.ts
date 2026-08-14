import { describe, expect, it } from 'vitest';
import { chatErrorMessage } from './reviewer-chat-error';

describe('chatErrorMessage', () => {
	it('passes a plain 503 body through', () => {
		expect(
			chatErrorMessage(
				new Error(
					'AI Gateway is not configured. Set AI_GATEWAY_API_KEY (Worker secret) and AI_GATEWAY_BASE_URL.'
				)
			)
		).toBe(
			'AI Gateway is not configured. Set AI_GATEWAY_API_KEY (Worker secret) and AI_GATEWAY_BASE_URL.'
		);
	});

	it('unwraps a JSON { error } body the transport used to surface', () => {
		expect(chatErrorMessage(new Error('{"error":"Unauthorized"}'))).toBe('Unauthorized');
	});

	it('does not invent a message when the body is empty', () => {
		expect(chatErrorMessage(new Error(''))).toBe('The assistant could not answer.');
	});
});
