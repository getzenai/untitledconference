/**
 * One field, several rooms — the text an organizer types into the structure forms.
 *
 * Rooms, tracks and formats came one submit at a time. That is three round trips
 * per element for a person setting up a conference, and it was measured on an
 * agent: in the first sbek calibration run, structure setup ate roughly two
 * thirds of a 70-turn budget and the agent never reached the CFP builder (#110).
 * The cost is not the page — settings has been on `use:enhance` all along — it is
 * that one submit buys one row. Batching turns "three turns per element" into
 * "three turns per category", however clever or dumb the client is.
 *
 * Everything here is pure text handling. It stays out of the database module so
 * the parsing rules can be read, and tested, without a conference to put them in.
 */

/** The longest a name may be, matching the column the row lands in. */
export const MAX_NAME = 120;
/** A whole day. A session longer than that is a typo, not a format. */
export const MAX_MINUTES = 24 * 60;

/**
 * The names in a block of text, one per line.
 *
 * Blank lines are dropped rather than rejected: a trailing newline is what a text
 * field leaves behind when somebody hits enter after the last entry, and refusing
 * it would be a lecture about whitespace.
 *
 * Duplicates within the block are dropped too, keeping the first. Repeating a
 * name in one paste is a slip, and two rooms called "Main Stage" are unusable on
 * the agenda grid — there is no way to tell which one a session is in.
 */
export function parseNames(block: string): string[] {
	const seen = new Set<string>();
	const names: string[] = [];

	for (const line of block.split('\n')) {
		const name = line.trim().slice(0, MAX_NAME);
		if (!name) continue;

		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		names.push(name);
	}

	return names;
}

export type FormatLine = { name: string; minutes: number | null };

/**
 * The formats in a block of text: `Talk` on its own, or `Workshop, 90`.
 *
 * The length is read from the last comma-separated piece, and only when that
 * piece is nothing but a number. "Talk, extended" is therefore a format called
 * "Talk, extended" rather than an error about a missing length — a name is free
 * text, and a rule that quietly claims part of it would be worse than no rule.
 */
export function parseFormatLines(
	block: string
): { ok: true; formats: FormatLine[] } | { ok: false; problem: string } {
	const seen = new Set<string>();
	const formats: FormatLine[] = [];

	for (const line of block.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const parsed = parseFormatLine(trimmed);
		if ('problem' in parsed) return { ok: false, problem: parsed.problem };

		const key = parsed.name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		formats.push(parsed);
	}

	return { ok: true, formats };
}

/** One non-empty line: `Panel`, or `Workshop, 90`. */
function parseFormatLine(line: string): FormatLine | { problem: string } {
	const comma = line.lastIndexOf(',');
	const tail = comma === -1 ? '' : line.slice(comma + 1).trim();
	const isLength = /^\d+$/.test(tail);

	const name = (isLength ? line.slice(0, comma).trim() : line).slice(0, MAX_NAME);
	if (!name) return { problem: `Give this format a name: "${line}".` };
	if (!isLength) return { name, minutes: null };

	const minutes = Number(tail);
	if (minutes < 1 || minutes > MAX_MINUTES) {
		return { problem: `Minutes must be between 1 and ${MAX_MINUTES} — "${line}" says ${minutes}.` };
	}

	return { name, minutes };
}

/**
 * What one submit did, in the words the organizer reads back.
 *
 * The skipped names are spelled out rather than counted. "1 was already there" of
 * a twelve-line paste sends somebody comparing lists by eye; naming it ends the
 * question. Being told what was skipped is also what makes a second submit safe:
 * re-sending the same block after a lost response adds nothing and says so, which
 * is the difference between a retry and a duplicate.
 */
export function addedMessage(noun: string, added: string[], skipped: string[]): string {
	const plural = (n: number) => (n === 1 ? noun : `${noun}s`);

	const parts: string[] = [];
	if (added.length > 0) parts.push(`Added ${added.length} ${plural(added.length)}.`);
	if (skipped.length > 0) {
		parts.push(
			`${skipped.length === 1 ? 'This one was' : 'These were'} already there, so nothing changed: ${skipped.join(', ')}.`
		);
	}

	return parts.join(' ');
}
