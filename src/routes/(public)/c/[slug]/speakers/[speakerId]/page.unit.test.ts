/**
 * The guard in front of the cross-event query.
 *
 * The design fixture at `/c/untitled-2026` carries string ids ("spk-ada",
 * "conf-untitled-2026") and has no database rows behind it. `Number('spk-ada')` is
 * NaN, and a NaN bound into a query is not an error Postgres reports — it is an
 * empty result at best and a 500 at worst, on a page that is supposed to be
 * readable with no account at all.
 */
import { describe, expect, it, vi } from 'vitest';

const loadSpeakerAppearances = vi.fn(async () => []);
vi.mock('$lib/server/conference/public-conference', () => ({ loadSpeakerAppearances }));

const { load } = await import('./+page.server');

const runLoad = (speakerId: string, conferenceId: string) =>
	(
		load as unknown as (event: {
			params: { speakerId: string };
			parent: () => Promise<{ conference: { id: string } }>;
		}) => Promise<{ appearances: unknown[] }>
	)({
		params: { speakerId },
		parent: async () => ({ conference: { id: conferenceId } })
	});

describe('speaker profile load', () => {
	it('queries the history for a real profile, excluding the conference on screen', async () => {
		loadSpeakerAppearances.mockClear();
		await runLoad('42', '7');

		expect(loadSpeakerAppearances).toHaveBeenCalledWith(42, { excludeConferenceId: 7 });
	});

	it('does not query at all for the fixture conference', async () => {
		loadSpeakerAppearances.mockClear();
		const result = await runLoad('spk-ada', 'conf-untitled-2026');

		expect(loadSpeakerAppearances).not.toHaveBeenCalled();
		expect(result.appearances).toEqual([]);
	});

	it('still returns the history when only the conference id is not numeric', async () => {
		loadSpeakerAppearances.mockClear();
		await runLoad('42', 'conf-untitled-2026');

		// No exclusion is better than excluding conference NaN: the worst case is the
		// current conference listed twice, not a query that silently matches nothing.
		expect(loadSpeakerAppearances).toHaveBeenCalledWith(42, { excludeConferenceId: undefined });
	});
});
