<script lang="ts" module>
	/**
	 * R4 in one place: status is a word, colour is the second channel.
	 *
	 * The design system says six status colours with one meaning each. Before this
	 * component that was prose — every screen picked its own `bg-green-500`, and
	 * five different greens meant "accepted". Map a domain status here once and
	 * every surface agrees, including the ones nobody has written yet.
	 */

	export type StatusTone = 'neutral' | 'progress' | 'good' | 'warn' | 'bad' | 'internal';

	/**
	 * Domain status -> tone. Keys are the values of the pgEnums in
	 * `src/lib/server/db/conference`. A status that is not listed renders neutral
	 * rather than throwing: an unlabelled badge is a design bug, a blank screen is
	 * an outage.
	 */
	export const STATUS_TONES: Record<string, StatusTone> = {
		// submission_status
		draft: 'neutral',
		submitted: 'progress',
		in_review: 'progress',
		accepted: 'good',
		rejected: 'bad',
		waitlisted: 'warn',
		resubmit_with_guidance: 'warn',
		withdrawn: 'bad',
		// content_approval / deliverable_approval
		pending: 'warn',
		approved: 'good',
		// conference_status
		published: 'good',
		archived: 'neutral',
		closed: 'neutral',
		// conference_speaker_status
		invited: 'progress',
		confirmed: 'good',
		declined: 'bad',
		cancelled: 'bad',
		// carry_forward_disposition (#448)
		discarded: 'bad',
		// task_status
		open: 'neutral',
		done: 'good',
		// editorial_stand (#446) — named on an accept, not a second status
		materials_requested: 'progress',
		received: 'progress',
		reviewed: 'warn',
		revision_requested: 'warn',
		final: 'good',
		// review_status
		assigned: 'progress',
		recused: 'neutral',
		// placement_status
		tentative: 'warn',
		// email_status
		queued: 'progress',
		sent: 'good',
		failed: 'bad'
	};

	const TONE_CLASSES: Record<StatusTone, string> = {
		neutral: 'bg-status-neutral-bg text-status-neutral',
		progress: 'bg-status-progress-bg text-status-progress',
		good: 'bg-status-good-bg text-status-good',
		warn: 'bg-status-warn-bg text-status-warn',
		bad: 'bg-status-bad-bg text-status-bad',
		internal: 'bg-status-internal-bg text-status-internal'
	};

	/** `in_review` -> `In review`. */
	export function humanise(status: string): string {
		const words = status.replace(/_/g, ' ');
		return words.charAt(0).toUpperCase() + words.slice(1);
	}
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';

	let {
		status,
		label,
		tone,
		class: className
	}: {
		status: string;
		/** Overrides the humanised status. The badge always shows a word. */
		label?: string;
		/** Overrides the mapping — for statuses this component cannot know about. */
		tone?: StatusTone;
		class?: string;
	} = $props();

	const resolvedTone = $derived(tone ?? STATUS_TONES[status] ?? 'neutral');
</script>

<span
	data-slot="status-badge"
	data-status={status}
	class={cn(
		'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
		TONE_CLASSES[resolvedTone],
		className
	)}
>
	<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
	{label ?? humanise(status)}
</span>
