/**
 * The public layout loader starts its two queries together.
 *
 * This is a latency test written as a structural one. The database is in
 * us-west-2 and the Worker runs at the visitor's edge, so an `await` between two
 * independent queries is not a style question — it is a whole round trip, ~163 ms
 * measured from Frankfurt against the production database. `publicConference` and
 * `callSummary` both take only the slug and neither reads the other's result, so
 * the second must not wait for the first.
 *
 * The concurrency assertion is the point: it fails against the sequential version
 * that shipped before, because there `callSummary` was not called until
 * `publicConference` had resolved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publicConference = vi.hoisted(() => vi.fn());
const callSummary = vi.hoisted(() => vi.fn());

vi.mock('$lib/conference/public-data', () => ({ publicConference }));
vi.mock('$lib/server/conference/cfp-submission', () => ({ callSummary }));

const conference = { id: 'c1', slug: 'devflow-conf-2027', name: 'DevFlow' };

type Load = (e: { params: { slug: string }; url: URL }) => Promise<Record<string, unknown>>;
let load: Load;

// Imported once, up front. Importing inside the helper would make the
// concurrency assertion below measure the dynamic import rather than the
// loader — several microtasks pass before `load` is even called.
beforeEach(async () => {
	vi.clearAllMocks();
	load = (await import('./+layout.server')).load as unknown as Load;
});

/** The loader under test, with the arguments SvelteKit would hand it. */
function run(slug = 'devflow-conf-2027', search = '') {
	return load({
		params: { slug },
		url: new URL(`https://example.test/c/${slug}${search}`)
	});
}

describe('the public layout loader', () => {
	it('starts the call summary without waiting for the conference', async () => {
		// `publicConference` is held open deliberately. If the loader awaited it
		// before reaching `callSummary`, the call count below would still be 0 —
		// which is exactly what the sequential version did.
		let release!: (value: typeof conference) => void;
		publicConference.mockReturnValue(
			new Promise<typeof conference>((resolve) => {
				release = resolve;
			})
		);
		callSummary.mockResolvedValue(null);

		// No await here on purpose: `Promise.all` invokes both functions while it
		// builds its array, so the call has already happened by the time `load`
		// returns its promise. The sequential version reached `callSummary` only
		// after `publicConference` resolved, which never happens above.
		const pending = run();

		expect(callSummary).toHaveBeenCalledTimes(1);
		expect(callSummary).toHaveBeenCalledWith('devflow-conf-2027');

		release(conference);
		await pending;
	});

	it('returns both results together', async () => {
		const closesAt = new Date('2027-01-01T00:00:00.000Z');
		publicConference.mockResolvedValue(conference);
		callSummary.mockResolvedValue({ state: 'open', closesAt });

		const data = await run();

		expect(data.conference).toBe(conference);
		expect(data.call).toEqual({ state: 'open', closesAt });
	});

	it('still 404s on a slug that does not exist', async () => {
		// The trade this change makes: the call summary runs on the 404 path too.
		// What must not change is that the visitor still gets a 404.
		publicConference.mockResolvedValue(null);
		callSummary.mockResolvedValue(null);

		await expect(run('no-such-conference')).rejects.toMatchObject({
			status: 404
		});
	});

	it('reads the embed flag off the query string', async () => {
		publicConference.mockResolvedValue(conference);
		callSummary.mockResolvedValue(null);

		expect((await run('devflow-conf-2027', '?embed=1')).embed).toBe(true);
		expect((await run('devflow-conf-2027')).embed).toBe(false);
	});
});
