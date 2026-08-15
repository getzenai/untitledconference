/**
 * The acceptance call (#444): slot arithmetic, one lobbying queue at a time.
 *
 * Separate from `/submissions` on purpose. That screen is asynchronous triage —
 * filter, sort, select twelve, decide. This one is a room with people in it, and
 * everything on it answers one of the two questions actually asked on the call:
 * "how many slots are left?" and "what are you fighting for?".
 *
 * The selected member lives in the URL so the organizer driving the call can hand
 * the link to whoever is speaking, and so the browser's back button walks back
 * through the meeting instead of out of it.
 */
import { parseCapacity } from '$lib/conference/decision-room';
import {
	conditionForDecision,
	conferenceOrganizers
} from '$lib/server/conference/accept-condition';
import { requireOrganizer } from '$lib/server/conference/access';
import { sentenceForDecision } from '$lib/server/conference/decision-note';
import {
	committeeSeats,
	lobbyingQueue,
	setSlotCapacity,
	slotBoard
} from '$lib/server/conference/decision-room';
import { decideSubmissions, type Decision } from '$lib/server/conference/decisions';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const DECISIONS: Decision[] = ['accepted', 'rejected', 'waitlisted', 'resubmit_with_guidance'];

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	const [board, seats, organizers] = await Promise.all([
		slotBoard(conference.id),
		committeeSeats(conference.id),
		conferenceOrganizers(conference)
	]);

	// An unknown `?member=` falls back to the first seat rather than failing: this
	// URL gets pasted around during a call, and a stale one should still open the room.
	const requested = url.searchParams.get('member');
	const selected = seats.find((seat) => seat.userId === requested) ?? seats[0] ?? null;
	const queue = selected ? await lobbyingQueue(conference.id, selected.userId) : [];

	return { board, seats, selectedUserId: selected?.userId ?? null, queue, organizers };
};

export const actions: Actions = {
	/**
	 * One talk, one decision — the shape of the call.
	 *
	 * `decideSubmissions` is the same transaction the submissions table uses, so an
	 * accept here creates the placement and the speaker tasks exactly as an accept
	 * there does. A second path into the programme would be a second set of bugs.
	 */
	decide: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const decision = form.get('decision');
		const id = Number(form.get('id'));

		if (typeof decision !== 'string' || !DECISIONS.includes(decision as Decision)) {
			return fail(400, { message: 'Unknown decision.' });
		}
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { message: 'Unknown submission.' });
		}

		const note = await conditionForDecision(conference, form, decision);
		if (!note.ok) return fail(400, { message: note.message });

		const sentence = sentenceForDecision(form, decision);
		if (!sentence.ok) return fail(400, { message: sentence.message });

		const result = await decideSubmissions(
			conference,
			[id],
			decision as Decision,
			note.condition,
			sentence.sentence
		);
		return { decision, result };
	},

	/** The numbers the room argues against. Empty clears one back to "not said". */
	capacity: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();

		const total = parseCapacity(form.get('total'));
		if (total === 'invalid') {
			return fail(400, { message: 'Slots must be a whole number, or empty.' });
		}

		const tracks: { id: number; capacity: number | null }[] = [];
		for (const [name, value] of form.entries()) {
			if (!name.startsWith('track-')) continue;
			const id = Number(name.slice('track-'.length));
			if (!Number.isInteger(id) || id <= 0) continue;
			const capacity = parseCapacity(value);
			if (capacity === 'invalid') {
				return fail(400, { message: 'Slots must be a whole number, or empty.' });
			}
			tracks.push({ id, capacity });
		}

		await setSlotCapacity(conference.id, total, tracks);
		return { message: 'Slots saved.' };
	}
};
