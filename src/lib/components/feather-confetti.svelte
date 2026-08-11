<script lang="ts">
	/**
	 * Goose easter egg: a burst of falling feathers, decorative only.
	 *
	 * `trigger` is a counter, not a boolean — bumping it (even to the same
	 * truthy value) re-fires the burst, which a boolean prop can't do without
	 * an extra reset step from the caller.
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
		rotate: number;
		drift: number;
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

		feathers = Array.from({ length: 14 }, () => ({
			id: nextId++,
			left: Math.random() * 100,
			delay: Math.random() * 0.3,
			duration: 1.6 + Math.random() * 0.8,
			rotate: Math.random() * 360,
			drift: Math.random() * 60 - 30
		}));

		const timeout = setTimeout(() => {
			feathers = [];
		}, 2600);

		return () => clearTimeout(timeout);
	});
</script>

{#if feathers.length > 0}
	<div class="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
		{#each feathers as feather (feather.id)}
			<svg
				class="feather-confetti absolute -top-8"
				style="left: {feather.left}%; animation-delay: {feather.delay}s; animation-duration: {feather.duration}s; --drift: {feather.drift}px; --rotate: {feather.rotate}deg;"
				viewBox="0 0 24 24"
				width="20"
				height="20"
				fill="none"
			>
				<path
					d="M12 2C7 6 5 12 5 17c0 2.8 2 4 4 4 1.6 0 2.6-.8 3-2 .4 1.2 1.4 2 3 2 2 0 4-1.2 4-4 0-5-2-11-7-15Z"
					fill="#E3AE28"
					fill-opacity="0.9"
				/>
				<path d="M12 3v16" stroke="#8a6a10" stroke-width="0.8" stroke-linecap="round" />
			</svg>
		{/each}
	</div>
{/if}

<style>
	.feather-confetti {
		animation-name: feather-fall;
		animation-timing-function: ease-in;
		animation-fill-mode: forwards;
	}

	@keyframes feather-fall {
		0% {
			transform: translateY(0) translateX(0) rotate(0deg);
			opacity: 1;
		}
		100% {
			transform: translateY(110vh) translateX(var(--drift)) rotate(var(--rotate));
			opacity: 0;
		}
	}
</style>
