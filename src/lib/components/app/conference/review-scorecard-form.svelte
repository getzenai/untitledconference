<script lang="ts">
	/**
	 * This reviewer's scorecard for one talk in one round (#737).
	 *
	 * Typed values live in `$lib/forms/browser-draft` until Save. A matching
	 * baseline restores; a newer saved review is a visible choice.
	 */
	import { enhance } from '$lib/forms/enhance';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { ratingAnswerError } from '$lib/conference/rating-answer';
	import AppSelect from '$lib/components/app/app-select.svelte';
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
	import { browser } from '$app/environment';
	import UnsavedGuard from '$lib/components/app/unsaved-guard.svelte';
	import {
		clearBrowserDraft,
		readBrowserDraft,
		writeBrowserDraft,
		type BrowserDraft
	} from '$lib/forms/browser-draft';
	import {
		isTypedReview,
		parseReviewDraft,
		reviewDraftBaseline,
		reviewDraftScope,
		sameReviewDraft,
		type ReviewDraft
	} from '$lib/conference/review-draft';

	type Criterion = {
		id: number;
		label: string;
		kind: string;
		scaleMax: number | null;
		options: string | null;
		value: number | null;
		valueText: string | null;
	};

	type Submission = {
		id: number;
		title: string;
		status: string;
		window: { state: string; notice: string | null };
		own: { reviewId: number; status: string; comment: string | null };
		criteria: Criterion[];
		round: { id: number; name: string };
	};

	let {
		submission: s,
		conferenceSlug,
		ownerId,
		form
	}: {
		submission: Submission;
		conferenceSlug: string;
		ownerId: string;
		form?: { message?: string; ok?: boolean } | null;
	} = $props();

	const withdrawn = $derived(s.status === 'withdrawn');
	const shut = $derived(s.window.state !== 'open');
	const locked = $derived(withdrawn || shut);
	let busy = $state(false);
	let reviewForm = $state<HTMLFormElement | null>(null);
	let confirmRecuseOpen = $state(false);
	let allowRecuse = false;
	let typed = $state<Record<number, string>>({});
	let comment = $state('');
	let listening = $state(false);
	let restoredAt = $state<number | null>(null);
	let restoreConflict = $state<BrowserDraft<ReviewDraft> | null>(null);
	let appliedKey = $state('');
	let parked = $state(false);

	const scoresFromCriteria = (criteria: Criterion[]): Record<number, string> => {
		const out: Record<number, string> = {};
		for (const criterion of criteria) {
			out[criterion.id] =
				criterion.kind === 'rating'
					? criterion.value === null
						? ''
						: String(criterion.value)
					: (criterion.valueText ?? '');
		}
		return out;
	};

	const scoreOf = (criterion: Criterion) =>
		typed[criterion.id] ??
		criterion.valueText ??
		(criterion.value === null ? '' : String(criterion.value));

	const draftScope = $derived(reviewDraftScope(conferenceSlug, s.id, s.round.id));
	const serverDraft = $derived<ReviewDraft>({
		comment: s.own.comment ?? '',
		scores: scoresFromCriteria(s.criteria)
	});
	const draftBaseline = $derived(
		reviewDraftBaseline({
			status: s.own.status,
			comment: serverDraft.comment,
			scores: serverDraft.scores
		})
	);
	const currentDraft = (): ReviewDraft => ({ comment, scores: { ...typed } });
	const dirty = $derived(
		!restoreConflict && !locked && !parked && !sameReviewDraft(currentDraft(), serverDraft)
	);
	const formOk = $derived(Boolean(form && 'ok' in form && form.ok));

	const persistDraft = () => {
		if (!listening || !browser || locked || !ownerId || restoreConflict) return;
		const draft = currentDraft();
		if (!isTypedReview(draft) || sameReviewDraft(draft, serverDraft)) {
			clearBrowserDraft(localStorage, draftScope, ownerId);
			restoredAt = null;
			parked = false;
			return;
		}
		writeBrowserDraft(localStorage, {
			scope: draftScope,
			owner: ownerId,
			baseline: draftBaseline,
			value: draft
		});
		parked = true;
	};

	const forgetDraft = () => {
		if (!browser || !ownerId) return;
		clearBrowserDraft(localStorage, draftScope, ownerId);
		restoredAt = null;
		restoreConflict = null;
		parked = false;
	};

	const useBrowserDraft = () => {
		if (!restoreConflict) return;
		const candidate = restoreConflict;
		restoreConflict = null;
		comment = candidate.value.comment;
		typed = { ...serverDraft.scores, ...candidate.value.scores };
		restoredAt = candidate.savedAt;
		persistDraft();
	};

	const keepSavedDraft = () => {
		forgetDraft();
		comment = serverDraft.comment;
		typed = { ...serverDraft.scores };
	};

	const applyParked = () => {
		if (!browser || !ownerId || locked) {
			listening = true;
			return;
		}
		const saved = readBrowserDraft(localStorage, {
			scope: draftScope,
			owner: ownerId,
			baseline: draftBaseline,
			parse: parseReviewDraft
		});
		if (saved.status === 'conflict') restoreConflict = saved.draft;
		if (saved.status === 'current') {
			comment = saved.draft.value.comment;
			typed = { ...serverDraft.scores, ...saved.draft.value.scores };
			restoredAt = saved.draft.savedAt;
			parked = true;
		}
		listening = true;
	};

	$effect(() => {
		const key = `${s.id}:${s.round.id}:${ownerId}`;
		if (appliedKey === key) return;
		appliedKey = key;
		comment = serverDraft.comment;
		typed = { ...serverDraft.scores };
		restoredAt = null;
		restoreConflict = null;
		parked = false;
		applyParked();
	});

	const scoreErrors = $derived(
		new Map(
			s.criteria
				.filter((criterion) => criterion.kind === 'rating')
				.map((criterion) => [criterion.id, ratingAnswerError(scoreOf(criterion), criterion)])
				.filter((entry): entry is [number, string] => entry[1] !== null)
		)
	);

	const isRecuse = (submitter: HTMLElement | null) =>
		submitter instanceof HTMLButtonElement && submitter.name === 'reviewId';

	const confirmRecuse = () => {
		const button = reviewForm?.querySelector<HTMLButtonElement>('button[name="reviewId"]');
		if (!button) return;
		allowRecuse = true;
		confirmRecuseOpen = false;
		reviewForm?.requestSubmit(button);
	};

	const submitting: SubmitFunction = ({ submitter, cancel }) => {
		if (isRecuse(submitter) && !allowRecuse) {
			cancel();
			confirmRecuseOpen = true;
			return;
		}
		if (!isRecuse(submitter) && scoreErrors.size > 0) {
			cancel();
			return;
		}
		allowRecuse = false;
		busy = true;
		return async ({ result, update }) => {
			try {
				await update(formUpdateOptions('edit'));
				if (result.type === 'success' || result.type === 'redirect') forgetDraft();
			} finally {
				busy = false;
			}
		};
	};

	const recordScore = (id: number, value: string) => {
		typed[id] = value;
		persistDraft();
	};

	const inputClass =
		'border-input bg-background focus-visible:ring-ring rounded-md border px-2 py-1.5 text-sm focus-visible:ring-[3px] focus-visible:outline-none';

	const parseOptions = (raw: string | null): string[] => {
		if (!raw) return [];
		try {
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === 'string') : [];
		} catch {
			return [];
		}
	};
</script>

<UnsavedGuard {dirty} />

<form
	bind:this={reviewForm}
	method="POST"
	action="?/save&round={s.round.id}"
	novalidate
	use:enhance={submitting}
	class="border-border bg-card h-fit space-y-3 rounded-lg border p-4"
>
	<input type="hidden" name="roundId" value={s.round.id} />
	<div class="flex items-center justify-between">
		<h2 class="text-sm font-semibold">My review — {s.round.name}</h2>
		<StatusBadge
			status={withdrawn ? 'withdrawn' : s.own.status}
			label={withdrawn ? 'Withdrawn' : s.own.status === 'submitted' ? 'Reviewed' : 'To review'}
		/>
	</div>

	{#if shut}
		<p
			class="border-status-warn/40 bg-status-warn-bg text-status-warn rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="round-window-notice"
		>
			{s.window.notice}
		</p>
	{/if}

	{#if withdrawn}
		<p class="border-status-bad text-status-bad rounded-md border px-3 py-2 text-sm" role="status">
			The speaker withdrew this talk, so it no longer needs a review.
		</p>
	{/if}

	{#if form?.message}
		<p
			class="rounded-md border px-3 py-2 text-sm {formOk
				? 'border-status-good text-status-good'
				: 'border-status-bad text-status-bad'}"
			role={formOk ? 'status' : 'alert'}
		>
			{form.message}
		</p>
	{/if}

	{#if restoreConflict}
		<div
			class="border-status-bad/40 bg-status-bad/5 rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="review-draft-conflict"
		>
			<p class="font-medium">This browser has unsaved changes, but the saved review changed.</p>
			<p class="text-muted-foreground mt-1">
				The browser copy is from {new Date(restoreConflict.savedAt).toLocaleString()}. Choose which
				version to continue with; nothing will be replaced until you decide.
			</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<Button type="button" size="sm" onclick={useBrowserDraft}>Use browser changes</Button>
				<Button type="button" size="sm" variant="outline" onclick={keepSavedDraft}>
					Keep latest saved version
				</Button>
			</div>
		</div>
	{:else if restoredAt !== null}
		<p
			class="text-muted-foreground rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="review-autosave-notice"
		>
			Your unsaved review is still here.
		</p>
	{/if}

	{#if s.criteria.length === 0}
		<p class="text-muted-foreground text-sm">
			This round has no scorecard yet — leave your verdict as an overall comment.
		</p>
	{/if}

	{#each s.criteria as criterion (criterion.id)}
		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">
				{criterion.label}{criterion.kind === 'rating' && criterion.scaleMax
					? ` (1–${criterion.scaleMax})`
					: ''}
			</span>

			{#if criterion.kind === 'rating'}
				{@const scoreError = scoreErrors.get(criterion.id)}
				<input
					type="number"
					name="criterion-{criterion.id}"
					min="0"
					max={criterion.scaleMax ?? undefined}
					step="1"
					value={scoreOf(criterion)}
					oninput={(event) => recordScore(criterion.id, event.currentTarget.value)}
					disabled={locked}
					aria-invalid={scoreError ? 'true' : undefined}
					aria-describedby={scoreError ? `criterion-${criterion.id}-error` : undefined}
					class="{inputClass} mt-1 w-full {scoreError ? 'border-status-bad' : ''}"
					data-testid="criterion-{criterion.id}"
				/>
				{#if scoreError}
					<span
						id="criterion-{criterion.id}-error"
						class="text-status-bad mt-1 block text-xs"
						data-testid="criterion-error"
					>
						{scoreError}
					</span>
				{/if}
			{:else if criterion.kind === 'select'}
				<AppSelect
					name="criterion-{criterion.id}"
					class="mt-1"
					aria-label={criterion.label}
					placeholder="—"
					value={scoreOf(criterion)}
					disabled={locked}
					onValueChange={(next) => recordScore(criterion.id, next)}
					options={parseOptions(criterion.options).map((option) => ({
						value: option,
						label: option
					}))}
				/>
			{:else}
				<textarea
					name="criterion-{criterion.id}"
					rows="2"
					disabled={locked}
					value={scoreOf(criterion)}
					oninput={(event) => recordScore(criterion.id, event.currentTarget.value)}
					class="{inputClass} mt-1 w-full"
				></textarea>
				<span class="text-muted-foreground mt-1 block text-xs">
					Part of this round's scorecard — not the overall comment below.
				</span>
			{/if}
		</label>
	{/each}

	<label class="block text-sm">
		<span class="text-muted-foreground text-xs">Overall comment</span>
		<textarea
			name="comment"
			rows="4"
			disabled={locked}
			class="{inputClass} mt-1 w-full"
			value={comment}
			oninput={(event) => {
				comment = event.currentTarget.value;
				persistDraft();
			}}
		></textarea>
		<span class="text-muted-foreground mt-1 block text-xs">
			Your verdict on this talk. Visible to organizers and — unless the round is anonymised — to
			other reviewers.
		</span>
	</label>

	<div class="flex flex-wrap gap-2">
		{#if s.own.status === 'submitted'}
			<Button
				type="submit"
				name="intent"
				value="submit"
				variant="outline"
				size="sm"
				disabled={busy || locked}
			>
				Update review
			</Button>
			<Button
				type="submit"
				name="intent"
				value="draft"
				variant="ghost"
				size="sm"
				disabled={busy || locked}
			>
				Save progress
			</Button>
		{:else}
			<Button type="submit" name="intent" value="submit" size="sm" disabled={busy || locked}>
				Submit review
			</Button>
			<Button
				type="submit"
				name="intent"
				value="draft"
				variant="outline"
				size="sm"
				disabled={busy || locked}
			>
				Save progress
			</Button>
		{/if}
		{#if s.own.status === 'assigned'}
			<Button
				type="submit"
				name="reviewId"
				value={s.own.reviewId}
				formaction="?/recuse"
				variant="ghost"
				size="sm"
				disabled={busy || withdrawn}
			>
				Recuse myself
			</Button>
		{/if}
	</div>

	<p class="text-muted-foreground text-xs">
		Submitting counts your review towards coverage. It emails nobody — the organizer decides when
		speakers are told.
	</p>
</form>

<AlertDialog bind:open={confirmRecuseOpen}>
	<AlertDialogContent data-testid="recuse-dialog">
		<AlertDialogHeader>
			<AlertDialogTitle>Hand this talk back to the organizers?</AlertDialogTitle>
			<AlertDialogDescription>
				Your assignment for {s.round.name} is removed and the talk returns to the organizers. You will
				not be able to review it again unless they assign it to you.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel data-testid="recuse-cancel">Keep the assignment</AlertDialogCancel>
			<Button data-testid="recuse-confirm" onclick={confirmRecuse}>Recuse myself</Button>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
