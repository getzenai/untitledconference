<script lang="ts">
	/**
	 * The design system, rendered by the product that uses it.
	 *
	 * Every value here is read from `design/tokens.json` at build time and every
	 * component is the real one — not a copy in a slide. A styleguide that is
	 * maintained separately drifts within a week; this one cannot drift without
	 * the product drifting with it.
	 */

	import tokens from '../../../design/tokens.json';
	import { contrastRatio, oklchToSrgb, toHex, type Rgb } from '$lib/design/color.js';
	import EmptyState from '$lib/components/empty-state.svelte';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';

	type Mode = 'light' | 'dark';
	type TokenValue = { colorSpace: string; components: [number, number, number]; alpha?: number };

	const modes: Mode[] = ['light', 'dark'];

	const entries = (mode: Mode) =>
		Object.entries(
			tokens[mode] as unknown as Record<string, { $value: TokenValue; $description?: string }>
		).filter(([name]) => !name.startsWith('$'));

	const rgb = (mode: Mode, name: string): Rgb | null => {
		const token = (tokens[mode] as unknown as Record<string, { $value: TokenValue }>)[name];
		if (!token || token.$value.alpha !== undefined) return null;
		const [l, c, h] = token.$value.components;
		return oklchToSrgb({ l, c, h });
	};

	const hex = (mode: Mode, name: string) => {
		const value = rgb(mode, name);
		return value ? toHex(value) : 'translucent';
	};

	const ratio = (mode: Mode, fg: string, bg: string) => {
		const a = rgb(mode, fg);
		const b = rgb(mode, bg);
		return a && b ? contrastRatio(a, b).toFixed(2) : '—';
	};

	const description = (name: string) =>
		(tokens.light as unknown as Record<string, { $description?: string }>)[name]?.$description;

	const base = [
		'primary',
		'act',
		'foreground',
		'background',
		'muted',
		'muted-foreground',
		'border',
		'ring',
		'destructive'
	];
	const statuses = ['neutral', 'progress', 'good', 'warn', 'bad', 'internal'] as const;
	const statusExamples: Record<(typeof statuses)[number], string> = {
		neutral: 'draft',
		progress: 'in_review',
		good: 'accepted',
		warn: 'pending',
		bad: 'rejected',
		internal: 'internal'
	};
	const type = [
		{ role: 'Page title', cls: 'text-lg font-semibold' },
		{ role: 'Section title', cls: 'text-sm font-semibold' },
		{ role: 'Body / table', cls: 'text-sm' },
		{ role: 'Meta, captions', cls: 'text-muted-foreground text-xs' }
	];
</script>

<svelte:head>
	<title>Design system — Untitled Conference</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="bg-background text-foreground min-h-screen">
	<div class="mx-auto max-w-5xl px-6 py-12">
		<div class="flex items-start justify-between gap-4">
			<h1 class="text-lg font-semibold">Design system</h1>
			<ModeToggle class="-mt-1 -mr-2" />
		</div>
		<p class="text-muted-foreground mt-1 max-w-prose text-sm">
			Read from <code>design/tokens.json</code> and rendered with the real components. The written
			rules live in <code>docs/DESIGN_SYSTEM.md</code>; this page is what they look like.
		</p>

		<section class="mt-10">
			<h2 class="text-sm font-semibold">Colour</h2>
			<table class="mt-3 w-full text-sm">
				<thead class="text-muted-foreground text-xs">
					<tr class="border-border border-b">
						<th class="w-10 py-2 text-left"></th>
						<th class="py-2 text-left font-semibold">Token</th>
						<th class="py-2 text-left font-semibold">Light</th>
						<th class="py-2 text-left font-semibold">Dark</th>
					</tr>
				</thead>
				<tbody>
					{#each base as name (name)}
						<tr class="border-border border-b align-top">
							<td class="py-2">
								<span
									class="border-border block size-6 rounded border"
									style="background: var(--{name})"
								></span>
							</td>
							<td class="py-2">
								<code>--{name}</code>
								{#if description(name)}
									<p class="text-muted-foreground mt-1 max-w-prose text-xs">{description(name)}</p>
								{/if}
							</td>
							<td class="py-2 font-mono text-xs tabular-nums">{hex('light', name)}</td>
							<td class="py-2 font-mono text-xs tabular-nums">{hex('dark', name)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="mt-10">
			<h2 class="text-sm font-semibold">Status — six meanings, one colour each</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Measured against its own background. Anything below 4.5:1 fails the unit test, so this
				column is not decoration.
			</p>
			<table class="mt-3 w-full text-sm">
				<thead class="text-muted-foreground text-xs">
					<tr class="border-border border-b">
						<th class="py-2 text-left font-semibold">Badge</th>
						<th class="py-2 text-left font-semibold">Token</th>
						<th class="py-2 text-left font-semibold">Light</th>
						<th class="py-2 text-left font-semibold">Dark</th>
					</tr>
				</thead>
				<tbody>
					{#each statuses as tone (tone)}
						<tr class="border-border border-b">
							<td class="py-2"><StatusBadge status={statusExamples[tone]} {tone} /></td>
							<td class="py-2"><code>--status-{tone}</code></td>
							<td class="py-2 font-mono text-xs tabular-nums">
								{ratio('light', `status-${tone}`, `status-${tone}-bg`)}:1
							</td>
							<td class="py-2 font-mono text-xs tabular-nums">
								{ratio('dark', `status-${tone}`, `status-${tone}-bg`)}:1
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section class="mt-10">
			<h2 class="text-sm font-semibold">Type</h2>
			<div class="mt-3 space-y-2">
				{#each type as row (row.role)}
					<div class="border-border flex items-baseline gap-4 border-b py-2">
						<span class={row.cls}>{row.role}</span>
						<code class="text-muted-foreground text-xs">{row.cls}</code>
					</div>
				{/each}
			</div>
		</section>

		<section class="mt-10">
			<h2 class="text-sm font-semibold">Buttons</h2>
			<div class="mt-3 space-y-4">
				<div class="flex flex-wrap items-center gap-3">
					<Button variant="outline">Cancel</Button>
					<Button>Save</Button>
					<span class="text-muted-foreground text-xs">
						The normal case. One filled button per screen (R1).
					</span>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<Button variant="outline">Import</Button>
					<Button variant="act">New conference</Button>
					<span class="text-muted-foreground text-xs">
						Creating something. <code>act</code> replaces the black primary, never joins it.
					</span>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<Button variant="ghost">Cancel</Button>
					<Button variant="destructive">Delete conference</Button>
					<span class="text-muted-foreground text-xs">
						Destructive, never adjacent to the primary (R2).
					</span>
				</div>
			</div>
		</section>

		<section class="mt-10">
			<h2 class="text-sm font-semibold">Empty state</h2>
			<div class="mt-3 grid gap-4 md:grid-cols-2">
				<EmptyState
					title="No submissions yet."
					description="Share your call for papers and they will land here."
					action={{ href: '/styleguide', label: 'Share the call for papers →' }}
				/>
				<!-- The same component under .dark. Nothing else changes: the goose is
			     currentColor, so there is no second asset to keep in step. -->
				<div class="dark bg-background text-foreground rounded-lg p-4">
					<EmptyState
						title="No submissions yet."
						description="Share your call for papers and they will land here."
						action={{ href: '/styleguide', label: 'Share the call for papers →' }}
					/>
				</div>
			</div>
		</section>

		<section class="mt-10">
			<h2 class="text-sm font-semibold">Every token, both modes</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				The full contents of the token file, so nothing hides. {entries('light').length} tokens.
			</p>
			<div class="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
				{#each modes as mode (mode)}
					<div>
						<h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">{mode}</h3>
						{#each entries(mode) as [name] (name)}
							<div class="border-border flex items-center gap-3 border-b py-1.5">
								<span
									class="border-border block size-4 shrink-0 rounded border"
									style="background: {hex(mode, name) === 'translucent'
										? 'transparent'
										: hex(mode, name)}"
								></span>
								<code class="text-xs">--{name}</code>
								<span class="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
									{hex(mode, name)}
								</span>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>
