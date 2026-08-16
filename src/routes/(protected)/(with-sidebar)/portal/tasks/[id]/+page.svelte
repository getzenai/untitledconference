<script lang="ts">
	/**
	 * What the organizers need from you, and what you have handed in so far.
	 *
	 * Versions are listed newest first with the top one marked — a speaker who
	 * re-uploads needs to see that the new file is the one that counts, and that
	 * the old one did not vanish (CNT-04).
	 *
	 * A question to the programme team parks under
	 * `portal-task-comment:{taskId}:{deliverableId}` (#789). The file picker is
	 * a file and is not parked.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions, type FormResetKind } from '$lib/conference/form-reset';
	import ContentFileLink from '$lib/components/content-file-link.svelte';
	import FilePreviewSheet from '$lib/components/file-preview-sheet.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		AlertDialog,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import BrowserDraftInput from '$lib/components/app/browser-draft-input.svelte';
	import UnsavedGuard from '$lib/components/app/unsaved-guard.svelte';
	import {
		PORTAL_TASK_COMMENT_LEAVE_PROMPT,
		portalTaskCommentScope
	} from '$lib/conference/portal-task-draft';
	import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from '$lib/conference/upload-limits';
	import { publicSiteLink } from '$lib/conference/conference-status';
	import { formatInstant } from '$lib/conference/deadline';
	import { readerZone } from '$lib/conference/reader-zone.svelte';
	import type { FilePreviewKind } from '$lib/conference/file-preview';
	import { isParticipationTaskTitle, isProfileTaskTitle } from '$lib/conference/task-purpose';
	import { withdrawWarning } from '$lib/conference/withdraw-warning';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let { data, form } = $props();
	const zone = readerZone();

	const task = $derived(data.task);
	const site = $derived(publicSiteLink(task.conferenceStatus, task.conferenceSlug));
	const files = $derived(data.files);
	const participationTask = $derived(
		task.kind === 'action' && isParticipationTaskTitle(task.title)
	);
	const profileTask = $derived(task.kind === 'action' && isProfileTaskTitle(task.title));
	// Acceptance initially puts a speaker on the roster as confirmed. That is the
	// organizer's assumption, not this speaker's answer; only present it as their
	// decision once this participation task has actually been completed.
	const participationDecision = $derived(task.status === 'done' ? task.participationStatus : null);
	let busy = $state(false);
	let confirmWithdraw = $state(false);
	let commitByFile = $state<Record<number, number>>({});
	const dirtyFields = new SvelteSet<number>();

	function setCommentDirty(deliverableId: number, dirty: boolean) {
		if (dirty) dirtyFields.add(deliverableId);
		else dirtyFields.delete(deliverableId);
	}

	// The Upload button is only for a form that never hydrated. Once JS is
	// running, picking a file hands it in — a second click after that is
	// ceremony (#626).
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	let preview = $state<{ title: string; src: string; kind: FilePreviewKind } | null>(null);

	const openFile = (src: string, title: string, kind: FilePreviewKind) => {
		preview = { src, title, kind };
	};

	const handInOnPick = (event: Event) => {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement) || !input.files?.length || !input.form) return;
		input.form.requestSubmit();
		// The submit handler has already copied the file. Clear so picking the
		// same path again is still a change — a refused upload must not trap
		// the speaker on a dead control.
		input.value = '';
	};

	const warning = $derived(withdrawWarning(task.conferenceName, data.acceptedTalks));

	const submitting = (kind: FormResetKind) => () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions(kind));
			} finally {
				busy = false;
				// A landed withdrawal takes the dialog with it, because the question and
				// the button live in the same `{#if}` as the answer. A *refused* one does
				// not, and the error it wants to show sits under the overlay — so the
				// question closes when the round trip ends, not only when it succeeds.
				confirmWithdraw = false;
			}
		};
	};

	/** Comment only: a refused send must not raise the token or the typed lines are gone. */
	const commenting = (deliverableId: number) => () => {
		busy = true;
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: (opts?: { reset?: boolean }) => Promise<void>;
		}) => {
			try {
				await update(formUpdateOptions('add'));
				if (result.type === 'success') {
					commitByFile[deliverableId] = (commitByFile[deliverableId] ?? 0) + 1;
				}
			} finally {
				busy = false;
			}
		};
	};

	const stamp = (value: Date | string) =>
		new Date(value).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	// Same instant, same helper, same zone as the portal list (#498). The day-only
	// stamp dropped the time and the zone, which is how "Due Sunday 2 May" could
	// already be over in Lisbon while it still looked open in Auckland.
	const dueLabel = $derived(task.dueOn ? formatInstant(task.dueOn, zone.current) : null);
	const overdue = $derived(
		task.status !== 'done' && Boolean(task.dueOn && new Date(task.dueOn) < new Date())
	);
	const sessionWhen = $derived.by(() => {
		if (!task.sessionStartsAt) return null;
		const starts = new Date(task.sessionStartsAt);
		const date = starts.toLocaleDateString('en-GB', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
		const start = starts.toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'UTC'
		});
		const end = task.sessionEndsAt
			? new Date(task.sessionEndsAt).toLocaleTimeString('en-GB', {
					hour: '2-digit',
					minute: '2-digit',
					timeZone: 'UTC'
				})
			: null;
		return `${date} · ${start}${end ? `–${end}` : ''}`;
	});
	const visibleInstructions = $derived.by(() => {
		if (!task.instructions) return null;
		const genericUploadInstruction =
			task.instructions.trim().toLocaleLowerCase('en') === 'upload the file here once it is ready.';
		if (task.kind === 'file_request' && files.length > 0 && genericUploadInstruction) return null;
		return task.instructions;
	});

	const sizeLabel = (bytes: number | null) =>
		bytes === null ? '' : `${(bytes / 1024).toFixed(0)} KB`;

	const megabytes = MAX_UPLOAD_BYTES / 1024 / 1024;
	// Newest first. A rejected latest file is "ask for changes" — the task is
	// open again, but the copy used to say the file was already handed in.
	const latest = $derived(files[0] ?? null);
	const latestRejected = $derived(latest?.approvalStatus === 'rejected');
</script>

<svelte:head>
	<title>{task.title} — Speaker portal</title>
</svelte:head>

<UnsavedGuard dirty={dirtyFields.size > 0} message={PORTAL_TASK_COMMENT_LEAVE_PROMPT} />

<div class="mx-auto max-w-3xl px-6 py-8">
	<a class="text-muted-foreground text-sm hover:underline" href="/portal">← Speaker portal</a>

	<div class="mt-4 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{task.title}</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if site.available}
					<a class="hover:underline" href={site.href}>{task.conferenceName}</a>
				{:else}
					{task.conferenceName}
				{/if}{#if task.submissionTitle}<span class="px-1.5">·</span>{task.submissionTitle}{/if}
			</p>
		</div>
		<!-- A withdrawal closes this task, so the status used to read "Done" on the
		     one answer that is emphatically not an achievement (#495). -->
		<Badge variant={task.status === 'open' ? 'outline' : 'secondary'}>
			{participationDecision === 'declined'
				? 'Withdrawn'
				: task.status === 'open'
					? 'Open'
					: task.status === 'submitted'
						? 'Handed in'
						: 'Done'}
		</Badge>
	</div>

	{#if dueLabel}
		<p class="mt-3 text-sm {overdue ? 'text-status-bad font-medium' : 'text-muted-foreground'}">
			<!-- One expression rather than an {#if} block: Svelte trims the whitespace that
			     starts a block, and the line read "11 August— overdue" without it. -->
			Due {dueLabel}{overdue ? ' — overdue' : ''}
		</p>
	{/if}

	{#if latestRejected}
		<p
			class="border-status-warn/40 bg-status-warn-bg text-status-warn mt-4 rounded-md border px-3 py-2 text-sm"
			role="status"
		>
			The organizers asked for a new version of this file.
		</p>
	{/if}

	{#if visibleInstructions}
		<p class="mt-4 text-sm whitespace-pre-line">{visibleInstructions}</p>
	{/if}

	{#if participationTask}
		<section class="border-border bg-muted/30 mt-6 rounded-lg border p-5">
			<h2 class="font-medium">Confirm your participation</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Tell the organizers whether you can take part in {task.conferenceName}. Your answer applies
				to all of your sessions at this event.
			</p>

			<div class="mt-4">
				<p class="text-sm font-medium">{task.submissionTitle ?? 'Your accepted session'}</p>
				{#if sessionWhen}
					<p class="text-muted-foreground mt-1 text-sm">
						{sessionWhen}{#if task.sessionRoom}<span class="px-1.5">·</span>{task.sessionRoom}{/if}
					</p>
				{:else}
					<p class="text-muted-foreground mt-1 text-sm">The schedule is not published yet.</p>
				{/if}
				{#if task.conferenceVenue}
					<p class="text-muted-foreground mt-1 text-sm">{task.conferenceVenue}</p>
				{/if}
			</div>

			{#if participationDecision === 'confirmed'}
				<p class="text-status-good mt-4 text-sm font-medium">You are confirmed for this event.</p>
			{:else if participationDecision === 'declined'}
				<p class="text-status-bad mt-4 text-sm font-medium">
					You told the organizers you cannot take part.
				</p>
			{/if}

			<div class="mt-4 flex flex-wrap gap-3">
				{#if participationDecision !== 'confirmed'}
					<form method="POST" action="?/participation" use:enhance={submitting('edit')}>
						<input type="hidden" name="decision" value="confirmed" />
						<Button type="submit" disabled={busy}>Yes, I’ll be there</Button>
					</form>
				{/if}
				{#if participationDecision !== 'declined'}
					<form
						id="withdraw-form"
						method="POST"
						action="?/participation"
						use:enhance={submitting('edit')}
					>
						<input type="hidden" name="decision" value="declined" />
						<Button
							type="submit"
							variant="outline"
							disabled={busy}
							data-testid="withdraw-submit"
							onclick={(event: MouseEvent) => {
								// "Yes, I'll be there" needs no guard: it is the state you can undo
								// from the screen you are standing on, and it costs nobody anything
								// if it was a misclick. Withdrawing tells the organizers to drop you
								// from the programme (#495), so it asks first.
								event.preventDefault();
								confirmWithdraw = true;
							}}
						>
							I can’t take part
						</Button>
					</form>

					<!--
						The confirm button reaches the form through `form=`, not a click handler:
						the dialog content is portalled out of the form's subtree, so a plain
						submit button inside it would post nothing. Without JavaScript the trigger
						stays an ordinary submit button and the withdrawal still works — the guard
						is an enhancement, not the mechanism. Same shape as unpublishing a
						conference, which is the other button in this app that lands somewhere the
						screen you are on cannot show you.

						It lives inside the same `{#if}` as the form it submits, so the answer
						landing takes the question away with it. Outside, the speaker reads
						"You told the organizers you cannot take part" *underneath* a dialog
						still asking whether they want to — with "Keep my place" offered after
						the place is gone.
					-->
					<AlertDialog bind:open={confirmWithdraw}>
						<AlertDialogContent data-testid="withdraw-dialog">
							<AlertDialogHeader>
								<AlertDialogTitle>{warning.title}</AlertDialogTitle>
								<AlertDialogDescription>
									{warning.consequence}
									<span class="mt-2 block">{warning.reversal}</span>
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel data-testid="withdraw-cancel">Keep my place</AlertDialogCancel>
								<Button
									type="submit"
									form="withdraw-form"
									variant="destructive"
									disabled={busy}
									data-testid="withdraw-confirm"
								>
									Withdraw me
								</Button>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				{/if}
			</div>

			{#if form?.participationError}
				<p class="text-status-bad mt-3 text-sm">{form.participationError}</p>
			{/if}
		</section>
	{:else if task.kind === 'action'}
		{#if profileTask}
			<section class="border-border bg-muted/30 mt-6 rounded-lg border p-5">
				<h2 class="font-medium">Complete your speaker profile</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Add the bio, headshot, role and links organizers need for the programme and speaker pages.
				</p>
				<Button href="/portal/profile" class="mt-4">Open my speaker profile</Button>
				<p class="text-muted-foreground mt-3 text-xs">
					When your profile is ready, return here and mark the task as done.
				</p>
			</section>
		{/if}
		<form method="POST" action="?/toggle" use:enhance={submitting('edit')} class="mt-6">
			<input type="hidden" name="done" value={task.status === 'done' ? 'false' : 'true'} />
			<Button
				type="submit"
				variant={task.status === 'done' ? 'outline' : 'default'}
				disabled={busy}
			>
				{task.status === 'done' ? 'Reopen this task' : 'Mark as done'}
			</Button>
		</form>
	{:else}
		<section class="mt-8">
			<h2 class="text-sm font-medium">
				{files.length === 0 ? 'Hand in a file' : 'Add a new version'}
			</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{files.length === 0
					? 'Upload the requested file when it is ready. Nothing you sent before is lost.'
					: latestRejected
						? 'Upload a new version that addresses what they asked for. Nothing you sent before is lost.'
						: 'Your file is already handed in. Upload here only to add a newer version. Nothing you sent before is lost.'}
			</p>

			<form
				method="POST"
				action="?/upload"
				enctype="multipart/form-data"
				use:enhance={submitting('add')}
				class="mt-3 flex flex-wrap items-center gap-3"
			>
				<input
					type="file"
					name="file"
					accept={UPLOAD_ACCEPT}
					required
					disabled={busy}
					data-testid="task-upload"
					onchange={handInOnPick}
					class="file:border-input file:bg-background text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
				/>
				{#if !hydrated}
					<Button type="submit" disabled={busy}>Upload</Button>
				{/if}
				<span class="text-muted-foreground text-sm"
					>PDF, image, slides or document, up to {megabytes} MB.{#if hydrated}
						It is handed in as soon as you pick it.{/if}</span
				>
			</form>

			{#if form?.uploadError}
				<p class="text-status-bad mt-2 text-sm">{form.uploadError}</p>
			{/if}
		</section>

		<section class="mt-8">
			<h2 class="text-sm font-medium">
				{files.length === 0 ? 'Nothing handed in yet' : 'What you have handed in'}
			</h2>

			<ul class="divide-border mt-3 divide-y">
				{#each files as file, i (file.id)}
					<li class="py-4">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div>
								<ContentFileLink
									filename={file.filename}
									contentType={file.contentType}
									href="/portal/files/{file.id}"
									onOpen={openFile}
								/>
								<span class="text-muted-foreground ml-2 text-sm">
									v{file.version}{#if file.sizeBytes}<span class="px-1.5">·</span>{sizeLabel(
											file.sizeBytes
										)}{/if}
								</span>
							</div>
							<div class="flex items-center gap-2">
								{#if i === 0}
									<Badge variant="secondary">Latest</Badge>
								{/if}
								<Badge variant={file.approvalStatus === 'approved' ? 'secondary' : 'outline'}>
									{file.approvalStatus === 'approved'
										? 'Approved'
										: file.approvalStatus === 'rejected'
											? 'Changes requested'
											: 'Waiting for a look'}
								</Badge>
							</div>
						</div>
						<p class="text-muted-foreground mt-0.5 text-sm">Uploaded {stamp(file.uploadedAt)}</p>

						{#if file.comments.length > 0}
							<ul class="border-border mt-3 space-y-2 border-l pl-3">
								{#each file.comments as comment (comment.id)}
									<li class="text-sm">
										<span class="font-medium">{comment.authorName ?? 'Someone'}</span>
										<span class="text-muted-foreground"> · {stamp(comment.createdAt)}</span>
										<p class="mt-0.5 whitespace-pre-line">{comment.body}</p>
									</li>
								{/each}
							</ul>
						{/if}

						<form
							method="POST"
							action="?/comment"
							use:enhance={commenting(file.id)}
							class="mt-3"
							data-testid={`speaker-question-form-${file.id}`}
						>
							<input type="hidden" name="deliverableId" value={file.id} />
							<p class="text-muted-foreground mb-2 text-sm">
								Goes to the programme team of {task.conferenceName}. Their reply appears here.
							</p>
							<BrowserDraftInput
								name="body"
								class="text-sm"
								scope={portalTaskCommentScope(task.id, file.id)}
								owner={data.user.id}
								baseline=""
								rows={2}
								aria-label="Question for the programme team of {task.conferenceName}"
								placeholder="Ask the programme team of {task.conferenceName}"
								testId="task-comment-{file.id}"
								commitToken={commitByFile[file.id] ?? 0}
								ondirtychange={(dirty) => setCommentDirty(file.id, dirty)}
							/>
							<Button type="submit" variant="outline" size="sm" class="mt-2" disabled={busy}>
								Send to the programme team
							</Button>
						</form>
					</li>
				{/each}
			</ul>

			{#if form?.commentError}
				<p class="text-status-bad mt-2 text-sm">{form.commentError}</p>
			{/if}
		</section>
	{/if}
</div>

<FilePreviewSheet bind:preview />
