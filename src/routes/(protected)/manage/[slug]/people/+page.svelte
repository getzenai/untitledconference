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
	<p class="text-muted-foreground mt-0.5 text-sm">
		How the review committee works with each other.
	</p>
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

	<section
		class="border-border bg-card mt-6 max-w-2xl rounded-lg border p-4"
		data-testid="people-committee"
	>
		<h2 class="text-sm font-semibold">Who reviews</h2>
		<p class="text-muted-foreground mt-0.5 text-xs">
			Only people on this list can be assigned a submission. They need an account already.
		</p>

		<form method="POST" action="?/addReviewer" use:enhance={submitting} class="mt-3 flex gap-2">
			<input
				name="email"
				type="email"
				required
				placeholder="reviewer@example.com"
				class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
			/>
			<Button type="submit" size="sm" disabled={busy}>Add</Button>
		</form>

		{#if data.committee.length === 0}
			<p class="text-muted-foreground mt-3 text-sm">
				Nobody yet — submissions cannot be assigned until someone is here.
			</p>
		{:else}
			<ul class="divide-border mt-3 divide-y">
				{#each data.committee as person (person.membershipId)}
					<li class="flex flex-wrap items-center justify-between gap-3 py-2">
						<div>
							<p class="text-sm font-medium">{person.name}</p>
							<p class="text-muted-foreground text-xs">{person.email}</p>
						</div>
						<form method="POST" action="?/removeReviewer" use:enhance={submitting}>
							<input type="hidden" name="membershipId" value={person.membershipId} />
							<Button type="submit" variant="ghost" size="sm" disabled={busy}>Remove</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
