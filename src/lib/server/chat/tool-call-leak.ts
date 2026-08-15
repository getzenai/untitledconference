/**
 * Stop a model that writes its tool call out as chat text (#660).
 *
 * A model behind an OpenAI-compatible endpoint can answer a question it was
 * given tools for by printing the call instead of making it:
 *
 *     {"type": "function", "name": "list_my_review_assignments", "parameters": {}}
 *
 * Nothing runs, nothing is read, and the reviewer is shown JSON. The stream
 * itself is healthy — the content is the fault — so no error reaches the
 * client on its own. This transform is the net: while a step has produced no
 * tool call, its text is held back until it can be judged, and text that is a
 * tool call in disguise is replaced by the chat's error state.
 *
 * The hold is what makes it work. By the time the last brace arrives the text
 * would already be on screen, so the first {@link HOLD_CHARS} characters of a
 * toolless step wait. That is well inside one sentence; a real answer flushes
 * as soon as it is longer than a call could plausibly be.
 */
import type { StreamTextTransform, TextStreamPart, ToolSet } from 'ai';

/**
 * How much of a toolless step is held before it is let through. Fabian's three
 * live samples are 68, 90 and 104 characters; a real answer that has said
 * nothing tool-shaped in 400 is answering, not calling.
 */
export const HOLD_CHARS = 400;

export class ChatToolCallLeakError extends Error {
	constructor() {
		super(
			'The assistant could not use its tools just now, so it did not answer. Nothing was changed — please try again.'
		);
		this.name = 'ChatToolCallLeakError';
	}
}

/**
 * Does this text look like a tool call the model failed to make?
 *
 * Two things have to be true together: a tool the surface actually offered is
 * named, and the text carries the machinery of a call around it. Either alone
 * is normal — the system prompt asks the assistant to name the tool it used
 * ("I used list_my_review_assignments to look"), and a reviewer may well paste
 * JSON into a chat about a talk.
 */
export function looksLikeToolCallTranscript(text: string, toolNames: readonly string[]): boolean {
	if (!toolNames.some((name) => text.includes(name))) return false;
	return (
		/"type"\s*:\s*"function"/.test(text) ||
		/"(?:parameters|arguments)"\s*:/.test(text) ||
		/"(?:name|function)"\s*:\s*"/.test(text)
	);
}

type Part<TOOLS extends ToolSet> = TextStreamPart<TOOLS>;
type Sink<TOOLS extends ToolSet> = TransformStreamDefaultController<Part<TOOLS>>;

/**
 * The state of one stream: what has been held back, and whether this turn has
 * called a tool yet.
 */
class LeakWatch<TOOLS extends ToolSet> {
	private held: Part<TOOLS>[] = [];
	private text = '';
	private sawToolCall = false;
	private flushed = false;
	failed = false;

	constructor(
		private readonly toolNames: readonly string[],
		private readonly stopStream: () => void
	) {}

	/** A real call happened: nothing held was a substitute for one. */
	toolCalled(sink: Sink<TOOLS>) {
		this.sawToolCall = true;
		this.release(sink);
	}

	/** Each step is judged on its own — unless the turn already used a tool. */
	stepStarted() {
		if (this.sawToolCall) return;
		this.held = [];
		this.text = '';
		this.flushed = false;
	}

	/** True when the part was taken; false when the caller should pass it on. */
	holds(part: Part<TOOLS>, sink: Sink<TOOLS>): boolean {
		if (this.sawToolCall || this.flushed) return false;
		this.held.push(part);
		if (part.type === 'text-delta') this.text += part.text;
		if (this.leaking()) {
			this.refuse(sink);
			return true;
		}
		if (this.text.length >= HOLD_CHARS) this.release(sink);
		return true;
	}

	/**
	 * The last chance to judge. A call short enough to end inside the hold never
	 * reached the length that flushes it.
	 */
	settle(sink: Sink<TOOLS>) {
		if (this.sawToolCall || this.flushed || this.held.length === 0) return;
		if (this.leaking()) this.refuse(sink);
		else this.release(sink);
	}

	private leaking(): boolean {
		return looksLikeToolCallTranscript(this.text, this.toolNames);
	}

	private release(sink: Sink<TOOLS>) {
		for (const part of this.held) sink.enqueue(part);
		this.held = [];
		this.flushed = true;
	}

	private refuse(sink: Sink<TOOLS>) {
		this.held = [];
		this.failed = true;
		sink.enqueue({ type: 'error', error: new ChatToolCallLeakError() });
		this.stopStream();
	}
}

/**
 * One part, one decision. Returns false when the watch has taken the part and
 * the caller must not pass it on.
 */
function forward<TOOLS extends ToolSet>(
	watch: LeakWatch<TOOLS>,
	part: Part<TOOLS>,
	sink: Sink<TOOLS>
): boolean {
	// After a refusal the turn is over; anything still in flight would arrive
	// under an error the reviewer has already been shown.
	if (watch.failed) return false;

	if (part.type === 'tool-input-start' || part.type === 'tool-call') {
		watch.toolCalled(sink);
		return true;
	}
	if (part.type === 'start-step') {
		watch.stepStarted();
		return true;
	}
	if (part.type === 'text-start' || part.type === 'text-delta') {
		return !watch.holds(part, sink);
	}
	if (part.type === 'text-end' || part.type === 'finish-step' || part.type === 'finish') {
		watch.settle(sink);
		return !watch.failed;
	}
	return true;
}

/**
 * The transform for `experimental_transform`. One instance per request: it
 * carries the state of a single stream.
 */
export function guardToolCallLeak<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
	return ({ tools, stopStream }) => {
		const watch = new LeakWatch<TOOLS>(Object.keys(tools ?? {}), stopStream);

		return new TransformStream<Part<TOOLS>, Part<TOOLS>>({
			transform(part, sink) {
				if (forward(watch, part, sink)) sink.enqueue(part);
			},
			flush(sink) {
				if (!watch.failed) watch.settle(sink);
			}
		});
	};
}
