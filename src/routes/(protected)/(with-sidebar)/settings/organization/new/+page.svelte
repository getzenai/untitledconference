<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
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

	let organizationName = $state('');
	let isCreatingOrg = $state(false);
	let createOrgError = $state('');

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

	async function createOrganization() {
		if (!organizationName.trim()) {
			createOrgError = 'Please enter an organization name';
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
			<div class="space-y-4">
				<div>
					<Label for="orgName">Organization Name</Label>
					<Input
						id="orgName"
						type="text"
						placeholder="My Organization"
						bind:value={organizationName}
						disabled={isCreatingOrg}
						required
					/>
					<p class="text-muted-foreground mt-2 text-sm">
						You'll be the owner of this organization and can invite other members.
					</p>
				</div>

				{#if createOrgError}
					<div class="text-destructive text-sm">{createOrgError}</div>
				{/if}

				<Button
					onclick={createOrganization}
					disabled={isCreatingOrg || !organizationName.trim()}
					class="w-full"
				>
					{#if isCreatingOrg}
						Creating...
					{:else}
						Create Organization
					{/if}
				</Button>
			</div>
		</CardContent>
	</Card>
</div>
