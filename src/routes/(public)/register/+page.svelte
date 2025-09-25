<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import PasswordInput from '$lib/components/ui/password-input.svelte';
	import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '$lib/validators/password';
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

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let email = $state('');
	let password = $state('');
	let error: string | null = $state(null);
	let isLoading = $state(false);
	let successMessage: string | null = null;
	let invitationCode = data.invitationCode;

	onMount(() => {
		// If we have an invitation code from Better Auth, store it
		// The invitation code is a secure token, not base64 encoded data
		if (invitationCode) {
			sessionStorage.setItem('pendingInvitation', invitationCode);
		}
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		// Validate required fields
		if (!email || !password) {
			error = 'Email and password are required';
			return;
		}

		// Validate password length
		if (password.length < PASSWORD_MIN_LENGTH) {
			error = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
			return;
		}
		if (password.length > PASSWORD_MAX_LENGTH) {
			error = `Password must be less than ${PASSWORD_MAX_LENGTH} characters`;
			return;
		}

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
				console.error('[Register Page] Sign-up error details:', signUpError);
				// Better error message for duplicate email
				if (signUpError.message?.includes('already') || signUpError.message?.includes('exists')) {
					error = 'User already exists. Use another email.';
				} else {
					error = signUpError.message || 'Registration failed. Please try again.';
				}
				// Clear password field on error
				password = '';
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
				}

				// Redirect to verify-email page instead of home
				await goto('/verify-email', { replaceState: true });
			} else {
				error = 'An unexpected error occurred during registration. No data and no error received.';
			}
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
					<CardDescription>Enter your details to create your account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onsubmit={handleSubmit} class="space-y-4">
						<div class="space-y-2">
							<Label for="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="Enter your email"
								bind:value={email}
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
							<PasswordInput
								id="password"
								name="password"
								placeholder={`Create a password (${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters)`}
								bind:value={password}
								disabled={isLoading}
								minlength={PASSWORD_MIN_LENGTH}
								maxlength={PASSWORD_MAX_LENGTH}
							/>
						</div>
						{#if invitationCode}
							<input type="hidden" name="invitationCode" value={invitationCode} />
							<div class="bg-muted rounded-lg p-3">
								<p class="text-sm">You'll join an existing organization after registration.</p>
							</div>
						{/if}
						{#if form && typeof form === 'object' && 'error' in form && form.error}
							<p class="text-sm text-red-500">{form.error}</p>
						{/if}
						{#if error}
							<div role="alert" class="error-message text-destructive text-s">
								{error}
							</div>
						{/if}
						{#if successMessage}
							<div role="status" class="success-message text-sm text-green-500">
								{successMessage}
							</div>
						{/if}
						<Button type="submit" class="w-full" disabled={isLoading}>
							{#if isLoading}
								Creating account...
							{:else}
								Register
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
