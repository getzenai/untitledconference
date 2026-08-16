/**
 * Following a streamed answer without dragging the reader along (#718).
 *
 * "Scroll to the bottom on every chunk" is the obvious answer and the wrong
 * one: an answer taller than the panel then pins its *end* to the viewport and
 * the reader is pushed off the sentence they were reading. So the viewport
 * follows *the current message* instead — it scrolls with new content, but
 * never past the point where that message's top reaches the top of the panel.
 * Beyond that cap the answer grows off-screen and the reader decides when to
 * move.
 *
 * Any wheel, touch or key input disengages the follow until the next message
 * registers: someone who scrolled up to re-read is not yanked back down.
 *
 * The scroll itself is applied from a `requestAnimationFrame` so a streamed
 * token does not cost a scroll each.
 */
import { getContext, setContext } from 'svelte';

const STICK_TO_BOTTOM_CONTEXT_KEY = Symbol('stick-to-bottom-context');

/** Breathing room left above the followed message when it is pinned. */
const PIN_PADDING_PX = 16;
/** How close to the end still counts as "at the bottom". */
const BOTTOM_THRESHOLD_PX = 32;

export interface InitialPlacement {
	/** Where the reader was when this conversation was last put away, or `null`. */
	remembered: number | null;
	/** Total scrollable height of the viewport. */
	scrollHeight: number;
	/** Visible height of the viewport. */
	clientHeight: number;
}

/**
 * Where a panel opens on a conversation that already has messages (#729).
 *
 * The end, unless the reader left it somewhere else — and clamped, because a
 * remembered offset outlives the layout it was taken in: a narrower window, a
 * collapsed tool block or a cleared message makes yesterday's number point
 * past the content, and the browser would silently land at the end while the
 * code believed it had restored something.
 */
export function initialScrollTop({
	remembered,
	scrollHeight,
	clientHeight
}: InitialPlacement): number {
	const end = Math.max(0, scrollHeight - clientHeight);
	if (remembered === null || !Number.isFinite(remembered)) return end;
	return Math.max(0, Math.min(end, remembered));
}

export interface ResizeGeometry {
	/** Whether the reader was at the end *before* the viewport changed size. */
	wasAtBottom: boolean;
	/** Total scrollable height of the viewport, after the change. */
	scrollHeight: number;
	/** Visible height of the viewport, after the change. */
	clientHeight: number;
}

/**
 * Where the viewport belongs after the panel changes size (#743).
 *
 * Shrinking moves neither `scrollTop` nor any node, so neither a `scroll` event
 * nor a mutation fires — the flag would go on saying "at the end" while the end
 * has moved away below the reader, and the way back down is a button that only
 * exists while the flag says otherwise.
 *
 * A reader who was at the end is put back at the end: they were watching the
 * newest line, and the viewport moved under them rather than the other way
 * round. A reader who was somewhere else is left alone — that is the whole
 * distinction, and it is why `wasAtBottom` has to be read *before* the resize
 * is applied.
 *
 * `null` means "do not scroll", which is not the same as `0`.
 */
export function afterResizeScrollTop({
	wasAtBottom,
	scrollHeight,
	clientHeight
}: ResizeGeometry): number | null {
	if (!wasAtBottom) return null;
	return Math.max(0, scrollHeight - clientHeight);
}

export interface FollowGeometry {
	/** Where the viewport is scrolled to now. */
	scrollTop: number;
	/** Top of the scrolling viewport, in client coordinates. */
	containerTop: number;
	/** Top of the message being followed, in client coordinates. */
	elementTop: number;
	/** Total scrollable height of the viewport. */
	scrollHeight: number;
	/** Visible height of the viewport. */
	clientHeight: number;
}

/**
 * Where the viewport should scroll to in order to keep the followed message in
 * view.
 *
 * The candidate is the position that aligns the message's top with the top of
 * the viewport (less a little padding). It is then bounded on both sides: it
 * can never exceed the real end of the scrollable area, and it can never go
 * negative — either would scroll to a place that does not exist and browsers
 * clamp it silently, which hides the mistake.
 */
export function followScrollTop(geometry: FollowGeometry): number {
	const { scrollTop, containerTop, elementTop, scrollHeight, clientHeight } = geometry;
	const alignTopScroll = scrollTop + (elementTop - containerTop) - PIN_PADDING_PX;
	const bottomFollow = scrollHeight - clientHeight;
	return Math.max(0, Math.min(bottomFollow, alignTopScroll));
}

class StickToBottomContext {
	#element: HTMLElement | null = $state(null);
	#isAtBottom = $state(true);
	#ready = false;

	#followTarget: HTMLElement | null = null;
	#followAllowed = true;
	#pendingApply = false;
	#mutationObserver: MutationObserver | null = null;

	#resizeObserver: ResizeObserver | null = null;

	/** Where this conversation was left, if the caller remembers (#729). */
	#remembered: number | null = null;
	/** Cleared once the viewport has been put where it belongs, or the reader moves. */
	#placementPending = true;

	isAtBottom = $derived(this.#isAtBottom);

	constructor() {
		$effect(() => {
			if (!this.#element) return;
			this.#setup();
			return () => this.#cleanup();
		});
	}

	setElement(element: HTMLElement) {
		this.#element = element;
	}

	/**
	 * Where to open, before anything is measured (#729).
	 *
	 * `null` means the end. Set from the caller that outlives the panel — the
	 * sheet is unmounted while closed, so the offset cannot live in here.
	 */
	placeAt(remembered: number | null) {
		this.#remembered = remembered;
	}

	/** Where the reader is now, for a caller that wants to remember it. */
	offset(): number | null {
		return this.#element ? this.#element.scrollTop : null;
	}

	/**
	 * Marks `element` as the message to follow while content streams in.
	 *
	 * Returns a cleanup function that clears the target if it is still the
	 * active one — call it from `$effect` so an unmounting message does not
	 * keep the viewport tied to a node that has gone.
	 */
	followMessage = (element: HTMLElement) => {
		this.#followTarget = element;
		this.#followAllowed = true;
		// A message that arrives on an open panel is a stronger claim on the
		// viewport than "open where it was left"; two owners writing
		// `scrollTop` would fight. A message that mounts *with* the panel is
		// not that: every anchor registers before the first placement is even
		// attempted, so cancelling here threw the remembered offset away
		// before it could be used, and the panel opened on its oldest message
		// no matter where the reader had been (#844). `#ready` is the line
		// between the two — it turns true once placement has had its frame.
		if (this.#ready) {
			this.#placementPending = false;
			this.#scheduleApply('smooth');
		}
		return () => {
			if (this.#followTarget === element) {
				this.#followTarget = null;
			}
		};
	};

	scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
		if (!this.#element) return;
		this.#followAllowed = true;
		this.#element.scrollTo({ top: this.#element.scrollHeight, behavior });
	};

	/**
	 * Opens the panel where the reader left it, or at the end (#729).
	 *
	 * Retried rather than done once: the sheet animates in, and a viewport
	 * measured mid-transition has nothing to scroll — a `scrollTo` there is a
	 * silent no-op the code would count as done, which is exactly how a
	 * conversation ends up showing its oldest message. So the attempt stands
	 * until there is something to scroll, and the mutation observer brings it
	 * back as content lands.
	 */
	#tryPlace() {
		if (!this.#element || !this.#placementPending) return;
		const { scrollHeight, clientHeight } = this.#element;
		if (scrollHeight <= clientHeight) return;
		this.#element.scrollTo({
			top: initialScrollTop({ remembered: this.#remembered, scrollHeight, clientHeight }),
			// Never animated: a smooth scroll through fifty messages on open is
			// a slot machine, and the reader did not ask for a journey.
			behavior: 'auto'
		});
		this.#placementPending = false;
		this.#syncAtBottom();
		// A reader restored into the middle of the conversation is a reader who
		// scrolled up, and #718 leaves those alone: the follow stays disengaged
		// until a new message registers, or the first mutation after opening
		// would drag them back down to the newest line (#844).
		this.#followAllowed = this.#isAtBottom;
	}

	#scheduleApply(behavior: ScrollBehavior) {
		if (this.#pendingApply) return;
		this.#pendingApply = true;
		requestAnimationFrame(() => {
			this.#pendingApply = false;
			this.#applyFollow(behavior);
		});
	}

	#applyFollow(behavior: ScrollBehavior) {
		if (!this.#element || !this.#followTarget || !this.#followAllowed || !this.#ready) {
			this.#syncAtBottom();
			return;
		}
		const containerRect = this.#element.getBoundingClientRect();
		const elementRect = this.#followTarget.getBoundingClientRect();
		const target = followScrollTop({
			scrollTop: this.#element.scrollTop,
			containerTop: containerRect.top,
			elementTop: elementRect.top,
			scrollHeight: this.#element.scrollHeight,
			clientHeight: this.#element.clientHeight
		});
		// Only ever move forward: a target behind the current position would
		// fight a reader who scrolled down ahead of the stream.
		if (target > this.#element.scrollTop + 1) {
			this.#element.scrollTo({ top: target, behavior });
		}
		this.#syncAtBottom();
	}

	/**
	 * A pin that does not move `scrollTop` never fires `scroll`, so the flag
	 * cannot live only in that handler.
	 */
	#syncAtBottom() {
		if (!this.#element) return;
		const { scrollTop, scrollHeight, clientHeight } = this.#element;
		this.#isAtBottom = scrollTop + clientHeight >= scrollHeight - BOTTOM_THRESHOLD_PX;
	}

	#onScroll = () => {
		this.#syncAtBottom();
	};

	/**
	 * The viewport changed size (#743).
	 *
	 * `#isAtBottom` still holds the answer from before this callback ran —
	 * nothing has recomputed it, because a resize fires neither `scroll` nor a
	 * mutation. That stale value is exactly what is needed here, and it is why
	 * `#syncAtBottom()` comes after the scroll rather than before it.
	 */
	#onResize = () => {
		if (!this.#element) return;
		const target = afterResizeScrollTop({
			wasAtBottom: this.#isAtBottom,
			scrollHeight: this.#element.scrollHeight,
			clientHeight: this.#element.clientHeight
		});
		if (target !== null) this.#element.scrollTo({ top: target, behavior: 'auto' });
		this.#syncAtBottom();
	};

	#onUserIntent = () => {
		this.#followAllowed = false;
		// Somebody who has already moved is not carried anywhere else.
		this.#placementPending = false;
	};

	#setup() {
		if (!this.#element) return;
		this.#element.addEventListener('scroll', this.#onScroll, { passive: true });
		this.#element.addEventListener('wheel', this.#onUserIntent, { passive: true });
		this.#element.addEventListener('touchstart', this.#onUserIntent, { passive: true });
		this.#element.addEventListener('touchmove', this.#onUserIntent, { passive: true });
		this.#element.addEventListener('keydown', this.#onUserIntent);
		this.#onScroll();

		this.#mutationObserver = new MutationObserver(() => {
			if (!this.#ready) return;
			this.#tryPlace();
			this.#scheduleApply('auto');
			this.#syncAtBottom();
		});
		this.#mutationObserver.observe(this.#element, {
			childList: true,
			subtree: true,
			characterData: true
		});

		// Sizing the panel is the one way to change the overhang without moving
		// `scrollTop` and without touching a node (#743).
		this.#resizeObserver = new ResizeObserver(() => {
			if (!this.#ready) return;
			this.#onResize();
		});
		this.#resizeObserver.observe(this.#element);

		// Two frames: the first lets the messages render, the second measures
		// them. Jumping to the end before that would measure an empty panel.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (!this.#element) return;
				this.#tryPlace();
				this.#ready = true;
				this.#onScroll();
			});
		});
	}

	#cleanup() {
		if (this.#element) {
			this.#element.removeEventListener('scroll', this.#onScroll);
			this.#element.removeEventListener('wheel', this.#onUserIntent);
			this.#element.removeEventListener('touchstart', this.#onUserIntent);
			this.#element.removeEventListener('touchmove', this.#onUserIntent);
			this.#element.removeEventListener('keydown', this.#onUserIntent);
		}
		this.#mutationObserver?.disconnect();
		this.#mutationObserver = null;
		this.#resizeObserver?.disconnect();
		this.#resizeObserver = null;
		this.#followTarget = null;
		this.#followAllowed = false;
		this.#ready = false;
		this.#placementPending = true;
	}
}

export function setStickToBottomContext(): StickToBottomContext {
	const context = new StickToBottomContext();
	setContext(STICK_TO_BOTTOM_CONTEXT_KEY, context);
	return context;
}

export function getStickToBottomContext(): StickToBottomContext {
	const context = getContext<StickToBottomContext>(STICK_TO_BOTTOM_CONTEXT_KEY);
	if (!context) {
		throw new Error('StickToBottomContext must be used within a Conversation component');
	}
	return context;
}

export { StickToBottomContext };
