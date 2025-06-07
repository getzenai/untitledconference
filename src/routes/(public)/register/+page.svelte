<script lang="ts">
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
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';

	let email = '';
	let password = '';
	let error: string | null = null;
	let isLoading = false;
	let successMessage: string | null = null;

	async function handleSubmit() {
		isLoading = true;
		error = null;
		successMessage = null;

		console.log('[Register Page] handleSubmit called. Email:', email);

		try {
			const { data: signUpData, error: signUpError } = await authClient.signUp.email({
				email,
				password,
				name: '', // Pass empty string to satisfy the 'string' type requirement
				callbackURL: '/login?verified=true' // For email verification link
			});
			console.log('[Register Page] signUpError:', signUpError);
			console.log('[Register Page] signUpData:', signUpData);

			if (signUpError) {
				console.error('[Register Page] Sign-up error details:', signUpError);
				error = signUpError.message || 'Registration failed. Please try again.';
			} else if (signUpData) {
				await goto('/home', { replaceState: true });
			} else {
				error = 'An unexpected error occurred during registration. No data and no error received.';
			}
		} catch (e: unknown) {
			console.error('[Register Page] Unexpected exception:', e);
			if (e instanceof Error) {
				error = e.message;
			} else {
				error = 'An unexpected error occurred.';
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
					<form on:submit|preventDefault={handleSubmit} class="space-y-4">
						<!-- Removed Name Input Field -->
						<div class="space-y-2">
							<Label for="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="Enter your email"
								bind:value={email}
								required
								disabled={isLoading}
							/>
						</div>
						<div class="space-y-2">
							<Label for="password">Password</Label>
							<Input
								id="password"
								name="password"
								type="password"
								placeholder="Create a password (min. 8 characters)"
								bind:value={password}
								required
								disabled={isLoading}
							/>
						</div>
						{#if error}
							<p class="text-sm text-red-500">{error}</p>
						{/if}
						{#if successMessage}
							<p class="text-sm text-green-500">{successMessage}</p>
						{/if}
						<Button type="submit" class="w-full" disabled={isLoading}>
							{#if isLoading}
								Creating account...
							{:else}
								Create Account
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
