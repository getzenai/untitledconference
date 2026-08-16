/**
 * AES-256-GCM wrap for an organization's chat API key.
 *
 * Wrapping key: Worker secret `ORG_AI_WRAP_KEY` (32 bytes as hex or base64).
 * IV: 12 random bytes per write. AAD: the organization id, so a ciphertext
 * copied onto another org's row will not decrypt.
 */
import { serverEnv } from '$lib/server/env';

const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const SUFFIX_LENGTH = 4;

export class OrgAiWrapKeyMissingError extends Error {
	constructor() {
		super('ORG_AI_WRAP_KEY is not configured.');
		this.name = 'OrgAiWrapKeyMissingError';
	}
}

export class OrgAiUnwrapError extends Error {
	constructor() {
		super('The organization API key could not be unwrapped.');
		this.name = 'OrgAiUnwrapError';
	}
}

export type WrappedApiKey = {
	cipher: Uint8Array;
	iv: Uint8Array;
	suffix: string;
};

export function decodeOrgAiWrapKey(raw: string): Uint8Array {
	const trimmed = raw.trim();
	if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
		return hexToBytes(trimmed);
	}
	const fromBase64 = decodeBase64(trimmed);
	if (fromBase64?.length === KEY_LENGTH) return fromBase64;
	throw new OrgAiWrapKeyMissingError();
}

export function readOrgAiWrapKey(): Uint8Array {
	const raw = process.env.ORG_AI_WRAP_KEY || serverEnv().ORG_AI_WRAP_KEY;
	if (!raw) throw new OrgAiWrapKeyMissingError();
	return decodeOrgAiWrapKey(raw);
}

export function apiKeySuffix(plaintext: string): string {
	return plaintext.slice(-SUFFIX_LENGTH);
}

export async function wrapApiKeyWithKey(
	keyBytes: Uint8Array,
	plaintext: string,
	organizationId: string
): Promise<WrappedApiKey> {
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const key = await importAesKey(keyBytes);
	const cipher = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv, additionalData: encoder.encode(organizationId) },
			key,
			encoder.encode(plaintext)
		)
	);
	return { cipher, iv, suffix: apiKeySuffix(plaintext) };
}

export async function unwrapApiKeyWithKey(
	keyBytes: Uint8Array,
	cipher: Uint8Array,
	iv: Uint8Array,
	organizationId: string
): Promise<string> {
	try {
		const key = await importAesKey(keyBytes);
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: encoder.encode(organizationId) },
			key,
			toArrayBuffer(cipher)
		);
		return decoder.decode(plain);
	} catch (error) {
		if (error instanceof OrgAiWrapKeyMissingError) throw error;
		throw new OrgAiUnwrapError();
	}
}

export async function wrapApiKey(
	plaintext: string,
	organizationId: string
): Promise<WrappedApiKey> {
	return wrapApiKeyWithKey(readOrgAiWrapKey(), plaintext, organizationId);
}

export async function unwrapApiKey(
	cipher: Uint8Array,
	iv: Uint8Array,
	organizationId: string
): Promise<string> {
	return unwrapApiKeyWithKey(readOrgAiWrapKey(), cipher, iv, organizationId);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
	if (keyBytes.length !== KEY_LENGTH) throw new OrgAiWrapKeyMissingError();
	return crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, [
		'encrypt',
		'decrypt'
	]);
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function decodeBase64(raw: string): Uint8Array | null {
	try {
		const binary = atob(raw);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
