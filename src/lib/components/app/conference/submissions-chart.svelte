<script lang="ts">
	/**
	 * Submissions per day, as an area with a line on top.
	 *
	 * One series, so there is no legend: the card's own heading says what is
	 * plotted, and a box with a single swatch would only restate it. The colour is
	 * `--chart-1`, one hue stepped separately for the light and the dark surface —
	 * not a mark that changes identity when the theme flips.
	 *
	 * Hand-drawn SVG rather than a chart library. The shape is a path and two axes;
	 * a dependency for that would cost more than it carries, and the marks then obey
	 * the same tokens as the rest of the app for free.
	 *
	 * Nothing here is reachable by hover alone. The endpoint is labelled on the
	 * chart, the axis carries the scale, and the full series sits in a table below
	 * the plot — the tooltip is a convenience on top of all three, never the only
	 * way to read a value.
	 */
	import type { SubmissionDay } from '$lib/server/conference/dashboard';

	let { days, class: className = '' }: { days: SubmissionDay[]; class?: string } = $props();

	// The viewBox is the coordinate system; the element scales to its container.
	// The x-axis band is inside it, so the labels can never be cut off by a fixed
	// height the way a plot-only box would cut them.
	const W = 640;
	const H = 180;
	const PAD = { top: 16, right: 10, bottom: 22, left: 30 };
	const plotW = W - PAD.left - PAD.right;
	const plotH = H - PAD.top - PAD.bottom;

	const total = $derived(days.reduce((sum, d) => sum + d.count, 0));
	const peak = $derived(days.reduce((max, d) => Math.max(max, d.count), 0));

	/**
	 * The top of the scale, rounded up to something a person reads without doing
	 * arithmetic. An axis that ends at 7 because the busiest day had 7 makes every
	 * chart a different shape for no reason.
	 */
	const ceiling = $derived.by(() => {
		if (peak <= 4) return 4;
		// 1 / 2 / 5 / 10 times the magnitude — the ladder people actually read on an
		// axis.
		const magnitude = Math.pow(10, Math.floor(Math.log10(peak)));
		const top = ([1, 2, 5, 10].map((f) => f * magnitude).find((rung) => rung >= peak) ??
			10 * magnitude) as number;
		// The half tick has to stay a whole number, and the ladder does not guarantee
		// it: a peak of exactly 5 lands on the rung 5 and puts "2.5" on an axis that
		// counts submissions. One rung of slack (5 → 6) is the whole fix, and it never
		// fires above magnitude 1 — 20, 50, 100 are all even already.
		return top % 2 === 0 ? top : top + magnitude;
	});

	const x = (i: number) =>
		PAD.left + (days.length < 2 ? plotW / 2 : (i / (days.length - 1)) * plotW);
	const y = (value: number) => PAD.top + plotH - (value / ceiling) * plotH;

	const line = $derived(
		days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(d.count)}`).join(' ')
	);
	const area = $derived(
		days.length === 0
			? ''
			: `${line} L${x(days.length - 1)} ${PAD.top + plotH} L${x(0)} ${PAD.top + plotH} Z`
	);

	/** Three ticks — 0, halfway, the ceiling. More would be grid, not information. */
	const ticks = $derived([0, ceiling / 2, ceiling]);

	const label = (day: string) =>
		new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});

	// The point under the pointer, or under the keyboard cursor. `null` is "not
	// pointing at anything", which is a different thing from pointing at day 0.
	let active = $state<number | null>(null);
	const activeDay = $derived(active === null ? null : days[active]);

	const nearest = (event: PointerEvent) => {
		const box = (event.currentTarget as SVGRectElement).getBoundingClientRect();
		if (box.width === 0 || days.length === 0) return;
		// Pointer position back into viewBox units, then to the closest index.
		const local = ((event.clientX - box.left) / box.width) * W;
		const ratio = (local - PAD.left) / plotW;
		active = Math.min(days.length - 1, Math.max(0, Math.round(ratio * (days.length - 1))));
	};

	const step = (delta: number) => {
		if (days.length === 0) return;
		active = Math.min(days.length - 1, Math.max(0, (active ?? days.length - 1) + delta));
	};

	const onkeydown = (event: KeyboardEvent) => {
		if (event.key === 'ArrowRight') step(1);
		else if (event.key === 'ArrowLeft') step(-1);
		else if (event.key === 'Escape') active = null;
		else return;
		event.preventDefault();
	};
</script>

<div class={className}>
	<figure>
		<svg
			viewBox="0 0 {W} {H}"
			class="h-auto w-full"
			role="img"
			aria-label="Submissions per day over the last {days.length} days, {total} in total"
		>
			<!-- Solid hairlines a step off the surface: a grid is orientation, not data. -->
			{#each ticks as tick (tick)}
				<line
					x1={PAD.left}
					x2={W - PAD.right}
					y1={y(tick)}
					y2={y(tick)}
					class="stroke-border"
					stroke-width="1"
				/>
				<text
					x={PAD.left - 6}
					y={y(tick) + 3}
					text-anchor="end"
					class="fill-muted-foreground text-[9px] tabular-nums"
				>
					{tick}
				</text>
			{/each}

			{#if days.length > 0}
				<!-- The fill is a wash at 10%, never a saturated block. -->
				<path d={area} class="fill-chart-1 opacity-10" />
				<path
					d={line}
					fill="none"
					class="stroke-chart-1"
					stroke-width="2"
					stroke-linejoin="round"
					stroke-linecap="round"
				/>

				<!-- The endpoint, labelled on the chart so the latest value never depends
			     on a hover. The ring is the surface colour, so the dot stays legible
			     where it sits on the line. -->
				<circle
					cx={x(days.length - 1)}
					cy={y(days[days.length - 1].count)}
					r="4"
					class="fill-chart-1 stroke-card"
					stroke-width="2"
				/>

				{#if activeDay}
					<line
						x1={x(active ?? 0)}
						x2={x(active ?? 0)}
						y1={PAD.top}
						y2={PAD.top + plotH}
						class="stroke-muted-foreground"
						stroke-width="1"
					/>
					<circle
						cx={x(active ?? 0)}
						cy={y(activeDay.count)}
						r="4"
						class="fill-chart-1 stroke-card"
						stroke-width="2"
					/>
				{/if}
			{/if}

			<!-- Both ends of the window, and nothing in between: the ticks a reader needs
		     to know what span they are looking at. -->
			{#if days.length > 0}
				<text x={PAD.left} y={H - 6} class="fill-muted-foreground text-[9px]">
					{label(days[0].day)}
				</text>
				<text
					x={W - PAD.right}
					y={H - 6}
					text-anchor="end"
					class="fill-muted-foreground text-[9px]"
				>
					{label(days[days.length - 1].day)}
				</text>
			{/if}

			<!--
			One transparent target over the whole plot rather than a hit area per
			point: at thirty days the points are eight pixels apart, and asking anyone
			to land on one of those is asking them not to bother.
		-->
			<rect
				x={PAD.left}
				y={PAD.top}
				width={plotW}
				height={plotH}
				fill="transparent"
				tabindex="0"
				role="slider"
				aria-label="Submissions per day, use the arrow keys to step through the days"
				aria-valuemin={0}
				aria-valuemax={days.length - 1}
				aria-valuenow={active ?? days.length - 1}
				aria-valuetext={activeDay
					? `${label(activeDay.day)}: ${activeDay.count}`
					: 'no day selected'}
				onpointermove={nearest}
				onpointerleave={() => (active = null)}
				{onkeydown}
				onblur={() => (active = null)}
			/>
		</svg>

		<figcaption class="text-muted-foreground mt-1 flex items-baseline justify-between text-xs">
			<span>
				{#if activeDay}
					<span class="text-foreground tabular-nums">
						{label(activeDay.day)}: {activeDay.count}
						{activeDay.count === 1 ? 'submission' : 'submissions'}
					</span>
				{:else}
					{total} in the last {days.length} days · busiest day {peak}
				{/if}
			</span>
		</figcaption>
	</figure>

	<!--
		The table twin. Outside the `<figure>` on purpose: a figure is the plot and
		its caption, and the a11y rule that a caption be the first or last child is
		the same rule saying so. Every value on the chart is readable without a pointer, and
		on days where nothing came in the row says zero rather than going missing.
	-->
	<details class="mt-2 text-xs">
		<summary class="text-muted-foreground cursor-pointer">Show the numbers</summary>
		<table class="mt-2 w-full text-left">
			<thead class="text-muted-foreground">
				<tr><th class="font-medium">Day</th><th class="font-medium">Submissions</th></tr>
			</thead>
			<tbody class="tabular-nums">
				{#each days as day (day.day)}
					<tr><td>{label(day.day)}</td><td>{day.count}</td></tr>
				{/each}
			</tbody>
		</table>
	</details>
</div>
