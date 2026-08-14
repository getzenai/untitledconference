<script lang="ts">
	/**
	 * Team & reviewers — committee settings that are not conference structure.
	 *
	 * Reviewer visibility used to sit alone on Settings (#63). The full people
	 * roster is still to come; this is the right place for the mode already.
	 */
	import { enhance } from '$app/forms';
	import { formUpdateOptions, type FormResetKind } from '$lib/conference/form-reset';
	import { REVIEW_VISIBILITY_MODES } from '$lib/conference/review-visibility';
	import { Button } from '$lib/components/ui/button';

	let { data, form } = $props();

	let busy = $state(false);

	const submitting = (kind: FormResetKind) => () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions(kind));
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:head>
	<title>Reviewer pool — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<h1 class="text-lg font-semibold tracking-tight">Reviewer pool</h1>
	<p class="text-muted-foreground mt-0.5 text-sm">
		Invite the committee, limit who reviews each track, and follow their assignments. Scorecards and
		weights for each round live under
		<a class="underline underline-offset-4" href="/manage/{data.conference.slug}/rounds"
			>Rounds &amp; scorecards</a
		>.
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
	{#if form?.invitationLink}
		<div class="border-border bg-muted mb-3 max-w-2xl rounded-md border p-3 text-sm">
			<p class="font-medium">Share this reviewer invitation link</p>
			<div class="mt-2 flex gap-2">
				<input
					readonly
					value={form.invitationLink}
					aria-label="Reviewer invitation link"
					class="border-input bg-background min-w-0 flex-1 rounded-md border px-3 py-2 font-mono text-xs"
				/>
			</div>
		</div>
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

		<form
			method="POST"
			action="?/reviewVisibility"
			use:enhance={submitting('edit')}
			class="mt-3 space-y-3"
		>
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
			Existing users join immediately. New users get a shareable invite and join this committee when
			they accept it.
		</p>

		<form
			method="POST"
			action="?/addReviewer"
			use:enhance={submitting('add')}
			class="mt-3 flex gap-2"
		>
			<input
				name="email"
				type="email"
				required
				placeholder="reviewer@example.com"
				class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
			/>
			<Button type="submit" size="sm" disabled={busy}>Add or invite</Button>
		</form>

		{#if data.pendingInvitations.length > 0}
			<div class="border-border mt-4 border-t pt-3" data-testid="pending-reviewer-invitations">
				<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Pending</p>
				<ul class="mt-1 space-y-1 text-sm">
					{#each data.pendingInvitations as invite (invite.id)}
						<li class="flex flex-wrap items-center justify-between gap-2">
							<span>{invite.email}</span>
							<a class="text-xs underline underline-offset-4" href={`/invite/${invite.id}`}
								>Open invite</a
							>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if data.committee.length === 0}
			<p class="text-muted-foreground mt-3 text-sm">
				Nobody yet — submissions cannot be assigned until someone is here.
			</p>
		{:else}
			<ul class="mt-3 space-y-3">
				{#each data.committee as person (person.userId)}
					<li class="border-border rounded-md border p-3">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p class="text-sm font-medium">{person.name}</p>
								<p class="text-muted-foreground text-xs">{person.email}</p>
								<p class="text-muted-foreground mt-1 text-xs">
									{person.conferenceManaged
										? 'Conference reviewer'
										: `Round reviewer · ${person.rounds.join(', ')}`} ·
									<span>{person.submitted}/{person.assigned} submitted</span>
									{#if person.outstanding > 0}· {person.outstanding} outstanding{/if}
								</p>
							</div>
							{#if person.conferenceManaged}
								<form method="POST" action="?/removeReviewer" use:enhance={submitting('edit')}>
									<input type="hidden" name="membershipId" value={person.membershipId} />
									<Button type="submit" variant="ghost" size="sm" disabled={busy}>Remove</Button>
								</form>
							{/if}
						</div>

						{#if data.tracks.length > 0 && person.conferenceManaged}
							<form
								method="POST"
								action="?/updateTracks"
								use:enhance={submitting('edit')}
								class="border-border mt-3 border-t pt-3"
							>
								<input type="hidden" name="membershipId" value={person.membershipId} />
								<p class="text-xs font-medium">Track access</p>
								<label class="mt-2 flex items-center gap-2 text-xs">
									<input
										type="radio"
										name="trackMode"
										value="all"
										checked={person.trackIds.length === 0}
									/>
									All tracks
								</label>
								<label class="mt-2 flex items-center gap-2 text-xs">
									<input
										type="radio"
										name="trackMode"
										value="selected"
										checked={person.trackIds.length > 0}
									/>
									Only selected tracks
								</label>
								<div class="mt-2 flex flex-wrap gap-x-4 gap-y-2 pl-6">
									{#each data.tracks as track (track.id)}
										<label class="flex items-center gap-2 text-xs">
											<input
												type="checkbox"
												name="trackId"
												value={track.id}
												checked={person.trackIds.includes(track.id)}
											/>
											{track.name}
										</label>
									{/each}
								</div>
								<div class="mt-3 flex items-center justify-between gap-3">
									<p class="text-muted-foreground text-xs">
										No stored restriction means access to every track.
									</p>
									<Button type="submit" variant="outline" size="sm" disabled={busy}
										>Save access</Button
									>
								</div>
							</form>
						{:else if !person.conferenceManaged}
							<p class="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
								This reviewer’s access is managed by their review rounds.
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<p class="text-muted-foreground mt-4 text-xs">
			Assignments are made on each
			<a class="underline underline-offset-4" href={`/manage/${data.conference.slug}/submissions`}
				>submission</a
			>. The counts above show who still has work outstanding.
		</p>
	</section>
</div>
