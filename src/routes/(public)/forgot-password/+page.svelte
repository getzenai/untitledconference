<script lang="ts">
	import { preventDefault } from 'svelte/legacy';

	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
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

	const confirmationCopy =
		'If an account with that email exists, we just sent password reset instructions. Please check your inbox and spam folder.';

	let email = $state('');
	let error: string | null = $state(null);
	let infoMessage = $state('');
	let isLoading = $state(false);

	function validate() {
		const trimmed = email.trim();
		email = trimmed;

		if (!trimmed) {
			error = 'Email is required';
			return false;
		}

		const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailPattern.test(trimmed)) {
			error = 'Enter a valid email address';
			return false;
		}

		error = null;
		return true;
	}

	async function handleSubmit() {
		if (!validate()) {
			return;
		}

		isLoading = true;
		infoMessage = '';

		try {
			const origin = page.url.origin;
			const redirectTo = `${origin}/reset-password`;
			const { error: requestError } = await authClient.forgetPassword({
				email,
				redirectTo
			});

			if (requestError) {
				console.error('[Forgot Password] Request error:', requestError);
			}

			infoMessage = confirmationCopy;
		} catch (err) {
			console.error('[Forgot Password] Unexpected error:', err);
			infoMessage = confirmationCopy;
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
					<form onsubmit={preventDefault(handleSubmit)} class="space-y-4">
						<div class="space-y-2">
							<Label for="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="you@example.com"
								bind:value={email}
								disabled={isLoading}
							/>
						</div>
						{#if error}
							<p class="text-destructive text-sm">{error}</p>
						{/if}
						{#if infoMessage}
							<p class="text-muted-foreground text-sm">{infoMessage}</p>
						{/if}
						<Button type="submit" class="w-full" disabled={isLoading}>
							{#if isLoading}
								Sending instructions...
							{:else}
								Send reset link
							{/if}
						</Button>
						<p class="text-muted-foreground text-center text-sm">
							Remembered your password?
							<a href="/login" class="text-primary hover:underline">Return to login</a>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	</div>
</div>
