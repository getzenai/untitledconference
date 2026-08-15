import { describe, expect, it } from 'vitest';
import {
	editorialBlockingRank,
	isEditorialStand,
	isHangingEditorialStand,
	nextEditorialStand,
	parseEditorialStand
} from './editorial-stand';

describe('editorial stand names', () => {
	it('accepts the five named stands and nothing else', () => {
		expect(isEditorialStand('received')).toBe(true);
		expect(isEditorialStand('accepted')).toBe(false);
		expect(isEditorialStand('')).toBe(false);
	});

	it('starts an unset talk at materials requested, and stops at final', () => {
		expect(nextEditorialStand(null)).toBe('materials_requested');
		expect(nextEditorialStand('materials_requested')).toBe('received');
		expect(nextEditorialStand('reviewed')).toBe('revision_requested');
		expect(nextEditorialStand('final')).toBeNull();
	});

	it('treats every named stand except final as hanging', () => {
		expect(isHangingEditorialStand(null)).toBe(false);
		expect(isHangingEditorialStand('materials_requested')).toBe(true);
		expect(isHangingEditorialStand('final')).toBe(false);
	});

	it('ranks materials requested first and final last', () => {
		expect(editorialBlockingRank('materials_requested')).toBeLessThan(
			editorialBlockingRank('revision_requested')
		);
		expect(editorialBlockingRank('revision_requested')).toBeLessThan(
			editorialBlockingRank('final')
		);
	});
});

describe('parseEditorialStand', () => {
	it('reads a named stand from the form', () => {
		const form = new FormData();
		form.set('editorialStand', 'received');
		expect(parseEditorialStand(form)).toEqual({ ok: true, stand: 'received' });
	});

	it('refuses an empty pick and a made-up name', () => {
		expect(parseEditorialStand(new FormData())).toMatchObject({
			ok: false,
			message: 'Pick where this talk stands.'
		});

		const form = new FormData();
		form.set('editorialStand', 'accepted');
		expect(parseEditorialStand(form)).toMatchObject({ ok: false });
	});
});
