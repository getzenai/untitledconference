<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import AuthShell from '$lib/components/app/auth/auth-shell.svelte';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import PasswordInput from '$lib/components/ui/password-input.svelte';
	import PasswordStrength from '$lib/components/ui/password-strength.svelte';
	import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '$lib/validators/password';
	import { onMount, tick } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { registerSchema } from './schema';
	import { safeReturnTo } from '$lib/safe-return-to';
	import { readPendingProposal } from '$lib/conference/pending-proposal';
	import type { PageData } from './$types';

	// The server action's answer. It only ever renders for a submit that happened
	// before hydration — once superForm is live it cancels the native submit.
	let { data, form: actionResult }: { data: PageData; form?: { message?: string } | null } =
		$props();

	// Check for invitation code in URL
	const invitationCode = $derived(page.url.searchParams.get('invitation'));
	const invitation = $derived(invitationCode ? data.invitation : null);
	const invitedEmail = $derived(invitation?.isValid ? invitation.email : null);
	const returnTo = $derived(safeReturnTo(page.url.searchParams.get('returnTo'), page.url.origin));
	const hasReturnTo = $derived(page.url.searchParams.has('returnTo'));
	const loginHref = $derived.by(() => {
		if (invitationCode) {
			return `/login?returnTo=${encodeURIComponent(`/invite/${invitationCode}`)}`;
		}
		return hasReturnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login';
	});
	const verifyEmailHref = $derived(`/verify-email?returnTo=${encodeURIComponent(returnTo)}`);
	const verificationCallback = $derived(`/email-verified?returnTo=${encodeURIComponent(returnTo)}`);

	function pendingProposalForSignUp() {
		const match = new URL(returnTo, page.url.origin).pathname.match(/^\/c\/([^/]+)\/cfp$/);
		if (!match) return undefined;
		const slug = decodeURIComponent(match[1]);
		const pending = readPendingProposal(sessionStorage, slug);
		return pending ? { slug, ...pending } : undefined;
	}

	// Initialize form client-side
	const form = superForm(
		{ email: invitedEmail || '', password: '', invitationCode: '' },
		{
			validators: zod4Client(registerSchema),
			SPA: true, // Prevent default form submission
			onSubmit: async ({ formData, cancel }) => {
				// Cancel the default form submission
				cancel();
				// `cancel` completes the submitting state synchronously. Let that settle
				// before setting an error that is known without an API round-trip.
				await tick();

				const email = formData.get('email') as string;
				const password = formData.get('password') as string;
				const invitationCodeValue = formData.get('invitationCode') as string | null;

				if (invitedEmail && email.toLowerCase() !== invitedEmail.toLowerCase()) {
					errors.set({
						_errors: [`This invitation is for ${invitedEmail}. Register with that email address.`]
					});
					return;
				}
				if (invitationCodeValue && !invitedEmail) {
					errors.set({
						_errors: [invitation?.isValid === false ? invitation.error : 'Invalid invitation.']
					});
					return;
				}

				try {
					// Sign up the user using Better Auth client
					const signUp = {
						email,
						password,
						name: '', // Better Auth requires a name field
						callbackURL: verificationCallback,
						// Better Auth accepts additional request fields. Its user-create hook
						// validates this again and keys it to the user it actually creates,
						// before a verification email can send the reader to a new tab.
						pendingProposal: pendingProposalForSignUp()
					} as Parameters<typeof authClient.signUp.email>[0];
					const { data: signUpData, error: signUpError } = await authClient.signUp.email(signUp);

					if (signUpError) {
						// Better error message for duplicate email
						if (
							signUpError.message?.includes('already') ||
							signUpError.message?.includes('exists')
						) {
							errors.set({ _errors: ['User already exists. Use another email.'] });
						} else {
							errors.set({
								_errors: [signUpError.message || 'Registration failed. Please try again.']
							});
						}
						return;
					}

					if (signUpData?.user) {
						// Handle invitation acceptance if we have an invitation code
						if (invitationCodeValue) {
							try {
								const { error: acceptError } = await authClient.organization.acceptInvitation({
									invitationId: invitationCodeValue
								});

								if (acceptError) {
									errors.set({
										_errors: [
											`Your account was created, but the invitation for ${invitedEmail} could not be accepted: ${acceptError.message || 'Please try again.'}`
										]
									});
									return;
								}
							} catch (_err) {
								errors.set({
									_errors: [
										`Your account was created, but the invitation for ${invitedEmail} could not be accepted. Return to the invitation and try again.`
									]
								});
								return;
							}
						}

						// Did sign-up hand us a session, or did it stop short of one?
						//
						// The question is not whether the address is verified — it never is,
						// one second after registering. It is whether this deployment gates
						// on that. Better Auth answers it in the response: it skips
						// auto-sign-in exactly when verification is required (or auto-sign-in
						// is off) and returns `token: null` (api/routes/sign-up); otherwise
						// it creates the session and returns its token.
						//
						// Reading `emailVerified` instead sent *every* new account to
						// "Verify your email", including where REQUIRE_EMAIL_VERIFICATION is
						// off — which is how production runs. The first screen after
						// registering was a dead end asking for a mail nobody had sent.
						if (signUpData.token) {
							await goto(returnTo, { invalidateAll: true });
						} else {
							await goto(verifyEmailHref);
						}
					} else {
						errors.set({ _errors: ['Registration failed. Please try again.'] });
					}
				} catch (_err) {
					errors.set({ _errors: ['An unexpected error occurred during registration.'] });
				}
			}
		}
	);

	const { form: formData, enhance, submitting, errors } = form;
	const emailMismatch = $derived(
		Boolean(
			invitedEmail &&
			$formData.email &&
			$formData.email.toLowerCase() !== invitedEmail.toLowerCase()
		)
	);

	onMount(() => {
		// If we have an invitation code from URL, store it and set in form
		const urlInvitation = page.url.searchParams.get('invitation');
		if (urlInvitation) {
			sessionStorage.setItem('pendingInvitation', urlInvitation);
			$formData.invitationCode = urlInvitation;
			if (invitedEmail) $formData.email = invitedEmail;
		}
	});
</script>

<AuthShell
	title="Create your account"
	description="One account for organizing, speaking and reviewing."
>
	<!-- POST even though superForm cancels the submit: before hydration nothing
	     cancels it, and a form without `method` defaults to GET - which would put
	     the credentials in the query string, the browser history and every proxy
	     log on the way. POST to a route without an action fails loudly instead. -->
	<!-- superforms' own enhance, and `SPA: true` cancels the submit: no server action
	runs, so there is no action result that could replace the page (#482). -->
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
					{#if invitedEmail}
						<p class="text-muted-foreground mt-1 text-sm">
							This invitation is for {invitedEmail}
						</p>
						{#if emailMismatch}
							<p role="alert" class="text-destructive mt-1 text-sm">
								This invitation is for {invitedEmail}. Register with that email address.
							</p>
						{/if}
					{/if}
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<Form.Field {form} name="password">
			<Form.Control>
				{#snippet children({ props })}
					<Form.Label>Password</Form.Label>
					<PasswordInput
						{...props}
						placeholder={`Create a password (${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters)`}
						bind:value={$formData.password}
						disabled={$submitting}
						minlength={PASSWORD_MIN_LENGTH}
						maxlength={PASSWORD_MAX_LENGTH}
					/>
					<PasswordStrength password={$formData.password} userInputs={[$formData.email]} />
				{/snippet}
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		{#if invitationCode}
			<input type="hidden" name="invitationCode" value={invitationCode} />
			<div class="bg-muted rounded-lg p-3">
				<p class="text-sm">You'll join an existing organization after registration.</p>
			</div>
		{/if}

		{#if $errors._errors || actionResult?.message}
			<div role="alert" class="text-destructive text-sm">
				{#if actionResult?.message}
					<p>{actionResult.message}</p>
				{/if}
				{#each $errors._errors ?? [] as error}
					<p>{error}</p>
				{/each}
			</div>
		{/if}

		<Form.Button type="submit" class="w-full" disabled={$submitting || emailMismatch}>
			{#if $submitting}
				Creating account...
			{:else}
				Register
			{/if}
		</Form.Button>
	</form>

	{#snippet footer()}
		<p>
			Already have an account?
			<a href={loginHref} class="text-foreground font-medium underline underline-offset-4">Login</a>
		</p>
	{/snippet}
</AuthShell>
