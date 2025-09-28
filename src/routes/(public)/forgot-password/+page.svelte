<script lang="ts">
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
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { forgotPasswordSchema } from './schema';

	const confirmationCopy =
		'If an account with that email exists, we just sent password reset instructions. Please check your inbox and spam folder.';

	let showSuccessMessage = $state(false);

	const form = superForm(
		{ email: '' },
		{
			// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
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
					await authClient.forgetPassword({
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

<div
	class="relative container grid min-h-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0"
>
	<div class="bg-muted relative hidden h-full flex-col p-10 text-white lg:flex dark:border-r">
		<div class="absolute inset-0 bg-zinc-900"></div>
	</div>
	<div class="flex h-full items-center p-4 lg:p-8">
		<div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<Card>
				<CardHeader>
					<CardTitle>Forgot password</CardTitle>
					<CardDescription>
						Enter the email address associated with your account. If we find a match we will send
						reset instructions.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{#if showSuccessMessage}
						<div class="space-y-4 text-center">
							<p class="text-muted-foreground text-sm">{confirmationCopy}</p>
							<p class="text-muted-foreground text-center text-sm">
								Remembered your password?
								<a href="/login" class="text-primary hover:underline">Return to login</a>
							</p>
						</div>
					{:else}
						<form use:enhance class="space-y-4">
							<Form.Field {form} name="email">
								<Form.Control>
									{#snippet children({ props })}
										<Form.Label>Email</Form.Label>
										<Input
											{...props}
											type="email"
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

							<p class="text-muted-foreground text-center text-sm">
								Remembered your password?
								<a href="/login" class="text-primary hover:underline">Return to login</a>
							</p>
						</form>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</div>
