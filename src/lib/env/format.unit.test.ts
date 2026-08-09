import { describe, expect, it } from 'vitest';
import { formatEnvIssues } from './format';

describe('formatEnvIssues', () => {
	it('renders a count and one line per issue', () => {
		const msg = formatEnvIssues(
			[
				{ path: ['DATABASE_URL'], message: 'required' },
				{ path: ['BETTER_AUTH_SECRET'], message: 'required' }
			],
			'server environment'
		);
		expect(msg).toContain('Invalid server environment. Fix the following 2 problem(s):');
		expect(msg).toContain('  - DATABASE_URL: required');
		expect(msg).toContain('  - BETTER_AUTH_SECRET: required');
	});

	it('joins nested path segments with a dot', () => {
		const msg = formatEnvIssues([{ path: ['a', 'b'], message: 'bad' }], 'public environment');
		expect(msg).toContain('  - a.b: bad');
	});

	it('renders an empty path as (root)', () => {
		const msg = formatEnvIssues([{ path: [], message: 'top-level problem' }], 'server environment');
		expect(msg).toContain('  - (root): top-level problem');
	});

	it('reports a zero count when there are no issues', () => {
		const msg = formatEnvIssues([], 'server environment');
		expect(msg).toContain('Fix the following 0 problem(s):');
	});
});
