<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { loginSchema } from './schema';

	const form = superForm(
		{ email: '', password: '', rememberMe: true },
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
						// Check email verification
						if (!sessionData.user.emailVerified) {
							const params = new SvelteURLSearchParams({ email });
							const returnTo = page.url.searchParams.get('returnTo');
							if (returnTo) params.set('returnTo', returnTo);
							await goto(`/verify-email?${params}`);
							return;
						}

						// Redirect to home or returnTo URL
						const returnTo = page.url.searchParams.get('returnTo') || '/home';
						await goto(returnTo);
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
					<form use:enhance class="space-y-4">
						<Form.Field {form} name="email">
							<Form.Control>
								{#snippet children({ props })}
									<Form.Label>Email</Form.Label>
									<Input
										{...props}
										type="email"
										placeholder="Enter your email"
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
										<a href="/forgot-password" class="text-primary text-sm hover:underline">
											Forgot your password?
										</a>
									</div>
									<Input
										{...props}
										type="password"
										placeholder="Enter your password"
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
										<Checkbox
											{...props}
											bind:checked={$formData.rememberMe}
											disabled={$submitting}
										/>
										<Form.Label class="text-sm font-normal">Remember me</Form.Label>
									</div>
								{/snippet}
							</Form.Control>
						</Form.Field>

						{#if $errors._errors}
							<div role="alert" class="text-sm text-red-500">
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
