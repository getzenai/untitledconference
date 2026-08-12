<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { EventNames, identifyUser, trackEvent } from '$lib/analytics/posthog';
	import { authClient } from '$lib/auth-client';
	import AuthShell from '$lib/components/app/auth/auth-shell.svelte';
	import { markGooseWelcome } from '$lib/goose-welcome';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import PasswordInput from '$lib/components/ui/password-input.svelte';
	import { dev } from '$app/environment';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { loginSchema } from './schema';

	// Pre-fill from query params for quick dev login (?email=...&pw=...)
	// Password pre-fill only in dev mode to avoid leaking credentials via URL
	const prefillEmail = page.url.searchParams.get('email') ?? '';
	const prefillPassword = dev ? (page.url.searchParams.get('pw') ?? '') : '';

	const form = superForm(
		{ email: prefillEmail, password: prefillPassword, rememberMe: true },
		{
			validators: zod4Client(loginSchema),
			SPA: true, // Prevent default form submission
			onSubmit: async ({ formData, cancel }) => {
				// Cancel the default form submission
				cancel();

				const email = formData.get('email') as string;
				const password = formData.get('password') as string;
				const rememberMe = formData.get('rememberMe') === 'on';

				try {
					// Use Better Auth client-side authentication
					const { data: sessionData, error: signInError } = await authClient.signIn.email({
						email,
						password,
						rememberMe
					});

					if (signInError) {
						// Handle email verification error
						if (signInError.status === 403 && signInError.message?.includes('Email not verified')) {
							const params = new SvelteURLSearchParams({ email });
							const returnTo = page.url.searchParams.get('returnTo');
							if (returnTo) params.set('returnTo', returnTo);
							await goto(`/verify-email?${params}`);
							return;
						}

						// Set form error
						errors.set({ _errors: [signInError.message || 'Invalid credentials.'] });
						return;
					}

					if (sessionData?.user) {
						// Sign-in happens client-side via Better Auth, so the server
						// never sees it — capture it here. No-op without a PostHog key.
						identifyUser(sessionData.user.id, { email: sessionData.user.email });
						trackEvent(EventNames.USER_SIGNED_IN);

						// No second opinion on whether this person may be here.
						//
						// This used to send anybody whose address was unverified to
						// /verify-email — after a sign-in that had already succeeded. Where
						// REQUIRE_EMAIL_VERIFICATION is off, which is how production runs,
						// that put a "you are not finished" screen in front of a session
						// that was complete: the user was signed in and told they were not.
						//
						// Better Auth decides this, and it answers above: with verification
						// required and the address unverified, sign-in throws 403 EMAIL_NOT_
						// VERIFIED (api/routes/sign-in) and never returns a session. So a
						// session in hand means the server let them in, and the only thing
						// left to do is take them where they were going.

						// Redirect to home or returnTo URL
						const rawReturnTo = page.url.searchParams.get('returnTo') || '/home';
						const returnTo =
							rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/home';

						// Goose easter egg: one-time "welcome back" toast, consumed by the
						// protected layout on mount. sessionStorage rather than a query
						// param so it survives the redirect without showing up in the URL.
						markGooseWelcome(sessionStorage);

						await goto(returnTo, { invalidateAll: true });
					} else {
						errors.set({ _errors: ['Login failed. Please try again.'] });
					}
				} catch (_err) {
					errors.set({ _errors: ['An unexpected error occurred during login.'] });
				}
			}
		}
	);

	const { form: formData, enhance, submitting, errors } = form;
</script>

<AuthShell title="Sign in" description="Use the account you registered with.">
	<!-- POST even though superForm cancels the submit: before hydration nothing
	     cancels it, and a form without `method` defaults to GET - which would put
	     the credentials in the query string, the browser history and every proxy
	     log on the way. POST to a route without an action fails loudly instead. -->
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

		<Form.Field {form} name="password">
			<Form.Control>
				{#snippet children({ props })}
					<div class="flex items-center justify-between">
						<Form.Label>Password</Form.Label>
						<a
							href="/forgot-password"
							class="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
						>
							Forgot your password?
						</a>
					</div>
					<PasswordInput
						{...props}
						autocomplete="current-password"
						placeholder="••••••••"
						bind:value={$formData.password}
						disabled={$submitting}
					/>
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Field {form} name="rememberMe">
			<Form.Control>
				{#snippet children({ props })}
					<div class="flex items-center space-x-2">
						<Checkbox {...props} bind:checked={$formData.rememberMe} disabled={$submitting} />
						<Form.Label class="text-sm font-normal">Remember me</Form.Label>
					</div>
				{/snippet}
			</Form.Control>
		</Form.Field>

		{#if $errors._errors}
			<div role="alert" class="text-destructive text-sm">
				{#each $errors._errors as error}
					<p>{error}</p>
				{/each}
			</div>
		{/if}

		<Form.Button type="submit" class="w-full" disabled={$submitting}>
			{#if $submitting}
				Logging in...
			{:else}
				Login
			{/if}
		</Form.Button>
	</form>

	{#snippet footer()}
		<p>
			Don't have an account?
			<a href="/register" class="text-foreground font-medium underline underline-offset-4">
				Register
			</a>
		</p>
		<!--
			The way back out, and it is load-bearing: `/` sends a visitor without a
			session here, so without this link the login form is a dead end for
			anyone who came for a conference's public site rather than an account.
			It sits under the card rather than in a panel because the old panel was
			`lg:` only and vanished on a phone.
		-->
		<p class="mt-1">
			Just looking for a conference?
			<a href="/" class="text-foreground font-medium underline underline-offset-4">
				Browse public conference sites
			</a>
		</p>
	{/snippet}
</AuthShell>
