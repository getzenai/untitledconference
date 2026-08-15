/**
 * The edition chain (#448): a conference names at most one predecessor.
 *
 * Pure on purpose. The server function loads the org's existing links and asks
 * these two questions before it writes; the page only needs the sentence that
 * makes the relationship visible. Nothing here transfers talks or scores.
 */

/**
 * Whether pointing `conferenceId` at `predecessorId` would loop.
 *
 * `links` is the chain as it stands: each conference to the edition it already
 * names. The proposed edge is not in the map yet — the caller is asking
 * whether it is legal to write.
 *
 * A conference pointing at itself is a cycle of one. Walking from the
 * proposed predecessor and meeting the conference again is a longer one
 * (2026 → 2025 → 2026). An existing loop in the stored chain is treated the
 * same way: we refuse to walk it rather than hang.
 */
export function predecessorWouldCycle(
	conferenceId: number,
	predecessorId: number,
	links: ReadonlyMap<number, number | null>
): boolean {
	if (predecessorId === conferenceId) return true;

	let current: number | null = predecessorId;
	const seen = new Set<number>();
	while (current != null) {
		if (current === conferenceId) return true;
		if (seen.has(current)) return true;
		seen.add(current);
		current = links.get(current) ?? null;
	}
	return false;
}

/** The one line the manage list shows when an edition names its predecessor. */
export function predecessorLine(name: string): string {
	return `Follows ${name}`;
}
