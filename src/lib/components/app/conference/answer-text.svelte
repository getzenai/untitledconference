<script lang="ts">
	/**
	 * A form answer, printed with its links clickable (#477).
	 *
	 * Three screens print the answers a submitter gave — the reviewer's detail page,
	 * the organizer's, and the speaker's own portal copy — and all three printed a
	 * URL as body text. On the reviewer's screen that is the worst of the three: the
	 * recording or the slide deck is the only evidence of how this person actually
	 * presents, and it sat there uncopyable while they scored.
	 *
	 * No `{@html}`: `answerParts` hands back plain strings and the anchor is built
	 * here, so nothing a stranger typed into a public form is ever parsed as markup.
	 */
	import { answerParts } from '$lib/conference/answer-links';

	let { value, class: className = '' }: { value: string; class?: string } = $props();

	const parts = $derived(answerParts(value));
</script>

<span class="whitespace-pre-line {className}" data-testid="answer-text"
	>{#each parts as part, i (i)}{#if part.kind === 'link'}<a
				href={part.value}
				target="_blank"
				rel="noopener noreferrer external"
				class="text-primary underline underline-offset-2"
				data-testid="answer-link">{part.value}</a
			>{:else}{part.value}{/if}{/each}</span
>
