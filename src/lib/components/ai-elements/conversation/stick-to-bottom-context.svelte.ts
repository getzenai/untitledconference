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
	 * Marks `element` as the message to follow while content streams in.
	 *
	 * Returns a cleanup function that clears the target if it is still the
	 * active one — call it from `$effect` so an unmounting message does not
	 * keep the viewport tied to a node that has gone.
	 */
	followMessage = (element: HTMLElement) => {
		this.#followTarget = element;
		this.#followAllowed = true;
		if (this.#ready) this.#scheduleApply('smooth');
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

	#onUserIntent = () => {
		this.#followAllowed = false;
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
			this.#scheduleApply('auto');
			this.#syncAtBottom();
		});
		this.#mutationObserver.observe(this.#element, {
			childList: true,
			subtree: true,
			characterData: true
		});

		// Two frames: the first lets the messages render, the second measures
		// them. Jumping to the end before that would measure an empty panel.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (!this.#element) return;
				this.#element.scrollTo({ top: this.#element.scrollHeight, behavior: 'auto' });
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
		this.#followTarget = null;
		this.#followAllowed = false;
		this.#ready = false;
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
