/**
 * The drag gesture on the agenda grid, as a state machine the page can hand its
 * pointers to.
 *
 * It lives outside the component for the same reason `agenda-grid.ts` does: every
 * decision in here — is this a drag or a click, is that slot free, is this drop a
 * write or a dialog — is a decision that can be wrong, and none of it needs a
 * browser to be exercised. What is left in the page is markup and wiring.
 *
 * Dragging is built on pointer events rather than the HTML5 drag API. Native
 * `dragstart` cannot be produced from a test runner, and a gesture no test can
 * drive is one that breaks silently; pointer events are also the ones that work
 * under a finger.
 *
 * Only `pointerdown` belongs on the draggable. Move and release are listened for
 * on the window rather than through `setPointerCapture`, because the interesting
 * drags all leave the element they started on — a talk goes from the tray to the
 * grid, or from one column to another.
 */
import { dropTarget, type GridBox, type GridFrame } from '$lib/conference/agenda-grid';

export type Dragged = {
	placementId: number;
	title: string;
	/** The room it currently sits in, or null while it is still in the tray. */
	roomId: number | null;
};

export type SlotRef = { roomId: number; startMinutes: number };

/** What a drop means. `Alt`/`Option` is the copy modifier everywhere else (#596). */
export type PlaceIntent = 'move' | 'alternative';

type Options = {
	/** The frame as it is now — rooms and rows both change under the room filter. */
	frame: () => GridFrame;
	/**
	 * The rectangle the room columns occupy, measured at the moment it is asked
	 * for. The page can scroll under a drag, and a box captured at pointerdown
	 * would put the drop a screenful away from where the organizer let go.
	 */
	columnsBox: () => GridBox | null;
	/** What already *starts* in a slot, if anything. */
	occupantAt: (slot: SlotRef) => { placementId: number; status?: string } | null;
	/** A drop onto a free slot: the one write this gesture makes. */
	place: (placementId: number, slot: SlotRef, intent: PlaceIntent) => void;
	/** A drop onto a taken slot, which is a question rather than a write. */
	openSlot: (slot: SlotRef) => void;
};

/** Below this many pixels the gesture was a click on a slot, not a drag across the grid. */
const THRESHOLD = 5;

export class DragController {
	#options: Options;

	dragging = $state<Dragged | null>(null);
	/** Where the pointer is, so the page can draw something under it. */
	pointer = $state<{ x: number; y: number } | null>(null);
	/** The slot the drop would land in, so the page can light it up. */
	hover = $state<SlotRef | null>(null);
	/**
	 * What this drop would do if it landed now, so the page can say so before the
	 * organizer lets go. A modifier nobody can see is as invisible as the rule it
	 * replaced (#596).
	 *
	 * Only a talk that is already on the grid can grow an alternative: from the
	 * tray there is nothing to leave behind, so `Alt` there is a move like any
	 * other and promising a copy would be a lie.
	 */
	intent = $state<PlaceIntent>('move');

	#origin: { x: number; y: number } | null = null;
	#moved = false;

	constructor(options: Options) {
		this.#options = options;
	}

	/** True while the click that ends a real drag is still to come. */
	get moved() {
		return this.#moved;
	}

	begin = (event: PointerEvent, item: Dragged) => {
		// Anything interactive nested inside a draggable keeps its own gesture: a
		// drag that started on a button would swallow the button.
		const interactive = (event.target as HTMLElement).closest('button, a, select, input');
		if (interactive && interactive !== event.currentTarget) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;

		this.#origin = { x: event.clientX, y: event.clientY };
		this.#moved = false;
		this.dragging = item;
		this.pointer = { x: event.clientX, y: event.clientY };
		this.#readModifier(event.altKey);
	};

	/**
	 * The key can be pressed or released mid-drag, and a held key on a still
	 * pointer fires no pointer event at all — so the page hands us the keyboard
	 * too. `Alt` on a tray card stays a move; see `intent`.
	 */
	#readModifier = (alt: boolean) => {
		const onGrid = this.dragging?.roomId != null;
		this.intent = alt && onGrid ? 'alternative' : 'move';
	};

	modifier = (alt: boolean) => {
		if (!this.dragging) return;
		this.#readModifier(alt);
	};

	move = (event: PointerEvent) => {
		if (!this.dragging || !this.#origin) return;

		this.pointer = { x: event.clientX, y: event.clientY };
		this.#readModifier(event.altKey);
		if (Math.hypot(event.clientX - this.#origin.x, event.clientY - this.#origin.y) < THRESHOLD) {
			return;
		}

		this.#moved = true;
		const box = this.#options.columnsBox();
		this.hover = box
			? dropTarget(this.#options.frame(), box, { x: event.clientX, y: event.clientY })
			: null;
	};

	end = (event?: PointerEvent) => {
		// Read at the release, not at the press: the organizer can decide halfway
		// through, and the last thing they did with the key is the answer (#596).
		if (event) this.#readModifier(event.altKey);

		const item = this.dragging;
		const target = this.hover;
		const moved = this.#moved;
		const intent = this.intent;
		this.cancel();

		// The click that follows this pointerup must not also open a slot, and the
		// one after a keyboard Enter must — so the flag is dropped a task later,
		// after the click it is meant to swallow and before anything else.
		setTimeout(() => (this.#moved = false), 0);

		if (!item || !moved || !target) return;

		const occupant = this.#options.occupantAt(target);

		// A drop back where it started is a no-op, not an empty write: posting it
		// would still reload the board and read as if something had moved.
		if (occupant?.placementId === item.placementId) return;

		// A published occupant is still a question (swap or empty it). A draft
		// occupant is an alternative: both talks stay, marked as options (#559).
		if (occupant && occupant.status !== 'tentative') {
			this.#options.openSlot(target);
			return;
		}

		this.#options.place(item.placementId, target, intent);
	};

	cancel = () => {
		this.dragging = null;
		this.pointer = null;
		this.hover = null;
		this.intent = 'move';
		this.#origin = null;
	};
}
