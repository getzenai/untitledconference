/**
 * What can be checked without a DOM, and what deliberately is not.
 *
 * The fade and the sentence are driven by a ResizeObserver, so the interesting
 * behaviour — appearing only when the strip really is cut off — needs layout.
 * That case lives in `cypress/e2e/critical-paths/public-scroll-edge.cy.ts`, at
 * two viewport widths. What belongs here is the server-rendered contract: the
 * strip comes out reachable, and neither mark comes out, because a hint baked
 * into the HTML would flash on every load and be wrong on every wide screen.
 */
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ScrollEdge from './scroll-edge.svelte';

const children = createRawSnippet(() => ({ render: () => '<div>wide</div>' }));

describe('the public scroll edge', () => {
	it('scrolls sideways on an inner element so the fade can sit on top', () => {
		const { body } = render(ScrollEdge, { props: { children } });

		expect(body).toContain('overflow-x-auto');
		expect(body).toContain('<div>wide</div>');
	});

	it('says nothing until it has measured something, even when a label is set', () => {
		const { body } = render(ScrollEdge, {
			props: { children, label: 'Scroll sideways for the other rooms' }
		});

		expect(body).not.toContain('data-testid="scroll-edge"');
		expect(body).not.toContain('data-testid="scroll-hint"');
		expect(body).not.toContain('Scroll sideways for the other rooms');
	});

	it('ships no buttons either, for the same reason (#589)', () => {
		// A button in the server HTML would offer to scroll a strip that, on a wide
		// screen, has nowhere to go — and would sit there until hydration measured
		// the box and took it away again.
		const { body } = render(ScrollEdge, { props: { children } });

		expect(body).not.toContain('data-testid="scroll-on"');
		expect(body).not.toContain('data-testid="scroll-back"');
	});
});
