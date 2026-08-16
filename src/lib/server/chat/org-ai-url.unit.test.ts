import { describe, expect, it, vi } from 'vitest';
import {
	assertAllowedChatBackendUrl,
	assertResolvedChatBackendUrl,
	ChatBackendAddressError,
	ChatBackendUrlError,
	isBlockedAddress
} from './org-ai-url';

/**
 * Every address a chat backend may not sit on, written as a literal. The
 * literal check and the resolved check both have to refuse all of them —
 * that agreement is what keeps a DNS answer from being judged more softly
 * than something typed into the form.
 */
const BLOCKED_ADDRESSES = [
	'127.0.0.1',
	'127.99.1.2',
	'0.0.0.0',
	'10.0.0.4',
	'192.168.1.10',
	'172.16.5.1',
	'172.31.255.254',
	'169.254.169.254',
	'100.64.1.1',
	'::1',
	'fe80::1',
	'fc00::1',
	'fd12:3456::1',
	'::ffff:127.0.0.1',
	'::ffff:7f00:1',
	'::ffff:a00:4'
];

const PUBLIC_ADDRESSES = ['93.184.216.34', '1.1.1.1', '172.32.0.1', '2606:4700::1111'];

function bracketed(address: string): string {
	return address.includes(':') ? `[${address}]` : address;
}

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
		for (const address of BLOCKED_ADDRESSES) {
			const url = `https://${bracketed(address)}/v1`;
			expect(() => assertAllowedChatBackendUrl(url, 'production'), url).toThrow(
				ChatBackendUrlError
			);
		}
		expect(() =>
			assertAllowedChatBackendUrl('https://metadata.google.internal/v1', 'production')
		).toThrow(ChatBackendUrlError);
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

describe('isBlockedAddress', () => {
	it('judges every literal the URL check refuses', () => {
		for (const address of BLOCKED_ADDRESSES) {
			expect(isBlockedAddress(address), address).toBe(true);
			// The claim this pairing exists to prove: one rule, two entry points.
			expect(() =>
				assertAllowedChatBackendUrl(`https://${bracketed(address)}/v1`, 'production')
			).toThrow(ChatBackendUrlError);
		}
	});

	it('lets a public address through', () => {
		for (const address of PUBLIC_ADDRESSES) {
			expect(isBlockedAddress(address), address).toBe(false);
			expect(
				assertAllowedChatBackendUrl(`https://${bracketed(address)}/v1`, 'production')
			).toContain(address);
		}
	});
});

describe('assertResolvedChatBackendUrl', () => {
	const resolvingTo = (...addresses: string[]) => vi.fn().mockResolvedValue(addresses);

	it('accepts a public host that resolves to public addresses', async () => {
		const resolve = resolvingTo('93.184.216.34', '2606:4700::1111');
		await expect(
			assertResolvedChatBackendUrl('https://api.openai.com/v1', {
				nodeEnv: 'production',
				resolve
			})
		).resolves.toBe('https://api.openai.com/v1');
		expect(resolve).toHaveBeenCalledWith('api.openai.com');
	});

	it('rejects a public host whose record points at a private address', async () => {
		for (const address of BLOCKED_ADDRESSES) {
			const resolve = resolvingTo(address);
			await expect(
				assertResolvedChatBackendUrl('https://chat.example.com/v1', {
					nodeEnv: 'production',
					resolve
				}),
				address
			).rejects.toBeInstanceOf(ChatBackendAddressError);
		}
	});

	it('rejects when only one of several answers is private', async () => {
		// The whole answer set has to be clean: a resolver that returns a public
		// address first and an internal one second would otherwise pass.
		const resolve = resolvingTo('93.184.216.34', '169.254.169.254');
		await expect(
			assertResolvedChatBackendUrl('https://chat.example.com/v1', {
				nodeEnv: 'production',
				resolve
			})
		).rejects.toBeInstanceOf(ChatBackendAddressError);
	});

	it('fails closed when the host does not resolve or the resolver errors', async () => {
		await expect(
			assertResolvedChatBackendUrl('https://chat.example.com/v1', {
				nodeEnv: 'production',
				resolve: resolvingTo()
			})
		).rejects.toBeInstanceOf(ChatBackendAddressError);

		await expect(
			assertResolvedChatBackendUrl('https://chat.example.com/v1', {
				nodeEnv: 'production',
				resolve: vi.fn().mockRejectedValue(new Error('resolver timed out'))
			})
		).rejects.toBeInstanceOf(ChatBackendAddressError);
	});

	it('keeps the URL rules, and does not look up what it can judge itself', async () => {
		const resolve = resolvingTo('93.184.216.34');

		await expect(
			assertResolvedChatBackendUrl('http://api.openai.com/v1', { nodeEnv: 'production', resolve })
		).rejects.toBeInstanceOf(ChatBackendUrlError);
		await expect(
			assertResolvedChatBackendUrl('https://169.254.169.254/v1', {
				nodeEnv: 'production',
				resolve
			})
		).rejects.toBeInstanceOf(ChatBackendUrlError);
		// Localhost outside production is allowed on purpose and has nothing
		// to look up; an address literal was already judged as itself.
		await expect(
			assertResolvedChatBackendUrl('http://localhost:11434/v1', { nodeEnv: 'test', resolve })
		).resolves.toContain('localhost');
		await expect(
			assertResolvedChatBackendUrl('https://1.1.1.1/v1', { nodeEnv: 'production', resolve })
		).resolves.toContain('1.1.1.1');

		expect(resolve).not.toHaveBeenCalled();
	});
});
