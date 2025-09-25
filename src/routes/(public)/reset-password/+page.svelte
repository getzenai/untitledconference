<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
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
	import { Eye, EyeOff } from 'lucide-svelte';
	import { passwordSchema, getPasswordRequirementsFromSchema } from '$lib/validators/password';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let password = $state('');
	let showPassword = $state(false);
	let errorMessage = $state('');
	let isLoading = $state(false);
	let didReset = $state(false);
	let token = $state(data.token ?? '');

	$effect(() => {
		token = data.token ?? '';
	});

	$effect(() => {
		if (form?.error) {
			errorMessage = form.error;
			isLoading = false;
			didReset = false;
		} else if (form?.success) {
			errorMessage = '';
			isLoading = false;
			didReset = true;
		}
	});

	const passwordRequirements = getPasswordRequirementsFromSchema();

	function validate() {
		errorMessage = '';

		if (!password) {
			errorMessage = 'Password is required';
			return false;
		}

		const result = passwordSchema.safeParse(password);
		if (!result.success) {
			errorMessage = result.error.errors[0].message;
			return false;
		}

		if (!token) {
			errorMessage = 'This reset link is invalid or has expired. Please request a new one.';
			return false;
		}

		return true;
	}
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
						<form
							method="POST"
							use:enhance={() => {
								if (!validate()) {
									return async () => {};
								}

								isLoading = true;
								didReset = false;

								return async ({ result, update }) => {
									if (result.type === 'success') {
										password = '';
										await update();
									} else if (result.type === 'failure') {
										await update();
									} else if (result.type === 'error') {
										console.error('[Reset Password] Submission error:', result.error);
										errorMessage = 'Something went wrong. Please try again.';
									}

									isLoading = false;
								};
							}}
							class="space-y-4"
						>
							<input type="hidden" name="token" value={token} />

							<div class="space-y-2">
								<Label for="password">New password</Label>
								<div class="relative">
									<Input
										id="password"
										name="password"
										type={showPassword ? 'text' : 'password'}
										autocomplete="new-password"
										placeholder="Enter a secure password"
										bind:value={password}
										disabled={isLoading}
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
							</div>

							{#if errorMessage}
								<p class="text-destructive text-sm">{errorMessage}</p>
							{/if}

							<div class="text-muted-foreground text-xs">
								<p>Password requirements:</p>
								<ul class="mt-1 list-inside list-disc">
									{#each passwordRequirements as req}
										<li>{req}</li>
									{/each}
								</ul>
							</div>

							<Button type="submit" class="w-full" disabled={isLoading}>
								{#if isLoading}
									Updating password...
								{:else}
									Update password
								{/if}
							</Button>
						</form>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</div>
