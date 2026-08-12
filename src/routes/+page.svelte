<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import GithubIcon from '@lucide/svelte/icons/github';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import MailCheckIcon from '@lucide/svelte/icons/mail-check';
	import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
	import RouteIcon from '@lucide/svelte/icons/route';
	import UsersRoundIcon from '@lucide/svelte/icons/users-round';
	import Goose from '$lib/components/goose.svelte';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { formatDayLong } from '$lib/conference/public-view';
	import { REPO_URL } from '$lib/constants';

	let { data } = $props();

	/**
	 * Where this page's own logo points.
	 *
	 * `/` sends a signed-in visitor straight back to `/home`, so for them the plain
	 * link would undo the escape hatch they just used: click the logo, land in the
	 * app, and the product page is out of reach again.
	 */
	const selfHref = $derived(data.user ? '/?home=0' : '/');

	const dateRange = (startsOn: string, endsOn: string) => {
		if (!startsOn) return null;
		if (!endsOn || endsOn === startsOn) return formatDayLong(startsOn);
		return `${formatDayLong(startsOn)} – ${formatDayLong(endsOn)}`;
	};
</script>

<svelte:head>
	<title>untitledconference — run your conference from call to stage</title>
	<meta
		name="description"
		content="Open-source conference programme management for calls for proposals, collaborative review, speaker operations and published agendas."
	/>
</svelte:head>

<!-- overflow-x-clip, not overflow-hidden: hidden would make this div the scroll
     container for the sticky header, which then never sticks (the page scrolls on
     the viewport, not on this div). clip clips the decorative bleed without
     creating a scroll container. -->
<div class="bg-background text-foreground min-h-screen overflow-x-clip">
	<header class="border-border/70 bg-background/90 sticky top-0 z-50 border-b backdrop-blur-xl">
		<div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
			<a
				href={selfHref}
				class="focus-visible:ring-ring flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-[3px] focus-visible:outline-none"
			>
				<Goose silent class="h-9 w-8" />
				<span>untitledconference</span>
			</a>

			<nav aria-label="Landing page" class="hidden items-center gap-6 md:flex">
				<a
					class="text-muted-foreground hover:text-foreground text-sm transition-colors"
					href="#product">Product</a
				>
				<a
					class="text-muted-foreground hover:text-foreground text-sm transition-colors"
					href="#workflow">Workflow</a
				>
				<a
					class="text-muted-foreground hover:text-foreground text-sm transition-colors"
					href="#live-events">Live conferences</a
				>
				<a
					class="text-muted-foreground hover:text-foreground text-sm transition-colors"
					href={REPO_URL}
					rel="noreferrer">Open source</a
				>
			</nav>

			<div class="flex items-center gap-1.5 sm:gap-2">
				<ModeToggle class="hidden sm:inline-flex" />
				<!-- A signed-in reader arrives here through `?home=0` (see +page.server.ts), so
				     the two buttons that ask them to sign in or sign up would be nonsense. The
				     page stays exactly the same otherwise: it is the product page, and reading
				     it is the point of having come. -->
				{#if data.user}
					<Button href="/home" variant="act" size="sm" data-testid="landing-back-to-work">
						Back to your work
					</Button>
				{:else}
					<Button href="/login" variant="ghost" size="sm" class="hidden sm:inline-flex"
						>Sign in</Button
					>
					<Button href="/register" variant="act" size="sm">Get started</Button>
				{/if}
			</div>
		</div>
	</header>

	<main>
		<section class="relative">
			<div
				class="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[34rem] bg-[radial-gradient(circle_at_70%_15%,color-mix(in_oklab,var(--act)_22%,transparent),transparent_48%)]"
			></div>
			<div
				class="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.02fr_0.98fr] lg:py-28"
			>
				<div class="max-w-2xl">
					<Badge variant="outline" class="bg-background/70 rounded-full px-3 py-1 backdrop-blur">
						<span class="bg-act mr-1 size-1.5 rounded-full"></span>
						Open source conference operations
					</Badge>
					<h1
						class="mt-6 text-4xl leading-[1.02] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl"
					>
						Run the whole conference.<br />
						<span class="text-muted-foreground">Lose the handoffs.</span>
					</h1>
					<p class="text-muted-foreground mt-6 max-w-xl text-base leading-7 sm:text-lg">
						One calm workspace for proposals, review rounds, speakers and the schedule. Built so
						organizers can move from open call to published agenda without a spreadsheet relay.
					</p>
					<div class="mt-8 flex flex-wrap items-center gap-3">
						<Button href="/register" variant="act" size="lg">
							Create your conference
							<ArrowRightIcon />
						</Button>
						{#if data.conferences.length > 0}
							<Button href="/c/{data.conferences[0].slug}" variant="outline" size="lg">
								Explore a live conference
							</Button>
						{:else}
							<Button href={REPO_URL} variant="outline" size="lg">
								<GithubIcon />
								View on GitHub
							</Button>
						{/if}
					</div>
					<ul class="text-muted-foreground mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
						<li class="flex items-center gap-2">
							<CheckIcon class="text-status-good size-4" /> Self-hostable
						</li>
						<li class="flex items-center gap-2">
							<CheckIcon class="text-status-good size-4" /> No attendee account required
						</li>
						<li class="flex items-center gap-2">
							<CheckIcon class="text-status-good size-4" /> Built for every role
						</li>
					</ul>
				</div>

				<div class="relative mx-auto w-full max-w-xl lg:mx-0">
					<div class="bg-act/30 absolute -inset-8 -z-10 rounded-[3rem] blur-3xl"></div>
					<div
						class="border-border bg-card overflow-hidden rounded-2xl border shadow-2xl shadow-black/10"
					>
						<div class="border-border flex items-center justify-between border-b px-4 py-3">
							<div class="flex items-center gap-2 text-xs font-medium">
								<div class="bg-act flex size-6 items-center justify-center rounded-md">
									<Goose class="h-5 w-4" />
								</div>
								DevFlow 2027
							</div>
							<span
								class="text-status-good bg-status-good-bg rounded-full px-2 py-1 text-[10px] font-medium"
								>On track</span
							>
						</div>

						<div class="grid min-h-80 grid-cols-[8rem_1fr] sm:grid-cols-[10rem_1fr]">
							<div class="border-border bg-muted/35 border-r p-3">
								<p
									class="text-muted-foreground mb-3 px-2 text-[10px] font-semibold tracking-wider uppercase"
								>
									Manage
								</p>
								<div class="space-y-1 text-xs">
									<div
										class="bg-background border-border flex items-center gap-2 rounded-md border px-2 py-2 font-medium shadow-xs"
									>
										<LayoutDashboardIcon class="size-3.5" /> Overview
									</div>
									<div class="text-muted-foreground flex items-center gap-2 px-2 py-2">
										<MessageSquareTextIcon class="size-3.5" /> Proposals
									</div>
									<div class="text-muted-foreground flex items-center gap-2 px-2 py-2">
										<UsersRoundIcon class="size-3.5" /> Speakers
									</div>
									<div class="text-muted-foreground flex items-center gap-2 px-2 py-2">
										<CalendarDaysIcon class="size-3.5" /> Agenda
									</div>
								</div>
							</div>

							<div class="min-w-0 p-4 sm:p-5">
								<div class="mb-5 flex items-start justify-between gap-3">
									<div>
										<p class="text-sm font-semibold">Good morning, Jordan</p>
										<p class="text-muted-foreground mt-1 text-[11px]">
											Here is what needs attention.
										</p>
									</div>
									<span
										class="bg-act text-act-foreground rounded-md px-2 py-1 text-[10px] font-medium"
										>Open call</span
									>
								</div>

								<div class="grid gap-2 sm:grid-cols-3">
									<div class="border-border rounded-lg border p-3">
										<p class="text-muted-foreground text-[10px]">Proposals</p>
										<p class="mt-1 text-xl font-semibold">32</p>
									</div>
									<div class="border-border rounded-lg border p-3">
										<p class="text-muted-foreground text-[10px]">Need review</p>
										<p class="mt-1 text-xl font-semibold">8</p>
									</div>
									<div class="border-border rounded-lg border p-3">
										<p class="text-muted-foreground text-[10px]">Scheduled</p>
										<p class="mt-1 text-xl font-semibold">18</p>
									</div>
								</div>

								<div class="border-border mt-3 rounded-lg border p-3">
									<div class="mb-3 flex items-center justify-between">
										<p class="text-xs font-medium">Next up</p>
										<span class="text-muted-foreground text-[10px]">3 tasks</span>
									</div>
									<div class="space-y-2 text-[11px]">
										<div class="bg-muted/60 flex items-center gap-2 rounded-md p-2">
											<CircleCheckIcon class="text-status-good size-3.5" /> Review round is ready
										</div>
										<div class="bg-muted/60 flex items-center gap-2 rounded-md p-2">
											<MailCheckIcon class="text-status-progress size-3.5" /> 6 speaker replies pending
										</div>
										<div class="bg-muted/60 flex items-center gap-2 rounded-md p-2">
											<RouteIcon class="text-status-warn size-3.5" /> 2 agenda conflicts
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<Goose
						alt="The untitledconference goose"
						class="absolute -right-4 -bottom-14 h-28 w-auto rotate-6 drop-shadow-lg sm:-right-10 sm:h-36"
					/>
				</div>
			</div>
		</section>

		<section id="product" class="border-border bg-muted/25 scroll-mt-16 border-y">
			<div class="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
				<div class="max-w-2xl">
					<p class="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
						One source of truth
					</p>
					<h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
						The programme stays connected.
					</h2>
					<p class="text-muted-foreground mt-4 leading-7">
						A decision should update the work around it—not start another copy-paste chain.
					</p>
				</div>

				<div class="mt-12 grid gap-4 lg:grid-cols-3">
					<article class="border-border bg-card rounded-2xl border p-6 shadow-sm">
						<div class="bg-act/25 flex size-11 items-center justify-center rounded-xl">
							<MessageSquareTextIcon class="size-5" />
						</div>
						<h3 class="mt-6 text-lg font-semibold">Collect without friction</h3>
						<p class="text-muted-foreground mt-2 text-sm leading-6">
							Open a branded call, shape the questions and let speakers start before creating an
							account.
						</p>
						<ul class="mt-6 space-y-3 text-sm">
							<li class="flex gap-2">
								<CheckIcon class="text-status-good mt-0.5 size-4" /> Custom and conditional questions
							</li>
							<li class="flex gap-2">
								<CheckIcon class="text-status-good mt-0.5 size-4" /> Drafts and co-speakers
							</li>
							<li class="flex gap-2">
								<CheckIcon class="text-status-good mt-0.5 size-4" /> Clear submission receipts
							</li>
						</ul>
					</article>

					<article class="border-border bg-card rounded-2xl border p-6 shadow-sm">
						<div
							class="bg-status-progress-bg text-status-progress flex size-11 items-center justify-center rounded-xl"
						>
							<UsersRoundIcon class="size-5" />
						</div>
						<h3 class="mt-6 text-lg font-semibold">Review with context</h3>
						<p class="text-muted-foreground mt-2 text-sm leading-6">
							Run focused rounds, keep access scoped and see where another opinion is still missing.
						</p>
						<ul class="mt-6 space-y-3 text-sm">
							<li class="flex gap-2">
								<CheckIcon class="text-status-good mt-0.5 size-4" /> Configurable review rounds
							</li>
							<li class="flex gap-2">
								<CheckIcon class="text-status-good mt-0.5 size-4" /> Track-level reviewer access
							</li>
							<li class="flex gap-2">
								<CheckIcon class="text-status-good mt-0.5 size-4" /> Blind and collaborative modes
							</li>
						</ul>
					</article>

					<article class="border-border bg-card rounded-2xl border p-6 shadow-sm">
						<div
							class="bg-status-good-bg text-status-good flex size-11 items-center justify-center rounded-xl"
						>
							<CalendarDaysIcon class="size-5" />
						</div>
						<h3 class="mt-6 text-lg font-semibold">Publish what is real</h3>
						<p class="text-muted-foreground mt-2 text-sm leading-6">
							Turn accepted sessions into a conflict-aware agenda and share it wherever attendees
							already are.
						</p>
						<ul class="mt-6 space-y-3 text-sm">
							<li class="flex gap-2">
								<CheckIcon class="text-status-good mt-0.5 size-4" /> Drag-and-drop agenda building
							</li>
							<li class="flex gap-2">
								<CheckIcon class="text-status-good mt-0.5 size-4" /> Public and embeddable schedule
							</li>
							<li class="flex gap-2">
								<CheckIcon class="text-status-good mt-0.5 size-4" /> Personal itineraries and calendar
								export
							</li>
						</ul>
					</article>
				</div>
			</div>
		</section>

		<section id="workflow" class="mx-auto max-w-7xl scroll-mt-16 px-5 py-20 sm:px-8 sm:py-24">
			<div class="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
				<div>
					<p class="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
						From call to stage
					</p>
					<h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
						A workflow your whole team can follow.
					</h2>
					<p class="text-muted-foreground mt-4 leading-7">
						Every role gets a focused view. Organizers keep the whole conference in sight without
						turning everyone into an admin.
					</p>
					<Button href="/register" variant="outline" class="mt-7"
						>Start with your call <ArrowRightIcon /></Button
					>
				</div>

				<ol
					class="border-border relative grid gap-8 border-l pl-8 sm:grid-cols-2 sm:border-l-0 sm:pl-0"
				>
					<li class="relative sm:border-t sm:pt-8">
						<span
							class="border-background bg-act text-act-foreground absolute top-0 -left-11 flex size-6 items-center justify-center rounded-full border-4 text-[10px] font-bold sm:-top-3 sm:left-0"
							>1</span
						>
						<h3 class="font-semibold">Shape the call</h3>
						<p class="text-muted-foreground mt-2 text-sm leading-6">
							Set dates, tracks, formats and the information speakers need.
						</p>
					</li>
					<li class="relative sm:border-t sm:pt-8">
						<span
							class="border-background bg-act text-act-foreground absolute top-0 -left-11 flex size-6 items-center justify-center rounded-full border-4 text-[10px] font-bold sm:-top-3 sm:left-0"
							>2</span
						>
						<h3 class="font-semibold">Make the decisions</h3>
						<p class="text-muted-foreground mt-2 text-sm leading-6">
							Invite reviewers, compare scores and keep decisions separate from notifications.
						</p>
					</li>
					<li class="relative sm:border-t sm:pt-8">
						<span
							class="border-background bg-act text-act-foreground absolute top-0 -left-11 flex size-6 items-center justify-center rounded-full border-4 text-[10px] font-bold sm:-top-3 sm:left-0"
							>3</span
						>
						<h3 class="font-semibold">Ready the speakers</h3>
						<p class="text-muted-foreground mt-2 text-sm leading-6">
							Track bios, assets, deliverables and the messages still waiting for a reply.
						</p>
					</li>
					<li class="relative sm:border-t sm:pt-8">
						<span
							class="border-background bg-act text-act-foreground absolute top-0 -left-11 flex size-6 items-center justify-center rounded-full border-4 text-[10px] font-bold sm:-top-3 sm:left-0"
							>4</span
						>
						<h3 class="font-semibold">Publish the programme</h3>
						<p class="text-muted-foreground mt-2 text-sm leading-6">
							Build the schedule, resolve conflicts and embed the finished agenda.
						</p>
					</li>
				</ol>
			</div>
		</section>

		<section class="border-border border-y">
			<div class="bg-border mx-auto grid max-w-7xl gap-px sm:grid-cols-3">
				<div class="bg-background p-8 sm:p-10">
					<p class="text-sm font-semibold">For organizers</p>
					<p class="text-muted-foreground mt-3 text-sm leading-6">
						See what is stuck, move the programme forward and keep the public story current.
					</p>
				</div>
				<div class="bg-background p-8 sm:p-10">
					<p class="text-sm font-semibold">For reviewers</p>
					<p class="text-muted-foreground mt-3 text-sm leading-6">
						A clean queue with the right proposals, the right rubric and no admin clutter.
					</p>
				</div>
				<div class="bg-background p-8 sm:p-10">
					<p class="text-sm font-semibold">For speakers</p>
					<p class="text-muted-foreground mt-3 text-sm leading-6">
						Submit, collaborate and handle conference requests from one focused portal.
					</p>
				</div>
			</div>
		</section>

		<section id="live-events" class="bg-muted/25 scroll-mt-16">
			<div class="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
				<div class="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
					<div>
						<p class="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
							Proof, not a directory
						</p>
						<h2 class="mt-3 text-3xl font-semibold tracking-tight">See a published conference.</h2>
					</div>
					<p class="text-muted-foreground max-w-lg text-sm leading-6">
						Public conference pages need no account. Each one can also be embedded into the
						organizer's own website.
					</p>
				</div>

				{#if data.conferences.length === 0}
					<div
						class="border-border bg-background mt-10 rounded-2xl border border-dashed p-8 text-sm"
					>
						<p class="font-medium">Nothing published yet.</p>
						<p class="text-muted-foreground mt-1">
							The first public conference on this instance will appear here.
						</p>
					</div>
				{:else}
					<ul class="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{#each data.conferences as conference (conference.slug)}
							{@const dates = dateRange(conference.startsOn, conference.endsOn)}
							<li>
								<a
									href="/c/{conference.slug}"
									class="border-border bg-background hover:border-foreground/30 group flex h-full flex-col rounded-2xl border p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
								>
									<div class="flex items-start justify-between gap-4">
										<CalendarDaysIcon class="text-muted-foreground size-5" /><ArrowRightIcon
											class="text-muted-foreground size-4 transition-transform group-hover:translate-x-1"
										/>
									</div>
									<h3 class="mt-8 font-semibold">{conference.name}</h3>
									<p class="text-muted-foreground mt-2 text-sm">
										{#if dates}{dates}{/if}{#if dates && conference.venue}<span class="px-1.5"
												>·</span
											>{/if}{#if conference.venue}{conference.venue}{/if}
									</p>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<section class="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
			<div
				class="bg-foreground text-background relative overflow-hidden rounded-3xl px-6 py-12 sm:px-12 sm:py-16 lg:px-16"
			>
				<div class="relative z-10 max-w-2xl">
					<p class="text-background/65 text-xs font-semibold tracking-widest uppercase">
						Your conference can have one home
					</p>
					<h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
						Ready when the programme is.
					</h2>
					<p class="text-background/70 mt-4 max-w-xl leading-7">
						Start with the next call. Keep the reviews, people and schedule connected as the
						conference grows.
					</p>
					<div class="mt-8 flex flex-wrap gap-3">
						<Button href="/register" variant="act" size="lg"
							>Create your conference <ArrowRightIcon /></Button
						>
						<Button
							href={REPO_URL}
							variant="outline"
							size="lg"
							class="border-background/25 text-background hover:bg-background/10 hover:text-background bg-transparent"
							><GithubIcon /> Explore the source</Button
						>
					</div>
				</div>
				<Goose
					silent
					class="pointer-events-none absolute -right-10 -bottom-20 h-72 w-auto opacity-20 sm:right-6 sm:h-80"
				/>
			</div>
		</section>
	</main>

	<footer class="border-border border-t">
		<div
			class="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8"
		>
			<div class="flex items-center gap-2 text-sm font-semibold">
				<Goose class="h-8 w-7" />
				<a
					href={selfHref}
					class="focus-visible:ring-ring rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
					>untitledconference</a
				>
			</div>
			<div class="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
				<span>Open source. Run it yourself.</span><a
					class="hover:text-foreground inline-flex items-center gap-1.5"
					href={REPO_URL}
					rel="noreferrer"><GithubIcon class="size-4" /> GitHub</a
				>{#if data.user}<a class="hover:text-foreground" href="/home">Your work</a>{:else}<a
						class="hover:text-foreground"
						href="/login">Sign in</a
					>{/if}
			</div>
		</div>
	</footer>
</div>
