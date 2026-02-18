<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import * as Form from '$lib/components/ui/form';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Separator } from '$lib/components/ui/separator';
	import { AlertCircle, Trash2, Edit, Save, ArrowLeft } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { enhance as svelteKitEnhance } from '$app/forms';
	import { exampleFormSchema } from '../schema';

	let { data } = $props();

	const form = superForm(data.form, {
		validators: zod4Client(exampleFormSchema)
	});

	const { form: formData, enhance, submitting } = form;

	let submittingDelete = $state(false);
	let showDeleteConfirm = $state(false);
</script>

<svelte:head>
	<title>Edit: {$formData.name || 'Example Object'}</title>
	<meta name="description" content="View and Edit Example Object {$formData.name}" />
</svelte:head>

<div class="container mx-auto p-4 md:p-8">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">
			View/Edit: <span class="font-normal">{$formData.name}</span>
		</h1>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/examples/crud" data-sveltekit-preload-data="hover">
			<Button variant="outline">
				<ArrowLeft class="mr-2 h-4 w-4" /> Back to List
			</Button>
		</a>
	</div>

	{#if data.exampleObject}
		<Card.Root class="mb-8">
			<Card.Header>
				<Card.Title class="flex items-center">
					<Edit class="mr-2 h-5 w-5" />
					Edit Example Object
				</Card.Title>
				<Card.Description
					>Modify the details of '{$formData.name}' (ID: {data.exampleObject
						?.id}).</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/update" use:enhance>
					<Form.Field {form} name="name">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Name</Form.Label>
								<Input {...props} bind:value={$formData.name} placeholder="Enter example name" />
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>

					<Form.Field {form} name="description">
						<Form.Control>
							{#snippet children({ props })}
								<Form.Label>Description</Form.Label>
								<Textarea
									{...props}
									bind:value={$formData.description as string}
									placeholder="Enter example description"
								/>
							{/snippet}
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>

					<div class="mt-6 flex items-center justify-between">
						<Button type="submit" disabled={$submitting}>
							{#if $submitting}
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
										<strong>{$formData.name}</strong>.
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
									<form
										method="POST"
										action="?/delete"
										use:svelteKitEnhance={() => {
											submittingDelete = true;
											return async ({ update }) => {
												await update();
												submittingDelete = false;
											};
										}}
									>
										<AlertDialog.Action type="submit" disabled={submittingDelete}>
											{#if submittingDelete}
												<Trash2 class="mr-2 h-4 w-4 animate-spin" />
												Deleting...
											{:else}
												<Trash2 class="mr-2 h-4 w-4" />
												Delete Forever
											{/if}
										</AlertDialog.Action>
									</form>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</div>
				</form>
			</Card.Content>
		</Card.Root>

		<Separator class="my-8" />

		<Card.Root>
			<Card.Header>
				<Card.Title class="text-xl">Example Object Details</Card.Title>
				<Card.Description>Read-only information about this example object.</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="space-y-4">
					<div>
						<h3 class="text-muted-foreground mb-2 text-sm font-semibold uppercase">ID</h3>
						<p class="font-mono text-lg">{data.exampleObject.id}</p>
					</div>
					<div>
						<h3 class="text-muted-foreground mb-2 text-sm font-semibold uppercase">Name</h3>
						<p class="text-lg">{$formData.name}</p>
					</div>
					<div>
						<h3 class="text-muted-foreground mb-2 text-sm font-semibold uppercase">Description</h3>
						<p class="text-lg">{$formData.description || 'No description'}</p>
					</div>
					<div>
						<h3 class="text-muted-foreground mb-2 text-sm font-semibold uppercase">Created</h3>
						<p class="text-lg">
							{new Date(data.exampleObject.createdAt).toLocaleString('en-US', {
								dateStyle: 'medium',
								timeStyle: 'short'
							})}
						</p>
					</div>
					<div>
						<h3 class="text-muted-foreground mb-2 text-sm font-semibold uppercase">Owner</h3>
						<p class="text-lg">{data.exampleObject.userId}</p>
					</div>
					{#if data.organizationId}
						<div>
							<h3 class="text-muted-foreground mb-2 text-sm font-semibold uppercase">
								Organization ID
							</h3>
							<p class="text-lg">{data.organizationId}</p>
						</div>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<Alert.Root>
			<AlertCircle class="h-4 w-4" />
			<Alert.Title>No Data Available</Alert.Title>
			<Alert.Description>
				The requested example object could not be loaded. Please go back and try again.
			</Alert.Description>
		</Alert.Root>
	{/if}
</div>
