import { describe, expect, it } from 'vitest';
import { assertAllowedChatBackendUrl, ChatBackendUrlError } from './org-ai-url';

describe('assertAllowedChatBackendUrl', () => {
	it('accepts a public https URL in production', () => {
		expect(assertAllowedChatBackendUrl('https://api.openai.com/v1', 'production')).toBe(
			'https://api.openai.com/v1'
		);
	});

	it('rejects http in production', () => {
		expect(() => assertAllowedChatBackendUrl('http://api.openai.com/v1', 'production')).toThrow(
			ChatBackendUrlError
		);
	});

	it('allows localhost over http only outside production', () => {
		expect(assertAllowedChatBackendUrl('http://localhost:11434/v1', 'test')).toContain('localhost');
		expect(() => assertAllowedChatBackendUrl('http://localhost:11434/v1', 'production')).toThrow(
			ChatBackendUrlError
		);
		expect(() => assertAllowedChatBackendUrl('http://api.openai.com/v1', 'test')).toThrow(
			ChatBackendUrlError
		);
	});

	it('rejects private, link-local and loopback addresses', () => {
		const blocked = [
			'https://127.0.0.1/v1',
			'https://0.0.0.0/v1',
			'https://10.0.0.4/v1',
			'https://192.168.1.10/v1',
			'https://172.16.5.1/v1',
			'https://169.254.169.254/latest',
			'https://100.64.1.1/v1',
			'https://[::1]/v1',
			'https://[fe80::1]/v1',
			'https://[fc00::1]/v1',
			'https://metadata.google.internal/v1'
		];
		for (const url of blocked) {
			expect(() => assertAllowedChatBackendUrl(url, 'production'), url).toThrow(
				ChatBackendUrlError
			);
		}
	});

	it('rejects credentials in the URL and a missing host', () => {
		expect(() =>
			assertAllowedChatBackendUrl('https://user:secret@api.openai.com/v1', 'production')
		).toThrow(ChatBackendUrlError);
		expect(() => assertAllowedChatBackendUrl('not a url', 'production')).toThrow(
			ChatBackendUrlError
		);
		expect(() => assertAllowedChatBackendUrl('', 'production')).toThrow(ChatBackendUrlError);
	});
});
