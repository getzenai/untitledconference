<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import * as Form from '$lib/components/ui/form';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Separator } from '$lib/components/ui/separator';
	import { Edit, PlusCircle } from 'lucide-svelte';
	import { exampleFormSchema } from './schema';
	let { data } = $props();

	const form = superForm(data.form, {
		// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
		validators: zod4Client(exampleFormSchema),
		onResult: ({ result }) => {
			if (result.type === 'success') {
				// Form will be automatically reset by superforms
			}
		}
	});

	const { form: formData, enhance, submitting, errors } = form;
</script>

<svelte:head>
	<title>Example Objects</title>
	<meta name="description" content="Manage Example Objects" />
</svelte:head>

<div class="container mx-auto p-4 md:p-8">
	<Card.Root class="mb-8">
		<Card.Header>
			<Card.Title class="flex items-center">
				<PlusCircle class="mr-2 h-5 w-5" />
				Create New Example Object
			</Card.Title>
			<Card.Description>Add a new example object to the system.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" use:enhance>
				<Form.Field {form} name="name">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>Name</Form.Label>
							<Input
								{...props}
								placeholder="Enter example name"
								bind:value={$formData.name}
								disabled={$submitting}
							/>
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
								placeholder="Enter example description"
								bind:value={$formData.description as string}
								disabled={$submitting}
							/>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				{#if $errors._errors}
					<div role="alert" class="mb-4 text-sm text-red-500">
						{#each $errors._errors as error, i (i)}
							<p>{error}</p>
						{/each}
					</div>
				{/if}

				<Form.Button type="submit" disabled={$submitting}>
					{#if $submitting}
						<PlusCircle class="mr-2 h-4 w-4 animate-spin" />
						Creating...
					{:else}
						<PlusCircle class="mr-2 h-4 w-4" />
						Create Object
					{/if}
				</Form.Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Separator class="my-8" />

	<h2 class="mb-6 text-2xl font-semibold">Existing Example Objects</h2>
	{#if data.examples && data.examples.length > 0}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each data.examples as example (example.id)}
				<Card.Root>
					<Card.Header>
						<Card.Title data-testid="example-name">{example.name}</Card.Title>
					</Card.Header>
					<Card.Content>
						<p class="text-muted-foreground text-xs">ID: {example.id}</p>
						<p class="text-muted-foreground text-xs">
							Created: {new Date(example.createdAt).toLocaleString()}
						</p>
						<p class="text-muted-foreground text-xs">
							Updated: {new Date(example.updatedAt).toLocaleString()}
						</p>
					</Card.Content>
					<Card.Footer class="flex justify-end gap-2">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href="/examples/crud/{example.id}" data-sveltekit-preload-data="hover">
							<Button variant="outline" size="sm">
								<Edit class="mr-1 h-4 w-4" /> View/Edit
							</Button>
						</a>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	{:else}
		<p class="text-muted-foreground py-8 text-center">
			No example objects found. Create one above!
		</p>
	{/if}
</div>
