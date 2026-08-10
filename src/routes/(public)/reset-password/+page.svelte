<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import AuthShell from '$lib/components/app/auth/auth-shell.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Form from '$lib/components/ui/form';
	import PasswordInput from '$lib/components/ui/password-input.svelte';
	import PasswordStrength from '$lib/components/ui/password-strength.svelte';
	import { getPasswordRequirementsFromSchema } from '$lib/validators/password';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { resetPasswordSchema } from './schema';

	const token = $derived(page.url.searchParams.get('token') || '');

	let didReset = $state(false);

	const form = superForm(
		{ password: '', token: '' },
		{
			validators: zod4Client(resetPasswordSchema),
			SPA: true, // Prevent default form submission
			onSubmit: async ({ formData, cancel }) => {
				// Cancel the default form submission
				cancel();

				const password = formData.get('password') as string;
				const token = formData.get('token') as string;

				try {
					// Use Better Auth client to reset password
					const { data: resetData, error: resetError } = await authClient.resetPassword({
						newPassword: password,
						token
					});

					if (resetError) {
						errors.set({
							_errors: [
								resetError.message ||
									'This reset link is invalid or has expired. Please request a new one.'
							]
						});
						return;
					}

					if (resetData) {
						didReset = true;

						// Auto-redirect to login after successful reset
						setTimeout(() => {
							goto('/login');
						}, 3000);
					} else {
						errors.set({ _errors: ['Failed to reset password. Please try again.'] });
					}
				} catch (_err) {
					errors.set({
						_errors: ['This reset link is invalid or has expired. Please request a new one.']
					});
				}
			}
		}
	);

	const { form: formData, enhance, submitting, errors } = form;
	const passwordRequirements = getPasswordRequirementsFromSchema();

	// Set the token value when available
	$effect(() => {
		if (token) {
			$formData.token = token;
		}
	});
</script>

<AuthShell title="Reset password" description="Enter a new password for your account.">
	{#if didReset}
		<div class="space-y-4">
			<p class="text-base font-medium">Your password has been updated.</p>
			<p class="text-muted-foreground text-sm">You can now sign in with your new password.</p>
			<Button type="button" class="w-full" onclick={() => goto('/login')}>Return to login</Button>
		</div>
	{:else if !token}
		<div class="space-y-4">
			<p class="text-destructive text-base font-medium">
				This reset link is invalid or has expired.
			</p>
			<p class="text-muted-foreground text-sm">
				Request a fresh link to continue resetting your password.
			</p>
			<Button type="button" class="w-full" onclick={() => goto('/forgot-password')}>
				Request new link
			</Button>
		</div>
	{:else}
		<form use:enhance class="space-y-4">
			<input type="hidden" name="token" value={token} />

			<Form.Field {form} name="password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>New password</Form.Label>
						<!--
							The same show/hide input the register form uses. It used to be
							hand-rolled here, one page away from a component that already did
							it — two toggles that could drift apart, for one behaviour.
						-->
						<PasswordInput
							{...props}
							autocomplete="new-password"
							placeholder="Enter a secure password"
							bind:value={$formData.password}
							disabled={$submitting}
						/>
						<PasswordStrength password={$formData.password} />
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			{#if $errors._errors}
				<div role="alert" class="text-destructive text-sm">
					{#each $errors._errors as error}
						<p>{error}</p>
					{/each}
				</div>
			{/if}

			<div class="text-muted-foreground text-xs">
				<p>Password requirements:</p>
				<ul class="mt-1 list-inside list-disc">
					{#each passwordRequirements as req}
						<li>{req}</li>
					{/each}
				</ul>
			</div>

			<Form.Button type="submit" class="w-full" disabled={$submitting}>
				{#if $submitting}
					Updating password...
				{:else}
					Update password
				{/if}
			</Form.Button>
		</form>
	{/if}
</AuthShell>
