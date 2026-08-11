<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import AuthShell from '$lib/components/app/auth/auth-shell.svelte';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { forgotPasswordSchema } from './schema';

	const confirmationCopy =
		'If an account with that email exists, we just sent password reset instructions. Please check your inbox and spam folder.';

	let showSuccessMessage = $state(false);

	const form = superForm(
		{ email: '' },
		{
			validators: zod4Client(forgotPasswordSchema),
			SPA: true, // Prevent default form submission
			onSubmit: async ({ formData, cancel }) => {
				// Cancel the default form submission
				cancel();

				const email = formData.get('email') as string;

				try {
					const origin = page.url.origin;
					const redirectTo = `${origin}/reset-password`;

					// Use Better Auth client to request password reset
					await authClient.requestPasswordReset({
						email,
						redirectTo
					});

					// Ignore error for security - always show success

					// Always show success message for security
					// We don't want to reveal whether an email exists
					showSuccessMessage = true;
				} catch (_err) {
					// Always show success message for security
					showSuccessMessage = true;
				}
			}
		}
	);

	const { form: formData, enhance, submitting } = form;
</script>

<AuthShell
	title="Forgot password"
	description="Enter the email address associated with your account. If we find a match we will send reset instructions."
>
	{#if showSuccessMessage}
		<p class="text-muted-foreground text-sm">{confirmationCopy}</p>
	{:else}
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
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Button type="submit" class="w-full" disabled={$submitting}>
				{#if $submitting}
					Sending instructions...
				{:else}
					Send reset link
				{/if}
			</Form.Button>
		</form>
	{/if}

	<!--
		The way back sits under the card in both states rather than inside the form,
		because after a successful send there is no form left to hang it on — and
		that is exactly the moment the visitor needs it.
	-->
	{#snippet footer()}
		<p>
			Remembered your password?
			<a href="/login" class="text-foreground font-medium underline underline-offset-4">
				Return to login
			</a>
		</p>
	{/snippet}
</AuthShell>
