<script lang="ts">
	/**
	 * Talks per day, as an area with a line on top.
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
	 * Axis labels live in HTML at `text-xs`, not as `<text>` inside the viewBox.
	 * SVG `px` is a user unit: on a wide card, `text-[9px]` grew with the scale
	 * (9 × cardWidth / viewBoxWidth) and the plot read as a small drawing blown up.
	 * The SVG is only the marks; it fills the card width at a fixed height.
	 *
	 * Nothing here is reachable by hover alone. The endpoint is labelled on the
	 * chart, the axis carries the scale, and the full series sits in a table below
	 * the plot — the tooltip is a convenience on top of all three, never the only
	 * way to read a value.
	 */
	import type { SubmissionDay } from '$lib/server/conference/dashboard';

	let { days, class: className = '' }: { days: SubmissionDay[]; class?: string } = $props();

	// Plot space, not pixels. Layout is `h-48 w-full` plus `preserveAspectRatio="none"`
	// so the marks stretch to the card instead of a 640×180 box being scaled up.
	const PLOT = 100;

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

	const x = (i: number) => (days.length < 2 ? PLOT / 2 : (i / (days.length - 1)) * PLOT);
	const y = (value: number) => PLOT - (value / ceiling) * PLOT;

	const line = $derived(
		days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(d.count)}`).join(' ')
	);
	const area = $derived(
		days.length === 0 ? '' : `${line} L${x(days.length - 1)} ${PLOT} L${x(0)} ${PLOT} Z`
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
		const ratio = (event.clientX - box.left) / box.width;
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
		<div class="flex w-full gap-x-1.5">
			<!-- Screen-sized ticks: HTML at text-xs, aligned to the plot, not scaled with it. -->
			<div class="relative h-48 shrink-0" aria-hidden="true">
				{#each ticks as tick, ti (ti)}
					<span
						class="text-muted-foreground absolute right-0 -translate-y-1/2 text-xs leading-none tabular-nums"
						style="top: {y(tick)}%"
					>
						{tick}
					</span>
				{/each}
			</div>
			<div class="min-w-0 flex-1">
				<div class="relative h-48">
					<!--
						Presentational, not `role="img"`. A picture cannot contain a control:
						the slider below is focusable, and an image with something focusable
						inside it is announced as one thing and operated as another (axe
						`nested-interactive`, #456). `aria-hidden` is not the way out either —
						it would hide a control the keyboard can still reach.

						Nothing is lost by making it a picture with no name. The summary this
						label carried is in the figcaption, every value is in the table below
						it, and the slider says the same sentence to whoever lands on it.
					-->
					<svg
						viewBox="0 0 {PLOT} {PLOT}"
						preserveAspectRatio="none"
						class="block h-48 w-full"
						role="presentation"
					>
						<!-- Solid hairlines a step off the surface: a grid is orientation, not data. -->
						{#each ticks as tick, ti (ti)}
							<line
								x1="0"
								x2={PLOT}
								y1={y(tick)}
								y2={y(tick)}
								class="stroke-border"
								stroke-width="1"
								vector-effect="non-scaling-stroke"
							/>
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
								vector-effect="non-scaling-stroke"
							/>

							{#if activeDay}
								<line
									x1={x(active ?? 0)}
									x2={x(active ?? 0)}
									y1="0"
									y2={PLOT}
									class="stroke-muted-foreground"
									stroke-width="1"
									vector-effect="non-scaling-stroke"
								/>
							{/if}
						{/if}

						<!--
							One transparent target over the whole plot rather than a hit area per
							point: at thirty days the points are eight pixels apart, and asking anyone
							to land on one of those is asking them not to bother.
						-->
						<rect
							x="0"
							y="0"
							width={PLOT}
							height={PLOT}
							fill="transparent"
							tabindex="0"
							role="slider"
							aria-label="Talks per day over the last {days.length} days, {total} in total — use the arrow keys to step through the days"
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

					<!--
						Dots sit in HTML so a non-uniform stretch (wide card, fixed height) cannot
						turn them into ellipses. The ring is the surface colour, so the mark stays
						legible where it sits on the line.
					-->
					{#if days.length > 0}
						<span
							class="bg-chart-1 ring-card pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
							style="left: {x(days.length - 1)}%; top: {y(days[days.length - 1].count)}%"
							aria-hidden="true"
						></span>
					{/if}
					{#if activeDay}
						<span
							class="bg-chart-1 ring-card pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
							style="left: {x(active ?? 0)}%; top: {y(activeDay.count)}%"
							aria-hidden="true"
						></span>
					{/if}
				</div>

				<!-- Both ends of the window, and nothing in between. -->
				{#if days.length > 0}
					<div class="mt-1 flex justify-between" aria-hidden="true">
						<span class="text-muted-foreground text-xs">{label(days[0].day)}</span>
						<span class="text-muted-foreground text-xs">{label(days[days.length - 1].day)}</span>
					</div>
				{/if}
			</div>
		</div>

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
				<tr><th class="font-medium">Day</th><th class="font-medium">Talks</th></tr>
			</thead>
			<tbody class="tabular-nums">
				{#each days as day (day.day)}
					<tr><td>{label(day.day)}</td><td>{day.count}</td></tr>
				{/each}
			</tbody>
		</table>
	</details>
</div>
