import { describe, expect, it } from 'vitest';
import {
	applyStandWrites,
	applyTalkStand,
	standWriteFromForm,
	type OptimisticHangingStand,
	type StandWrite
} from './editorial-stand-optimistic';

const item = (
	over: Partial<OptimisticHangingStand> & { submissionId: number }
): OptimisticHangingStand => ({
	stand: 'materials_requested',
	...over
});

describe('standWriteFromForm', () => {
	it('reads the hanging-row id', () => {
		const form = new FormData();
		form.set('id', '11');
		expect(standWriteFromForm(form)).toEqual({ kind: 'advance', submissionId: 11 });
	});

	it('refuses a missing or non-positive id', () => {
		expect(standWriteFromForm(new FormData())).toBeNull();
		const form = new FormData();
		form.set('id', '0');
		expect(standWriteFromForm(form)).toBeNull();
	});
});

describe('applyStandWrites', () => {
	it('names the next stand and leaves the neighbour alone', () => {
		const next = applyStandWrites(
			[item({ submissionId: 11 }), item({ submissionId: 12, stand: 'received' })],
			[{ kind: 'advance', submissionId: 11 }]
		);
		expect(next).toEqual([
			{ submissionId: 11, stand: 'received' },
			{ submissionId: 12, stand: 'received' }
		]);
	});

	it('takes a row off the pile when the next stand is final', () => {
		const next = applyStandWrites(
			[item({ submissionId: 11, stand: 'revision_requested' })],
			[{ kind: 'advance', submissionId: 11 }]
		);
		expect(next).toEqual([]);
	});

	it('leaves the server pile alone when the write is dropped', () => {
		const start = [item({ submissionId: 11 })];
		const write: StandWrite = { kind: 'advance', submissionId: 11 };
		expect(applyStandWrites(start, [write])[0].stand).toBe('received');
		expect(applyStandWrites(start, [])[0].stand).toBe('materials_requested');
	});

	it('ignores a write for a talk that is not on the pile', () => {
		const start = [item({ submissionId: 11 })];
		expect(applyStandWrites(start, [{ kind: 'advance', submissionId: 99 }])).toEqual(start);
	});
});

describe('applyTalkStand', () => {
	it('names the next stand on the talk itself', () => {
		expect(applyTalkStand('received', 11, [{ kind: 'advance', submissionId: 11 }])).toBe(
			'reviewed'
		);
	});

	it('starts an unset talk at materials requested', () => {
		expect(applyTalkStand(null, 11, [{ kind: 'advance', submissionId: 11 }])).toBe(
			'materials_requested'
		);
	});

	it('keeps final on the talk instead of taking it off', () => {
		expect(applyTalkStand('revision_requested', 11, [{ kind: 'advance', submissionId: 11 }])).toBe(
			'final'
		);
		expect(applyTalkStand('final', 11, [{ kind: 'advance', submissionId: 11 }])).toBe('final');
	});

	it('leaves the server stand alone when the write is dropped', () => {
		const write: StandWrite = { kind: 'advance', submissionId: 11 };
		expect(applyTalkStand('received', 11, [write])).toBe('reviewed');
		expect(applyTalkStand('received', 11, [])).toBe('received');
	});

	it('ignores a write for a different talk', () => {
		expect(applyTalkStand('received', 11, [{ kind: 'advance', submissionId: 99 }])).toBe(
			'received'
		);
	});

	it('applies the remaining write on the server stand when the first is dropped', () => {
		const first: StandWrite = { kind: 'advance', submissionId: 11 };
		const second: StandWrite = { kind: 'advance', submissionId: 11 };
		expect(applyTalkStand('materials_requested', 11, [first, second])).toBe('reviewed');
		expect(applyTalkStand('materials_requested', 11, [second])).toBe('received');
	});
});
