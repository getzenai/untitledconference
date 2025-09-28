<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import PasswordInput from '$lib/components/ui/password-input.svelte';
	import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '$lib/validators/password';
	import { onMount } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { registerSchema } from './schema';

	// Check for invitation code in URL
	const invitationCode = $derived(page.url.searchParams.get('invitation'));

	// Initialize form client-side
	const form = superForm(
		{ email: '', password: '', invitationCode: '' },
		{
			// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
			validators: zod4Client(registerSchema),
			SPA: true, // Prevent default form submission
			onSubmit: async ({ formData, cancel }) => {
				// Cancel the default form submission
				cancel();

				const email = formData.get('email') as string;
				const password = formData.get('password') as string;
				const invitationCodeValue = formData.get('invitationCode') as string | null;

				try {
					// Sign up the user using Better Auth client
					const { data: signUpData, error: signUpError } = await authClient.signUp.email({
						email,
						password,
						name: '' // Better Auth requires a name field
					});

					if (signUpError) {
						// Better error message for duplicate email
						if (
							signUpError.message?.includes('already') ||
							signUpError.message?.includes('exists')
						) {
							errors.set({ _errors: ['User already exists. Use another email.'] });
						} else {
							errors.set({
								_errors: [signUpError.message || 'Registration failed. Please try again.']
							});
						}
						return;
					}

					if (signUpData?.user) {
						// Handle invitation acceptance if we have an invitation code
						if (invitationCodeValue) {
							try {
								const { error: acceptError } = await authClient.organization.acceptInvitation({
									invitationId: invitationCodeValue
								});

								if (acceptError) {
									// Don't fail completely, the account was created
								}
							} catch (_err) {
								// Don't fail completely, the account was created
							}
						}

						// Check if email verification is required
						const requiresVerification = signUpData.user && !signUpData.user.emailVerified;
						if (requiresVerification) {
							await goto('/verify-email');
						} else {
							// User is auto-signed in, redirect to home
							await goto('/home');
						}
					} else {
						errors.set({ _errors: ['Registration failed. Please try again.'] });
					}
				} catch (_err) {
					errors.set({ _errors: ['An unexpected error occurred during registration.'] });
				}
			}
		}
	);

	const { form: formData, enhance, submitting, errors } = form;

	onMount(() => {
		// If we have an invitation code from URL, store it and set in form
		const urlInvitation = page.url.searchParams.get('invitation');
		if (urlInvitation) {
			sessionStorage.setItem('pendingInvitation', urlInvitation);
			$formData.invitationCode = urlInvitation;
		}
	});
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
					<form use:enhance class="space-y-4">
						<Form.Field {form} name="email">
							<Form.Control>
								{#snippet children({ props })}
									<Form.Label>Email</Form.Label>
									<Input
										{...props}
										type="email"
										placeholder="Enter your email"
										bind:value={$formData.email}
										disabled={$submitting}
									/>
									{#if invitationCode}
										<p class="text-muted-foreground mt-1 text-sm">
											Please use the email address associated with your invitation
										</p>
									{/if}
								{/snippet}
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<Form.Field {form} name="password">
							<Form.Control>
								{#snippet children({ props })}
									<Form.Label>Password</Form.Label>
									<PasswordInput
										{...props}
										placeholder={`Create a password (${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters)`}
										bind:value={$formData.password}
										disabled={$submitting}
										minlength={PASSWORD_MIN_LENGTH}
										maxlength={PASSWORD_MAX_LENGTH}
									/>
								{/snippet}
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						{#if invitationCode}
							<input type="hidden" name="invitationCode" value={invitationCode} />
							<div class="bg-muted rounded-lg p-3">
								<p class="text-sm">You'll join an existing organization after registration.</p>
							</div>
						{/if}

						{#if $errors._errors}
							<div role="alert" class="text-destructive text-sm">
								{#each $errors._errors as error}
									<p>{error}</p>
								{/each}
							</div>
						{/if}

						<Form.Button type="submit" class="w-full" disabled={$submitting}>
							{#if $submitting}
								Creating account...
							{:else}
								Register
							{/if}
						</Form.Button>

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
