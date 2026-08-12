<script lang="ts">
	/**
	 * Review rounds: dates (ABS-01), and the scorecard each one carries (ABS-03, ABS-04).
	 *
	 * A round without criteria is assignable but not scoreable. The weighted
	 * aggregate already reads `weight`; this page is where an organizer types a
	 * weight other than 1. Kind-specific fields only appear for the kind that
	 * uses them — scaleMax for rating, options for select — so the wrong shape
	 * never posts.
	 */
	import { enhance } from '$app/forms';
	import DateTimePicker from '$lib/components/app/datetime-picker.svelte';
	import { optionsToText, type CriterionKind } from '$lib/conference/scorecard-criterion';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();

	let busy = $state(false);
	/** Which round's "add criterion" form is showing a non-default kind. */
	let addKindByRound = $state<Record<number, CriterionKind>>({});
	/** Editing state for an existing criterion's kind (drives conditional fields). */
	let editKindById = $state<Record<number, CriterionKind>>({});

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

	const kindLabel = (kind: CriterionKind) =>
		kind === 'rating' ? 'Rating' : kind === 'select' ? 'Select' : 'Text';

	const addKind = (roundId: number): CriterionKind => addKindByRound[roundId] ?? 'rating';

	const editKind = (id: number, fallback: CriterionKind): CriterionKind =>
		editKindById[id] ?? fallback;
</script>

<svelte:head>
	<title>Review rounds — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<h1 class="text-lg font-semibold tracking-tight">Review rounds</h1>
	<p class="text-muted-foreground mt-0.5 text-sm">
		A submission is assigned to reviewers within a round. Set the window, then build the scorecard —
		criteria, types, and weights.
	</p>
</div>

<div class="px-6 py-5">
	{#if form?.message}
		<p
			class="border-status-good text-status-good mb-3 max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="rounds-feedback"
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
			<ul class="mt-3 space-y-4">
				{#each data.rounds as round (round.id)}
					{@const criteria = data.criteriaByRound[round.id] ?? []}
					<li
						class="border-border bg-card rounded-lg border px-4 py-3"
						data-testid="round-row"
						data-round-id={round.id}
					>
						<div class="flex flex-wrap items-start justify-between gap-3">
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

						<!-- Scorecard for this round (ABS-03 / ABS-04). -->
						<div class="border-border mt-4 border-t pt-3" data-testid="scorecard-{round.id}">
							<h3 class="text-sm font-semibold">Scorecard</h3>
							<p class="text-muted-foreground mt-0.5 text-xs">
								Reviewers fill these in order. Weight changes the submission average — a criterion
								at 3 pulls three times as hard as one at 1.
							</p>

							{#if criteria.length === 0}
								<p class="text-muted-foreground mt-2 text-sm" data-testid="scorecard-empty">
									No criteria yet. Add a rating, a select, or a free-text question.
								</p>
							{:else}
								<ul class="mt-3 space-y-3" data-testid="criteria-list">
									{#each criteria as criterion, index (criterion.id)}
										<li
											class="border-border bg-muted/30 rounded-md border p-3"
											data-testid="criterion-row"
											data-criterion-id={criterion.id}
										>
											<form
												method="POST"
												action="?/updateCriterion"
												use:enhance={submitting}
												class="space-y-2"
											>
												<input type="hidden" name="id" value={criterion.id} />
												<div class="flex flex-wrap items-end gap-2">
													<label class="min-w-[10rem] flex-1">
														<span class="text-muted-foreground text-xs font-medium">Label</span>
														<input
															name="label"
															value={criterion.label}
															required
															maxlength="200"
															class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
														/>
													</label>
													<label class="w-28">
														<span class="text-muted-foreground text-xs font-medium">Type</span>
														<select
															name="kind"
															class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
															value={editKind(criterion.id, criterion.kind)}
															onchange={(e) => {
																editKindById[criterion.id] = e.currentTarget.value as CriterionKind;
															}}
														>
															<option value="rating">Rating</option>
															<option value="select">Select</option>
															<option value="text">Text</option>
														</select>
													</label>
													<label class="w-20">
														<span class="text-muted-foreground text-xs font-medium">Weight</span>
														<input
															name="weight"
															type="number"
															min="0.01"
															max="100"
															step="0.01"
															value={criterion.weight}
															required
															class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
															data-testid="criterion-weight"
														/>
													</label>
												</div>

												{#if editKind(criterion.id, criterion.kind) === 'rating'}
													<label class="block w-28">
														<span class="text-muted-foreground text-xs font-medium">Scale max</span>
														<input
															name="scaleMax"
															type="number"
															min="2"
															max="10"
															step="1"
															value={criterion.scaleMax ?? 5}
															required
															class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
															data-testid="criterion-scale-max"
														/>
													</label>
												{:else if editKind(criterion.id, criterion.kind) === 'select'}
													<label class="block">
														<span class="text-muted-foreground text-xs font-medium"
															>Options (one per line)</span
														>
														<textarea
															name="options"
															rows="3"
															required
															class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
															data-testid="criterion-options"
															>{optionsToText(criterion.options)}</textarea
														>
													</label>
												{/if}

												<div class="flex flex-wrap items-center gap-2">
													<Button type="submit" size="sm" variant="outline" disabled={busy}
														>Save criterion</Button
													>
													<span class="text-muted-foreground text-xs"
														>{kindLabel(criterion.kind)} · position {index + 1}</span
													>
												</div>
											</form>

											<div class="mt-2 flex flex-wrap gap-1">
												<form method="POST" action="?/moveCriterion" use:enhance={submitting}>
													<input type="hidden" name="id" value={criterion.id} />
													<input type="hidden" name="direction" value="up" />
													<Button
														type="submit"
														size="sm"
														variant="ghost"
														disabled={busy || index === 0}
														data-testid="criterion-move-up"
													>
														Up
													</Button>
												</form>
												<form method="POST" action="?/moveCriterion" use:enhance={submitting}>
													<input type="hidden" name="id" value={criterion.id} />
													<input type="hidden" name="direction" value="down" />
													<Button
														type="submit"
														size="sm"
														variant="ghost"
														disabled={busy || index === criteria.length - 1}
														data-testid="criterion-move-down"
													>
														Down
													</Button>
												</form>
												<form method="POST" action="?/removeCriterion" use:enhance={submitting}>
													<input type="hidden" name="id" value={criterion.id} />
													<Button
														type="submit"
														size="sm"
														variant="ghost"
														disabled={busy || criterion.scoreCount > 0}
														title={criterion.scoreCount > 0
															? `${criterion.scoreCount} review score${criterion.scoreCount === 1 ? '' : 's'} hang on this criterion`
															: 'Remove criterion'}
														data-testid="criterion-remove"
													>
														{#if criterion.scoreCount > 0}
															{criterion.scoreCount} score{criterion.scoreCount === 1 ? '' : 's'} — locked
														{:else}
															Remove
														{/if}
													</Button>
												</form>
											</div>
										</li>
									{/each}
								</ul>
							{/if}

							<form
								method="POST"
								action="?/addCriterion"
								use:enhance={submitting}
								class="border-border mt-3 space-y-2 rounded-md border border-dashed p-3"
								data-testid="add-criterion"
							>
								<input type="hidden" name="roundId" value={round.id} />
								<p class="text-sm font-medium">Add criterion</p>
								<div class="flex flex-wrap items-end gap-2">
									<label class="min-w-[10rem] flex-1">
										<span class="text-muted-foreground text-xs font-medium">Label</span>
										<input
											name="label"
											required
											maxlength="200"
											placeholder="Relevance"
											class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
											data-testid="add-criterion-label"
										/>
									</label>
									<label class="w-28">
										<span class="text-muted-foreground text-xs font-medium">Type</span>
										<select
											name="kind"
											class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
											data-testid="add-criterion-kind"
											value={addKind(round.id)}
											onchange={(e) => {
												addKindByRound[round.id] = e.currentTarget.value as CriterionKind;
											}}
										>
											<option value="rating">Rating</option>
											<option value="select">Select</option>
											<option value="text">Text</option>
										</select>
									</label>
									<label class="w-20">
										<span class="text-muted-foreground text-xs font-medium">Weight</span>
										<input
											name="weight"
											type="number"
											min="0.01"
											max="100"
											step="0.01"
											value="1"
											required
											class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
											data-testid="add-criterion-weight"
										/>
									</label>
								</div>

								{#if addKind(round.id) === 'rating'}
									<label class="block w-28">
										<span class="text-muted-foreground text-xs font-medium">Scale max</span>
										<input
											name="scaleMax"
											type="number"
											min="2"
											max="10"
											step="1"
											value="5"
											required
											class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
											data-testid="add-criterion-scale-max"
										/>
									</label>
								{:else if addKind(round.id) === 'select'}
									<label class="block">
										<span class="text-muted-foreground text-xs font-medium"
											>Options (one per line)</span
										>
										<textarea
											name="options"
											rows="3"
											required
											placeholder="Strong yes, Maybe, No"
											class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm"
											data-testid="add-criterion-options"
										></textarea>
									</label>
								{/if}

								<Button type="submit" size="sm" disabled={busy} data-testid="add-criterion-submit"
									>Add criterion</Button
								>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
