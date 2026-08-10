<script lang="ts">
	import EmptyState from '$lib/components/empty-state.svelte';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDayLong } from '$lib/conference/public-view';

	let { data } = $props();

	// `starts_on` and `ends_on` are nullable in the schema and arrive as '' when
	// unset. `formatDayLong('')` would render "Invalid Date" on the front page, so
	// a conference without dates simply shows none.
	const dateRange = (startsOn: string, endsOn: string) => {
		if (!startsOn) return null;
		if (!endsOn || endsOn === startsOn) return formatDayLong(startsOn);
		return `${formatDayLong(startsOn)} – ${formatDayLong(endsOn)}`;
	};
</script>

<svelte:head>
	<title>Conferences</title>
	<meta
		name="description"
		content="Public conference sites: agenda, speakers and call for papers."
	/>
</svelte:head>

<div class="bg-background text-foreground min-h-screen">
	<header class="border-border border-b">
		<div class="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-8">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight">Conferences</h1>
				<p class="text-muted-foreground mt-1 text-sm">
					Agenda, speakers and open calls — no account needed.
				</p>
			</div>
			<div class="flex items-center gap-2">
				<ModeToggle class="-mr-1" />
				<a href="/login"><Button variant="outline">Sign in</Button></a>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-6 py-10">
		{#if data.conferences.length === 0}
			<EmptyState
				title="No conference has been published yet"
				description="Organizers publish a conference from their dashboard. Sign in to set one up."
				action={{ href: '/login', label: 'Sign in' }}
			/>
		{:else}
			<ul class="grid gap-4">
				{#each data.conferences as conference (conference.slug)}
					{@const dates = dateRange(conference.startsOn, conference.endsOn)}
					<li>
						<a
							href="/c/{conference.slug}"
							class="border-border hover:border-primary hover:bg-muted/40 block rounded-lg border p-6 transition-colors"
						>
							<h2 class="text-lg font-medium">{conference.name}</h2>
							<p class="text-muted-foreground mt-1 text-sm">
								{#if dates}{dates}{/if}{#if dates && conference.venue}<span class="px-1.5">·</span
									>{/if}{#if conference.venue}{conference.venue}{/if}
							</p>
						</a>
					</li>
				{/each}
			</ul>
		{/if}

		<p class="text-muted-foreground mt-10 text-sm">
			Organizing, speaking or reviewing? <a href="/login" class="text-foreground underline"
				>Sign in</a
			>
			or <a href="/register" class="text-foreground underline">create an account</a>.
		</p>
	</main>
</div>
