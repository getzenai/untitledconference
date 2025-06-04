<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Separator } from '$lib/components/ui/separator';
	import { Edit, PlusCircle } from 'lucide-svelte';

	export let data: PageData;
	export let form: ActionData;

	let nameValue = '';
	let descriptionValue = '';
	let submitting = false;
	$: if (form?.data) {
		nameValue = form.data.name || '';
		descriptionValue = form.data.description || '';
	}

	$: if (form?.success) {
		nameValue = '';
		descriptionValue = '';
	}
</script>

<svelte:head>
	<title>Dummy Elements</title>
	<meta name="description" content="Manage Dummy Elements" />
</svelte:head>

<div class="container mx-auto p-4 md:p-8">
	<Card.Root class="mb-8">
		<Card.Header>
			<Card.Title class="flex items-center">
				<PlusCircle class="mr-2 h-5 w-5" />
				Create New Dummy Element
			</Card.Title>
			<Card.Description>Add a new dummy element to the system.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						await update();
						submitting = false;
						if (result.type === 'success' || result.status === 200) {
							await invalidateAll();
						}
					};
				}}
			>
				<div class="mb-4 space-y-1">
					<Label for="name-input">Name</Label>
					<Input
						id="name-input"
						name="name"
						bind:value={nameValue}
						placeholder="Enter dummy name"
						aria-invalid={form?.errors?.name ? 'true' : undefined}
					/>
					{#if form?.errors?.name}
						{#each form.errors.name as errorMsg}
							<p class="text-sm text-destructive">{errorMsg}</p>
						{/each}
					{/if}
				</div>

				<div class="mb-6 space-y-1">
					<Label for="description-input">Description</Label>
					<Textarea
						id="description-input"
						name="description"
						bind:value={descriptionValue}
						placeholder="Enter dummy description"
						aria-invalid={form?.errors?.description ? 'true' : undefined}
					/>
					{#if form?.errors?.description}
						{#each form.errors.description as errorMsg}
							<p class="text-sm text-destructive">{errorMsg}</p>
						{/each}
					{/if}
				</div>

				<Button type="submit" disabled={submitting}>
					{#if submitting}
						<PlusCircle class="mr-2 h-4 w-4 animate-spin" />
						Creating...
					{:else}
						<PlusCircle class="mr-2 h-4 w-4" />
						Create Element
					{/if}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Separator class="my-8" />

	<h2 class="mb-6 text-2xl font-semibold">Existing Dummy Elements</h2>
	{#if data.dummies && data.dummies.length > 0}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each data.dummies as dummy (dummy.id)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{dummy.name}</Card.Title>
					</Card.Header>
					<Card.Content>
						<p class="text-xs text-muted-foreground">ID: {dummy.id}</p>
						<p class="text-xs text-muted-foreground">
							Created: {new Date(dummy.createdAt).toLocaleString()}
						</p>
						<p class="text-xs text-muted-foreground">
							Updated: {new Date(dummy.updatedAt).toLocaleString()}
						</p>
					</Card.Content>
					<Card.Footer class="flex justify-end gap-2">
						<a href="/dummies/{dummy.id}" data-sveltekit-preload-data="hover">
							<Button variant="outline" size="sm">
								<Edit class="mr-1 h-4 w-4" /> View/Edit
							</Button>
						</a>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	{:else}
		<p class="py-8 text-center text-muted-foreground">No dummy elements found. Create one above!</p>
	{/if}
</div>
