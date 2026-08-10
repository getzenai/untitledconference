/**
 * What can be checked without a DOM, and what deliberately is not.
 *
 * The hint is driven by a ResizeObserver, so its interesting behaviour — appearing
 * only when the table really is cut off — needs layout, and this suite renders to a
 * string. That case lives in `cypress/e2e/critical-paths/submissions-table.cy.ts`,
 * at two viewport widths. What belongs here is the server-rendered contract: the
 * table comes out reachable, and the hint does NOT come out, because a hint baked
 * into the HTML would flash on every load and be wrong on every wide screen.
 */
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ScrollTable from './scroll-table.svelte';

const children = createRawSnippet(() => ({ render: () => '<table><tbody></tbody></table>' }));

describe('the scrollable table box', () => {
	it('scrolls sideways on an inner element so the rounding survives', () => {
		const { body } = render(ScrollTable, { props: { children } });

		// Both, and on different elements: `overflow-hidden` alone is what clipped
		// the right-hand columns off a phone, and `overflow-x-auto` on the same
		// element as the border would square off the corners it rounds.
		expect(body).toContain('overflow-hidden rounded-lg border');
		expect(body).toContain('overflow-x-auto');
		expect(body).toContain('<table>');
	});

	it('says nothing until it has measured something', () => {
		const { body } = render(ScrollTable, { props: { children } });

		expect(body).not.toContain('data-testid="scroll-hint"');
	});
});
