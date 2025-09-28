<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import { getPasswordRequirementsFromSchema } from '$lib/validators/password';
	import { Eye, EyeOff } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { resetPasswordSchema } from './schema';

	const token = $derived(page.url.searchParams.get('token') || '');

	let showPassword = $state(false);
	let didReset = $state(false);

	const form = superForm(
		{ password: '', token: '' },
		{
			// @ts-expect-error - Zod v4 type incompatibility with sveltekit-superforms
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
					<CardTitle>Reset password</CardTitle>
					<CardDescription>Enter a new password for your account.</CardDescription>
				</CardHeader>
				<CardContent>
					{#if didReset}
						<div class="space-y-4 text-center">
							<p class="text-base font-medium">Your password has been updated.</p>
							<p class="text-muted-foreground text-sm">
								You can now sign in with your new password.
							</p>
							<Button type="button" class="w-full" onclick={() => goto('/login')}>
								Return to login
							</Button>
						</div>
					{:else if !token}
						<div class="space-y-4 text-center">
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
										<div class="relative">
											<Input
												{...props}
												type={showPassword ? 'text' : 'password'}
												autocomplete="new-password"
												placeholder="Enter a secure password"
												bind:value={$formData.password}
												disabled={$submitting}
												class="pr-10"
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												class="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2"
												aria-label={showPassword ? 'Hide password' : 'Show password'}
												onclick={() => (showPassword = !showPassword)}
											>
												{#if showPassword}
													<EyeOff class="size-4" />
												{:else}
													<Eye class="size-4" />
												{/if}
											</Button>
										</div>
									{/snippet}
								</Form.Control>
								<Form.FieldErrors />
							</Form.Field>

							{#if $errors._errors}
								<div role="alert" class="text-sm text-red-500">
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
				</CardContent>
			</Card>
		</div>
	</div>
</div>
