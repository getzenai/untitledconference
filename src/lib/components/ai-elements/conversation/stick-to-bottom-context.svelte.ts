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
 * This file is only the reactive skin: `$state` for the one value a component
 * redraws on, and the `$effect` that hooks the viewport up and unhooks it
 * again. The behaviour itself is `PanelViewport` in `panel-viewport.ts`, which
 * has no runes so that a test can drive it directly.
 */
import { getContext, setContext } from 'svelte';
import { PanelViewport } from './panel-viewport.js';

const STICK_TO_BOTTOM_CONTEXT_KEY = Symbol('stick-to-bottom-context');

class StickToBottomContext {
	#element: HTMLElement | null = $state(null);
	#isAtBottom = $state(true);
	#viewport = new PanelViewport((atBottom) => {
		this.#isAtBottom = atBottom;
	});

	isAtBottom = $derived(this.#isAtBottom);

	constructor() {
		$effect(() => {
			const element = this.#element;
			if (!element) return;
			this.#viewport.attach(element);
			return () => this.#viewport.detach();
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
		this.#viewport.placeAt(remembered);
	}

	/** Where the reader is now, for a caller that wants to remember it. */
	offset(): number | null {
		return this.#viewport.offset();
	}

	/**
	 * Marks `element` as the message to follow while content streams in.
	 *
	 * Returns a cleanup function that clears the target if it is still the
	 * active one — call it from `$effect` so an unmounting message does not
	 * keep the viewport tied to a node that has gone.
	 */
	followMessage = (element: HTMLElement) => this.#viewport.followMessage(element);

	scrollToBottom = (behavior: ScrollBehavior = 'smooth') => this.#viewport.scrollToBottom(behavior);
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
