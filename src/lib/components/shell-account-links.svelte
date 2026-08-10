<script lang="ts">
	/**
	 * Minimal Home + Log out for product shells outside the app sidebar.
	 *
	 * `/manage`, `/portal` and `/review` do not render AppSidebar/NavUser.
	 * After #62 removed the second logout on /home, these shells need their
	 * own affordance — otherwise speakers and reviewers cannot leave.
	 */
	import { goto } from '$app/navigation';
	import { resetUser } from '$lib/analytics/posthog';
	import { authClient } from '$lib/auth-client';

	let {
		showHome = true,
		homeTestId = 'shell-home-link',
		class: className = ''
	}: {
		showHome?: boolean;
		/** Override when an existing selector pins a specific home link. */
		homeTestId?: string;
		class?: string;
	} = $props();

	async function handleLogout() {
		try {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						resetUser();
						goto('/login', { replaceState: true });
					}
				}
			});
		} catch (error) {
			console.error('Logout failed:', error);
		}
	}
</script>

<div
	class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs {className}"
	data-testid="shell-account-links"
>
	{#if showHome}
		<a
			href="/home"
			data-testid={homeTestId}
			class="text-muted-foreground hover:text-foreground underline underline-offset-4"
		>
			Home
		</a>
	{/if}
	<button
		type="button"
		data-testid="shell-logout"
		class="text-muted-foreground hover:text-foreground underline underline-offset-4"
		onclick={handleLogout}
	>
		Log out
	</button>
</div>
