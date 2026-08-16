import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHostAddresses } from './org-ai-dns';

function dnsAnswer(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/dns-json' }
	});
}

/** One reply per query, in the order the resolver asks: A first, then AAAA. */
function resolverReturning(...responses: Response[]) {
	const fetchMock = vi.fn();
	for (const response of responses) fetchMock.mockResolvedValueOnce(response);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('resolveHostAddresses', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('asks the resolver for A and AAAA and returns both', async () => {
		const fetchMock = resolverReturning(
			dnsAnswer({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }),
			dnsAnswer({ Status: 0, Answer: [{ type: 28, data: '2606:2800:220:1:248:1893:25c8:1946' }] })
		);

		await expect(resolveHostAddresses('example.com')).resolves.toEqual([
			'93.184.216.34',
			'2606:2800:220:1:248:1893:25c8:1946'
		]);

		const asked = fetchMock.mock.calls.map(([url]) => String(url));
		expect(asked[0]).toContain('name=example.com');
		expect(asked.join(' ')).toContain('type=A');
		expect(asked.join(' ')).toContain('type=AAAA');
		expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ accept: 'application/dns-json' });
	});

	it('skips the CNAME rows and anything of the wrong type', async () => {
		resolverReturning(
			dnsAnswer({
				Status: 0,
				Answer: [
					{ type: 5, data: 'lb.example.net.' },
					{ type: 1, data: '93.184.216.34' },
					{ type: 28, data: '::ffff:7f00:1' }
				]
			}),
			dnsAnswer({ Status: 0, Answer: [] })
		);

		await expect(resolveHostAddresses('example.com')).resolves.toEqual(['93.184.216.34']);
	});

	it('returns nothing for a name that does not exist', async () => {
		resolverReturning(dnsAnswer({ Status: 3 }), dnsAnswer({ Status: 3 }));
		await expect(resolveHostAddresses('nope.example.com')).resolves.toEqual([]);
	});

	it('throws when the resolver fails, refuses, or answers unreadably', async () => {
		resolverReturning(dnsAnswer({ Status: 2 }), dnsAnswer({ Status: 0, Answer: [] }));
		await expect(resolveHostAddresses('example.com')).rejects.toThrow(/status 2/);

		resolverReturning(dnsAnswer({}, 503), dnsAnswer({ Status: 0, Answer: [] }));
		await expect(resolveHostAddresses('example.com')).rejects.toThrow(/answered 503/);

		resolverReturning(
			new Response('not json', { status: 200 }),
			dnsAnswer({ Status: 0, Answer: [] })
		);
		await expect(resolveHostAddresses('example.com')).rejects.toThrow(/not readable/);

		const failing = vi.fn().mockRejectedValue(new Error('connection reset'));
		vi.stubGlobal('fetch', failing);
		await expect(resolveHostAddresses('example.com')).rejects.toThrow(/did not answer/);
	});
});
