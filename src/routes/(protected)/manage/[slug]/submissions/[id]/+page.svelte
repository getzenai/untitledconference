<script lang="ts">
	/**
	 * Journey 2, step 6 — and Ü4.
	 *
	 * Abstract and reviews on ONE screen. The organizer decides with an eye movement,
	 * not a navigation: if the scores sit behind a tab, every decision costs a page
	 * load and the "submissions per hour" measure collapses.
	 *
	 * The right-hand column carries what only this role may see (sponsor tier, R6)
	 * and what the button is about to set off (R3).
	 */
	import { enhance } from '$lib/forms/enhance';
	import { clearBrowserDraft } from '$lib/forms/browser-draft';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { talkContentDraftScope } from '$lib/conference/talk-content-draft';
	import {
		decisionBlockReason,
		describeDecision,
		describeNotification,
		notificationTone
	} from '$lib/conference/decision-summary';
	import { draftDeleteWarning } from '$lib/conference/draft-delete-warning';
	import { assignBlockReason } from '$lib/conference/review-assignment';
	import {
		applyAssignmentWrites,
		assignmentWriteFromForm,
		type AssignmentWrite
	} from '$lib/conference/reviewer-assignment-optimistic';
	import { formatScore } from '$lib/conference/scoring';
	import {
		EDITORIAL_STANDS,
		EDITORIAL_STAND_LABELS,
		nextEditorialStand
	} from '$lib/conference/editorial-stand';
	import {
		applyTalkStand,
		standWriteFromForm,
		type StandWrite
	} from '$lib/conference/editorial-stand-optimistic';
	import { actionErrorCopy } from '$lib/forms/keep-page-on-action-error';
	import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import AnswerText from '$lib/components/app/conference/answer-text.svelte';
	import SpeakerHistoryPanel from '$lib/components/app/conference/speaker-history.svelte';
	import TalkContentDraft from '$lib/components/app/conference/talk-content-draft.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import {
		AlertDialog,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const s = $derived(data.submission);

	let busy = $state(false);
	let confirmDelete = $state(false);
	const deleteWarning = $derived(draftDeleteWarning('organizer'));

	/**
	 * In-flight assignment writes sit on top of the last server list. Dropping
	 * one is the rollback — the row is back where the server left it.
	 */
	type QueuedAssignment = AssignmentWrite & { token: number };
	let assignmentWrites = $state<QueuedAssignment[]>([]);
	let assignmentWriteToken = 0;
	let assignmentWriteError = $state<string | null>(null);
	const assignmentRounds = $derived(applyAssignmentWrites(data.assignmentRounds, assignmentWrites));

	/**
	 * In-flight stand advances sit on top of the last server stand. Dropping
	 * one is the rollback — the badge is back where the server left it.
	 * Advance does not take the page-wide `busy` lock.
	 *
	 * One request flies for this talk. A second click paints immediately and
	 * waits; when the answer lands, that write is sent against the server
	 * stand we now have. Locking the button is not enough — badge, select
	 * and Advance share the page.
	 */
	type QueuedStand = StandWrite & { token: number };
	let standWrites = $state<QueuedStand[]>([]);
	let standWriteToken = 0;
	let standWriteError = $state<string | null>(null);
	let standWireBusy = false;
	let standWireForm = $state<HTMLFormElement | undefined>(undefined);
	const paintedStand = $derived(applyTalkStand(s.editorialStand, s.id, standWrites));

	const assignmentFailureMessage = (result: ActionResult): string => {
		if (result.type === 'failure') {
			const message = (result.data as { assignmentMessage?: unknown } | undefined)
				?.assignmentMessage;
			if (typeof message === 'string' && message.length > 0) return message;
			return 'That change could not be saved.';
		}
		if (result.type === 'error') return actionErrorCopy(result);
		return 'That change could not be saved.';
	};

	const submittingAssignment: SubmitFunction = ({ formData }) => {
		const write = assignmentWriteFromForm(formData);
		const queued = write ? { ...write, token: ++assignmentWriteToken } : null;
		if (queued) assignmentWrites = [...assignmentWrites, queued];
		assignmentWriteError = null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				await update(formUpdateOptions('edit'));
				if (queued) {
					assignmentWrites = assignmentWrites.filter((item) => item.token !== queued.token);
				}
				return;
			}
			if (queued) {
				assignmentWrites = assignmentWrites.filter((item) => item.token !== queued.token);
			}
			assignmentWriteError = assignmentFailureMessage(result);
			if (result.type === 'failure') await update(formUpdateOptions('edit'));
		};
	};

	const standFailureMessage = (result: ActionResult): string => {
		if (result.type === 'failure') {
			const message = (result.data as { standMessage?: unknown } | undefined)?.standMessage;
			if (typeof message === 'string' && message.length > 0) return message;
			return 'That change could not be saved.';
		}
		if (result.type === 'error') return actionErrorCopy(result);
		return 'That change could not be saved.';
	};

	const settleStand =
		(queued: QueuedStand | null) =>
		async ({
			result,
			update
		}: {
			result: ActionResult;
			update: (opts?: { reset?: boolean }) => Promise<void>;
		}) => {
			try {
				if (result.type === 'success') {
					await update(formUpdateOptions('edit'));
				} else {
					standWriteError = standFailureMessage(result);
					if (result.type === 'failure') await update(formUpdateOptions('edit'));
				}
			} finally {
				if (queued) standWrites = standWrites.filter((item) => item.token !== queued.token);
				standWireBusy = false;
				sendNextStand();
			}
		};

	function sendNextStand(): void {
		const next = standWrites[0];
		if (!next || !standWireForm || standWireBusy) return;
		standWireBusy = true;
		const id = standWireForm.elements.namedItem('id');
		if (!(id instanceof HTMLInputElement)) {
			standWireBusy = false;
			return;
		}
		id.value = String(next.submissionId);
		standWireForm.requestSubmit();
	}

	const submittingStand: SubmitFunction = ({ formData, cancel }) => {
		const write = standWriteFromForm(formData);
		const queued = write ? { ...write, token: ++standWriteToken } : null;
		if (queued) standWrites = [...standWrites, queued];
		standWriteError = null;
		if (standWireBusy) {
			cancel();
			return;
		}
		standWireBusy = true;
		return settleStand(queued);
	};

	const submittingStandWire: SubmitFunction = () => settleStand(standWrites[0] ?? null);

	/**
	 * Open when the last save was refused, so a rejected edit is still on screen to
	 * correct rather than thrown away behind a closed panel.
	 *
	 * Reading `form` once, at mount, is the point and not an oversight: with JS the
	 * panel is already open when the refusal arrives, and without it the page mounts
	 * fresh with the errors in hand. A derived value would instead re-open the panel
	 * the moment Cancel closed it, since the failed `form` is still there.
	 */
	// svelte-ignore state_referenced_locally
	let editing = $state(!!form?.contentErrors);

	const savedTalk = $derived({
		title: s.title,
		abstract: s.abstract ?? '',
		keyTakeaway: s.keyTakeaway ?? '',
		audienceLevel: s.audienceLevel ?? ''
	});
	const refusedTalk = $derived(
		form?.contentValues
			? {
					title: form.contentValues.title ?? s.title,
					abstract: form.contentValues.abstract ?? '',
					keyTakeaway: form.contentValues.keyTakeaway ?? '',
					audienceLevel: form.contentValues.audienceLevel ?? ''
				}
			: null
	);

	const stamp = (value: Date | string | null) =>
		value
			? new Date(value).toLocaleDateString('en-GB', {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				})
			: null;

	/**
	 * A boolean answer is stored as the string the form's dropdown posted, so printing
	 * it raw puts "false" on the organizer's screen where the submitter chose "No".
	 */
	const answerValue = (answer: { kind: string; value: string | null }) => {
		if (answer.value === null || answer.value === '') return '—';
		if (answer.kind !== 'boolean') return answer.value;
		return answer.value === 'true' ? 'Yes' : 'No';
	};

	const subtitle = $derived(
		[
			s.speakers.map((sp) => sp.name).join(', ') || null,
			s.track,
			s.sessionFormat
				? `${s.sessionFormat}${s.sessionMinutes ? ` (${s.sessionMinutes} min)` : ''}`
				: null,
			stamp(s.submittedAt) ? `submitted ${stamp(s.submittedAt)}` : null
		]
			.filter(Boolean)
			.join(' · ')
	);

	const initials = (name: string) =>
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('');

	const decided = $derived(
		s.status === 'accepted' ||
			s.status === 'rejected' ||
			s.status === 'waitlisted' ||
			s.status === 'resubmit_with_guidance'
	);
	const cannotDecide = $derived(decisionBlockReason(s.status));
	const hideDecisions = $derived(s.status === 'withdrawn');
	const cannotAssign = $derived(Boolean(assignBlockReason(s.status)));
	const inTray = $derived(s.placements.length > 0);
	const notificationLabel = $derived(
		data.notificationStatus === 'queued'
			? 'Decision notification queued.'
			: data.notificationStatus === 'sent'
				? 'Decision notification sent.'
				: data.notificationStatus === 'failed'
					? 'Decision notification failed. Notify again to retry.'
					: decided
						? 'Decision saved. Speakers have not been notified.'
						: 'Choose a decision before notifying speakers.'
	);

	/**
	 * The slot the talk was actually held in.
	 *
	 * A recording belongs to a confirmed placement, not to a tentative one: a draft
	 * parked on three slots is exactly the state where "which of these was recorded"
	 * has no answer.
	 */
	const scheduled = $derived(s.placements.find((p) => p.status === 'confirmed') ?? null);

	const tiers = $derived(data.sponsorTiers ?? []);
	const selectedTier = $derived(tiers.find((tier) => tier.name === s.sponsorTier) ?? null);
	const sponsorOptions = $derived([
		{ value: 'none', label: 'No sponsor' },
		...tiers.map((tier) => ({ value: String(tier.id), label: tier.name }))
	]);
	const organizers = $derived(data.organizers ?? []);
	const ownerOptions = $derived([
		{ value: '', label: 'Who follows up' },
		...organizers.map((owner) => ({ value: owner.userId, label: owner.name }))
	]);
	const conditionLine = $derived(
		s.acceptCondition
			? s.acceptConditionOwner
				? `${s.acceptCondition} · ${s.acceptConditionOwner}`
				: s.acceptCondition
			: null
	);
	const guidanceLine = $derived(s.resubmitGuidance);
	const declineLine = $derived(s.declineNote);
	const standOptions = EDITORIAL_STANDS.map((stand) => ({
		value: stand,
		label: EDITORIAL_STAND_LABELS[stand]
	}));
	const nextStand = $derived(s.status === 'accepted' ? nextEditorialStand(paintedStand) : null);
</script>

<svelte:head>
	<title>{s.title} — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<a
		href="{base}/submissions"
		class="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
	>
		← All talks
	</a>
	<div class="mt-2 flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="text-lg font-semibold tracking-tight">{s.title}</h1>
				<StatusBadge status={s.status} />
				{#if conditionLine}
					<span data-testid="submission-condition">
						<StatusBadge status="open" tone="warn" label={conditionLine} />
					</span>
				{/if}
				{#if paintedStand}
					<span data-testid="submission-editorial-stand" data-stand={paintedStand}>
						<StatusBadge status={paintedStand} />
					</span>
				{/if}
				{#if guidanceLine}
					<span data-testid="submission-guidance">
						<StatusBadge status="open" tone="warn" label={guidanceLine} />
					</span>
				{/if}
				{#if declineLine}
					<span data-testid="submission-decline-note">
						<StatusBadge status="open" tone="warn" label={declineLine} />
					</span>
				{/if}
			</div>
			<p class="text-muted-foreground mt-0.5 text-sm">{subtitle}</p>
		</div>

		<!-- #852: shrink-0 let this column grow the document, so flex-wrap on the
		     four verbs never fired and Accept painted as Acc. Bound the column to
		     the page below md; above it the row is unchanged. -->
		<div class="flex w-full min-w-0 flex-col items-end gap-1 md:w-auto">
			<form
				method="POST"
				action="?/decide"
				class="flex w-full max-w-full flex-col items-end gap-2"
				use:enhance={() => {
					busy = true;
					// `finally`, not a trailing line: a dropped connection would otherwise
					// leave every button disabled with no way back except a reload.
					return async ({ update }) => {
						try {
							await update(formUpdateOptions('edit'));
						} finally {
							busy = false;
						}
					};
				}}
			>
				{#if !hideDecisions}
					{#if !decided}
						<div class="flex w-64 flex-col gap-2" data-testid="accept-condition">
							<input
								name="condition"
								type="text"
								maxlength="280"
								placeholder="If they bring a co-presenter…"
								class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
								data-testid="accept-condition-text"
							/>
							<AppSelect
								name="conditionOwnerId"
								value=""
								options={ownerOptions}
								size="sm"
								aria-label="Who follows up"
								testId="accept-condition-owner"
							/>
						</div>
					{/if}
					{#if s.status !== 'resubmit_with_guidance'}
						<div class="flex w-64 flex-col gap-2" data-testid="resubmit-guidance">
							<input
								name="guidance"
								type="text"
								maxlength="280"
								placeholder="Resubmit with your client…"
								class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
								data-testid="resubmit-guidance-text"
							/>
						</div>
					{/if}
					{#if s.status !== 'rejected'}
						<div class="flex w-64 flex-col gap-2" data-testid="decline-note">
							<input
								name="declineNote"
								type="text"
								maxlength="280"
								placeholder="Optional — one sentence from the champion"
								class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
								data-testid="decline-note-text"
							/>
						</div>
					{/if}
					<div class="flex w-full flex-wrap justify-end gap-2" data-testid="decision-actions">
						<Button
							type="submit"
							name="decision"
							value="rejected"
							variant="outline"
							disabled={busy || Boolean(cannotDecide)}
							aria-describedby={cannotDecide ? 'decision-block-reason' : undefined}
						>
							Decline
						</Button>
						<Button
							type="submit"
							name="decision"
							value="resubmit_with_guidance"
							variant="outline"
							disabled={busy || Boolean(cannotDecide)}
							aria-describedby={cannotDecide ? 'decision-block-reason' : undefined}
							data-testid="decide-resubmit"
						>
							Ask to resubmit
						</Button>
						<Button
							type="submit"
							name="decision"
							value="waitlisted"
							variant="outline"
							disabled={busy || Boolean(cannotDecide)}
							aria-describedby={cannotDecide ? 'decision-block-reason' : undefined}
						>
							Waitlist
						</Button>
						<Button
							type="submit"
							name="decision"
							value="accepted"
							disabled={busy || Boolean(cannotDecide)}
							aria-describedby={cannotDecide ? 'decision-block-reason' : undefined}
						>
							Accept
						</Button>
					</div>
				{/if}
			</form>
			{#if cannotDecide}
				<p
					id="decision-block-reason"
					class="text-muted-foreground max-w-56 text-right text-xs"
					data-testid="decision-block-reason"
				>
					{cannotDecide}
				</p>
			{/if}
			{#if s.status === 'draft'}
				<form
					id="delete-draft-form"
					method="POST"
					action="?/deleteDraft"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							try {
								await update(formUpdateOptions('edit'));
							} finally {
								busy = false;
								confirmDelete = false;
							}
						};
					}}
				>
					<Button
						type="submit"
						size="sm"
						variant="outline"
						disabled={busy}
						data-testid="delete-draft"
						onclick={(event: MouseEvent) => {
							event.preventDefault();
							confirmDelete = true;
						}}
					>
						Delete this draft
					</Button>
				</form>
				<AlertDialog bind:open={confirmDelete}>
					<AlertDialogContent data-testid="delete-draft-dialog">
						<AlertDialogHeader>
							<AlertDialogTitle>{deleteWarning.title}</AlertDialogTitle>
							<AlertDialogDescription>
								{deleteWarning.consequence}
								<span class="mt-2 block">{deleteWarning.reversal}</span>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel data-testid="delete-draft-cancel"
								>Keep this draft</AlertDialogCancel
							>
							<Button
								type="submit"
								form="delete-draft-form"
								variant="destructive"
								disabled={busy}
								data-testid="delete-draft-confirm"
							>
								Delete it
							</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			{/if}
		</div>
	</div>

	{#if form?.notificationResult}
		{@const tone = notificationTone(form.notificationResult)}
		<p
			class={tone === 'bad'
				? 'text-status-bad mt-3 text-sm'
				: tone === 'warn'
					? 'text-status-warn mt-3 text-sm'
					: 'text-status-good mt-3 text-sm'}
			role={tone === 'bad' ? 'alert' : 'status'}
		>
			{describeNotification(form.notificationResult)}
		</p>
	{:else if form?.result}
		<p class="text-status-good mt-3 text-sm" role="status">
			{describeDecision(form.decision, form.result)}
		</p>
	{:else if form?.message}
		<p class="text-status-bad mt-3 text-sm" role="alert">{form.message}</p>
	{/if}
	{#if form?.conditionMessage}
		<p class="text-status-good mt-3 text-sm" role="status">{form.conditionMessage}</p>
	{/if}
	{#if standWriteError}
		<p class="text-status-bad mt-3 text-sm" role="alert" data-testid="stand-write-error">
			{standWriteError}
		</p>
	{:else if form?.standMessage}
		<p class="text-status-good mt-3 text-sm" role="status">{form.standMessage}</p>
	{/if}
	{#if conditionLine}
		<div class="mt-3 flex flex-wrap items-end justify-end gap-2" data-testid="edit-condition">
			<form
				method="POST"
				action="?/updateCondition"
				class="flex flex-wrap items-end gap-2"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						try {
							await update(formUpdateOptions('edit'));
						} finally {
							busy = false;
						}
					};
				}}
			>
				<input
					name="condition"
					type="text"
					maxlength="280"
					value={s.acceptCondition ?? ''}
					class="border-input bg-background w-64 rounded-md border px-3 py-2 text-sm"
					data-testid="edit-condition-text"
				/>
				<AppSelect
					name="conditionOwnerId"
					value={s.acceptConditionOwnerId ?? ''}
					options={ownerOptions}
					size="sm"
					aria-label="Who follows up"
					testId="edit-condition-owner"
				/>
				<Button
					type="submit"
					size="sm"
					variant="outline"
					disabled={busy}
					data-testid="save-condition"
				>
					Save condition
				</Button>
			</form>
			<form
				method="POST"
				action="?/resolveCondition"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						try {
							await update(formUpdateOptions('edit'));
						} finally {
							busy = false;
						}
					};
				}}
			>
				<Button
					type="submit"
					size="sm"
					variant="outline"
					disabled={busy}
					data-testid="resolve-condition"
				>
					Resolve condition
				</Button>
			</form>
		</div>
	{/if}
	{#if s.status === 'accepted'}
		<div class="mt-3 flex flex-wrap items-end justify-end gap-2" data-testid="editorial-stand">
			<form
				method="POST"
				action="?/advanceEditorialStand"
				use:enhance={submittingStandWire}
				bind:this={standWireForm}
				hidden
				aria-hidden="true"
			>
				<input type="hidden" name="id" value="" />
			</form>
			<form
				method="POST"
				action="?/setEditorialStand"
				class="flex flex-wrap items-end gap-2"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						try {
							await update(formUpdateOptions('edit'));
						} finally {
							busy = false;
						}
					};
				}}
			>
				<AppSelect
					name="editorialStand"
					value={paintedStand ?? 'materials_requested'}
					options={standOptions}
					size="sm"
					aria-label="Editorial stand"
					testId="editorial-stand-select"
				/>
				<Button
					type="submit"
					size="sm"
					variant="outline"
					disabled={busy}
					data-testid="set-editorial-stand"
				>
					Save stand
				</Button>
			</form>
			{#if nextStand}
				<form method="POST" action="?/advanceEditorialStand" use:enhance={submittingStand}>
					<input type="hidden" name="id" value={s.id} />
					<Button type="submit" size="sm" data-testid="advance-editorial-stand">
						Advance to {EDITORIAL_STAND_LABELS[nextStand].toLowerCase()}
					</Button>
				</form>
			{/if}
		</div>
	{/if}
</div>

<!--
	#858: the implicit column below lg sizes to min-content. A long
	reviewer address or a recording URL has no break, the column grows
	past the screen, and the page slides sideways. min-w-0 lets the
	column shrink; break-words on the text is what then wraps.
-->
<div class="grid min-w-0 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
	<div class="min-w-0 space-y-4">
		<section class="border-border bg-card min-w-0 rounded-lg border p-5" data-testid="talk-content">
			<div class="flex min-w-0 items-baseline justify-between gap-3">
				<h2 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
					Abstract
				</h2>
				{#if !editing}
					<Button size="sm" variant="outline" onclick={() => (editing = true)}>Edit talk</Button>
				{/if}
			</div>

			{#if editing}
				<!--
					The speaker's own form is closed once the call closes or the talk is
					decided — which is exactly when a typo on the public programme is worth
					fixing. So the organizer gets the four content fields here, and every
					save leaves a revision behind saying who changed what.
				-->
				<form
					method="POST"
					action="?/content"
					class="mt-3 space-y-3"
					use:enhance={() => {
						busy = true;
						return async ({ update, result }) => {
							try {
								await update(formUpdateOptions('edit'));
								if (result.type === 'success') {
									clearBrowserDraft(
										localStorage,
										talkContentDraftScope(data.conference.slug, s.id),
										data.user.id
									);
									editing = false;
								}
							} finally {
								busy = false;
							}
						};
					}}
				>
					<TalkContentDraft
						slug={data.conference.slug}
						submissionId={s.id}
						owner={data.user.id}
						status={s.status}
						saved={savedTalk}
						refused={refusedTalk}
						errors={form?.contentErrors}
					/>
					<div class="flex items-center gap-3">
						<Button type="submit" size="sm" disabled={busy}>Save talk</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							disabled={busy}
							onclick={() => (editing = false)}
						>
							Cancel
						</Button>
						<span class="text-muted-foreground text-xs">
							The speaker is not notified of this change.
						</span>
					</div>
				</form>
			{:else}
				<p class="mt-2 leading-relaxed break-words whitespace-pre-line">
					{s.abstract ?? 'No abstract.'}
				</p>
				{#if form?.contentSaved}
					<p class="text-status-good mt-2 text-sm" role="status">{form.contentSaved}</p>
				{:else if data.contentEdit}
					<p class="text-muted-foreground mt-2 text-xs" data-testid="content-edit-trail">
						Edited by {data.contentEdit.editorName ?? 'an organizer'} on
						{stamp(data.contentEdit.editedAt)}.
					</p>
				{/if}
			{/if}

			{#if !editing && (s.keyTakeaway || s.audienceLevel)}
				<dl class="border-border mt-4 grid min-w-0 gap-3 border-t pt-4 text-sm sm:grid-cols-2">
					{#if s.keyTakeaway}
						<div class="min-w-0">
							<dt class="text-muted-foreground">Key takeaway</dt>
							<dd class="break-words">{s.keyTakeaway}</dd>
						</div>
					{/if}
					{#if s.audienceLevel}
						<div class="min-w-0">
							<dt class="text-muted-foreground">Audience level</dt>
							<dd class="break-words">{s.audienceLevel}</dd>
						</div>
					{/if}
				</dl>
			{/if}

			{#if s.answers.length > 0}
				<!-- Ü2: whatever the organizer added to the form arrives here, or they retype it. -->
				<dl class="border-border mt-4 grid min-w-0 gap-3 border-t pt-4 text-sm sm:grid-cols-2">
					{#each s.answers as answer, i (i)}
						<div class="min-w-0">
							<dt class="text-muted-foreground break-words">{answer.label}</dt>
							<dd class="min-w-0 break-words">
								{#if answer.kind === 'boolean' || answer.value === null || answer.value === ''}
									{answerValue(answer)}
								{:else}
									<!-- #477: a link the submitter typed is a link here too. -->
									<AnswerText class="break-words" value={answer.value} />
								{/if}
							</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</section>

		<section
			class="border-border bg-card min-w-0 rounded-lg border p-5"
			data-testid="submission-reviews"
		>
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Reviews</h2>
				<div class="flex flex-wrap items-center gap-3">
					<span class="font-medium tabular-nums">Ø {formatScore(s.score)}</span>
					<a
						class="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
						href="{base}/rounds"
						data-testid="edit-scorecard-link"
					>
						Scorecard &amp; weights
					</a>
				</div>
			</div>

			{#if s.reviews.length === 0}
				<p class="text-muted-foreground mt-3 text-sm">Nobody is assigned to this talk yet.</p>
			{:else}
				<ul>
					{#each s.reviews as review (review.id)}
						<li class="border-border min-w-0 border-t py-3 first:mt-3">
							<div class="flex min-w-0 items-baseline justify-between gap-3">
								<span class="flex min-w-0 flex-wrap items-baseline gap-2">
									<span class="min-w-0 font-medium break-words" data-testid="review-reviewer-name"
										>{review.reviewerName}</span
									>
									{#if review.anonymized}
										<!--
										The organizer sees the name and, next to it, that the round hides it
										from the other reviewers (#416) — the fact they need when they quote
										a score in a committee meeting.
										-->
										<span class="text-muted-foreground text-xs" data-testid="review-blind-round"
											>blind to peers</span
										>
									{/if}
								</span>
								<span class="text-muted-foreground text-sm tabular-nums">
									{#if review.status === 'submitted'}
										{formatScore(review.score)}
									{:else if review.status === 'recused'}
										<StatusBadge status="recused" />
									{:else}
										<StatusBadge status={review.status} label="To review" />
									{/if}
								</span>
							</div>
							{#if review.scores.length > 0}
								<p class="text-muted-foreground mt-1 text-xs break-words tabular-nums">
									{#each review.scores as score, i (i)}
										{i > 0 ? ' · ' : ''}{score.criterion}:
										{score.valueText ??
											`${score.value ?? '—'}${score.scaleMax ? `/${score.scaleMax}` : ''}`}
									{/each}
								</p>
							{/if}
							{#if review.comment}
								<p class="text-muted-foreground mt-1 text-sm break-words">{review.comment}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			<!--
			The organizer's own review, when they have one.

			Reviews are not written here and should not be: the reviewer form carries
			the round's criteria, the blind-mode rules and the recusal path, and a
			second copy of it on this screen would be a second implementation of
			#33's guarantees. What was missing was the door — an organizer assigned to
			their own conference had to remember that /review exists and navigate to
			it by hand.

			The line stays honest in the other direction too: when there is no door,
			it says what would open one instead of silently offering nothing.
		-->
			<div class="border-border mt-4 border-t pt-4" data-testid="own-review">
				{#if data.ownReview}
					<div class="flex flex-wrap items-center justify-between gap-3">
						<p class="text-sm">
							{data.ownReview.status === 'submitted'
								? 'You have reviewed this talk.'
								: 'This talk is assigned to you for review.'}
						</p>
						<Button
							href="/review/{data.conference.slug}/{s.id}"
							variant={data.ownReview.status === 'submitted' ? 'outline' : 'default'}
							size="sm"
						>
							{data.ownReview.status === 'submitted' ? 'Open your review' : 'Write your review'}
						</Button>
					</div>
				{:else}
					<p class="text-muted-foreground text-sm">
						Reviews are written by the reviewers assigned below. To write one yourself, take a
						reviewer seat in
						<a class="underline underline-offset-4" href="{base}/people">Reviewer pool</a>
						<!--
							The second half names the step that is actually next: with no round
							yet, "assign yourself to a round" points at a control that is not
							there — and the block below already says so.
						-->
						{data.assignmentRounds.length === 0
							? 'and create a review round.'
							: 'and assign yourself to a round here.'}
					</p>
				{/if}
			</div>

			<div class="border-border mt-4 border-t pt-4" data-testid="review-assignments">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h3 class="text-sm font-semibold">Reviewer assignments</h3>
					<span class="text-muted-foreground text-xs">One reviewer at a time</span>
				</div>
				{#if assignmentWriteError}
					<p class="text-status-bad mt-2 text-sm" role="alert" data-testid="assignment-write-error">
						{assignmentWriteError}
					</p>
				{:else if form?.assignmentMessage}
					<p class="mt-2 text-sm" role="status">{form.assignmentMessage}</p>
				{/if}
				{#if data.assignmentRounds.length === 0}
					<p class="text-muted-foreground mt-2 text-sm">
						<a class="underline" href="/manage/{data.conference.slug}/rounds">
							Create a review round
						</a>
						before assigning talks.
					</p>
				{:else}
					<div class="mt-3 space-y-3">
						{#each assignmentRounds as round (round.id)}
							<section
								class="border-border bg-background rounded-lg border p-3"
								data-testid="assignment-round"
							>
								<h4 class="text-sm font-semibold">{round.name}</h4>
								{#if round.reviewers.length === 0}
									<p class="text-muted-foreground mt-1 text-sm">
										No eligible reviewers in this round —
										<a class="underline" href="/manage/{data.conference.slug}/people">
											add someone to the committee
										</a>.
									</p>
								{:else}
									<ul class="mt-1 divide-y">
										{#each round.reviewers as reviewer (reviewer.userId)}
											<li
												class="flex items-center justify-between gap-3 py-2 text-sm"
												data-testid="assignment-reviewer"
												data-reviewer-status={reviewer.status ?? 'none'}
											>
												<div class="min-w-0">
													<p class="flex min-w-0 items-center gap-2">
														<span class="truncate font-medium">{reviewer.name}</span>
														{#if reviewer.status}
															<StatusBadge status={reviewer.status} />
														{/if}
													</p>
													<p class="text-muted-foreground truncate text-xs">{reviewer.email}</p>
												</div>
												<form
													method="POST"
													action="?/assignment"
													use:enhance={submittingAssignment}
												>
													<input type="hidden" name="roundId" value={round.id} />
													<input type="hidden" name="reviewerUserId" value={reviewer.userId} />
													{#if reviewer.status && reviewer.status !== 'recused'}
														<div class="flex flex-col items-end gap-1">
															<Button
																type="submit"
																name="intent"
																value="unassign"
																variant="outline"
																size="sm"
																disabled={Boolean(reviewer.unassignBlockReason)}
															>
																Unassign
															</Button>
															{#if reviewer.unassignBlockReason}
																<p
																	class="text-muted-foreground max-w-56 text-right text-xs"
																	data-testid="unassign-block-reason"
																>
																	{reviewer.unassignBlockReason}
																</p>
															{/if}
														</div>
													{:else if !cannotAssign}
														<Button
															type="submit"
															name="intent"
															value="assign"
															size="sm"
															disabled={!reviewer.eligible}
														>
															{reviewer.status === 'recused' ? 'Reassign' : 'Assign'}
														</Button>
													{/if}
												</form>
											</li>
										{/each}
									</ul>
								{/if}
							</section>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>

	<div class="min-w-0 space-y-4">
		<section class="border-border bg-card rounded-lg border p-4" data-testid="submission-speakers">
			<h2 class="text-sm font-medium">{s.speakers.length === 1 ? 'Speaker' : 'Speakers'}</h2>
			{#if s.speakers.length === 0}
				<p class="text-muted-foreground mt-2 text-sm">No speaker on this talk.</p>
			{:else}
				<ul class="mt-2 space-y-3">
					{#each s.speakers as speaker (speaker.id)}
						<li class="flex items-center gap-3" data-testid="speaker-row">
							{#if speaker.headshotUrl}
								<img
									src={speaker.headshotUrl}
									alt=""
									class="size-9 shrink-0 rounded-full object-cover"
								/>
							{:else}
								<span
									class="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
									aria-hidden="true"
								>
									{initials(speaker.name)}
								</span>
							{/if}
							<div class="min-w-0 text-sm">
								<div class="font-medium">{speaker.name}</div>
								<!--
									ABS-11: the CFP stores roleLabel on co-presenters, but job title /
									company used to win the single subtitle line and hide the role
									entirely whenever either was set. Role is its own line so it is
									always visible when the submitter gave one.
								-->
								{#if speaker.roleLabel}
									<div class="text-muted-foreground text-xs" data-testid="speaker-role">
										{speaker.roleLabel}
									</div>
								{:else if speaker.isPrimary}
									<div class="text-muted-foreground text-xs" data-testid="speaker-role">
										Primary speaker
									</div>
								{/if}
								{#if speaker.jobTitle || speaker.company}
									<div class="text-muted-foreground truncate text-xs">
										{[speaker.jobTitle, speaker.company].filter(Boolean).join(', ')}
									</div>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- #451: directly under the speakers, because it is a second sentence about
		     the same people — "and this is what they did here last time". -->
		{#if data.speakerHistory.length > 0}
			<section
				class="border-border bg-card rounded-lg border p-4"
				data-testid="submission-speaker-history"
			>
				<h2 class="text-sm font-medium">Speaker history</h2>
				<div class="mt-2">
					<SpeakerHistoryPanel history={data.speakerHistory} />
				</div>
			</section>
		{/if}

		<section class="border-border bg-card rounded-lg border p-4" data-testid="submission-sponsor">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm font-medium">Sponsorship</h2>
				<StatusBadge status="internal" tone="internal" label="internal only" />
			</div>
			<p class="text-muted-foreground mt-1 text-xs">
				Reviewers do not see this, and the public programme shows only the format.
			</p>

			{#if tiers.length === 0}
				<p class="text-muted-foreground mt-3 text-sm">
					No sponsor tiers yet.
					<a class="underline underline-offset-4" href="{base}/settings#sponsors">
						Add them in Settings
					</a>.
				</p>
				{#if s.sponsorTier}
					<p class="mt-2 text-sm font-medium">{s.sponsorTier}</p>
				{/if}
			{:else}
				<form
					method="POST"
					action="?/sponsor"
					class="mt-3 space-y-2"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							try {
								await update(formUpdateOptions('edit'));
							} finally {
								busy = false;
							}
						};
					}}
				>
					<AppSelect
						name="sponsorTierId"
						value={selectedTier ? String(selectedTier.id) : 'none'}
						options={sponsorOptions}
						size="sm"
						aria-label="Sponsor tier"
						testId="sponsor-tier-select"
					/>
					<Button type="submit" size="sm" variant="outline" disabled={busy}>Save marker</Button>
				</form>
			{/if}

			{#if selectedTier?.note ?? s.sponsorNote}
				<p class="text-muted-foreground mt-2 text-sm">{selectedTier?.note ?? s.sponsorNote}</p>
			{/if}
			{#if form?.sponsorError}
				<p class="text-status-bad mt-2 text-sm" role="alert">{form.sponsorError}</p>
			{:else if form?.sponsorMessage}
				<p class="text-status-good mt-2 text-sm" role="status">{form.sponsorMessage}</p>
			{/if}
		</section>

		<!-- Deciding changes the programme; notifying people is deliberately separate. -->
		<section class="border-border bg-card rounded-lg border p-4">
			<h2 class="text-sm font-medium">Decision workflow</h2>
			<p class="text-muted-foreground mt-1 text-xs">
				Saving Accept, Waitlist, Decline or Ask to resubmit does not notify speakers. Check the
				programme first, then send the decision explicitly.
			</p>
			<h3 class="mt-3 text-xs font-medium">Accepting also</h3>
			<ul class="text-muted-foreground mt-2 space-y-1 text-sm">
				<li>· put the talk on the agenda as unscheduled</li>
				<li>· confirm the speakers for this conference</li>
				<li>· create their tasks from the conference's task template</li>
				<li>
					· a condition is a note on that accept, not a second status — the talk still takes its
					slot
				</li>
			</ul>
			<p class="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
				Declining or waitlisting an accepted talk takes it off the agenda and withdraws the tasks
				nobody has started. A slot you already confirmed stays — that one is yours to move.
			</p>
			{#if inTray && (s.status === 'rejected' || s.status === 'waitlisted' || s.status === 'resubmit_with_guidance')}
				<p
					class="border-status-warn/40 bg-status-warn-bg text-status-warn mt-3 rounded-md border px-3 py-2 text-sm font-medium"
					data-testid="rejected-placement-badge"
					role="status"
				>
					{s.status === 'rejected'
						? 'Declined'
						: s.status === 'resubmit_with_guidance'
							? 'Asked to resubmit'
							: 'Waitlisted'} but still on the programme ({s.placements
						.map((p) => p.status)
						.join(', ')}). Remove or reassign the slot on
					<a class="underline underline-offset-4" href="{base}/agenda">Agenda</a>.
				</p>
			{:else if inTray}
				<p class="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
					Already in the programme as
					{s.placements.map((p) => p.status).join(', ')}.
				</p>
			{/if}
			<div class="border-border mt-3 border-t pt-3">
				<p class="text-muted-foreground text-xs" data-testid="decision-notification-status">
					{notificationLabel}
				</p>
				<form
					method="POST"
					action="?/notify"
					class="mt-2"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							try {
								await update(formUpdateOptions('edit'));
							} finally {
								busy = false;
							}
						};
					}}
				>
					<Button type="submit" variant="secondary" size="sm" disabled={!decided || busy}>
						{data.notificationStatus === 'failed' ? 'Notify again' : 'Notify speakers of decision'}
					</Button>
				</form>
			</div>
		</section>

		{#if scheduled}
			<!-- #20 stage 1. The conference page dies the day after the event unless
			     something on it keeps working; the recording is that something. -->
			<section class="border-border bg-card rounded-lg border p-4">
				<h2 class="text-sm font-medium">Recording</h2>
				<p class="text-muted-foreground mt-1 text-xs">
					Paste the video link once it is online. The public agenda shows a "Watch recording" button
					as soon as it is set; emptying the field takes it back down.
				</p>
				<form
					method="POST"
					action="?/recording"
					class="mt-3 space-y-2"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							try {
								await update(formUpdateOptions('edit'));
							} finally {
								busy = false;
							}
						};
					}}
				>
					<input type="hidden" name="placementId" value={scheduled.id} />
					<Input
						name="recordingUrl"
						type="url"
						value={scheduled.recordingUrl ?? ''}
						placeholder="https://www.youtube.com/watch?v=…"
						aria-label="Recording link"
					/>
					<div class="flex items-center gap-3">
						<Button type="submit" size="sm" variant="outline" disabled={busy}>Save link</Button>
						{#if scheduled.recordingUrl}
							<a
								href={scheduled.recordingUrl}
								target="_blank"
								rel="noopener"
								class="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
							>
								Open it
							</a>
						{/if}
					</div>
				</form>
			</section>
		{/if}
	</div>
</div>
