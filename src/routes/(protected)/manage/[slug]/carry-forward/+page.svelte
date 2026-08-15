<script lang="ts">
	/**
	 * Last year's declined talks, one row at a time (#448).
	 *
	 * The predecessor pointer is the door; this screen is the work. Two
	 * actions, both persistent: invite them onto this edition, or discard
	 * the row. The score and the committee comments sit on the line so the
	 * organizer does not have to open last year's pile to remember why.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { carryForwardDispositionLabel } from '$lib/conference/carry-forward';
	import { formatScore } from '$lib/conference/scoring';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';

	let { data, form } = $props();

	let busy = $state(false);
	const predecessor = $derived(data.lane.predecessor);

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

	const speakerLine = (speakers: { name: string }[]) =>
		speakers.length === 0 ? '—' : speakers.map((speaker) => speaker.name).join(', ');

	const commentsOnTheLine = (comments: string[], declineNote: string | null) => {
		const parts = [...comments];
		if (declineNote?.trim()) parts.push(declineNote.trim());
		return parts;
	};
</script>

<svelte:head>
	<title>Carry forward — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<h1 class="text-lg font-semibold tracking-tight">Carry forward</h1>
	<p class="text-muted-foreground mt-0.5 text-sm">
		{#if predecessor}
			Declined talks from {predecessor.name}, highest score first. Invite them onto this edition or
			discard the row.
		{:else}
			Last year’s declined talks, once this edition names the one it follows.
		{/if}
	</p>
</div>

<div class="px-6 py-5">
	{#if form?.message}
		<p
			class="border-status-bad text-status-bad mb-3 rounded-md border px-3 py-2 text-sm"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	{#if !predecessor}
		<EmptyState
			title="No previous edition set"
			description="This list is last year’s declined talks. Name the previous edition on the events list first — the field sits on each event card."
			action={{ href: '/manage', label: 'Set the previous edition' }}
		/>
	{:else if data.lane.rows.length === 0}
		<EmptyState
			title="Nothing to carry forward"
			description="{predecessor.name} has no declined talks. When that edition declines a near miss, it lands here."
			action={{
				href: `/manage/${predecessor.slug}/submissions`,
				label: `Open ${predecessor.name} submissions`
			}}
		/>
	{:else}
		<ul class="space-y-3" data-testid="carry-forward-list">
			{#each data.lane.rows as row (row.submissionId)}
				{@const comments = commentsOnTheLine(row.comments, row.declineNote)}
				<li
					class="border-border rounded-lg border p-4"
					data-testid="carry-forward-row"
					data-submission-id={row.submissionId}
				>
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
								<a
									href="/manage/{predecessor.slug}/submissions/{row.submissionId}"
									class="focus-visible:ring-ring font-medium hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
								>
									{row.title}
								</a>
								<span
									class="text-muted-foreground text-sm tabular-nums"
									data-testid="carry-forward-score"
								>
									{formatScore(row.score)}
								</span>
								{#if row.disposition}
									<StatusBadge
										status={row.disposition}
										tone={row.disposition === 'invited' ? 'progress' : 'bad'}
										label={carryForwardDispositionLabel(row.disposition)}
									/>
								{/if}
							</div>
							<p class="text-muted-foreground mt-1 text-sm">{speakerLine(row.speakers)}</p>
							{#if comments.length > 0}
								<p class="mt-2 text-sm whitespace-pre-wrap" data-testid="carry-forward-comments">
									{comments.join(' · ')}
								</p>
							{/if}
						</div>
						<div class="flex shrink-0 flex-wrap gap-2">
							<form method="POST" action="?/invite" use:enhance={submitting}>
								<input type="hidden" name="submissionId" value={row.submissionId} />
								<Button
									type="submit"
									size="sm"
									disabled={busy || row.disposition === 'invited'}
									data-testid="carry-forward-invite"
								>
									Invite
								</Button>
							</form>
							<form method="POST" action="?/discard" use:enhance={submitting}>
								<input type="hidden" name="submissionId" value={row.submissionId} />
								<Button
									type="submit"
									variant="outline"
									size="sm"
									disabled={busy || row.disposition === 'discarded'}
									data-testid="carry-forward-discard"
								>
									Discard
								</Button>
							</form>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
