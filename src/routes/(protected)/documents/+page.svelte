<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash';
	import EditIcon from '@lucide/svelte/icons/edit';
	import FileTextIcon from '@lucide/svelte/icons/file-text';

	export let data: PageData;

	let creatingDocument = false;

	function handleDeleteClick(id: number, event: Event) {
		event.stopPropagation();
		if (!confirm('Are you sure you want to delete this document?')) return;

		// Submit the form programmatically
		const form = document.getElementById(`delete-form-${id}`) as HTMLFormElement;
		if (form) {
			form.requestSubmit();
		}
	}
</script>

<div class="container mx-auto py-8">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Documents</h1>
			<p class="text-muted-foreground mt-2">Create and manage your documents</p>
		</div>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				creatingDocument = true;
				return async ({ update }) => {
					await update();
					creatingDocument = false;
				};
			}}
		>
			<Button type="submit" disabled={creatingDocument}>
				<PlusIcon class="mr-2 h-4 w-4" />
				{creatingDocument ? 'Creating...' : 'New Document'}
			</Button>
		</form>
	</div>

	{#if data.documents.length === 0}
		<Card.Root class="mx-auto max-w-md">
			<Card.Content class="flex flex-col items-center py-12 text-center">
				<FileTextIcon class="text-muted-foreground mb-4 h-12 w-12" />
				<h3 class="mb-2 text-lg font-semibold">No documents yet</h3>
				<p class="text-muted-foreground mb-6">Create your first document to get started</p>
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						creatingDocument = true;
						return async ({ update }) => {
							await update();
							creatingDocument = false;
						};
					}}
				>
					<Button type="submit" disabled={creatingDocument}>
						<PlusIcon class="mr-2 h-4 w-4" />
						{creatingDocument ? 'Creating...' : 'Create Document'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each data.documents as doc}
				<Card.Root
					class="cursor-pointer transition-shadow hover:shadow-lg"
					onclick={() => goto(`/documents/${doc.id}`)}
				>
					<Card.Header>
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<Card.Title class="line-clamp-1">{doc.title}</Card.Title>
								<Card.Description>
									Updated {new Date(doc.updatedAt).toLocaleDateString()}
								</Card.Description>
							</div>
							<div class="flex gap-1">
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									onclick={(e) => {
										e.stopPropagation();
										goto(`/documents/${doc.id}`);
									}}
								>
									<EditIcon class="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									onclick={(e) => handleDeleteClick(doc.id, e)}
								>
									<TrashIcon class="h-4 w-4" />
								</Button>
								<form
									id={`delete-form-${doc.id}`}
									method="POST"
									action="?/delete"
									use:enhance
									class="hidden"
								>
									<input type="hidden" name="id" value={doc.id} />
								</form>
							</div>
						</div>
					</Card.Header>
					{#if doc.plainText}
						<Card.Content>
							<p class="text-muted-foreground line-clamp-3 text-sm">
								{doc.plainText}
							</p>
						</Card.Content>
					{/if}
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
