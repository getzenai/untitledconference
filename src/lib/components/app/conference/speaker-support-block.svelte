<script lang="ts">
	/**
	 * The labelled block both a submitter and an accepted speaker read (#512).
	 *
	 * One component so the public call and the portal cannot drift: the lines
	 * come from `speakerSupportLines`, and an empty set renders nothing. The
	 * caller decides *whether* to show this (accepted, call still open, …);
	 * this file only prints what was actually set.
	 */
	import {
		hasSpeakerSupport,
		speakerSupportLines,
		type SpeakerSupport
	} from '$lib/conference/speaker-support';

	let {
		support = {},
		class: className = 'border-border bg-card mt-4 rounded-lg border p-6'
	}: {
		support?: SpeakerSupport;
		class?: string;
	} = $props();

	const lines = $derived(speakerSupportLines(support));
</script>

{#if hasSpeakerSupport(support)}
	<section class={className} data-testid="speaker-support">
		<h3 class="text-sm font-semibold">Speaker expenses</h3>
		<dl class="mt-3 space-y-3 text-sm">
			{#each lines as line (line.key)}
				<div>
					<dt class="text-muted-foreground text-xs">{line.label}</dt>
					<dd class="mt-0.5" data-testid="speaker-support-{line.key}">{line.text}</dd>
				</div>
			{/each}
		</dl>
	</section>
{/if}
