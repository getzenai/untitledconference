<script lang="ts">
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
	import { page } from '$app/state';

	let email = $state('');
	let password = $state('');
	let error: string | null = $state(null);
	let isLoading = $state(false);
	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		// Validate fields
		if (!email || !password) {
			error = 'Email and password are required';
			return;
		}
		isLoading = true;
		error = null;
		try {
			console.log('[Login Page] Attempting sign-in with:', { email });
			let redirectedToVerify = false;
			let signInErrorMessage: string | null = null;

			const signInResult = await authClient.signIn.email(
				{
					email,
					password,
					rememberMe: true
				},
				{
					onError: async (ctx) => {
						console.error('[Login Page] Sign-in error details:', ctx.error);
						const message = ctx.error.message?.toLowerCase() ?? '';
						if (ctx.error.status === 403 && message.includes('email not verified')) {
							redirectedToVerify = true;
							const search = new URLSearchParams();
							if (email) {
								search.set('email', email);
							}
							const returnTo = page.url.searchParams.get('returnTo');
							if (returnTo) {
								search.set('returnTo', returnTo);
							}
							const verifyUrl = `/verify-email${search.toString() ? `?${search.toString()}` : ''}`;
							await goto(verifyUrl, { replaceState: true });
							return;
						}
						signInErrorMessage = ctx.error.message || 'Invalid credentials or server error.';
					}
				}
			);

			if (redirectedToVerify) {
				return;
			}

			const { data: sessionData } = signInResult ?? {};

			if (signInErrorMessage) {
				error = signInErrorMessage;
				return;
			}

			if (sessionData) {
				console.log('[Login Page] Login successful, checking verification status...');

				// Check if user needs email verification
				const sessionResponse = await authClient.getSession();
				if (sessionResponse?.data?.user && !sessionResponse.data.user.emailVerified) {
					console.log('[Login Page] User email not verified, redirecting to verify-email');
					await goto('/verify-email', { replaceState: true });
					return;
				}

				console.log('[Login Page] User verified, redirecting to returnTo or home...');
				const returnTo = page.url.searchParams.get('returnTo') || '/home';
				await goto(returnTo, { replaceState: true });
			} else {
				console.log('[Login Page] No sessionData returned.');
				error = 'Login attempt did not result in a session.';
			}
		} catch (e: unknown) {
			console.error('[Login Page] Unexpected exception during sign-in:', e);
			if (e instanceof Error) {
				error = e.message;
			} else {
				error = 'An unexpected error occurred.';
			}
			// Clear password on any error
			password = '';
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
				<span class="text-2xl font-bold">SvelteKit Vibe Starter</span>
			</div>
			<blockquote class="space-y-2 text-right">
				<p class="text-lg">
					A powerful SvelteKit starter application to vibe code with RooCode, featuring modern
					authentication, database integration, and beautiful UI components.
				</p>
			</blockquote>
			<div class="mt-6 space-y-4 text-right">
				<h3 class="text-xl font-semibold">Features:</h3>
				<ul class="space-y-2">
					<li>• Modern Authentication with Better Auth</li>
					<li>• PostgreSQL Database with Drizzle ORM</li>
					<li>• Beautiful UI Components with shadcn</li>
					<li>• Internationalization with Paraglide</li>
					<li>• Type-safe Database Operations</li>
				</ul>
			</div>
		</div>
	</div>
	<div class="flex h-full items-center p-4 lg:p-8">
		<div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<Card>
				<CardHeader>
					<CardTitle>Login</CardTitle>
					<CardDescription>Enter your credentials to access your account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onsubmit={handleSubmit} class="space-y-4">
						<div class="space-y-2">
							<Label for="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="Enter your email"
								bind:value={email}
								disabled={isLoading}
							/>
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<Label for="password">Password</Label>
								<a href="/forgot-password" class="text-primary text-sm hover:underline">
									Forgot your password?
								</a>
							</div>
							<Input
								id="password"
								name="password"
								type="password"
								placeholder="Enter your password"
								bind:value={password}
								disabled={isLoading}
							/>
						</div>
						{#if error}
							<div role="alert" class="error-message text-sm text-red-500">{error}</div>
						{/if}
						<button
							type="submit"
							class="bg-primary hover:bg-primary/90 w-full rounded px-4 py-2 font-medium text-white disabled:opacity-50"
							disabled={isLoading}
						>
							{#if isLoading}
								Logging in...
							{:else}
								Login
							{/if}
						</button>
						<p class="text-muted-foreground text-center text-sm">
							Don't have an account? <a href="/register" class="text-primary hover:underline"
								>Register</a
							>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	</div>
</div>
