/**
 * The follow arithmetic decides whether a long answer drags the reader down or
 * grows off-screen above them. Both bounds matter: a target past the end of the
 * scrollable area and a negative one are clamped silently by the browser, so a
 * mistake there looks like "the panel just doesn't follow properly".
 */
import { describe, expect, it } from 'vitest';
import { afterResizeScrollTop, followScrollTop, initialScrollTop } from './panel-viewport';

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

/**
 * Where the panel opens on a conversation that already has messages (#729).
 *
 * The remembered number comes from a layout that no longer exists — a
 * narrower window, a collapsed tool block, a cleared message — so every case
 * here is about what happens when it no longer fits. The browser clamps out
 * of range silently, which is what makes an unclamped restore look like it
 * worked right up until somebody notices they are at the end again.
 */
describe('initialScrollTop', () => {
	const VIEWPORT = { scrollHeight: 1000, clientHeight: 400 };

	it('opens at the end when nothing is remembered', () => {
		expect(initialScrollTop({ remembered: null, ...VIEWPORT })).toBe(600);
	});

	it('opens where the reader left it', () => {
		expect(initialScrollTop({ remembered: 220, ...VIEWPORT })).toBe(220);
	});

	it('keeps the top when that is where they were', () => {
		// Zero is a position, not "nothing remembered" — someone who scrolled
		// to the first message and closed the panel meant it.
		expect(initialScrollTop({ remembered: 0, ...VIEWPORT })).toBe(0);
	});

	it('never scrolls past the end when the conversation got shorter', () => {
		expect(initialScrollTop({ remembered: 5000, ...VIEWPORT })).toBe(600);
	});

	it('never returns a negative position', () => {
		expect(initialScrollTop({ remembered: -50, ...VIEWPORT })).toBe(0);
	});

	it('stays at zero when the content is shorter than the panel', () => {
		expect(initialScrollTop({ remembered: 120, scrollHeight: 300, clientHeight: 400 })).toBe(0);
	});

	it('treats a number that is not one as nothing remembered', () => {
		expect(initialScrollTop({ remembered: Number.NaN, ...VIEWPORT })).toBe(600);
	});
});

/**
 * Where the viewport belongs after the panel changes size (#743).
 *
 * The case that has no event of its own: shrinking moves neither `scrollTop`
 * nor a node, so nothing recomputes the flag and the reader is left above an
 * end that has moved, with no way back down offered.
 */
describe('afterResizeScrollTop', () => {
	it('puts a reader who was at the end back at the new end', () => {
		expect(afterResizeScrollTop({ wasAtBottom: true, scrollHeight: 1000, clientHeight: 300 })).toBe(
			700
		);
	});

	it('leaves a reader who was somewhere else alone', () => {
		// `null`, not `0`: the caller must be able to tell "stay where you are"
		// from "go to the top", and zero is a position.
		expect(
			afterResizeScrollTop({ wasAtBottom: false, scrollHeight: 1000, clientHeight: 300 })
		).toBe(null);
	});

	it('has nowhere to go when the content is shorter than the panel', () => {
		expect(afterResizeScrollTop({ wasAtBottom: true, scrollHeight: 200, clientHeight: 400 })).toBe(
			0
		);
	});

	it('follows the panel growing as well as shrinking', () => {
		// Growing usually fires a scroll by itself, because the browser clamps
		// `scrollTop` — but only when the clamp actually moves it. This is the
		// same answer either way rather than a second rule for the other
		// direction.
		expect(afterResizeScrollTop({ wasAtBottom: true, scrollHeight: 1000, clientHeight: 900 })).toBe(
			100
		);
	});
});
