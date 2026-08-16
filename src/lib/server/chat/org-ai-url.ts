/**
 * What an organization-supplied chat backend URL is allowed to be.
 *
 * OpenAI-compatible HTTPS in production. Localhost (and only localhost) may
 * use HTTP when NODE_ENV is not production. Private, link-local and loopback
 * addresses are refused — the Worker will POST the conversation to whatever
 * the org typed.
 *
 * `assertAllowedChatBackendUrl` judges the URL as written, so it only sees
 * address *literals*. `assertResolvedChatBackendUrl` also resolves the host
 * and judges every answer, which is what stops a public name whose A record
 * points at `169.254.169.254`.
 *
 * One lookup is not a connection. The fetch layer looks the name up
 * again at connect time — a second answer of `127.0.0.1` or
 * `169.254.169.254` is refused there, not after `fetch` has already
 * dialed it. `fetch` then resolves the name a third time; this runtime
 * cannot pin that hop to a judged address. See `org-ai-fetch.ts` and #741.
 */
import { resolveHostAddresses, type ResolveHostAddresses } from './org-ai-dns';

export class ChatBackendUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChatBackendUrlError';
	}
}

/**
 * The host does not resolve, or resolves somewhere it may not.
 *
 * A subclass so that every existing `instanceof ChatBackendUrlError` — the
 * 400 in the settings action, the `broken` row in `loadOrganizationChatBackend`
 * — keeps treating it as a bad URL, while callers that want to tell a
 * refused address from a malformed URL still can.
 */
export class ChatBackendAddressError extends ChatBackendUrlError {
	constructor(message: string) {
		super(message);
		this.name = 'ChatBackendAddressError';
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

/**
 * Judge one address literal: loopback, RFC1918, carrier NAT, link-local,
 * `0.0.0.0/8`, ULA, or an IPv4 address wearing an IPv6 mapping.
 *
 * Exported because the resolved check has to apply *the same* rule to a DNS
 * answer that this module applies to a typed literal — two lists would drift.
 * `org-ai-url.unit.test.ts` asserts the two agree on every blocked literal.
 */
export function isBlockedAddress(address: string): boolean {
	const host = address
		.trim()
		.replace(/^\[|\]$/g, '')
		.toLowerCase();
	if (!host) return true;
	return isLoopbackHost(host) || isPrivateAddress(host);
}

function assertPublicChatBackendHost(host: string, production: boolean, loopback: boolean): void {
	const privateish = isBlockedHost(host) || isBlockedAddress(host);
	if (privateish && (production || !loopback)) {
		throw new ChatBackendUrlError(
			'The backend URL must not point at a private, link-local, or loopback address.'
		);
	}
}

/**
 * True for a host that is already an address, so there is nothing to resolve.
 * A registrable name can never contain a colon, and the brackets are gone by
 * the time this runs.
 */
function isAddressLiteral(host: string): boolean {
	return parseIPv4(host) !== null || host.includes(':');
}

/**
 * The URL after the address rules, plus the addresses those rules judged.
 *
 * `addresses` are the ones this lookup judged. An IP literal is already
 * that address; a name that had to be resolved carries every public
 * answer. Localhost outside production has nothing to look up. They are
 * not pinned to `fetch` — see `org-ai-fetch.ts`.
 */
export type CheckedChatBackendUrl = {
	href: string;
	host: string;
	addresses: string[];
};

/**
 * `assertAllowedChatBackendUrl`, plus every address the host resolves to.
 *
 * Fails closed: a host that will not resolve, or a resolver that will not
 * answer, is refused rather than passed through. The returned `addresses`
 * are the ones this lookup judged. They are not pinned to `fetch`.
 *
 * @param options.resolve Injected by the tests and by `org-ai-fetch.ts`;
 * defaults to the DNS-over-HTTPS resolver.
 */
export async function resolveCheckedChatBackendUrl(
	raw: string,
	options: { nodeEnv?: string; resolve?: ResolveHostAddresses } = {}
): Promise<CheckedChatBackendUrl> {
	const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
	const href = assertAllowedChatBackendUrl(raw, nodeEnv);
	const host = new URL(href).hostname.replace(/^\[|\]$/g, '').toLowerCase();
	// A literal was judged as itself above; localhost only got here outside
	// production, where it is deliberately allowed and has nothing to look up.
	if (isAddressLiteral(host)) return { href, host, addresses: [host] };
	if (isLoopbackHost(host)) return { href, host, addresses: [] };

	const addresses = await lookUpHost(host, options.resolve);
	assertPublicAddresses(host, addresses);
	return { href, host, addresses };
}

/**
 * Same as `resolveCheckedChatBackendUrl`, but only the href — the save
 * path does not connect, so it has nothing to bind.
 */
export async function assertResolvedChatBackendUrl(
	raw: string,
	options: { nodeEnv?: string; resolve?: ResolveHostAddresses } = {}
): Promise<string> {
	return (await resolveCheckedChatBackendUrl(raw, options)).href;
}

async function lookUpHost(host: string, resolve?: ResolveHostAddresses): Promise<string[]> {
	try {
		return await (resolve ?? resolveHostAddresses)(host);
	} catch (error) {
		// A resolver that will not answer is a refusal, not a pass. Everything
		// the resolver module throws is a lookup failure by construction.
		throw new ChatBackendAddressError(
			error instanceof Error ? error.message : `Could not look up ${host}.`
		);
	}
}

function assertPublicAddresses(host: string, addresses: string[]): void {
	if (addresses.length === 0) {
		throw new ChatBackendAddressError(`The backend host ${host} does not resolve to any address.`);
	}
	for (const address of addresses) {
		if (isBlockedAddress(address)) {
			throw new ChatBackendAddressError(
				`The backend host ${host} resolves to ${address}, a private, link-local, or loopback address.`
			);
		}
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

/**
 * An IPv4 address inside an IPv6 one. A resolver answers in the hex form
 * (`::ffff:7f00:1`) as readily as the dotted one, so both are read here —
 * reading only the dotted form would let `127.0.0.1` back in through an
 * AAAA record.
 */
function mappedIPv4(host: string): number | null {
	const dotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
	if (dotted) return parseIPv4(dotted[1]);
	const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
	if (!hex) return null;
	return (((Number.parseInt(hex[1], 16) << 16) >>> 0) + Number.parseInt(hex[2], 16)) >>> 0;
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
