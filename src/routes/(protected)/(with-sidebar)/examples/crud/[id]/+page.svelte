<script lang="ts">
	import { run } from 'svelte/legacy';

	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Separator } from '$lib/components/ui/separator';
	import { AlertCircle, Trash2, Edit, Save, ArrowLeft } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let idValue = $state(data.exampleObject?.id || '');
	let nameValue = $state(data.exampleObject?.name || '');
	let descriptionValue = $state(data.exampleObject?.description || '');

	let submittingUpdate = $state(false);
	let submittingDelete = $state(false);
	let showDeleteConfirm = $state(false);

	run(() => {
		if (form?.data && form.formAction === '?/update') {
			idValue = form.data.id || data.exampleObject?.id || '';
			nameValue = form.data.name || data.exampleObject?.name || '';
			descriptionValue = form.data.description || data.exampleObject?.description || '';
		} else if (data.exampleObject) {
			idValue = data.exampleObject.id;
			nameValue = data.exampleObject.name;
			descriptionValue = data.exampleObject.description || '';
		}
	});
</script>

<svelte:head>
	<title>Edit: {nameValue || 'Example Object'}</title>
	<meta name="description" content="View and Edit Example Object {nameValue}" />
</svelte:head>

<div class="container mx-auto p-4 md:p-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">
			View/Edit: <span class="font-normal">{nameValue}</span>
		</h1>
		<a href="/examples/crud">
			<Button variant="outline"><ArrowLeft class="mr-2 h-4 w-4" /> Back to List</Button>
		</a>
	</div>

	{#if data.exampleObject}
		<Card.Root class="mb-8">
			<Card.Header>
				<Card.Title class="flex items-center">
					<Edit class="mr-2 h-5 w-5" />
					Edit Example Object
				</Card.Title>
				<Card.Description>Modify the details of '{nameValue}' (ID: {idValue}).</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/update"
					use:enhance={() => {
						submittingUpdate = true;
						return async ({ update }) => {
							await update();
							submittingUpdate = false;
						};
					}}
				>
					<input type="hidden" name="id" bind:value={idValue} />

					<div class="mb-4 space-y-1">
						<Label for="name-input-edit">Name</Label>
						<Input
							id="name-input-edit"
							name="name"
							bind:value={nameValue}
							placeholder="Enter example name"
							aria-invalid={form?.errors?.name && form.formAction === '?/update'
								? 'true'
								: undefined}
						/>
						{#if form?.errors?.name && form.formAction === '?/update'}
							{#each form.errors.name as errorMsg}
								<p class="text-destructive text-sm">{errorMsg}</p>
							{/each}
						{/if}
					</div>

					<div class="mb-6 space-y-1">
						<Label for="description-input-edit">Description</Label>
						<Textarea
							id="description-input-edit"
							name="description"
							bind:value={descriptionValue}
							placeholder="Enter example description"
							aria-invalid={form?.errors?.description && form.formAction === '?/update'
								? 'true'
								: undefined}
						/>
						{#if form?.errors?.description && form.formAction === '?/update'}
							{#each form.errors.description as errorMsg}
								<p class="text-destructive text-sm">{errorMsg}</p>
							{/each}
						{/if}
					</div>

					<div class="flex items-center justify-between">
						<Button type="submit" disabled={submittingUpdate}>
							{#if submittingUpdate}
								<Save class="mr-2 h-4 w-4 animate-spin" />
								Saving...
							{:else}
								<Save class="mr-2 h-4 w-4" />
								Save Changes
							{/if}
						</Button>

						<AlertDialog.Root bind:open={showDeleteConfirm}>
							<AlertDialog.Trigger
								class={buttonVariants({ variant: 'destructive' })}
								disabled={submittingDelete}
							>
								<Trash2 class="mr-2 h-4 w-4" /> Delete
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
									<AlertDialog.Description>
										This action cannot be undone. This will permanently delete the example object
										<strong>{nameValue}</strong>.
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
									<form
										method="POST"
										action="?/remove"
										use:enhance={() => {
											submittingDelete = true;
											return async ({ update }) => {
												await update();
												submittingDelete = false;
											};
										}}
									>
										<Button type="submit" variant="destructive" disabled={submittingDelete}>
											{#if submittingDelete}
												<Trash2 class="mr-2 h-4 w-4 animate-spin" /> Deleting...
											{:else}
												<Trash2 class="mr-2 h-4 w-4" /> Yes, delete it
											{/if}
										</Button>
									</form>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{:else}
		<Alert.Root variant="destructive" class="mb-6">
			<AlertCircle class="h-4 w-4" />
			<Alert.Title>Error</Alert.Title>
			<Alert.Description
				>Example object not found. It may have been deleted or you may not have access.</Alert.Description
			>
		</Alert.Root>
		<a href="/examples/crud">
			<Button variant="outline"><ArrowLeft class="mr-2 h-4 w-4" /> Back to List</Button>
		</a>
	{/if}

	<Separator class="my-8" />
	{#if data.exampleObject}
		<Card.Root>
			<Card.Header><Card.Title>Raw Data (Current)</Card.Title></Card.Header>
			<Card.Content>
				<pre class="bg-muted overflow-x-auto rounded-md p-4 text-sm">{JSON.stringify(
						data.exampleObject,
						null,
						2
					)}</pre>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
