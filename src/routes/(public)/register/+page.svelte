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
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let email = data.invitationEmail || '';
	let password = '';
	let organizationName = data.invitationOrgName || '';
	let error: string | null = null;
	let isLoading = false;
	let successMessage: string | null = null;
	let invitationCode = data.invitationCode;
	let systemToken = data.systemToken;
	let invitationRole = data.invitationRole;
	let isFirstUser = data.isFirstUser;

	onMount(() => {
		// If we have an invitation code from Better Auth, store it
		// The invitation code is a secure token, not base64 encoded data
		if (invitationCode) {
			sessionStorage.setItem('pendingInvitation', invitationCode);
		}
	});

	async function handleSubmit() {
		isLoading = true;
		error = null;

		try {
			console.log('[Register Page] Attempting sign-up with:', { email });

			// Sign up the user - Better Auth will automatically sign them in with autoSignIn: true
			const { data: signUpData, error: signUpError } = await authClient.signUp.email({
				email,
				password,
				name: ''
			});

			if (signUpError) {
				console.error('[Register Page] Sign-up error:', signUpError);
				error = signUpError.message || 'Registration failed';
				return;
			}

			if (!signUpData) {
				error = 'Registration failed - no user data returned';
				return;
			}

			console.log('[Register Page] Sign-up successful, user created:', signUpData);

			// Better Auth's autoSignIn should have already signed in the user
			// The server-side database hook will handle admin role assignment for first user
			// Just redirect to home
			console.log('[Register Page] Redirecting to home after successful registration');
			await goto('/home', { replaceState: true });
		} catch (e: unknown) {
			console.error('[Register Page] Unexpected error:', e);
			if (e instanceof Error) {
				error = e.message;
			} else {
				error = 'An unexpected error occurred';
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
					<CardDescription>
						{#if systemToken && invitationRole}
							You've been invited to join as a {invitationRole}
						{:else if isFirstUser}
							You'll be the first user and will automatically become the system administrator
						{:else}
							Enter your details to create your account
						{/if}
					</CardDescription>
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
						{#if systemToken}
							<input type="hidden" name="systemToken" value={systemToken} />
							<input type="hidden" name="invitationRole" value={invitationRole} />
						{/if}
						{#if invitationCode}
							<input type="hidden" name="invitationCode" value={invitationCode} />
						{/if}
						{#if !invitationCode && !systemToken}
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
						{:else if invitationCode}
							<div class="bg-muted rounded-lg p-3">
								<p class="text-sm">You'll join an existing organization after registration.</p>
							</div>
						{:else if systemToken}
							<div class="bg-muted rounded-lg p-3">
								<p class="text-sm">You've been invited to join as a {invitationRole}.</p>
							</div>
						{/if}
						{#if form && typeof form === 'object' && 'error' in form && form.error}
							<p class="text-sm text-red-500">{form.error}</p>
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
