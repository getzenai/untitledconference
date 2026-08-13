<script lang="ts">
	/**
	 * The rows inside an expanded speaker card.
	 *
	 * Pulled out of the page so the talk title can be pinned without a test-only
	 * page prop — SvelteKit pages may only receive `data` / `form` / `errors`.
	 */
	import { Badge } from '$lib/components/ui/badge';

	type Task = {
		id: number;
		title: string;
		kind: string;
		status: string;
		dueOn: Date | string | null;
		fileCount: number;
		latestFilename: string | null;
		latestApproval: string | null;
		sessionTitle: string | null;
	};

	let { base, tasks }: { base: string; tasks: Task[] } = $props();

	const due = (value: Date | string | null) =>
		value ? new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : null;

	const overdue = (value: Date | string | null, status: string) =>
		Boolean(value && status !== 'done' && new Date(value) < new Date());
</script>

<ul class="divide-border border-border mt-0 divide-y border-t px-4 pb-4">
	{#each tasks as task (task.id)}
		<li class="flex flex-wrap items-center justify-between gap-2 py-2">
			<div class="min-w-0">
				<a class="text-sm hover:underline" href="{base}/content/tasks/{task.id}">
					{task.title}
				</a>
				{#if task.sessionTitle}
					<span class="text-muted-foreground ml-2 text-xs">{task.sessionTitle}</span>
				{/if}
				<span class="text-muted-foreground ml-2 text-xs">
					{#if task.fileCount > 0}
						{task.latestFilename}{#if task.fileCount > 1}
							<span class="px-1">·</span>v{task.fileCount}{/if}
					{:else if task.kind === 'file_request'}
						nothing handed in
					{:else}
						no file needed
					{/if}
					{#if task.dueOn}
						<span class="px-1">·</span>
						<span class={overdue(task.dueOn, task.status) ? 'text-status-bad' : ''}>
							due {due(task.dueOn)}
						</span>
					{/if}
				</span>
			</div>

			<div class="flex items-center gap-2">
				{#if task.latestApproval && task.fileCount > 0}
					<Badge variant={task.latestApproval === 'approved' ? 'secondary' : 'outline'}>
						{task.latestApproval === 'approved'
							? 'Approved'
							: task.latestApproval === 'rejected'
								? 'Rejected'
								: 'Needs a look'}
					</Badge>
				{/if}
				<Badge variant={task.status === 'open' ? 'outline' : 'secondary'}>
					{task.status === 'open' ? 'To do' : task.status === 'submitted' ? 'Handed in' : 'Done'}
				</Badge>
			</div>
		</li>
	{/each}
</ul>
