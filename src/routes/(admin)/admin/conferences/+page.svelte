<script lang="ts">
	import { enhance } from '$lib/forms/enhance';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { toast } from 'svelte-sonner';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	$effect(() => {
		if (form?.success && form.message) toast.success(form.message);
		if (form && 'error' in form && form.error) toast.error(form.error);
	});
</script>

<svelte:head>
	<title>Front page listings — Admin</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Front page listings</h1>
		<p class="text-muted-foreground mt-0.5 text-sm">
			The conferences the directory on <code>/</code> is allowed to name. Taking one off here does
			not unpublish it — <code>/c/&lt;slug&gt;</code> and its call for papers stay exactly as they were.
		</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Listed conferences</CardTitle>
			<CardDescription>
				Turning a listing back on is the organizer's decision and lives in that conference's
				settings. This page can only take one down.
			</CardDescription>
		</CardHeader>
		<CardContent>
			{#if data.conferences.length === 0}
				<p class="text-muted-foreground text-sm">Nothing is listed on the front page.</p>
			{:else}
				<Table data-testid="admin-listed-conferences">
					<TableHeader>
						<TableRow>
							<TableHead>Conference</TableHead>
							<TableHead>Organization</TableHead>
							<TableHead>Status</TableHead>
							<TableHead class="text-right">Listing</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each data.conferences as conference (conference.id)}
							<TableRow data-testid="admin-conference-row-{conference.slug}">
								<TableCell>
									<div class="font-medium">{conference.name}</div>
									<a
										class="text-muted-foreground text-xs underline underline-offset-4"
										href="/c/{conference.slug}"
									>
										/c/{conference.slug}
									</a>
								</TableCell>
								<TableCell class="text-sm">{conference.organizationName ?? '—'}</TableCell>
								<TableCell>
									{#if conference.status === 'published'}
										<Badge variant="secondary">On the front page</Badge>
									{:else}
										<!-- Listed but not published: the directory filters on both, so a
										     visitor never sees this one. Said out loud, because otherwise
										     the row looks like an unexplained miss. -->
										<Badge variant="outline">{conference.status} — not shown</Badge>
									{/if}
								</TableCell>
								<TableCell class="text-right">
									<form method="POST" action="?/unlist" use:enhance>
										<input type="hidden" name="conferenceId" value={conference.id} />
										<Button
											type="submit"
											variant="outline"
											size="sm"
											data-testid="unlist-{conference.slug}"
										>
											Take off the front page
										</Button>
									</form>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</CardContent>
	</Card>
</div>
