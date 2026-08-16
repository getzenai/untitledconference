/**
 * Local advance writes on Speaker materials (#721).
 *
 * Advancing names the next stand. The list used to reload to learn that.
 * Queue the write, paint it, settle against the reply. Dropping the write
 * is the rollback — the hanging pile is the server pile again.
 *
 * `final` is not hanging, so an advance that lands there takes the row off
 * the list. That is the same local truth the server would return.
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

function applyAdvance<H extends OptimisticHangingStand>(hanging: H[], submissionId: number): H[] {
	return hanging.flatMap((item) => {
		if (item.submissionId !== submissionId) return [item];
		const next = nextEditorialStand(item.stand);
		if (!next || next === 'final') return [];
		return [{ ...item, stand: next }];
	});
}
