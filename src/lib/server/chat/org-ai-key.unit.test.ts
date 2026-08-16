import { describe, expect, it } from 'vitest';
import {
	OrgAiUnwrapError,
	OrgAiWrapKeyMissingError,
	apiKeySuffix,
	decodeOrgAiWrapKey,
	unwrapApiKeyWithKey,
	wrapApiKeyWithKey
} from './org-ai-key';

function randomKey(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(32));
}

describe('org AI key wrap', () => {
	it('round-trips a key for the same organization', async () => {
		const key = randomKey();
		const wrapped = await wrapApiKeyWithKey(key, 'sk-live-secret-7f3a', 'org-1');
		expect(wrapped.iv).toHaveLength(12);
		expect(wrapped.suffix).toBe('7f3a');
		expect(wrapped.cipher.length).toBeGreaterThan(16);
		await expect(unwrapApiKeyWithKey(key, wrapped.cipher, wrapped.iv, 'org-1')).resolves.toBe(
			'sk-live-secret-7f3a'
		);
	});

	it('refuses a ciphertext bound to a different organization', async () => {
		const key = randomKey();
		const wrapped = await wrapApiKeyWithKey(key, 'sk-live-secret-7f3a', 'org-1');
		await expect(
			unwrapApiKeyWithKey(key, wrapped.cipher, wrapped.iv, 'org-2')
		).rejects.toBeInstanceOf(OrgAiUnwrapError);
	});

	it('refuses a ciphertext unwrapped with a different wrap key', async () => {
		const wrapped = await wrapApiKeyWithKey(randomKey(), 'sk-live-secret-7f3a', 'org-1');
		await expect(
			unwrapApiKeyWithKey(randomKey(), wrapped.cipher, wrapped.iv, 'org-1')
		).rejects.toBeInstanceOf(OrgAiUnwrapError);
	});

	it('writes a fresh IV each time so two wraps of the same key differ', async () => {
		const key = randomKey();
		const first = await wrapApiKeyWithKey(key, 'sk-live-secret-7f3a', 'org-1');
		const second = await wrapApiKeyWithKey(key, 'sk-live-secret-7f3a', 'org-1');
		expect(Buffer.from(first.iv).equals(Buffer.from(second.iv))).toBe(false);
		expect(Buffer.from(first.cipher).equals(Buffer.from(second.cipher))).toBe(false);
	});

	it('reads a 32-byte wrap key from hex or base64 and rejects anything else', () => {
		const bytes = randomKey();
		const hex = Buffer.from(bytes).toString('hex');
		const b64 = Buffer.from(bytes).toString('base64');
		expect(decodeOrgAiWrapKey(hex)).toEqual(bytes);
		expect(decodeOrgAiWrapKey(b64)).toEqual(bytes);
		expect(() => decodeOrgAiWrapKey('')).toThrow(OrgAiWrapKeyMissingError);
		expect(() => decodeOrgAiWrapKey('too-short')).toThrow(OrgAiWrapKeyMissingError);
	});

	it('takes the last four characters as the suffix shown on the card', () => {
		expect(apiKeySuffix('sk-live-secret-7f3a')).toBe('7f3a');
		expect(apiKeySuffix('ab')).toBe('ab');
	});
});
