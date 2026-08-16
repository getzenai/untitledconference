/**
 * Local advance writes on Speaker materials and on a talk (#721).
 *
 * Advancing names the next stand. Speaker materials used to reload to
 * learn that. The talk page used enhance + a page-wide `busy` lock and
 * left the badge sitting. Queue the write, paint it, settle against the
 * reply. Dropping the write is the rollback.
 *
 * On the hanging pile, `final` is not hanging, so an advance that lands
 * there takes the row off the list. On the talk itself the stand stays
 * visible, including `final`.
 */

import { nextEditorialStand, type EditorialStand } from './editorial-stand';

export type StandWrite = {
	kind: 'advance';
	submissionId: number;
};

export type OptimisticHangingStand = {
	submissionId: number;
	stand: EditorialStand;
};

export function standWriteFromForm(form: FormData): StandWrite | null {
	const submissionId = Number(form.get('id'));
	if (!Number.isInteger(submissionId) || submissionId <= 0) return null;
	return { kind: 'advance', submissionId };
}

export function applyStandWrites<H extends OptimisticHangingStand>(
	hanging: H[],
	writes: readonly StandWrite[]
): H[] {
	return writes.reduce((next, write) => applyAdvance(next, write.submissionId), hanging);
}

/**
 * The talk page has one stand, not a pile. An advance that lands on
 * `final` names it; a further write cannot walk off the end.
 */
export function applyTalkStand(
	stand: EditorialStand | null,
	submissionId: number,
	writes: readonly StandWrite[]
): EditorialStand | null {
	return writes.reduce((current, write) => {
		if (write.submissionId !== submissionId) return current;
		return nextEditorialStand(current) ?? current;
	}, stand);
}

function applyAdvance<H extends OptimisticHangingStand>(hanging: H[], submissionId: number): H[] {
	return hanging.flatMap((item) => {
		if (item.submissionId !== submissionId) return [item];
		const next = nextEditorialStand(item.stand);
		if (!next || next === 'final') return [];
		return [{ ...item, stand: next }];
	});
}
