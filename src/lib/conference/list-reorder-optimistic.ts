/**
 * Local list-order writes (#721).
 *
 * Move up / Move down has an obvious next list: this row swaps with its
 * neighbour. The pages used to set a page-wide `busy` and leave the list
 * sitting until the server answered. Queue the write, paint the swap,
 * settle against the reply. Dropping the write is the rollback — the next
 * derive is the server list again. Settle releases the wire in `finally`
 * so a throw from `update()` cannot keep it (#856).
 */

export type ReorderWrite = {
	kind: 'move';
	id: number;
	direction: 'up' | 'down';
};

export function reorderWriteFromForm(form: FormData): ReorderWrite | null {
	const id = Number(form.get('id'));
	const direction = form.get('direction');
	if (!Number.isInteger(id) || id <= 0 || (direction !== 'up' && direction !== 'down')) {
		return null;
	}
	return { kind: 'move', id, direction };
}

export function applyReorderWrites<T extends { id: number }>(
	items: T[],
	writes: readonly ReorderWrite[]
): T[] {
	return writes.reduce((next, write) => applyMove(next, write), items);
}

/**
 * Settle one in-flight reorder. The wire is released in `finally` so a
 * throw from `update()` on the success path cannot keep it (#856).
 */
export async function settleReorderWrite({
	result,
	update,
	onError,
	release
}: {
	result: { type: string };
	update: () => Promise<void>;
	onError: () => void | Promise<void>;
	release: () => void;
}): Promise<void> {
	try {
		if (result.type === 'success') {
			await update();
		} else {
			await onError();
		}
	} finally {
		release();
	}
}

function applyMove<T extends { id: number }>(items: T[], write: ReorderWrite): T[] {
	const index = items.findIndex((item) => item.id === write.id);
	if (index < 0) return items;
	const target = write.direction === 'up' ? index - 1 : index + 1;
	if (target < 0 || target >= items.length) return items;
	const next = items.slice();
	const here = next[index];
	const there = next[target];
	if (!here || !there) return items;
	next[index] = there;
	next[target] = here;
	return next;
}
