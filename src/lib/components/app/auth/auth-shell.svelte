<script lang="ts">
	/**
	 * The frame around every page you can reach without an account: login,
	 * register, forgot password, reset password, verify email.
	 *
	 * It exists because all five carried the starter template's split screen — a
	 * black slab down the left half with marketing copy on it, and on two of the
	 * five an empty black slab, because nobody had copy to put there. Half the
	 * first screen of the product said nothing, and on the pages that did say
	 * something it was about "building amazing applications with our powerful
	 * SvelteKit starter".
	 *
	 * What replaces it is one quiet column: the product's name, the card, and one
	 * line underneath. The name is a link to the front door, which is also the way
	 * out for a visitor who only wanted to read a conference's public site — the
	 * old panel could not carry that link, because it was hidden below `lg`.
	 */
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		children,
		footer,
		wide = false
	}: {
		title: string;
		description?: string;
		children: Snippet;
		/** The line under the card: "Need an account?", "Back to sign in", and so on. */
		footer?: Snippet;
		/** For the pages that are read rather than filled in — email verification. */
		wide?: boolean;
	} = $props();
</script>

<div class="bg-muted flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
	<a
		href="/"
		class="text-foreground hover:text-primary text-lg font-semibold tracking-tight transition-colors"
	>
		Untitled Conference
	</a>

	<Card class="w-full {wide ? 'max-w-md' : 'max-w-sm'} shadow-sm">
		<CardHeader>
			<CardTitle class="text-xl">{title}</CardTitle>
			{#if description}
				<CardDescription>{description}</CardDescription>
			{/if}
		</CardHeader>
		<CardContent>
			{@render children()}
		</CardContent>
	</Card>

	{#if footer}
		<div class="text-muted-foreground text-center text-sm">
			{@render footer()}
		</div>
	{/if}
</div>
