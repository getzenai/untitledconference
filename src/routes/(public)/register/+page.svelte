<script lang="ts">
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
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	let email = data.invitationEmail || '';
	let password = '';
	let organizationName = data.invitationOrgName || '';
	let error: string | null = null;
	let isLoading = false;
	let successMessage: string | null = null;
	let invitationCode = data.invitationCode;

	onMount(() => {
		// If we have an invitation code, store it
		if (invitationCode) {
			sessionStorage.setItem('pendingInvitation', invitationCode);
		}
	});

	async function handleSubmit() {
		isLoading = true;
		error = null;
		successMessage = null;

		console.log('[Register Page] handleSubmit called. Email:', email);

		try {
			const { data: signUpData, error: signUpError } = await authClient.signUp.email({
				email,
				password,
				name: '',
				callbackURL: '/login?verified=true' // For email verification link
			});
			console.log('[Register Page] signUpError:', signUpError);
			console.log('[Register Page] signUpData:', signUpData);

			if (signUpError) {
				console.error('[Register Page] Sign-up error details:', signUpError);
				error = signUpError.message || 'Registration failed. Please try again.';
			} else if (signUpData) {
				// Handle invitation acceptance if we have an invitation code
				if (invitationCode) {
					try {
						const { error: acceptError } = await authClient.organization.acceptInvitation({
							invitationId: invitationCode
						});

						if (acceptError) {
							console.error('[Register Page] Invitation acceptance error:', acceptError);
							error = `Account created successfully, but failed to accept invitation: ${acceptError.message || 'Invalid or expired invitation'}. Please login and ask for a new invitation.`;
							isLoading = false;
							return; // Don't redirect on error
						} else {
							// Clear the invitation from session storage
							sessionStorage.removeItem('pendingInvitation');
						}
					} catch (err) {
						console.error('[Register Page] Error accepting invitation:', err);
						error =
							'Account created but failed to join organization. Please login and ask for a new invitation.';
						isLoading = false;
						return; // Don't redirect on error
					}
				} else if (organizationName) {
					// Create organization if no invitation and org name provided
					// Generate base slug from organization name
					const baseSlug = organizationName
						.toLowerCase()
						.replace(/\s+/g, '-')
						.replace(/[^a-z0-9-]/g, '');

					let slug = baseSlug;
					let attempts = 0;
					const maxAttempts = 10;
					let orgData = null;
					let lastOrgError = null;

					// Try to create organization with unique slug
					while (attempts < maxAttempts) {
						const { data, error: orgError } = await authClient.organization.create({
							name: organizationName,
							slug: slug
						});

						if (data) {
							orgData = data;
							break;
						}

						if (orgError) {
							// Check if error is due to duplicate slug
							if (
								orgError.message?.toLowerCase().includes('already exists') ||
								orgError.message?.toLowerCase().includes('duplicate') ||
								orgError.message?.toLowerCase().includes('unique')
							) {
								// Try with a different slug
								attempts++;
								// Add random suffix for uniqueness
								const randomSuffix = Math.random().toString(36).substring(2, 8);
								slug = `${baseSlug}-${randomSuffix}`;
								lastOrgError = null; // Clear error for retry
							} else {
								// Other error, stop trying
								lastOrgError = orgError;
								break;
							}
						}
					}

					if (orgData) {
						// Set the new organization as active
						await authClient.organization.setActive({
							organizationId: orgData.id
						});
					} else if (lastOrgError) {
						console.error('[Register Page] Organization creation error:', lastOrgError);
						error = `Account created but organization creation failed: ${lastOrgError.message}`;
					} else {
						error =
							'Account created but unable to create organization. Please try a different name.';
					}
				}

				await goto('/home', { replaceState: true });
			} else {
				error = 'An unexpected error occurred during registration. No data and no error received.';
			}
		} catch (e: unknown) {
			console.error('[Register Page] Unexpected exception:', e);
			if (e instanceof Error) {
				error = e.message;
			} else {
				error = 'An unexpected error occurred.';
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<div
	class="relative container grid min-h-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0"
>
	<div class="bg-muted relative hidden h-full flex-col p-10 text-white lg:flex dark:border-r">
		<div class="absolute inset-0 bg-zinc-900"></div>
		<div class="relative z-20 flex flex-1 flex-col justify-center">
			<div class="mb-8 text-right">
				<span class="text-2xl font-bold">Join Our Community</span>
			</div>
			<blockquote class="space-y-2 text-right">
				<p class="text-lg">
					Create your account and start building amazing applications with our powerful SvelteKit
					starter. Get access to all features and join our growing community.
				</p>
			</blockquote>
			<div class="mt-6 space-y-4 text-right">
				<h3 class="text-xl font-semibold">Why Register?</h3>
				<ul class="space-y-2">
					<li>• Access to all starter features</li>
					<li>• Type-safe database operations</li>
					<li>• Modern authentication system</li>
					<li>• Beautiful UI components</li>
					<li>• Regular updates and improvements</li>
				</ul>
			</div>
		</div>
	</div>
	<div class="flex h-full items-center p-4 lg:p-8">
		<div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<Card>
				<CardHeader>
					<CardTitle>Create Account</CardTitle>
					<CardDescription>Enter your details to create your account</CardDescription>
				</CardHeader>
				<CardContent>
					<form on:submit|preventDefault={handleSubmit} class="space-y-4">
						<div class="space-y-2">
							<Label for="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="Enter your email"
								bind:value={email}
								required
								disabled={isLoading}
							/>
							{#if invitationCode}
								<p class="text-muted-foreground text-sm">
									Please use the email address associated with your invitation
								</p>
							{/if}
						</div>
						<div class="space-y-2">
							<Label for="password">Password</Label>
							<Input
								id="password"
								name="password"
								type="password"
								placeholder="Create a password (min. 8 characters)"
								bind:value={password}
								required
								disabled={isLoading}
							/>
						</div>
						{#if !invitationCode}
							<div class="space-y-2">
								<Label for="organizationName">Organization Name (Optional)</Label>
								<Input
									id="organizationName"
									name="organizationName"
									type="text"
									placeholder="Enter your organization name (optional)"
									bind:value={organizationName}
									disabled={isLoading}
								/>
								<p class="text-muted-foreground text-xs">
									You'll be the administrator of this organization
								</p>
							</div>
						{:else}
							<div class="bg-muted rounded-lg p-3">
								<p class="text-sm">You'll join an existing organization after registration.</p>
							</div>
						{/if}
						{#if error}
							<p class="text-sm text-red-500">{error}</p>
						{/if}
						{#if successMessage}
							<p class="text-sm text-green-500">{successMessage}</p>
						{/if}
						<Button type="submit" class="w-full" disabled={isLoading}>
							{#if isLoading}
								Creating account...
							{:else}
								Create Account
							{/if}
						</Button>
						<p class="text-muted-foreground text-center text-sm">
							Already have an account? <a href="/login" class="text-primary hover:underline"
								>Login</a
							>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	</div>
</div>
