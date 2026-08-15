/**
 * Slot arithmetic for the acceptance call (#444).
 *
 * Pure, and separate from the loader, because this is the number a committee argues
 * over out loud. The interview behind the issue is blunt about it: the argument that
 * wins most often is not quality, it is "total slots 51, accepted so far 33". A screen
 * that says "18 left" when it is 12 does more damage than a screen that says nothing.
 *
 * The one rule everything here obeys: **an unset capacity is not zero.** Null in,
 * null out — no remainder, no bar, no "full" badge. We do not know their programme.
 */

export type SlotLine = {
	/** Null on the conference total line; the track id otherwise. */
	id: number | null;
	name: string;
	/** What the organizer typed. Null means nobody has said. */
	capacity: number | null;
	accepted: number;
};

export type SlotCount = SlotLine & {
	/** `capacity - accepted`, null when there is no capacity. May be negative. */
	remaining: number | null;
	/** Accepted beyond capacity. Zero unless the committee has overbooked. */
	over: number;
	/** 0..1 for the meter, null when there is nothing to be a fraction of. */
	fraction: number | null;
};

export function slotCount(line: SlotLine): SlotCount {
	const { capacity, accepted } = line;
	if (capacity === null || capacity <= 0) {
		return { ...line, remaining: null, over: 0, fraction: null };
	}
	const remaining = capacity - accepted;
	return {
		...line,
		remaining,
		over: remaining < 0 ? -remaining : 0,
		// Clamped so an overbooked track fills the meter rather than overflowing it;
		// the count next to it already says by how much.
		fraction: Math.min(1, accepted / capacity)
	};
}

/**
 * The sentence under the number, written for someone reading it mid-argument.
 *
 * Deliberately not "33/51": the committee is deciding whether one more talk fits,
 * so the remainder is the subject of the sentence, not the ratio.
 */
export function slotSentence(count: SlotCount): string {
	if (count.capacity === null) return `${count.accepted} accepted`;
	if (count.over > 0) {
		return `${count.accepted} accepted, ${count.over} over ${count.capacity}`;
	}
	if (count.remaining === 0) return `${count.accepted} accepted, none left of ${count.capacity}`;
	return `${count.accepted} accepted, ${count.remaining} left of ${count.capacity}`;
}

/**
 * A capacity typed into the form.
 *
 * Empty clears it — that is the only way back to "we have not said", and it has to
 * stay reachable: a number typed by accident would otherwise be permanent. Anything
 * that is not a non-negative whole number is rejected rather than coerced, because
 * `Number('')` is 0 and 0 is a statement about the programme.
 */
/** A review row carries the round it was written in, so a later one can win. */
export type RoundStamped = { roundPosition: number; roundId: number };

/**
 * One row per key, from the latest round (#592).
 *
 * A second review round writes a second review row for the same talk by the same
 * person — that is the schema working as intended. The room, though, argues one
 * talk at a time, and the queue is keyed by submission id: two rows for one talk
 * are not a cosmetic duplicate, they abort the render and leave the organizer
 * looking at whatever page they came from.
 *
 * The later round wins because that is the score and the sentence the member will
 * read out on the call. Position first — that is the order the organizer arranged
 * the rounds in — and the id only to break a tie between two rounds at the same
 * position.
 */
export function latestPerKey<K, T extends RoundStamped>(rows: T[], keyOf: (row: T) => K): T[] {
	const latest = new Map<K, T>();
	for (const row of rows) {
		const key = keyOf(row);
		const kept = latest.get(key);
		if (!kept || isLaterRound(row, kept)) latest.set(key, row);
	}
	return [...latest.values()];
}

function isLaterRound(a: RoundStamped, b: RoundStamped): boolean {
	if (a.roundPosition !== b.roundPosition) return a.roundPosition > b.roundPosition;
	return a.roundId > b.roundId;
}

export function parseCapacity(raw: FormDataEntryValue | null): number | null | 'invalid' {
	if (typeof raw !== 'string') return 'invalid';
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	const value = Number(trimmed);
	if (!Number.isInteger(value) || value < 0) return 'invalid';
	return value;
}
