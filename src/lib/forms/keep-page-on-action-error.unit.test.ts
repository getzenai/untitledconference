import { describe, expect, it } from 'vitest';
import { actionErrorCopy, shouldApplyAction } from './keep-page-on-action-error';

describe('shouldApplyAction', () => {
	it('holds the page only for a thrown action — fail() and redirects still apply', () => {
		expect(
			shouldApplyAction({ type: 'error', status: 500, error: { message: 'Internal Error' } })
		).toBe(false);
		expect(
			shouldApplyAction({ type: 'failure', status: 400, data: { error: 'Name is taken.' } })
		).toBe(true);
		expect(shouldApplyAction({ type: 'success', status: 200, data: { message: 'Saved.' } })).toBe(
			true
		);
		expect(shouldApplyAction({ type: 'redirect', status: 303, location: '/home' })).toBe(true);
	});
});

describe('actionErrorCopy', () => {
	it('uses the same 5xx sentence as the error page, never the thrown message', () => {
		expect(
			actionErrorCopy({
				type: 'error',
				status: 500,
				error: { message: 'Failed query: select "slug" from "conference"' }
			})
		).toBe(
			'Something went wrong on our side. Nothing you did caused it, and trying again in a moment often works.'
		);
	});

	it('treats a missing status as 500 rather than inventing a 4xx', () => {
		expect(actionErrorCopy({ type: 'error', error: { message: 'Internal Error' } })).toBe(
			'Something went wrong on our side. Nothing you did caused it, and trying again in a moment often works.'
		);
	});

	it('passes a 4xx action error through — those are written for the reader', () => {
		expect(
			actionErrorCopy({ type: 'error', status: 403, error: { message: 'Not yours to open' } })
		).toBe('Not yours to open');
	});
});
