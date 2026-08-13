<script lang="ts">
	/**
	 * Goose easter egg: a burst of falling feathers, decorative only.
	 *
	 * `trigger` is a counter, not a boolean — bumping it (even to the same
	 * truthy value) re-fires the burst, which a boolean prop can't do without
	 * an extra reset step from the caller.
	 *
	 * The fall and the flutter are two separate animations on nested elements:
	 * the wrapper glides down with a slow sideways drift, while the feather
	 * itself sways back and forth on its own shorter cycle. Combining both in
	 * one keyframe track would tie the sway rhythm to the fall duration and
	 * every feather would flutter in lockstep.
	 */
	interface Props {
		trigger: number;
	}

	let { trigger }: Props = $props();

	type Feather = {
		id: number;
		left: number;
		delay: number;
		duration: number;
		drift: number;
		size: number;
		sway: number;
		swayPhase: number;
		amp: number;
		tilt: number;
		flip: boolean;
	};

	let feathers = $state<Feather[]>([]);
	let nextId = 0;

	$effect(() => {
		if (trigger === 0) return;

		if (
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			return;
		}

		// Built as a local first: reading `feathers` back inside this effect
		// (for the timeout below) would make the state its own dependency and
		// loop the effect forever.
		const burst = Array.from({ length: 14 }, () => ({
			id: nextId++,
			left: Math.random() * 100,
			delay: Math.random() * 0.6,
			duration: 3 + Math.random() * 2,
			drift: Math.random() * 160 - 80,
			size: 18 + Math.random() * 14,
			sway: 1.4 + Math.random() * 0.9,
			swayPhase: Math.random() * 2,
			amp: 14 + Math.random() * 18,
			tilt: 18 + Math.random() * 22,
			flip: Math.random() < 0.5
		}));

		feathers = burst;

		const lastLanding = Math.max(...burst.map((f) => f.delay + f.duration));
		const timeout = setTimeout(
			() => {
				feathers = [];
			},
			lastLanding * 1000 + 200
		);

		return () => clearTimeout(timeout);
	});
</script>

{#if feathers.length > 0}
	<div class="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
		{#each feathers as feather (feather.id)}
			<div
				class="feather-fall absolute -top-10"
				style="left: {feather.left}%; animation-delay: {feather.delay}s; animation-duration: {feather.duration}s; --drift: {feather.drift}px;"
			>
				<svg
					class="feather-sway"
					style="animation-duration: {feather.sway}s; animation-delay: -{feather.swayPhase}s; --amp: {feather.amp}px; --tilt: {feather.tilt}deg; --flip: {feather.flip
						? -1
						: 1};"
					viewBox="0 0 24 24"
					width={feather.size}
					height={feather.size}
					fill="none"
				>
					<!-- Curved vane with a tapered tip, plus quill and one barb line -->
					<path
						d="M12.67 19a2 2 0 0 0 1.42-.59l6.15-6.17a6 6 0 0 0-8.49-8.49L5.59 9.91A2 2 0 0 0 5 11.33V18a1 1 0 0 0 1 1z"
						fill="#E3AE28"
						fill-opacity="0.9"
					/>
					<path d="M16 8 2 22" stroke="#8a6a10" stroke-width="1" stroke-linecap="round" />
					<path d="M17.5 15H9" stroke="#8a6a10" stroke-width="0.8" stroke-linecap="round" />
				</svg>
			</div>
		{/each}
	</div>
{/if}

<style>
	.feather-fall {
		animation-name: feather-fall;
		/* near-linear: a feather reaches terminal velocity almost immediately */
		animation-timing-function: cubic-bezier(0.3, 0, 0.8, 1);
		animation-fill-mode: both;
	}

	.feather-sway {
		display: block;
		animation-name: feather-sway;
		animation-timing-function: ease-in-out;
		animation-direction: alternate;
		animation-iteration-count: infinite;
	}

	@keyframes feather-fall {
		0% {
			transform: translateY(0) translateX(0);
			opacity: 0;
		}
		6% {
			opacity: 1;
		}
		88% {
			opacity: 1;
		}
		100% {
			transform: translateY(108vh) translateX(var(--drift));
			opacity: 0;
		}
	}

	@keyframes feather-sway {
		from {
			transform: translateX(calc(-1 * var(--amp))) rotate(calc(-1 * var(--tilt)))
				scaleX(var(--flip));
		}
		to {
			transform: translateX(var(--amp)) rotate(var(--tilt)) scaleX(var(--flip));
		}
	}
</style>
