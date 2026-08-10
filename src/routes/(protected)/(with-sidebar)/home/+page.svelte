<script lang="ts">
	/**
	 * The first screen after login: pick which hat you are wearing.
	 *
	 * One account can organize, speak and review. The three destinations used to be
	 * reachable only by typing a URL (except organizing, which lived under /manage
	 * once you knew to look). Listing all three here is the navigation; a loader that
	 * finds neither role answers with an empty list rather than an error, so the
	 * cards are unconditional.
	 *
	 * Logout lives in the sidebar account menu — not on this page. A second logout
	 * button here was leftover from the starter template and made the screen look
	 * like a demo rather than the product.
	 */
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const roles = [
		{
			href: '/manage',
			title: 'Organizing',
			description: 'Your conferences, the call, decisions and the programme.'
		},
		{
			href: '/portal',
			title: 'Speaking',
			description: 'Your proposals, tasks and files.'
		},
		{
			href: '/review',
			title: 'Reviewing',
			description: 'The proposals assigned to you to score.'
		}
	] as const;
</script>

<div class="container space-y-6 py-8" data-testid="home-dashboard">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Home</h1>
		{#if data.user?.email}
			<p class="text-muted-foreground mt-1 text-sm">Welcome, {data.user.email}</p>
		{:else}
			<p class="text-muted-foreground mt-1 text-sm">Welcome</p>
		{/if}
	</div>

	{#if data.onboarding}
		<section class="border-border bg-card rounded-lg border p-4">
			<h2 class="text-sm font-semibold">
				{#if data.onboarding.pendingInvitationCount > 0}
					You have {data.onboarding.pendingInvitationCount} pending invitation{data.onboarding
						.pendingInvitationCount === 1
						? ''
						: 's'}
				{:else}
					Finish setting up your account
				{/if}
			</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if data.onboarding.pendingInvitationCount > 0}
					Join an organization you have been invited to.
				{:else}
					Create an organization to start collaborating.
				{/if}
			</p>
			<p class="mt-3">
				<a
					href={data.onboarding.href}
					class="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-9 items-center rounded-md px-3 text-sm font-medium focus-visible:ring-[3px] focus-visible:outline-none"
				>
					{data.onboarding.pendingInvitationCount > 0
						? 'Review invitations'
						: 'Create organization'}
				</a>
			</p>
		</section>
	{/if}

	<section aria-label="Where to work">
		<div class="grid gap-3 sm:grid-cols-3">
			{#each roles as role (role.href)}
				<a
					href={role.href}
					class="border-border hover:border-primary hover:bg-muted/40 focus-visible:ring-ring block rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
				>
					<span class="block font-medium">{role.title}</span>
					<span class="text-muted-foreground text-sm">{role.description}</span>
				</a>
			{/each}
		</div>
	</section>
</div>
