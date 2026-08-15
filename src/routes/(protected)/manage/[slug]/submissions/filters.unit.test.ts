import { describe, expect, it } from 'vitest';
import { parseSubmissionFilters } from './filters';

const parse = (query: string) =>
	parseSubmissionFilters(new URL(`https://example.test/manage/devflow/submissions${query}`));

describe('parseSubmissionFilters', () => {
	it('keeps a real submission_status', () => {
		expect(parse('?status=rejected').status).toEqual(['rejected']);
	});

	it('maps declined to rejected — the word on the Decline button', () => {
		expect(parse('?status=declined').status).toEqual(['rejected']);
	});

	it('drops an unknown status instead of passing it to the enum', () => {
		expect(parse('?status=quatsch').status).toEqual([]);
	});

	it('collapses a status that appears twice', () => {
		expect(parse('?status=rejected&status=rejected').status).toEqual(['rejected']);
	});

	it('treats the empty string as no status filter', () => {
		expect(parse('?status=').status).toEqual([]);
	});

	it('keeps known values next to unknown ones', () => {
		expect(parse('?status=accepted&status=quatsch&status=declined').status).toEqual([
			'accepted',
			'rejected'
		]);
	});

	it('does not throw when every filter in the URL is junk', () => {
		const filters = parse(
			'?status=declined&status=&status=quatsch&agenda=maybe&track=nope&format=-1'
		);
		expect(filters.status).toEqual(['rejected']);
		expect(filters.agenda).toBeUndefined();
		expect(filters.trackId).toBeUndefined();
		expect(filters.sessionFormatId).toBeUndefined();
	});
});
