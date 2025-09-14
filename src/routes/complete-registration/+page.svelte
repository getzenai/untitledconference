<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import { authClient } from '$lib/auth-client';

	let { form }: { form: ActionData } = $props();

	let newPassword = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let token = $state('');

	onMount(() => {
		// Check for error parameter (invalid/expired token)
		const errorParam = page.url.searchParams.get('error');
		if (errorParam === 'INVALID_TOKEN') {
			toast.error(
				'This invitation link has expired or is invalid. Please request a new invitation.'
			);
			goto('/login');
			return;
		}

		// Get the token from URL parameters
		token = page.url.searchParams.get('token') || '';
		if (!token) {
			toast.error('This invitation link appears to be invalid. Please request a new invitation.');
			goto('/login');
		}
	});

	// Handle form errors
	$effect(() => {
		if (form?.error) {
			error = form.error;
			isLoading = false;
		}
	});

	function validateForm() {
		error = '';

		if (!newPassword) {
			error = 'Password is required';
			return false;
		}

		if (newPassword.length < 8) {
			error = 'Password must be at least 8 characters';
			return false;
		}

		return true;
	}
</script>

<div class="bg-background flex min-h-screen items-center justify-center p-4">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Complete Your Registration</CardTitle>
			<CardDescription>Welcome! Please set up your account by creating a password.</CardDescription>
		</CardHeader>
		<CardContent>
			<form
				method="POST"
				use:enhance={() => {
					if (!validateForm()) {
						return async () => {};
					}
					isLoading = true;
					return async ({ result, update }) => {
						if (result.type === 'success') {
							const data = result.data as { email?: string; password?: string };
							if (data?.email && data?.password) {
								// Keep loading state during auto-login
								// Auto-login with the credentials
								try {
									const { error: signInError } = await authClient.signIn.email({
										email: data.email,
										password: data.password,
										rememberMe: true
									});

									if (signInError) {
										console.error('Auto-login failed:', signInError);
										toast.success('Registration completed! Please log in with your new password.');
										goto('/login');
									} else {
										toast.success('Registration completed successfully!');
										goto('/home');
									}
								} catch (err) {
									console.error('Auto-login error:', err);
									toast.success('Registration completed! Please log in with your new password.');
									goto('/login');
								}
								// Don't set isLoading = false here since we're redirecting
							}
						} else if (result.type === 'failure') {
							// Only set loading to false on failure
							isLoading = false;
							// Let the form handle the error display
							await update();
						}
					};
				}}
				class="space-y-4"
			>
				<input type="hidden" name="token" value={token} />

				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input
						id="password"
						name="password"
						type="password"
						bind:value={newPassword}
						placeholder="Enter a secure password"
						disabled={isLoading}
						required
					/>
				</div>

				{#if error}
					<p class="text-destructive text-sm">{error}</p>
				{/if}

				<p class="text-muted-foreground text-xs">
					Use at least 8 characters with a mix of letters, numbers and symbols.
				</p>

				<Button type="submit" disabled={isLoading || !token} class="w-full">
					{#if isLoading}
						Completing Registration...
					{:else}
						Complete Registration
					{/if}
				</Button>
			</form>
		</CardContent>
	</Card>
</div>
