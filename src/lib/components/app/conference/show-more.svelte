<script lang="ts">
	let {
		text,
		limit = 180,
		class: className = ''
	}: { text: string; limit?: number; class?: string } = $props();

	let expanded = $state(false);

	// Cut on a word boundary, not mid-word: a truncation that reads as a typo
	// costs more attention than the three words it saved.
	const needsCut = $derived(text.length > limit);
	const short = $derived(
		needsCut ? text.slice(0, text.lastIndexOf(' ', limit)).trimEnd() + '…' : text
	);
</script>

<p class="text-muted-foreground text-sm leading-relaxed {className}">
	{expanded || !needsCut ? text : short}
	{#if needsCut}
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			class="text-foreground hover:text-foreground/70 ml-1 font-medium underline underline-offset-2"
		>
			{expanded ? 'Show less' : 'Show more'}
		</button>
	{/if}
</p>
