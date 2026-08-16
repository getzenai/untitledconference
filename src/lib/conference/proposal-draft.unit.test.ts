import { describe, expect, it } from 'vitest';
import {
	formatSelectOptions,
	parseOptionalId,
	trackSelectOptions,
	YES_NO_OPTIONS
} from './proposal-draft';

describe('proposal draft helpers', () => {
	it('does not treat 0 as empty', () => {
		expect(parseOptionalId('')).toBeNull();
		expect(parseOptionalId('soon')).toBeNull();
		expect(parseOptionalId('0')).toBe(0);
		expect(parseOptionalId('12')).toBe(12);
	});

	it('keeps the empty option so a pick can be cleared', () => {
		const formats = formatSelectOptions([{ id: 1, name: 'Talk', minutes: 30 }]);
		expect(formats[0]).toEqual({ value: '', label: '—' });
		expect(formats[1]).toEqual({ value: '1', label: 'Talk (30 min)' });
		expect(trackSelectOptions([{ id: 2, name: 'Platform' }])[1]).toEqual({
			value: '2',
			label: 'Platform'
		});
		expect(YES_NO_OPTIONS.map((option) => option.value)).toEqual(['', 'true', 'false']);
	});
});
