<script lang="ts">
	/**
	 * What the organizers need from you, and what you have handed in so far.
	 *
	 * Versions are listed newest first with the top one marked — a speaker who
	 * re-uploads needs to see that the new file is the one that counts, and that
	 * the old one did not vanish (CNT-04).
	 */
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from '$lib/conference/upload-limits';

	let { data, form } = $props();

	const task = $derived(data.task);
	const files = $derived(data.files);
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

	const stamp = (value: Date | string) =>
		new Date(value).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	// Same rule as the portal list: the year shows up only when it is not this one,
	// so a deadline in the next CFP year cannot be misread as one this month.
	const dueLabel = $derived.by(() => {
		if (!task.dueOn) return null;
		const date = new Date(task.dueOn);
		const options: Intl.DateTimeFormatOptions = {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		};
		if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
		return date.toLocaleDateString('en-GB', options);
	});
	const overdue = $derived(Boolean(task.dueOn && new Date(task.dueOn) < new Date()));

	const sizeLabel = (bytes: number | null) =>
		bytes === null ? '' : `${(bytes / 1024).toFixed(0)} KB`;

	const megabytes = MAX_UPLOAD_BYTES / 1024 / 1024;
</script>

<svelte:head>
	<title>{task.title} — Speaker portal</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8">
	<a class="text-muted-foreground text-sm hover:underline" href="/portal">← Speaker portal</a>

	<div class="mt-4 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{task.title}</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				{task.conferenceName}{#if task.submissionTitle}<span class="px-1.5">·</span
					>{task.submissionTitle}{/if}
			</p>
		</div>
		<Badge variant={task.status === 'open' ? 'outline' : 'secondary'}>
			{task.status === 'open' ? 'Open' : task.status === 'submitted' ? 'Handed in' : 'Done'}
		</Badge>
	</div>

	{#if dueLabel}
		<p class="mt-3 text-sm {overdue ? 'text-status-bad font-medium' : 'text-muted-foreground'}">
			<!-- One expression rather than an {#if} block: Svelte trims the whitespace that
			     starts a block, and the line read "11 August— overdue" without it. -->
			Due {dueLabel}{overdue ? ' — overdue' : ''}
		</p>
	{/if}

	{#if task.instructions}
		<p class="mt-4 text-sm whitespace-pre-line">{task.instructions}</p>
	{/if}

	{#if task.kind === 'action'}
		<form method="POST" action="?/toggle" use:enhance={submitting} class="mt-6">
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
			<h2 class="text-sm font-medium">Hand in a file</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Uploading again adds a new version. Nothing you sent before is lost.
			</p>

			<form
				method="POST"
				action="?/upload"
				enctype="multipart/form-data"
				use:enhance={submitting}
				class="mt-3 flex flex-wrap items-center gap-3"
			>
				<input
					type="file"
					name="file"
					accept={UPLOAD_ACCEPT}
					required
					class="file:border-input file:bg-background text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm"
				/>
				<Button type="submit" disabled={busy}>Upload</Button>
				<span class="text-muted-foreground text-sm"
					>PDF, image, slides or document, up to {megabytes} MB.</span
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
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<div>
								<a class="text-sm font-medium hover:underline" href="/portal/files/{file.id}">
									{file.filename}
								</a>
								<span class="text-muted-foreground ml-2 text-sm">
									v{file.version}{#if file.sizeBytes}<span class="px-1.5">·</span>{sizeLabel(
											file.sizeBytes
										)}{/if}
								</span>
							</div>
							{#if i === 0}
								<Badge variant="secondary">Latest</Badge>
							{/if}
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

						<form method="POST" action="?/comment" use:enhance={submitting} class="mt-3">
							<input type="hidden" name="deliverableId" value={file.id} />
							<Textarea
								name="body"
								rows={2}
								placeholder="Ask a question about this file"
								class="text-sm"
							/>
							<Button type="submit" variant="outline" size="sm" class="mt-2" disabled={busy}>
								Add comment
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
