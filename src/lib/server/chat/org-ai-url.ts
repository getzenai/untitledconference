/**
 * What an organization-supplied chat backend URL is allowed to be.
 *
 * OpenAI-compatible HTTPS in production. Localhost (and only localhost) may
 * use HTTP when NODE_ENV is not production. Private, link-local and loopback
 * addresses are refused — the Worker will POST the conversation to whatever
 * the org typed.
 */
export class ChatBackendUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChatBackendUrlError';
	}
}

const BLOCKED_HOSTS = new Set([
	'localhost',
	'localhost.',
	'0.0.0.0',
	'::',
	'::1',
	'metadata.google.internal'
]);

export function assertAllowedChatBackendUrl(raw: string, nodeEnv = process.env.NODE_ENV): string {
	const parsed = parseBackendUrl(raw);
	const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	if (!host) throw new ChatBackendUrlError('The backend URL must include a host.');

	const production = nodeEnv === 'production';
	const loopback = isLoopbackHost(host);
	assertChatBackendProtocol(parsed.protocol, production, loopback);
	assertPublicChatBackendHost(host, production, loopback);
	return parsed.href;
}

function parseBackendUrl(raw: string): URL {
	const trimmed = raw.trim();
	if (!trimmed) throw new ChatBackendUrlError('A backend URL is required.');
	try {
		const parsed = new URL(trimmed);
		if (parsed.username || parsed.password) {
			throw new ChatBackendUrlError('The backend URL must not include credentials.');
		}
		return parsed;
	} catch (error) {
		if (error instanceof ChatBackendUrlError) throw error;
		throw new ChatBackendUrlError('The backend URL is not a valid URL.');
	}
}

function assertChatBackendProtocol(protocol: string, production: boolean, loopback: boolean): void {
	if (protocol !== 'https:' && protocol !== 'http:') {
		throw new ChatBackendUrlError('The backend URL must be http or https.');
	}
	if (production && protocol !== 'https:') {
		throw new ChatBackendUrlError('The backend URL must be https in production.');
	}
	if (!production && protocol === 'http:' && !loopback) {
		throw new ChatBackendUrlError('HTTP is only allowed for localhost.');
	}
}

function assertPublicChatBackendHost(host: string, production: boolean, loopback: boolean): void {
	const privateish = loopback || isBlockedHost(host) || isPrivateAddress(host);
	if (privateish && (production || !loopback)) {
		throw new ChatBackendUrlError(
			'The backend URL must not point at a private, link-local, or loopback address.'
		);
	}
}

function isLoopbackHost(host: string): boolean {
	if (host === 'localhost' || host === 'localhost.') return true;
	if (host.endsWith('.localhost')) return true;
	if (host === '::1') return true;
	const ipv4 = parseIPv4(host);
	if (ipv4 !== null && ipv4 >>> 24 === 127) return true;
	const mapped = mappedIPv4(host);
	if (mapped !== null && mapped >>> 24 === 127) return true;
	return false;
}

function isBlockedHost(host: string): boolean {
	if (BLOCKED_HOSTS.has(host)) return true;
	if (host.endsWith('.local')) return true;
	if (host.endsWith('.localhost')) return true;
	return false;
}

function isPrivateAddress(host: string): boolean {
	const ipv4 = parseIPv4(host);
	if (ipv4 !== null) return isPrivateIPv4(ipv4);
	const mapped = mappedIPv4(host);
	if (mapped !== null) return isPrivateIPv4(mapped);
	return isPrivateIPv6(host);
}

function parseIPv4(host: string): number | null {
	const parts = host.split('.');
	if (parts.length !== 4) return null;
	const nums = parts.map((part) => {
		if (!/^\d{1,3}$/.test(part)) return Number.NaN;
		return Number(part);
	});
	if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
	return (((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3]) >>> 0;
}

const PRIVATE_V4: Array<[number, number, number]> = [
	[0, 0, 255],
	[10, 0, 255],
	[100, 64, 127],
	[127, 0, 255],
	[169, 254, 254],
	[172, 16, 31],
	[192, 168, 168]
];

function isPrivateIPv4(int: number): boolean {
	const b1 = int >>> 24;
	const b2 = (int >>> 16) & 255;
	return PRIVATE_V4.some(([first, min, max]) => b1 === first && b2 >= min && b2 <= max);
}

function mappedIPv4(host: string): number | null {
	const match = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
	if (!match) return null;
	return parseIPv4(match[1]);
}

function isPrivateIPv6(host: string): boolean {
	if (host === '::' || host === '::1') return true;
	const first = host.split(':', 2)[0] ?? '';
	if (!/^[0-9a-f]{0,4}$/i.test(first) || first.length === 0) return false;
	const nibble = Number.parseInt(first.padEnd(4, '0'), 16);
	if ((nibble & 0xfe00) === 0xfc00) return true;
	if ((nibble & 0xffc0) === 0xfe80) return true;
	return false;
}
