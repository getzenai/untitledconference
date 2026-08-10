<script lang="ts">
	/**
	 * The product page, not a conference page.
	 *
	 * The tool is multi-tenant and open source: a visitor who lands here is far
	 * more likely to be an organizer sizing it up than an attendee of whichever
	 * conference happens to be published. So the page leads with what the tool
	 * does and how to start, and the published conferences appear further down as
	 * evidence that it runs — a conference's real home is the organizer's own site
	 * (`/c/<slug>/embed`), not our root.
	 *
	 * The list stays for a second reason: every EMB eval scenario starts logged out
	 * at the base URL, and without it `/c/<slug>` is reachable only by guessing the
	 * slug (PR #53).
	 */
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDayLong } from '$lib/conference/public-view';

	let { data } = $props();

	const GITHUB_URL = 'https://github.com/getzenai/untitledconference';

	// Each role's one sentence, from the prototype's home screen: what this tool
	// does for you, in the words of the person doing the job.
	const roles = [
		{ who: 'Speakers', what: 'submit without creating an account first.' },
		{ who: 'Reviewers', what: 'see exactly their tracks — and nothing else.' },
		{ who: 'Organizers', what: 'see what is stuck, on one screen.' }
	];

	// `startsOn` and `endsOn` are nullable in the schema and arrive as '' when
	// unset. `formatDayLong('')` would render "Invalid Date" on the front page, so
	// a conference without dates simply shows none.
	const dateRange = (startsOn: string, endsOn: string) => {
		if (!startsOn) return null;
		if (!endsOn || endsOn === startsOn) return formatDayLong(startsOn);
		return `${formatDayLong(startsOn)} – ${formatDayLong(endsOn)}`;
	};
</script>

<svelte:head>
	<title>untitledconference — from first submission to published schedule</title>
	<meta
		name="description"
		content="Open-source conference programme management: call for papers, review, speaker onboarding and the published agenda."
	/>
</svelte:head>

<div class="bg-background text-foreground min-h-screen">
	<header class="border-border border-b">
		<div class="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-5">
			<span class="text-sm font-semibold tracking-tight">untitledconference</span>
			<div class="flex items-center gap-2">
				<ModeToggle class="-mr-1" />
				<a href="/login"><Button variant="ghost" size="sm">Sign in</Button></a>
				<a href="/register"><Button size="sm">Get started</Button></a>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-6 py-16">
		<section>
			<p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
				Conference programme
			</p>
			<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
				From first submission to published schedule.
			</h1>
			<p class="text-muted-foreground mt-3 max-w-xl text-sm">
				Call for papers, review, speaker onboarding and the agenda — in a tool fast enough to work
				through in one afternoon.
			</p>

			<dl class="border-border mt-8 max-w-xl space-y-3 border-t pt-6 text-sm">
				{#each roles as role (role.who)}
					<div class="flex gap-3">
						<dt class="text-muted-foreground w-28 shrink-0">{role.who}</dt>
						<dd>{role.what}</dd>
					</div>
				{/each}
			</dl>

			<div class="mt-8 flex flex-wrap items-center gap-3">
				<a href="/register"><Button>Set up a conference</Button></a>
				<a href="/login" class="text-muted-foreground hover:text-foreground text-sm underline">
					I already have an account
				</a>
			</div>
		</section>

		<section class="border-border mt-16 border-t pt-10">
			<h2 class="text-lg font-medium">Running on untitledconference</h2>
			<p class="text-muted-foreground mt-1 max-w-xl text-sm">
				Every conference here is public and needs no account to read. Organizers normally show
				theirs on their own site — each conference page comes with an embed for that.
			</p>

			{#if data.conferences.length === 0}
				<p
					class="border-border text-muted-foreground mt-6 rounded-lg border border-dashed p-6 text-sm"
				>
					Nothing published yet. The first conference on this instance will appear here.
				</p>
			{:else}
				<ul class="mt-6 grid gap-3">
					{#each data.conferences as conference (conference.slug)}
						{@const dates = dateRange(conference.startsOn, conference.endsOn)}
						<li>
							<a
								href="/c/{conference.slug}"
								class="border-border hover:border-primary hover:bg-muted/40 block rounded-lg border p-4 transition-colors"
							>
								<h3 class="font-medium">{conference.name}</h3>
								<p class="text-muted-foreground mt-1 text-sm">
									{#if dates}{dates}{/if}{#if dates && conference.venue}<span class="px-1.5">·</span
										>{/if}{#if conference.venue}{conference.venue}{/if}
								</p>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</main>

	<footer class="border-border border-t">
		<div
			class="text-muted-foreground mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm"
		>
			<span>Open source. Run it yourself.</span>
			<a class="hover:text-foreground underline" href={GITHUB_URL} rel="noreferrer">GitHub</a>
		</div>
	</footer>
</div>
