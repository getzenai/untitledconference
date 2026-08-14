<script lang="ts">
	/**
	 * The page every thrown error lands on (#377).
	 *
	 * Until this existed the tree had no `+error.svelte` at any level, so
	 * SvelteKit's built-in fallback rendered every one of them: a bare `<h1>` and
	 * a paragraph on an unstyled body, no header, no theme, and — the part that
	 * actually costs us a visitor — no link anywhere. A mistyped slug off a
	 * poster was a back button or nothing.
	 *
	 * It sits at the root on purpose. A per-area error page would have to repeat
	 * this shell three times to say the same sentence, and the shell a visitor
	 * needs when `/manage/<stale-slug>` 404s is not the organizer sidebar they
	 * just lost access to — it is the way back to the front door.
	 *
	 * The wording, and the rule that a 5xx message is never shown, live in
	 * `$lib/error-copy` — that rule is a promise about what does not reach a
	 * stranger, and it deserves a test that runs the code.
	 */
	import LandingHeader from '$lib/components/landing-header.svelte';
	import { Button } from '$lib/components/ui/button';
	import { errorDetail, errorHeadline } from '$lib/error-copy';
	import { page } from '$app/state';

	/**
	 * `page.data` is the root layout's data. It is present here — an error below
	 * the root renders inside the root layout — but an error *in* the root load
	 * takes this page down with it and falls back to `src/error.html`, so read it
	 * defensively rather than assume which of the two happened.
	 */
	const signedIn = $derived(Boolean(page.data?.user));

	const status = $derived(page.status);

	/** Where the logo goes. `/` bounces a signed-in reader to `/home`, so they get the bypass. */
	const selfHref = $derived(signedIn ? '/home' : '/');

	const headline = $derived(errorHeadline(status));

	const detail = $derived(errorDetail(status, page.error?.message));
</script>

<svelte:head>
	<title>{status} — untitledconference</title>
	<!-- An error page has nothing worth indexing, and a 404 that ranks is worse than none. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bg-background text-foreground flex min-h-screen flex-col">
	<LandingHeader {selfHref} />

	<main class="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
		<div class="w-full max-w-lg text-center" data-testid="error-page">
			<p class="text-muted-foreground font-mono text-sm tracking-widest" data-testid="error-status">
				{status}
			</p>

			<h1 class="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{headline}</h1>

			<p class="text-muted-foreground mt-4 text-base" data-testid="error-message">{detail}</p>

			<!-- The point of the whole page: a way onward. Anonymous visitors get the
			     conference directory, which is what the front door is for them; a
			     signed-in reader gets their own work first, with the directory second
			     under `?home=0` so `/` does not bounce them straight back. -->
			<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
				{#if signedIn}
					<Button href="/home" variant="act" data-testid="error-home">Back to your work</Button>
					<Button href="/?home=0#live-events" variant="outline" data-testid="error-directory">
						Browse live conferences
					</Button>
				{:else}
					<Button href="/#live-events" variant="act" data-testid="error-directory">
						Browse live conferences
					</Button>
					<Button href="/" variant="outline" data-testid="error-home">Go to the start page</Button>
				{/if}
			</div>
		</div>
	</main>
</div>
