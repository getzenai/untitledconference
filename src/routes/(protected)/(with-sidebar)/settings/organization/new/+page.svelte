<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { ORGANIZATION_CREATE_FIELDS, createFormBlockReason } from '$lib/conference/create-form';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';
	import UnsavedGuard from '$lib/components/app/unsaved-guard.svelte';

	let organizationName = $state('');
	let isCreatingOrg = $state(false);
	let createOrgError = $state('');

	// One field, so the typed name is the whole answer to "is there unsaved work
	// here". `created` is what keeps the guard out of the way of our own `goto`
	// to the new organization — that navigation is the save, not a way out of it.
	let created = $state(false);
	const dirty = $derived(!created && organizationName.trim() !== '');

	const submitBlockReason = $derived(
		createFormBlockReason([{ ...ORGANIZATION_CREATE_FIELDS.name, value: organizationName }])
	);

	async function generateUniqueSlug(baseName: string) {
		const baseSlug = baseName
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '');

		let slug = baseSlug;
		let attempts = 0;
		const maxAttempts = 10;

		while (attempts < maxAttempts) {
			const { data, error } = await authClient.organization.create({
				name: baseName.trim(),
				slug: slug
			});

			if (data) {
				return { data, slug };
			}

			if (error?.message?.toLowerCase().match(/already exists|duplicate|unique/)) {
				attempts++;
				const randomSuffix = Math.random().toString(36).substring(2, 8);
				slug = `${baseSlug}-${randomSuffix}`;
			} else {
				return { error };
			}
		}

		return { error: new Error('Unable to create organization. Please try a different name.') };
	}

	async function createOrganization(event: SubmitEvent) {
		event.preventDefault();

		if (submitBlockReason) {
			createOrgError = submitBlockReason;
			return;
		}

		isCreatingOrg = true;
		createOrgError = '';

		try {
			const { data: orgData, slug, error } = await generateUniqueSlug(organizationName);

			if (orgData && slug) {
				// Set the new organization as active
				await authClient.organization.setActive({
					organizationId: orgData.id
				});

				toast.success('Organization created successfully!');
				created = true;
				// Navigate to the organization details page
				await goto(`/settings/organization/${slug}`);
			} else if (error) {
				createOrgError = error.message || 'Failed to create organization';
			}
		} catch (error) {
			console.error('Error creating organization:', error);
			createOrgError = 'An unexpected error occurred while creating the organization';
		} finally {
			isCreatingOrg = false;
		}
	}
</script>

<svelte:head>
	<title>New organization</title>
</svelte:head>

<UnsavedGuard {dirty} />

<div class="container mx-auto max-w-6xl py-8">
	<h1 class="mb-8 text-3xl font-bold">Create Organization</h1>

	<Card>
		<CardHeader>
			<CardTitle>Create Your Organization</CardTitle>
			<CardDescription>
				You're not currently part of any organization. Create one to get started.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<!--
				A real form so Enter in the only field creates the organization (#485).
				`Button` defaults to type="button", which is why the key used to vanish.
			-->
			<form class="space-y-4" onsubmit={createOrganization} data-testid="create-organization-form">
				<div>
					<Label for="orgName">
						Organization Name{#if ORGANIZATION_CREATE_FIELDS.name.required}<span
								class="text-status-bad">&nbsp;*</span
							>{/if}
					</Label>
					<Input
						id="orgName"
						type="text"
						placeholder="My Organization"
						bind:value={organizationName}
						disabled={isCreatingOrg}
						required={ORGANIZATION_CREATE_FIELDS.name.required}
					/>
					<p class="text-muted-foreground mt-2 text-sm">
						You'll be the owner of this organization and can invite other members.
					</p>
				</div>

				{#if createOrgError}
					<div class="text-destructive text-sm">{createOrgError}</div>
				{/if}

				<div class="flex flex-col items-stretch gap-1">
					<Button
						type="submit"
						disabled={isCreatingOrg || Boolean(submitBlockReason)}
						class="w-full"
						aria-describedby={submitBlockReason ? 'create-block-reason' : undefined}
					>
						{#if isCreatingOrg}
							Creating...
						{:else}
							Create Organization
						{/if}
					</Button>
					{#if submitBlockReason}
						<p
							id="create-block-reason"
							class="text-muted-foreground text-xs"
							data-testid="create-block-reason"
						>
							{submitBlockReason}
						</p>
					{/if}
				</div>
			</form>
		</CardContent>
	</Card>
</div>
