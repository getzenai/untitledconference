import { describe, expect, it } from 'vitest';
import {
	applyReorderWrites,
	reorderWriteFromForm,
	settleReorderWrite,
	type ReorderWrite
} from './list-reorder-optimistic';

const list = (...ids: number[]) => ids.map((id) => ({ id, label: `item-${id}` }));

describe('reorderWriteFromForm', () => {
	it('reads up and down from the row form', () => {
		const up = new FormData();
		up.set('id', '3');
		up.set('direction', 'up');
		expect(reorderWriteFromForm(up)).toEqual({ kind: 'move', id: 3, direction: 'up' });

		const down = new FormData();
		down.set('id', '3');
		down.set('direction', 'down');
		expect(reorderWriteFromForm(down)).toEqual({ kind: 'move', id: 3, direction: 'down' });
	});

	it('refuses a missing field or a made-up direction', () => {
		expect(reorderWriteFromForm(new FormData())).toBeNull();
		const form = new FormData();
		form.set('id', '3');
		form.set('direction', 'sideways');
		expect(reorderWriteFromForm(form)).toBeNull();
	});
});

describe('applyReorderWrites', () => {
	it('swaps with the neighbour and leaves the rest alone', () => {
		const next = applyReorderWrites(list(1, 2, 3), [{ kind: 'move', id: 2, direction: 'up' }]);
		expect(next.map((item) => item.id)).toEqual([2, 1, 3]);
	});

	it('does not walk off either end', () => {
		expect(
			applyReorderWrites(list(1, 2), [{ kind: 'move', id: 1, direction: 'up' }]).map(
				(item) => item.id
			)
		).toEqual([1, 2]);
		expect(
			applyReorderWrites(list(1, 2), [{ kind: 'move', id: 2, direction: 'down' }]).map(
				(item) => item.id
			)
		).toEqual([1, 2]);
	});

	it('leaves the server list alone when the write is dropped', () => {
		const start = list(1, 2);
		const write: ReorderWrite = { kind: 'move', id: 1, direction: 'down' };
		expect(applyReorderWrites(start, [write]).map((item) => item.id)).toEqual([2, 1]);
		expect(applyReorderWrites(start, []).map((item) => item.id)).toEqual([1, 2]);
	});

	it('ignores a write for an id that is not on the list', () => {
		expect(
			applyReorderWrites(list(1, 2), [{ kind: 'move', id: 9, direction: 'down' }]).map(
				(item) => item.id
			)
		).toEqual([1, 2]);
	});

	it('applies the remaining write on the server list when the first is dropped', () => {
		const start = list(1, 2, 3);
		const first: ReorderWrite = { kind: 'move', id: 2, direction: 'up' };
		const second: ReorderWrite = { kind: 'move', id: 3, direction: 'up' };
		expect(applyReorderWrites(start, [first, second]).map((item) => item.id)).toEqual([2, 3, 1]);
		expect(applyReorderWrites(start, [second]).map((item) => item.id)).toEqual([1, 3, 2]);
	});
});

describe('settleReorderWrite', () => {
	it('sends the waiting move after update throws on the success path', async () => {
		let busy = true;
		const waiting = ['second'];
		const sent: string[] = [];
		const sendNext = () => {
			if (busy || waiting.length === 0) return;
			busy = true;
			const next = waiting.shift();
			if (next) sent.push(next);
		};

		await expect(
			settleReorderWrite({
				result: { type: 'success' },
				update: async () => {
					throw new Error('paint failed');
				},
				onError: () => {},
				release: () => {
					busy = false;
					sendNext();
				}
			})
		).rejects.toThrow('paint failed');

		expect(sent).toEqual(['second']);
	});
});
