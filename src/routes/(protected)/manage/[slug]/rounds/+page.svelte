<script lang="ts">
	/**
	 * Review rounds: make one, say when it runs, see what is happening in it,
	 * remove an unused one.
	 *
	 * Deliberately not a scorecard editor — anonymisation is one checkbox because
	 * the reviewer view already honours the flag, and a per-round scorecard is a
	 * different job than a round's own dates.
	 */
	import { enhance } from '$app/forms';
	import DateTimePicker from '$lib/components/app/datetime-picker.svelte';
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

	/**
	 * The picker posts local wall time; only the browser knows which zone that was
	 * typed in, so it becomes an ISO instant here. Same conversion the call for
	 * papers does on its own window.
	 */
	const saveRound = ({ formData }: { formData: FormData }) => {
		for (const name of ['opensAt', 'closesAt']) {
			const raw = formData.get(name);
			if (typeof raw === 'string' && raw) formData.set(name, new Date(raw).toISOString());
		}
		return submitting();
	};

	/** What the picker reads back: local wall time, no zone suffix. */
	const localInput = (value: Date | string | null) => {
		if (!value) return '';
		const date = new Date(value);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	};

	const stamp = (value: Date | string) =>
		new Date(value).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	/** The window in one phrase, so a saved date is visible without opening a picker. */
	const window_ = (opensAt: Date | null, closesAt: Date | null) => {
		if (opensAt && closesAt) return `${stamp(opensAt)} – ${stamp(closesAt)}`;
		if (opensAt) return `opens ${stamp(opensAt)}`;
		if (closesAt) return `closes ${stamp(closesAt)}`;
		return 'no dates set';
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

		<form method="POST" action="?/add" use:enhance={saveRound} class="mt-3 space-y-3">
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

			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class="text-sm font-medium" for="round-opens-at">Opens</label>
					<DateTimePicker
						id="round-opens-at"
						name="opensAt"
						placeholder="No opening date"
						class="mt-1"
					/>
				</div>
				<div>
					<label class="text-sm font-medium" for="round-closes-at">Closes</label>
					<DateTimePicker
						id="round-closes-at"
						name="closesAt"
						placeholder="No closing date"
						class="mt-1"
					/>
				</div>
				<p class="text-muted-foreground text-xs sm:col-span-2">
					The window the committee works in. It is what reviewers and organizers read; it does not
					lock anyone out of a review already assigned to them.
				</p>
			</div>

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
					<li class="px-4 py-3" data-testid="round-row" data-round-id={round.id}>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<!-- The name is a field, not a label: a round used to be write-once, and
							     its name is what reviewers navigate by and what the queue prints
							     beside a talk held in two rounds. Removing and re-adding is not the
							     same operation — that is refused once anyone is assigned. The dates
							     save on the same form, so one Save covers the whole round. -->
							<form
								method="POST"
								action="?/rename"
								use:enhance={saveRound}
								class="flex flex-1 flex-col gap-2"
							>
								<input type="hidden" name="id" value={round.id} />
								<div class="flex flex-wrap items-center gap-2">
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
								</div>
								<div class="grid gap-2 sm:grid-cols-2">
									<DateTimePicker
										name="opensAt"
										id="round-{round.id}-opens-at"
										value={localInput(round.opensAt)}
										placeholder="No opening date"
										size="sm"
										aria-label="Round opens"
									/>
									<DateTimePicker
										name="closesAt"
										id="round-{round.id}-closes-at"
										value={localInput(round.closesAt)}
										placeholder="No closing date"
										size="sm"
										aria-label="Round closes"
									/>
								</div>
							</form>

							{#if round.assignments === 0}
								<form method="POST" action="?/remove" use:enhance={submitting}>
									<input type="hidden" name="id" value={round.id} />
									<Button type="submit" variant="ghost" disabled={busy}>Remove</Button>
								</form>
							{/if}
						</div>

						<p class="text-muted-foreground mt-1.5 text-sm" data-testid="round-summary">
							{progress(round.assignments, round.completed)}<span class="px-1.5">·</span>{window_(
								round.opensAt,
								round.closesAt
							)}{#if round.anonymized}<span class="px-1.5">·</span>authors hidden{/if}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
