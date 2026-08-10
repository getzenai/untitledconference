<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { superForm } from 'sveltekit-superforms';
	import * as Form from '$lib/components/ui/form';
	import AuthShell from '$lib/components/app/auth/auth-shell.svelte';
	import PasswordInput from '$lib/components/ui/password-input.svelte';
	import PasswordStrength from '$lib/components/ui/password-strength.svelte';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { authClient } from '$lib/auth-client';

	let { data } = $props();

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

		// Check if token is available
		if (!data.token || !data.isValidToken) {
			toast.error('This invitation link appears to be invalid. Please request a new invitation.');

			goto('/login');
		}
	});

	const form = superForm(data.form, {
		SPA: true, // Prevent default form submission
		onSubmit: async ({ formData, cancel }) => {
			// Cancel the default form submission
			cancel();

			const password = formData.get('password') as string;
			const token = formData.get('token') as string;

			if (!data.email) {
				errors.set({ _errors: ['Invalid invitation. Please request a new invitation.'] });
				return;
			}

			try {
				// First, reset the password using the token
				const { data: resetData, error: resetError } = await authClient.resetPassword({
					newPassword: password,
					token
				});

				if (resetError) {
					errors.set({
						_errors: [resetError.message || 'This invitation link has expired or is invalid.']
					});
					return;
				}

				if (resetData) {
					// Auto-login with the new credentials
					const { data: signInData, error: signInError } = await authClient.signIn.email({
						email: data.email,
						password,
						rememberMe: true
					});

					if (signInError) {
						toast.success('Registration completed! Please log in with your new password.');

						await goto('/login');
					} else if (signInData?.user) {
						toast.success('Registration completed successfully!');

						await goto('/home');
					} else {
						toast.success('Registration completed! Please log in with your new password.');

						await goto('/login');
					}
				} else {
					errors.set({ _errors: ['Failed to complete registration. Please try again.'] });
				}
			} catch (_err) {
				errors.set({ _errors: ['Failed to complete registration. Please try again.'] });
			}
		}
	});

	const { form: formData, enhance, submitting, errors } = form;
</script>

<AuthShell
	title="Complete your registration"
	description="Welcome! Set up your account by choosing a password."
>
	<form use:enhance class="space-y-4">
		<input type="hidden" name="token" bind:value={$formData.token} />

		<Form.Field {form} name="password">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>Password</Form.Label>
					<PasswordInput
						{...props}
						autocomplete="new-password"
						placeholder="Enter a secure password"
						bind:value={$formData.password}
						disabled={$submitting}
						required
					/>
					<PasswordStrength password={$formData.password} userInputs={[data.email]} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		{#if $errors._errors}
			<div role="alert" class="text-destructive text-sm">
				{#each $errors._errors as error, i (i)}
					<p>{error}</p>
				{/each}
			</div>
		{/if}

		<p class="text-muted-foreground text-xs">
			Use at least 8 characters with a mix of letters, numbers and symbols.
		</p>

		<Form.Button type="submit" disabled={$submitting || !data.token} class="w-full">
			{#if $submitting}
				Completing Registration...
			{:else}
				Complete Registration
			{/if}
		</Form.Button>
	</form>
</AuthShell>
