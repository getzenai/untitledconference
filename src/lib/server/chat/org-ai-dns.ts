/**
 * Resolve a hostname to its addresses.
 *
 * workerd has no `node:dns` — `nodejs_compat` does not carry the resolver —
 * so the answers come from DNS over HTTPS. Cloudflare's resolver speaks a
 * JSON profile (RFC 8484's cousin) that needs nothing but `fetch`, which is
 * the only network primitive a Worker has.
 *
 * Every call is a real subrequest. The save path looks the name up once;
 * the fetch path looks it up twice per hop (judge, then connect) so a
 * record that flips to a private address between the two cannot be
 * dialed. They are not cached: a cache would widen exactly that window.
 */
export type ResolveHostAddresses = (hostname: string) => Promise<string[]>;

const RESOLVER_URL = 'https://cloudflare-dns.com/dns-query';
const RESOLVER_TIMEOUT_MS = 2_000;

/** DNS record type numbers, as they come back in the JSON answer. */
const A = 1;
const AAAA = 28;

/** NOERROR and NXDOMAIN both mean "the resolver answered"; the rest do not. */
const NOERROR = 0;
const NXDOMAIN = 3;

type DnsAnswer = { type?: unknown; data?: unknown };
type DnsResponse = { Status?: unknown; Answer?: unknown };

/**
 * Every A and AAAA record for `hostname`, in no particular order.
 *
 * Empty means the name exists but has no address (or does not exist at all);
 * the caller decides what to do with that. Anything else — a resolver that
 * times out, refuses, or answers SERVFAIL — throws a plain error, which
 * `assertResolvedChatBackendUrl` turns into a `ChatBackendAddressError`.
 * The dependency runs one way: this module knows nothing about the URL rules.
 */
export const resolveHostAddresses: ResolveHostAddresses = async (hostname) => {
	const [v4, v6] = await Promise.all([
		queryRecords(hostname, 'A', A),
		queryRecords(hostname, 'AAAA', AAAA)
	]);
	return [...v4, ...v6];
};

async function queryRecords(hostname: string, type: string, recordType: number): Promise<string[]> {
	const url = `${RESOLVER_URL}?name=${encodeURIComponent(hostname)}&type=${type}`;
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { accept: 'application/dns-json' },
			signal: AbortSignal.timeout(RESOLVER_TIMEOUT_MS)
		});
	} catch (error) {
		throw new Error(
			`Could not look up ${hostname}: the DNS resolver did not answer (${describe(error)}).`
		);
	}
	if (!response.ok) {
		throw new Error(`Could not look up ${hostname}: the DNS resolver answered ${response.status}.`);
	}

	let body: DnsResponse;
	try {
		body = (await response.json()) as DnsResponse;
	} catch (error) {
		throw new Error(
			`Could not look up ${hostname}: the DNS answer was not readable (${describe(error)}).`
		);
	}
	if (body.Status !== NOERROR && body.Status !== NXDOMAIN) {
		throw new Error(
			`Could not look up ${hostname}: the DNS resolver returned status ${String(body.Status)}.`
		);
	}

	const answers: DnsAnswer[] = Array.isArray(body.Answer) ? body.Answer : [];
	// A CNAME chain comes back in the same array; only the address records
	// matter, and only the ones of the type that was asked for.
	return answers
		.filter((answer) => answer?.type === recordType && typeof answer.data === 'string')
		.map((answer) => (answer.data as string).trim());
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
