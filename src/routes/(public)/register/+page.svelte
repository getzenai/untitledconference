<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import AuthShell from '$lib/components/app/auth/auth-shell.svelte';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import PasswordInput from '$lib/components/ui/password-input.svelte';
	import PasswordStrength from '$lib/components/ui/password-strength.svelte';
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

						// Did sign-up hand us a session, or did it stop short of one?
						//
						// The question is not whether the address is verified — it never is,
						// one second after registering. It is whether this deployment gates
						// on that. Better Auth answers it in the response: it skips
						// auto-sign-in exactly when verification is required (or auto-sign-in
						// is off) and returns `token: null` (api/routes/sign-up); otherwise
						// it creates the session and returns its token.
						//
						// Reading `emailVerified` instead sent *every* new account to
						// "Verify your email", including where REQUIRE_EMAIL_VERIFICATION is
						// off — which is how production runs. The first screen after
						// registering was a dead end asking for a mail nobody had sent.
						if (signUpData.token) {
							await goto('/home');
						} else {
							await goto('/verify-email');
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

<AuthShell
	title="Create your account"
	description="One account for organizing, speaking and reviewing."
>
	<!-- POST, although superForm cancels the native submit: before hydration
	     nothing cancels it, and a bare <form> then defaults to GET — with the
	     credentials in the query string. -->
	<form method="POST" use:enhance class="space-y-4">
		<Form.Field {form} name="email">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>Email</Form.Label>
					<Input
						{...props}
						type="email"
						autocomplete="email"
						placeholder="you@example.com"
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
					<PasswordStrength password={$formData.password} userInputs={[$formData.email]} />
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
	</form>

	{#snippet footer()}
		<p>
			Already have an account?
			<a href="/login" class="text-foreground font-medium underline underline-offset-4">Login</a>
		</p>
	{/snippet}
</AuthShell>
