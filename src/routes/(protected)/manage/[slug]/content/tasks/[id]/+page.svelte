<script lang="ts">
	/**
	 * One task, from the side that decides (CNT-07/08/11).
	 *
	 * Approving or rejecting takes a note in the same submit. A rejection with no reason
	 * moves the task back to open and tells the speaker nothing about what to change,
	 * which turns one round trip into three.
	 */
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
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

	const sizeLabel = (bytes: number | null) =>
		bytes === null ? '' : `${(bytes / 1024).toFixed(0)} KB`;
</script>

<svelte:head>
	<title>{task.title} — {data.conference.name}</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<a class="text-muted-foreground text-sm hover:underline" href="{base}/content">
		← Speaker content
	</a>

	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{task.title}</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				{task.speakerName}
				{#if task.speakerEmail}<span class="px-1.5">·</span>{task.speakerEmail}{/if}
				{#if !task.speakerHasAccount}
					<span class="px-1.5">·</span>no account, so they cannot upload this themselves
				{/if}
			</p>
		</div>
		<Badge variant={task.status === 'open' ? 'outline' : 'secondary'}>
			{task.status === 'open' ? 'Open' : task.status === 'submitted' ? 'Handed in' : 'Done'}
		</Badge>
	</div>

	{#if task.instructions}
		<p class="text-sm whitespace-pre-line">{task.instructions}</p>
	{/if}

	{#if form?.error}
		<p class="text-status-bad text-sm">{form.error}</p>
	{/if}

	{#if files.length === 0}
		<p class="border-border bg-muted/40 rounded-lg border p-4 text-sm">
			{task.kind === 'file_request'
				? 'Nothing handed in yet.'
				: 'This task needs no file — the speaker ticks it off in their portal.'}
		</p>
	{:else}
		<ul class="divide-border divide-y">
			{#each files as file, i (file.id)}
				<li class="py-4">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<div>
							<a class="text-sm font-medium hover:underline" href="{base}/content/files/{file.id}">
								{file.filename}
							</a>
							<span class="text-muted-foreground ml-2 text-sm">
								v{file.version}{#if file.sizeBytes}<span class="px-1.5">·</span>{sizeLabel(
										file.sizeBytes
									)}{/if}
							</span>
						</div>
						<div class="flex items-center gap-2">
							{#if i === 0}<Badge variant="secondary">Latest</Badge>{/if}
							<Badge variant={file.approvalStatus === 'approved' ? 'secondary' : 'outline'}>
								{file.approvalStatus === 'approved'
									? 'Approved'
									: file.approvalStatus === 'rejected'
										? 'Rejected'
										: 'Needs a look'}
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

					<!--
						The decision sits on the newest version only. The task follows that
						version (the server derives it, so an older one cannot rewrite the
						status), and offering the buttons on every version invited a click
						that looked like it did nothing. The separate comment form below stays
						available on every version, including older files.
					-->
					{#if i === 0}
						<form method="POST" action="?/decide" use:enhance={submitting} class="mt-3">
							<input type="hidden" name="deliverableId" value={file.id} />
							<Textarea
								name="note"
								rows={2}
								placeholder="What should they change? The speaker sees this."
								class="text-sm"
							/>
							<div class="mt-2 flex flex-wrap gap-2">
								<Button type="submit" name="approval" value="approved" size="sm" disabled={busy}>
									Approve
								</Button>
								<Button
									type="submit"
									name="approval"
									value="rejected"
									size="sm"
									variant="outline"
									disabled={busy}
								>
									Ask for changes
								</Button>
								{#if file.approvalStatus !== 'pending'}
									<Button
										type="submit"
										name="approval"
										value="pending"
										size="sm"
										variant="ghost"
										disabled={busy}
									>
										Undecide
									</Button>
								{/if}
							</div>
						</form>
					{/if}

					<form
						method="POST"
						action="?/comment"
						use:enhance={submitting}
						class="mt-3"
						data-testid={`organizer-comment-form-${file.id}`}
					>
						<input type="hidden" name="deliverableId" value={file.id} />
						<Textarea
							name="body"
							aria-label={`Comment on ${file.filename}`}
							rows={2}
							placeholder="Add a comment about this file"
							required
							class="text-sm"
						/>
						<Button type="submit" variant="outline" size="sm" class="mt-2" disabled={busy}>
							Add comment
						</Button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</div>
