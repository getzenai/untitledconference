/**
 * The shape of a speaker's track record at earlier editions (#451, layer 1), and
 * the one sentence that reports it.
 *
 * Here rather than beside the query because the panel that renders it is client
 * code: `$lib/server/*` may not be imported from a component, not even for a type.
 * The query lives in `$lib/server/conference/speaker-history.ts`.
 */

/** One talk this speaker actually held at an earlier edition. */
export type PastAppearance = {
	conferenceId: number;
	conferenceName: string;
	/** From the edition's start date — the "2025" a committee member says out loud. */
	year: number | null;
	talkTitle: string;
};

export type SpeakerHistory = {
	speakerProfileId: number;
	name: string;
	/** Most recent first. Empty means first-timer, which is itself worth showing. */
	appearances: PastAppearance[];
};

/**
 * "Spoke here three times, most recently 2025" — the two facts that win the
 * argument in the room, in the order they are said.
 *
 * A returning speaker whose past editions carry no dates still gets the count:
 * dropping the whole line because a year is missing would hide the stronger fact
 * behind the weaker one.
 */
export function speakerHistorySummary(entry: SpeakerHistory): string {
	const count = entry.appearances.length;
	if (count === 0) return 'First time with us';
	const times = count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`;
	// Appearances arrive newest first, so the first year we know is the latest.
	const latest = entry.appearances.find((a) => a.year !== null)?.year;
	return latest ? `Spoke here ${times}, most recently ${latest}` : `Spoke here ${times}`;
}
