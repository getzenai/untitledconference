import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Counts, { CAP_HINT, EACH_HINT } from './auto-distribute-counts.svelte';

/**
 * The short labels stay "each" and "cap". What they mean has to sit on the
 * field itself (#415) — tooltip for hover/focus, describedby so a keyboard
 * user gets the same sentence without a mouse.
 */
describe('auto-distribute each and cap (#415)', () => {
	const html = render(Counts, {
		props: { reviewsPerSubmission: '2', capPerReviewer: '10' }
	}).body;

	it('keeps the short labels and names the unit in a sentence on each field', () => {
		expect(html).toContain(' each ');
		expect(html).toContain('>cap ');
		expect(html).toContain(EACH_HINT);
		expect(html).toContain(CAP_HINT);
	});

	it('ties each input to that sentence without a mouse', () => {
		const each = html.slice(
			html.lastIndexOf('<input', html.indexOf('data-testid="bulk-assign-per-talk"')),
			html.indexOf('>', html.indexOf('data-testid="bulk-assign-per-talk"'))
		);
		expect(each).toContain('aria-describedby="bulk-assign-each-hint"');

		const cap = html.slice(
			html.lastIndexOf('<input', html.indexOf('data-testid="bulk-assign-cap"')),
			html.indexOf('>', html.indexOf('data-testid="bulk-assign-cap"'))
		);
		expect(cap).toContain('aria-describedby="bulk-assign-cap-hint"');

		expect(html).toContain('id="bulk-assign-each-hint"');
		expect(html).toContain('id="bulk-assign-cap-hint"');
	});
});
