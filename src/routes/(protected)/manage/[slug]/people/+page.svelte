<script lang="ts">
	/**
	 * Team & reviewers — committee settings that are not conference structure.
	 *
	 * Reviewer visibility used to sit alone on Settings (#63). The full people
	 * roster is still to come; this is the right place for the mode already.
	 */
	import { enhance } from '$app/forms';
	import { REVIEW_VISIBILITY_MODES } from '$lib/conference/review-visibility';
	import { Button } from '$lib/components/ui/button';

	let { data, form } = $props();

	let busy = $state(false);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:head>
	<title>Team &amp; reviewers — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<h1 class="text-lg font-semibold tracking-tight">Team &amp; reviewers</h1>
	<p class="text-muted-foreground mt-0.5 text-sm">How the review committee works with each other.</p>
</div>

<div class="px-6 py-5">
	{#if form?.message}
		<p
			class="border-status-good text-status-good mb-3 max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="status"
		>
			{form.message}
		</p>
	{/if}

	<section
		class="border-border bg-card max-w-2xl rounded-lg border p-4"
		data-testid="people-review-visibility"
	>
		<h2 class="text-sm font-semibold">What reviewers see of each other</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			The restriction is enforced when the page is built, not when it is drawn — a hidden score is
			never sent to the browser.
		</p>

		<form method="POST" action="?/reviewVisibility" use:enhance={submitting} class="mt-3 space-y-3">
			{#each REVIEW_VISIBILITY_MODES as mode (mode.value)}
				<label class="border-border flex items-start gap-3 rounded-md border p-3 text-sm">
					<input
						type="radio"
						name="mode"
						value={mode.value}
						checked={data.conference.reviewVisibility === mode.value}
						class="accent-primary mt-0.5 size-4"
					/>
					<span>
						<span class="font-medium">{mode.label}</span>
						<span class="text-muted-foreground block text-xs">{mode.description}</span>
					</span>
				</label>
			{/each}

			<Button type="submit" size="sm" disabled={busy}>Save</Button>
		</form>
	</section>
</div>
