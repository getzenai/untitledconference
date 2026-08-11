<script lang="ts">
	/**
	 * Review rounds: make one, see what is happening in it, remove an unused one.
	 *
	 * Deliberately not a scorecard editor or a blinding console — anonymisation is
	 * one checkbox because the reviewer view already honours the flag, and every
	 * other knob on a round is future work.
	 */
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import EmptyState from '$lib/components/empty-state.svelte';

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

	const progress = (assignments: number, completed: number) => {
		if (assignments === 0) return 'Nobody assigned yet';
		return `${completed} of ${assignments} reviewed`;
	};
</script>

<svelte:head>
	<title>Review rounds — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<h1 class="text-lg font-semibold tracking-tight">Review rounds</h1>
	<p class="text-muted-foreground mt-0.5 text-sm">
		A submission is assigned to reviewers within a round. Make one before you assign.
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

	<section class="border-border bg-card max-w-2xl rounded-lg border p-4" data-testid="rounds-add">
		<h2 class="text-sm font-semibold">Add a round</h2>

		<form method="POST" action="?/add" use:enhance={submitting} class="mt-3 space-y-3">
			<label class="block">
				<span class="text-sm font-medium">Name</span>
				<input
					name="name"
					required
					maxlength="120"
					placeholder="Screening"
					class="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
				/>
			</label>

			<label class="flex items-start gap-2">
				<input name="anonymized" type="checkbox" class="mt-0.5" />
				<span class="text-sm">
					Hide author names from reviewers in this round
					<span class="text-muted-foreground block text-xs">
						Organizers still see who wrote what.
					</span>
				</span>
			</label>

			<Button type="submit" disabled={busy}>Add round</Button>
		</form>
	</section>

	<section class="mt-6 max-w-2xl" data-testid="rounds-list">
		<h2 class="text-sm font-medium">Rounds</h2>

		{#if data.rounds.length === 0}
			<EmptyState title="No rounds yet.">
				<p class="text-muted-foreground mt-1 text-sm">
					Until there is one, submissions cannot be assigned to reviewers.
				</p>
			</EmptyState>
		{:else}
			<ul class="divide-border border-border bg-card mt-3 divide-y rounded-lg border">
				{#each data.rounds as round (round.id)}
					<li class="px-4 py-3">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<!-- The name is a field, not a label: a round used to be write-once, and
							     its name is what reviewers navigate by and what the queue prints
							     beside a talk held in two rounds. Removing and re-adding is not the
							     same operation — that is refused once anyone is assigned. -->
							<form
								method="POST"
								action="?/rename"
								use:enhance={submitting}
								class="flex flex-1 flex-wrap items-center gap-2"
							>
								<input type="hidden" name="id" value={round.id} />
								<Input
									name="name"
									value={round.name}
									aria-label="Round name"
									class="h-8 min-w-[10rem] flex-1 text-sm"
									required
								/>
								<label class="text-muted-foreground flex items-center gap-2 text-xs">
									<input
										type="checkbox"
										name="anonymized"
										checked={round.anonymized}
										class="accent-primary size-4"
									/>
									Authors hidden
								</label>
								<Button type="submit" size="sm" variant="outline" disabled={busy}>Save</Button>
							</form>

							{#if round.assignments === 0}
								<form method="POST" action="?/remove" use:enhance={submitting}>
									<input type="hidden" name="id" value={round.id} />
									<Button type="submit" variant="ghost" disabled={busy}>Remove</Button>
								</form>
							{/if}
						</div>

						<p class="text-muted-foreground mt-1.5 text-sm">
							{progress(round.assignments, round.completed)}{#if round.anonymized}<span
									class="px-1.5">·</span
								>authors hidden{/if}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
