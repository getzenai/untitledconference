<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	let { allowDraft = true }: { allowDraft?: boolean } = $props();
</script>

<div class="flex flex-wrap items-center gap-3 border-t pt-6">
	<Button type="submit" formaction="?/submit" data-testid="cfp-sign-in-to-submit">
		Sign in to submit
	</Button>
	{#if allowDraft}
		<Button type="submit" formaction="?/draft" variant="outline" data-testid="cfp-sign-in-to-draft">
			Save as draft
		</Button>
	{/if}
	<span class="text-muted-foreground text-sm">
		We'll save your choice as soon as you sign in or create an account.
	</span>
</div>
