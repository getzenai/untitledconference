/**
 * The follow arithmetic decides whether a long answer drags the reader down or
 * grows off-screen above them. Both bounds matter: a target past the end of the
 * scrollable area and a negative one are clamped silently by the browser, so a
 * mistake there looks like "the panel just doesn't follow properly".
 */
import { describe, expect, it } from 'vitest';
import { followScrollTop } from './stick-to-bottom-context.svelte';

/** A 400px-tall panel scrolled to the top, with 1000px of content in it. */
const PANEL = {
	scrollTop: 0,
	containerTop: 100,
	elementTop: 100,
	scrollHeight: 1000,
	clientHeight: 400
};

describe('followScrollTop', () => {
	it('pins the followed message to the top of the panel, less the padding', () => {
		// The message starts 300px below the top of the viewport.
		expect(followScrollTop({ ...PANEL, elementTop: 400 })).toBe(300 - 16);
	});

	it('counts from where the panel is already scrolled to', () => {
		expect(followScrollTop({ ...PANEL, scrollTop: 120, elementTop: 400 })).toBe(120 + 300 - 16);
	});

	it('never scrolls past the end of the scrollable area', () => {
		// A message far below the fold would want 4884px; only 600px exist.
		expect(followScrollTop({ ...PANEL, elementTop: 5000 })).toBe(1000 - 400);
	});

	it('never returns a negative position', () => {
		// A message scrolled above the viewport, plus the padding, goes negative.
		expect(followScrollTop({ ...PANEL, elementTop: 10 })).toBe(0);
	});

	it('stays at zero when the content is shorter than the panel', () => {
		expect(
			followScrollTop({ ...PANEL, elementTop: 400, scrollHeight: 300, clientHeight: 400 })
		).toBe(0);
	});
});
