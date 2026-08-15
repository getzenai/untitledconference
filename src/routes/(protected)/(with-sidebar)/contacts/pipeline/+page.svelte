<script lang="ts">
	/**
	 * Speaker sourcing kanban (CRM-07) with card detail notes + stage history (CRM-08).
	 */
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { PIPELINE_STAGE_LABELS, type PipelineStage } from '$lib/conference/pipeline-stages';

	let { data, form } = $props();

	const stages = $derived(data.stages as PipelineStage[]);
	const board = $derived(
		data.board as Record<
			PipelineStage,
			Array<{
				id: number;
				name: string;
				email: string | null;
				company: string | null;
				jobTitle: string | null;
				stage: PipelineStage;
				score: number | null;
			}>
		>
	);

	const enrollOptions = $derived([
		{ value: '', label: 'Choose a contact…' },
		...data.enrollable.map((c: { id: number; name: string; email: string | null }) => ({
			value: String(c.id),
			label: c.email ? `${c.name} (${c.email})` : c.name
		}))
	]);

	const stageMoveOptions = $derived(
		stages.map((s) => ({ value: s, label: PIPELINE_STAGE_LABELS[s] }))
	);

	const enrollStageOptions = $derived([
		{ value: 'identified', label: PIPELINE_STAGE_LABELS.identified },
		{ value: 'researching', label: PIPELINE_STAGE_LABELS.researching },
		{ value: 'contacted', label: PIPELINE_STAGE_LABELS.contacted },
		{ value: 'interested', label: PIPELINE_STAGE_LABELS.interested }
	]);

	function formatStamp(value: Date | string): string {
		const d = typeof value === 'string' ? new Date(value) : value;
		return d.toLocaleString('en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	let busy = $state(false);
	const submitting = () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions('edit'));
			} finally {
				busy = false;
			}
		};
	};

	const submittingAdd = () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions('add'));
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:head>
	<title>Pipeline — Speaker CRM</title>
</svelte:head>

<div class="space-y-6" data-testid="pipeline-page">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="text-muted-foreground text-xs">
				<a href="/contacts" class="hover:underline">Contacts</a>
				<span aria-hidden="true"> / </span>
				<span>Pipeline</span>
			</p>
			<h1 class="text-lg font-semibold tracking-tight" data-testid="pipeline-heading">
				Sourcing pipeline
			</h1>
			<p class="text-muted-foreground mt-0.5 text-sm">
				Track prospects from research through confirmed or declined. Moves persist across reload.
			</p>
		</div>
		<Button href="/contacts" size="sm" variant="secondary">Back to directory</Button>
	</div>

	{#if !data.canManage}
		<p
			class="border-border bg-card text-muted-foreground max-w-2xl rounded-lg border px-4 py-3 text-sm"
			data-testid="pipeline-empty-org"
		>
			You need to own or administer an organization to use the pipeline.
		</p>
	{:else}
		{#if form?.error}
			<p
				class="border-status-bad text-status-bad max-w-2xl rounded-md border px-3 py-2 text-sm"
				role="alert"
				data-testid="pipeline-error"
			>
				{form.error}
			</p>
		{/if}

		<!-- Enroll (CRM-07) -->
		<section
			class="border-border bg-card max-w-3xl rounded-lg border p-4"
			data-testid="pipeline-enroll"
		>
			<h2 class="text-sm font-semibold">Enroll a contact</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				They show up on this board. You can still find them in the directory.
			</p>
			<form
				method="POST"
				action="?/enroll"
				use:enhance={submitting}
				class="mt-3 grid gap-3 sm:grid-cols-2"
			>
				<div class="sm:col-span-2">
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="enroll-contact">
						Contact
					</label>
					<AppSelect
						id="enroll-contact"
						name="speakerProfileId"
						class="w-full"
						testId="pipeline-enroll-contact"
						value=""
						options={enrollOptions}
						required
					/>
				</div>
				<div>
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="enroll-stage">
						Starting stage
					</label>
					<AppSelect
						id="enroll-stage"
						name="stage"
						class="w-full"
						testId="pipeline-enroll-stage"
						value="identified"
						options={enrollStageOptions}
					/>
				</div>
				<div>
					<label class="text-muted-foreground mb-1 block text-xs font-medium" for="enroll-score">
						Score (optional)
					</label>
					<Input
						id="enroll-score"
						name="score"
						type="number"
						min="0"
						max="100"
						placeholder="85"
						data-testid="pipeline-enroll-score"
					/>
				</div>
				<div class="sm:col-span-2">
					<label
						class="text-muted-foreground mb-1 block text-xs font-medium"
						for="enroll-rationale"
					>
						Rationale (optional)
					</label>
					<Input
						id="enroll-rationale"
						name="rationale"
						placeholder="Why this prospect?"
						data-testid="pipeline-enroll-rationale"
					/>
				</div>
				<div class="sm:col-span-2">
					<Button type="submit" size="sm" disabled={busy} data-testid="pipeline-enroll-submit">
						Enroll
					</Button>
				</div>
			</form>
		</section>

		<!-- Kanban board (CRM-07) -->
		<section class="overflow-x-auto pb-2" aria-label="Pipeline board" data-testid="pipeline-board">
			<div class="flex min-w-max gap-3">
				{#each stages as stage (stage)}
					<div
						class="border-border bg-muted/20 flex w-56 shrink-0 flex-col rounded-lg border"
						data-testid="pipeline-column"
						data-stage={stage}
					>
						<div class="border-border flex items-center justify-between border-b px-3 py-2">
							<h2 class="text-xs font-semibold tracking-wide uppercase">
								{PIPELINE_STAGE_LABELS[stage]}
							</h2>
							<span class="text-muted-foreground text-xs tabular-nums">
								{board[stage]?.length ?? 0}
							</span>
						</div>
						<ul class="flex flex-1 flex-col gap-2 p-2">
							{#each board[stage] ?? [] as card (card.id)}
								<li>
									<a
										href="/contacts/pipeline?card={card.id}"
										class="border-border bg-card hover:border-primary block rounded-md border p-2 text-sm shadow-sm transition-colors"
										data-testid="pipeline-card"
										data-card-id={card.id}
										data-stage={card.stage}
									>
										<p class="leading-snug font-medium">{card.name}</p>
										{#if card.company || card.jobTitle}
											<p class="text-muted-foreground mt-0.5 truncate text-xs">
												{[card.jobTitle, card.company].filter(Boolean).join(' · ')}
											</p>
										{/if}
										{#if card.score != null}
											<p class="text-muted-foreground mt-1 text-xs tabular-nums">
												Score {card.score}
											</p>
										{/if}
									</a>
								</li>
							{:else}
								<li class="text-muted-foreground px-1 py-4 text-center text-xs">Empty</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</section>

		<!-- Card detail: notes + history (CRM-08) -->
		{#if data.selected}
			{@const selected = data.selected}
			<section
				class="border-border bg-card grid max-w-3xl gap-4 rounded-lg border p-4 md:grid-cols-2"
				data-testid="pipeline-card-detail"
			>
				<div class="space-y-3 md:col-span-2">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div>
							<h2 class="text-sm font-semibold" data-testid="pipeline-detail-name">
								{selected.name}
							</h2>
							<p class="text-muted-foreground text-xs">
								{PIPELINE_STAGE_LABELS[selected.stage as PipelineStage]}
								{#if selected.email}
									· {selected.email}
								{/if}
								{#if selected.company}
									· {selected.company}
								{/if}
							</p>
						</div>
						<a
							href="/contacts/{selected.speakerProfileId}"
							class="text-muted-foreground text-xs underline-offset-2 hover:underline"
						>
							Open directory profile
						</a>
					</div>

					<form
						method="POST"
						action="?/move"
						use:enhance={submitting}
						class="flex flex-wrap items-end gap-2"
						data-testid="pipeline-move-form"
					>
						<input type="hidden" name="cardId" value={selected.id} />
						<div>
							<label class="text-muted-foreground mb-1 block text-xs font-medium" for="move-stage">
								Move to
							</label>
							<AppSelect
								id="move-stage"
								name="toStage"
								class="w-44"
								testId="pipeline-move-stage"
								value={selected.stage}
								options={stageMoveOptions}
							/>
						</div>
						<Button type="submit" size="sm" disabled={busy} data-testid="pipeline-move-submit">
							Move
						</Button>
					</form>
				</div>

				<div>
					<h3 class="text-xs font-semibold tracking-wide uppercase">Notes</h3>
					<form method="POST" action="?/note" use:enhance={submittingAdd} class="mt-2 space-y-2">
						<input type="hidden" name="cardId" value={selected.id} />
						<textarea
							name="notes"
							rows="5"
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							data-testid="pipeline-notes">{selected.notes ?? ''}</textarea
						>
						<Button
							type="submit"
							size="sm"
							variant="secondary"
							disabled={busy}
							data-testid="pipeline-notes-save"
						>
							Save note
						</Button>
					</form>
				</div>

				<div>
					<h3 class="text-xs font-semibold tracking-wide uppercase">Stage history</h3>
					<ol class="mt-2 space-y-2" data-testid="pipeline-stage-history">
						{#each selected.history as entry (entry.id)}
							<li
								class="border-border rounded-md border px-2 py-1.5 text-xs"
								data-testid="pipeline-history-entry"
							>
								<p class="font-medium">
									{#if entry.fromStage}
										{PIPELINE_STAGE_LABELS[entry.fromStage as PipelineStage]}
										→
										{PIPELINE_STAGE_LABELS[entry.toStage as PipelineStage]}
									{:else}
										Enrolled as {PIPELINE_STAGE_LABELS[entry.toStage as PipelineStage]}
									{/if}
								</p>
								<p class="text-muted-foreground tabular-nums" data-testid="pipeline-history-stamp">
									{formatStamp(entry.changedAt)}
								</p>
							</li>
						{:else}
							<li class="text-muted-foreground text-xs">No stage changes yet.</li>
						{/each}
					</ol>
				</div>
			</section>
		{:else}
			<p class="text-muted-foreground text-sm" data-testid="pipeline-detail-hint">
				Select a card on the board to open notes and stage history.
			</p>
		{/if}
	{/if}
</div>
