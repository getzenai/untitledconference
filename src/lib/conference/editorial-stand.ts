/**
 * The editorial loop on an accepted talk (#446).
 *
 * Named, not computed. A file on disk is not a stand, and a task being open is
 * not one either. The organizer says where the talk is; the talk stays
 * `accepted`. Null means they have not started tracking. `final` is done.
 *
 *   materials requested → received → reviewed → revision requested → final
 *
 * Revision is a stop on that line, not a branch the code invents. Skipping it
 * is picking `final` after `reviewed`.
 */

export const EDITORIAL_STANDS = [
	'materials_requested',
	'received',
	'reviewed',
	'revision_requested',
	'final'
] as const;

export type EditorialStand = (typeof EDITORIAL_STANDS)[number];

export const EDITORIAL_STAND_LABELS: Record<EditorialStand, string> = {
	materials_requested: 'Materials requested',
	received: 'Received',
	reviewed: 'Reviewed',
	revision_requested: 'Revision requested',
	final: 'Final'
};

export function isEditorialStand(value: string): value is EditorialStand {
	return (EDITORIAL_STANDS as readonly string[]).includes(value);
}

/** The next named stand, or null at `final`. An unset talk starts at the first. */
export function nextEditorialStand(stand: EditorialStand | null): EditorialStand | null {
	if (stand === null) return EDITORIAL_STANDS[0];
	const index = EDITORIAL_STANDS.indexOf(stand);
	return EDITORIAL_STANDS[index + 1] ?? null;
}

export function isHangingEditorialStand(
	stand: EditorialStand | null | undefined
): stand is EditorialStand {
	return stand != null && stand !== 'final';
}

/** Earlier in the chain is more blocking — "whose deck have I not seen". */
export function editorialBlockingRank(stand: EditorialStand): number {
	return EDITORIAL_STANDS.indexOf(stand);
}

export function parseEditorialStand(
	form: FormData
): { ok: true; stand: EditorialStand } | { ok: false; message: string } {
	const raw = String(form.get('editorialStand') ?? '').trim();
	if (!isEditorialStand(raw)) return { ok: false, message: 'Pick where this talk stands.' };
	return { ok: true, stand: raw };
}
