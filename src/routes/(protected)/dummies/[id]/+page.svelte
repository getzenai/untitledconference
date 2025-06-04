<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Separator } from '$lib/components/ui/separator';
	import { AlertCircle, Trash2, Edit, Save, ArrowLeft } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	export let data: PageData;
	export let form: ActionData;

	let idValue = data.dummyElement?.id || '';
	let nameValue = data.dummyElement?.name || '';
	let descriptionValue = data.dummyElement?.description || '';

	let submittingUpdate = false;
	let submittingDelete = false;
	let showDeleteConfirm = false;

	$: if (form?.data && form.formAction === '?/update') {
		idValue = form.data.id || data.dummyElement?.id || '';
		nameValue = form.data.name || data.dummyElement?.name || '';
		descriptionValue = form.data.description || data.dummyElement?.description || '';
	} else if (data.dummyElement) {
		idValue = data.dummyElement.id;
		nameValue = data.dummyElement.name;
		descriptionValue = data.dummyElement.description;
	}
</script>

<svelte:head>
	<title>Edit: {nameValue || 'Dummy Element'}</title>
	<meta name="description" content="View and Edit Dummy Element {nameValue}" />
</svelte:head>

<div class="container mx-auto p-4 md:p-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">
			View/Edit: <span class="font-normal">{nameValue}</span>
		</h1>
		<a href="/dummies">
			<Button variant="outline"><ArrowLeft class="mr-2 h-4 w-4" /> Back to List</Button>
		</a>
	</div>

	{#if data.dummyElement}
		<Card.Root class="mb-8">
			<Card.Header>
				<Card.Title class="flex items-center">
					<Edit class="mr-2 h-5 w-5" />
					Edit Dummy Element
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
							placeholder="Enter dummy name"
							aria-invalid={form?.errors?.name && form.formAction === '?/update'
								? 'true'
								: undefined}
						/>
						{#if form?.errors?.name && form.formAction === '?/update'}
							{#each form.errors.name as errorMsg}
								<p class="text-sm text-destructive">{errorMsg}</p>
							{/each}
						{/if}
					</div>

					<div class="mb-6 space-y-1">
						<Label for="description-input-edit">Description</Label>
						<Textarea
							id="description-input-edit"
							name="description"
							bind:value={descriptionValue}
							placeholder="Enter dummy description"
							aria-invalid={form?.errors?.description && form.formAction === '?/update'
								? 'true'
								: undefined}
						/>
						{#if form?.errors?.description && form.formAction === '?/update'}
							{#each form.errors.description as errorMsg}
								<p class="text-sm text-destructive">{errorMsg}</p>
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
							<AlertDialog.Trigger asChild let:builder>
								<Button variant="destructive" builders={[builder]} disabled={submittingDelete}>
									<Trash2 class="mr-2 h-4 w-4" /> Delete
								</Button>
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
									<AlertDialog.Description>
										This action cannot be undone. This will permanently delete the dummy element
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
				>Dummy element not found. It may have been deleted or you may not have access.</Alert.Description
			>
		</Alert.Root>
		<a href="/dummies">
			<Button variant="outline"><ArrowLeft class="mr-2 h-4 w-4" /> Back to List</Button>
		</a>
	{/if}

	<Separator class="my-8" />
	{#if data.dummyElement}
		<Card.Root>
			<Card.Header><Card.Title>Raw Data (Current)</Card.Title></Card.Header>
			<Card.Content>
				<pre class="overflow-x-auto rounded-md bg-muted p-4 text-sm">{JSON.stringify(
						data.dummyElement,
						null,
						2
					)}</pre>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
