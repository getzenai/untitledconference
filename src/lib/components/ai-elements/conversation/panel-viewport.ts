/**
 * Everything the conversation panel does with its scrolling viewport, kept
 * free of runes on purpose.
 *
 * The panel's behaviour is a sequence, not a calculation: a `scroll`, a
 * mutation and a `ResizeObserver` callback arrive in an order the browser
 * chooses, and each one reads state the others wrote. That is where #849 went
 * wrong, and it is the one thing the pure helpers below cannot check.
 *
 * Vitest runs this suite through the server build of Svelte, where `$effect`
 * is a no-op — a test that drove the reactive class would register no listener
 * and pass without executing anything. So the wiring lives here, where a test
 * can hand it a stub viewport and fire the sequence itself, and
 * `stick-to-bottom-context.svelte.ts` is the thin reactive shell over it.
 */

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
 * Shrinking the panel alone moves neither `scrollTop` nor any node, so neither
 * a `scroll` event nor a mutation fires — the flag would go on saying "at the
 * end" while the end has moved away below the reader, and the way back down is
 * a button that only exists while the flag says otherwise. Shrinking the
 * *window* does move `scrollTop`; that is #849, and it is handled by keeping
 * this function's `wasAtBottom` from being overwritten in between, not here.
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

export interface ScrollOrigin {
	/** Visible height of the viewport when it was last measured. */
	lastClientHeight: number;
	/** Visible height of the viewport now. */
	clientHeight: number;
}

/**
 * Whether a `scroll` event is the layout moving under the reader (#849).
 *
 * Shrinking the window fires one: the browser moves `scrollTop` itself while
 * the panel is being re-laid out. That event is not the reader saying "I want
 * to be somewhere else", but by position alone it is indistinguishable from
 * one — and taken as one it clears the very flag the resize handler is about
 * to read, so a reader who was watching the newest line is left above it.
 *
 * `clientHeight` tells the two apart: only a resize changes the height of the
 * viewport. Content arriving moves `scrollHeight`, and a reader moves neither.
 */
export function isResizeDrivenScroll({ lastClientHeight, clientHeight }: ScrollOrigin): boolean {
	return clientHeight !== lastClientHeight;
}

export interface EndIntent {
	/** Whether the last measurement put the reader at the end. */
	atBottom: boolean;
	/** Where a scroll this panel started is heading, or `null` for none. */
	glideTarget: number | null;
	/** The end of the scrollable area as of that last measurement. */
	lastEnd: number;
}

/**
 * Whether the reader is watching the newest line — there, or on the way (#849).
 *
 * A message arriving scrolls the panel over a few hundred milliseconds, and for
 * every one of those frames the reader is *not* at the end by position. A
 * window resize inside that window read the position, decided they were reading
 * something older, and left them behind; the glide then finished at the end the
 * panel had before it shrank.
 *
 * Where the glide is heading answers what the position cannot. Any scroll the
 * reader starts themselves clears it, so this can only ever say "the panel was
 * carrying them to the newest line", never "they asked to be there".
 */
export function isWatchingTheEnd({ atBottom, glideTarget, lastEnd }: EndIntent): boolean {
	if (atBottom) return true;
	if (glideTarget === null) return false;
	return glideTarget >= lastEnd - BOTTOM_THRESHOLD_PX;
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

export class PanelViewport {
	#element: HTMLElement | null = null;
	#isAtBottom = true;
	#onAtBottom: (atBottom: boolean) => void;
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
	/** Height of the viewport as of the last measurement — the resize tell (#849). */
	#lastClientHeight = 0;
	/** The end of the scrollable area as of that same measurement (#849). */
	#lastEnd = 0;
	/** Where a scroll this panel started is heading, until it lands (#849). */
	#glideTarget: number | null = null;
	/** How far that glide had left to go when it was last measured (#849). */
	#lastGlideDistance = 0;

	/**
	 * `onAtBottom` is how the reactive shell hears about the flag changing.
	 * This class works out the answer; who repaints a button because of it is
	 * not its business.
	 */
	constructor(onAtBottom: (atBottom: boolean) => void = () => {}) {
		this.#onAtBottom = onAtBottom;
	}

	/** Whether the reader is at the newest line, as the last measurement left it. */
	get atBottom(): boolean {
		return this.#isAtBottom;
	}

	/** Starts listening to `element`. Everything is undone again by `detach`. */
	attach(element: HTMLElement) {
		this.detach();
		this.#element = element;
		this.#setup();
	}

	detach() {
		if (!this.#element) return;
		this.#cleanup();
		this.#element = null;
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
		this.#glide(this.#element.scrollHeight, behavior);
	};

	/**
	 * Every scroll this panel starts goes through here, so that where it is
	 * heading is written down (#849). A smooth scroll takes a few hundred
	 * milliseconds, and a resize inside that window has to know the reader is
	 * being carried to the newest line — their position says the opposite for
	 * every frame of it.
	 */
	#glide(top: number, behavior: ScrollBehavior) {
		if (!this.#element) return;
		this.#glideTarget = top;
		this.#lastGlideDistance = Math.abs(this.#element.scrollTop - top);
		this.#element.scrollTo({ top, behavior });
	}

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
		this.#glide(
			initialScrollTop({ remembered: this.#remembered, scrollHeight, clientHeight }),
			// Never animated: a smooth scroll through fifty messages on open is
			// a slot machine, and the reader did not ask for a journey.
			'auto'
		);
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
			this.#glide(target, behavior);
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
		this.#lastClientHeight = clientHeight;
		this.#lastEnd = Math.max(0, scrollHeight - clientHeight);
		// A glide is over once it arrives — and also once the viewport starts
		// moving *away* from where it was heading, which a smooth scroll never
		// does: that is someone else driving, and left standing the glide would
		// go on answering for a reader it is no longer carrying.
		if (this.#glideTarget !== null) {
			const distance = Math.abs(scrollTop - this.#glideTarget);
			if (distance <= 1 || distance > this.#lastGlideDistance + 1) {
				this.#glideTarget = null;
			} else {
				this.#lastGlideDistance = distance;
			}
		}
		const atBottom = scrollTop + clientHeight >= scrollHeight - BOTTOM_THRESHOLD_PX;
		if (atBottom === this.#isAtBottom) return;
		this.#isAtBottom = atBottom;
		this.#onAtBottom(atBottom);
	}

	/**
	 * A scroll that arrives with a viewport of a different height is the window
	 * being resized, not the reader moving, and it goes to the resize path
	 * instead of overwriting the flag that path reads (#849, #876).
	 */
	#onScroll = () => {
		if (!this.#element) return;
		if (
			this.#ready &&
			this.#followAllowed &&
			isResizeDrivenScroll({
				lastClientHeight: this.#lastClientHeight,
				clientHeight: this.#element.clientHeight
			})
		) {
			this.#onResize();
			return;
		}
		this.#syncAtBottom();
		// Arriving at the newest line under their own steam is the other end of
		// #718's rule: a wheel disengages the follow, and coming back down asks
		// for it again. Without this the panel stays disengaged for the rest of
		// the conversation, and the next resize leaves them behind because the
		// switch above is no longer theirs to use (#880).
		if (this.#isAtBottom) this.#followAllowed = true;
	};

	/**
	 * The viewport changed size (#743).
	 *
	 * `#isAtBottom` still holds the answer from before the size changed, which
	 * is exactly what is needed here — it is why `#syncAtBottom()` comes after
	 * the scroll rather than before it. Shrinking the panel recomputes nothing
	 * on its own, because it fires neither `scroll` nor a mutation; shrinking
	 * the window does fire a `scroll`, and `#onScroll` sends it here rather
	 * than letting it answer the question this handler is still asking (#849).
	 */
	#onResize = () => {
		if (!this.#element) return;
		const target = afterResizeScrollTop({
			wasAtBottom: isWatchingTheEnd({
				atBottom: this.#isAtBottom,
				glideTarget: this.#glideTarget,
				lastEnd: this.#lastEnd
			}),
			scrollHeight: this.#element.scrollHeight,
			clientHeight: this.#element.clientHeight
		});
		if (target !== null) this.#glide(target, 'auto');
		this.#syncAtBottom();
	};

	#onUserIntent = () => {
		this.#followAllowed = false;
		// Somebody who has already moved is not carried anywhere else — neither
		// to a remembered offset, nor to the end a glide was still aiming at.
		this.#placementPending = false;
		this.#glideTarget = null;
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
		this.#lastClientHeight = 0;
		this.#lastEnd = 0;
		this.#glideTarget = null;
		this.#lastGlideDistance = 0;
	}
}
