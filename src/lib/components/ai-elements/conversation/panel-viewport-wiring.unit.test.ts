/**
 * The order, not the arithmetic (#849).
 *
 * `panel-viewport.unit.test.ts` checks what each decision returns. What broke
 * in #849 was not one of those answers but the order they are asked in: a
 * window shrink delivers a `scroll` *before* the `ResizeObserver`, and the
 * handler for the first one overwrote the answer the second one needed.
 *
 * The sequence and the geometry are transcribed from a trace taken on
 * `untitledconference.com` (`e811f4b4`, 1440x900 → 1000x400, two runs, same
 * order both times, no mutation in between and no `scrollTo` from the app):
 *
 * ```
 * 0ms    before         top=1419  ch=718  sh=2137  fromEnd=0
 * 9.7ms  window-resize  top=1459  ch=218  sh=2137  fromEnd=460
 * 9.7ms  scroll         top=1459  ch=218  sh=2137  fromEnd=460
 * 10.3ms ResizeObserver top=1459  ch=218  sh=2137  fromEnd=460
 * ```
 *
 * It is replayed here rather than in Cypress because the local browser does
 * not reproduce it: there the shrink moves `scrollTop` all the way to the new
 * end by itself and hands the panel the answer it failed to work out, so the
 * same case is green on the broken code three runs out of three. Live the
 * browser moves it 26–40 px and the panel is on its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelViewport } from './panel-viewport';

/** How close to the end still counts as being on the newest line. */
const BOTTOM_THRESHOLD_PX = 32;

type Listener = () => void;

/**
 * A scrolling viewport with no browser under it.
 *
 * `scrollTo` lands immediately and fires `scroll`, which is what an element
 * does when nothing animates it. Every case here is about who reads which
 * value first, so a scroll that took frames would only add noise; a glide is
 * expressed by moving `scrollTop` in steps instead.
 */
class StubViewport {
	scrollTop: number;
	scrollHeight: number;
	clientHeight: number;
	#listeners = new Map<string, Set<Listener>>();

	constructor(geometry: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
		this.scrollTop = geometry.scrollTop;
		this.scrollHeight = geometry.scrollHeight;
		this.clientHeight = geometry.clientHeight;
	}

	addEventListener(type: string, listener: Listener) {
		const listeners = this.#listeners.get(type) ?? new Set<Listener>();
		listeners.add(listener);
		this.#listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: Listener) {
		this.#listeners.get(type)?.delete(listener);
	}

	/**
	 * `auto` lands immediately, the way an element with nothing animating it
	 * does. `smooth` does not land at all — a smooth scroll takes frames, and a
	 * case that wants to catch one in flight has to be able to, so it is the
	 * test that walks `scrollTop` towards the target.
	 */
	scrollTo({ top, behavior }: { top: number; behavior?: ScrollBehavior }) {
		if (behavior === 'smooth') return;
		const landed = Math.max(0, Math.min(this.end, top));
		if (landed === this.scrollTop) return;
		this.scrollTop = landed;
		this.fire('scroll');
	}

	/** One frame of a scroll that is still under way. */
	glideTo(top: number) {
		this.scrollTop = Math.max(0, Math.min(this.end, top));
		this.fire('scroll');
	}

	getBoundingClientRect() {
		return { top: 0, bottom: this.clientHeight, height: this.clientHeight } as DOMRect;
	}

	get end() {
		return Math.max(0, this.scrollHeight - this.clientHeight);
	}

	/** How far the newest line sits below the fold. */
	get fromEnd() {
		return this.end - this.scrollTop;
	}

	get listenerCount() {
		return [...this.#listeners.values()].reduce((total, set) => total + set.size, 0);
	}

	fire(type: string) {
		for (const listener of [...(this.#listeners.get(type) ?? [])]) listener();
	}
}

let resizeCallbacks: Array<() => void> = [];
let frameCallbacks: Array<() => void> = [];

/** Runs the frames the panel asked for, and any they ask for in turn. */
function drainFrames() {
	for (let pass = 0; pass < 4 && frameCallbacks.length > 0; pass++) {
		const due = frameCallbacks;
		frameCallbacks = [];
		for (const callback of due) callback();
	}
}

function deliverResize() {
	for (const callback of [...resizeCallbacks]) callback();
}

beforeEach(() => {
	resizeCallbacks = [];
	frameCallbacks = [];
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(callback: () => void) {
				resizeCallbacks.push(callback);
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
	vi.stubGlobal(
		'MutationObserver',
		class {
			observe() {}
			disconnect() {}
			takeRecords() {
				return [];
			}
		}
	);
	vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frameCallbacks.push(callback));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** A panel attached to a stub viewport, before it has had its two frames. */
function attachPanel(geometry: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
	const viewport = new StubViewport(geometry);
	const panel = new PanelViewport();
	panel.attach(viewport as unknown as HTMLElement);
	// Without this the rest would be theatre: a panel that registered nothing
	// answers every question with the value it was constructed with, and that
	// value happens to be the one these cases are looking for.
	expect(viewport.listenerCount, 'the panel is listening to this viewport').toBeGreaterThan(0);
	return { viewport, panel };
}

/** ...and the same panel, settled, which is where most cases start. */
function openPanel(geometry: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
	const panel = attachPanel(geometry);
	drainFrames();
	return panel;
}

/** The browser re-lays out, moves `scrollTop` itself, and only then observes. */
function shrinkWindow(viewport: StubViewport, next: { clientHeight: number; nudgedTo?: number }) {
	viewport.clientHeight = next.clientHeight;
	if (next.nudgedTo !== undefined) {
		viewport.scrollTop = next.nudgedTo;
		viewport.fire('scroll');
	}
	deliverResize();
	drainFrames();
}

describe('a window shrink under a standing panel (#849, live trace)', () => {
	it.each([
		{ run: 'run 1', scrollTop: 1419, scrollHeight: 2137, nudgedTo: 1459 },
		{ run: 'run 3', scrollTop: 1594, scrollHeight: 2312, nudgedTo: 1620 }
	])('keeps the reader on the newest line ($run)', ({ scrollTop, scrollHeight, nudgedTo }) => {
		const { viewport, panel } = openPanel({ scrollTop, scrollHeight, clientHeight: 718 });
		expect(viewport.fromEnd, 'starts on the newest line').toBe(0);

		shrinkWindow(viewport, { clientHeight: 218, nudgedTo });

		expect(viewport.fromEnd, 'still on the newest line after the shrink').toBeLessThanOrEqual(
			BOTTOM_THRESHOLD_PX
		);
		expect(panel.atBottom, 'and the way back down is not offered').toBe(true);
		panel.detach();
	});

	it('leaves a reader who really is somewhere else where they are', () => {
		// The counterweight: if a resize simply jumped to the end, every case
		// here would pass and #718 would be undone. A reader who scrolled up to
		// re-read something stays where they put themselves.
		const { viewport, panel } = openPanel({
			scrollTop: 1419,
			scrollHeight: 2137,
			clientHeight: 718
		});

		// They scroll up to re-read something. The wheel is what disengages the
		// follow, and the scroll that comes with it arrives in a viewport of the
		// same height — so it speaks for them.
		viewport.fire('wheel');
		viewport.glideTo(400);

		shrinkWindow(viewport, { clientHeight: 218 });

		expect(viewport.scrollTop, 'the message they were reading is still there').toBe(400);
		panel.detach();
	});
});

describe('a reader who scrolls while the window is being dragged (#849)', () => {
	/**
	 * The cost of the switch, and the line that keeps it from being paid by the
	 * wrong person. A drag delivers many sizes, so a reader who wheels in the
	 * middle of one arrives with a `clientHeight` that differs from the last
	 * measurement — which is exactly the signature the switch uses for "this is
	 * the layout, not the reader". Their wheel is what tells the two apart: it
	 * is the same signal #718 already uses to disengage the follow, and once it
	 * has been given, a scroll belongs to them whatever the viewport is doing.
	 */
	it('leaves them where they put themselves, mid-drag', () => {
		const { viewport, panel } = openPanel({
			scrollTop: 1419,
			scrollHeight: 2137,
			clientHeight: 718
		});
		expect(viewport.fromEnd, 'starts on the newest line').toBe(0);

		// The drag is under way — the panel is already shorter — and they wheel
		// up to re-read something while it is happening.
		viewport.clientHeight = 600;
		viewport.fire('wheel');
		viewport.glideTo(900);

		deliverResize();
		drainFrames();

		expect(viewport.scrollTop, 'their own scroll survives the resize').toBe(900);
		panel.detach();
	});
});

describe('a window shrink while the panel is still scrolling (#849, local trace)', () => {
	/**
	 * The half the live trace does not show, and the only one Cypress could
	 * reproduce here — five runs out of five. A message has arrived and the
	 * panel is carrying the reader to it, so their position says "reading
	 * something older" for every frame of the way, and the glide then finishes
	 * at the end the panel had before it shrank.
	 */
	it('finishes at the new end, not at the one it was aimed at', () => {
		const { viewport, panel } = openPanel({ scrollTop: 106, scrollHeight: 824, clientHeight: 718 });

		// They scroll up to re-read something, then ask to be taken back down.
		viewport.fire('wheel');
		viewport.glideTo(0);
		panel.scrollToBottom('smooth');

		// The panel is carrying them to the newest line and is part of the way
		// there — which by position alone still reads as "somewhere older".
		viewport.glideTo(68);
		expect(viewport.fromEnd, 'not there yet').toBeGreaterThan(BOTTOM_THRESHOLD_PX);

		shrinkWindow(viewport, { clientHeight: 218, nudgedTo: 83 });

		expect(viewport.fromEnd, 'lands on the newest line').toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX);
		panel.detach();
	});
});
