<script lang="ts">
	import { browser } from '$app/environment';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import {
		PASSWORD_MIN_SCORE,
		PASSWORD_STRENGTH_LABELS,
		type PasswordScore,
		type PasswordStrength
	} from '$lib/validators/password-strength-config';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** The password being typed. */
		password?: string;
		/** Score the password must reach; mirrors `newPasswordSchema`. */
		minScore?: PasswordScore;
		/** Email / name, so passwords derived from them score badly. */
		userInputs?: string[];
	};

	let {
		ref = $bindable(null),
		password = '',
		minScore = PASSWORD_MIN_SCORE,
		userInputs = [],
		class: className,
		...restProps
	}: Props = $props();

	// zxcvbn's dictionaries are ~787 KB gzipped, so they are fetched on demand
	// the first time someone types a password rather than shipped with the page.
	// Until the chunk arrives the meter simply does not render.
	type Evaluate = (password: string, userInputs?: string[]) => PasswordStrength;
	let evaluate = $state<Evaluate | null>(null);
	let loading = false;

	$effect(() => {
		if (!browser || evaluate || loading || password.length === 0) return;
		loading = true;
		import('$lib/validators/password-strength')
			.then((module) => {
				evaluate = module.evaluatePasswordStrength;
			})
			.finally(() => {
				loading = false;
			});
	});

	const strength = $derived(evaluate ? evaluate(password, userInputs) : null);

	const meter = $derived(
		strength
			? [
					{ color: 'bg-destructive', width: 'w-1/5' },
					{ color: 'bg-orange-500', width: 'w-2/5' },
					{ color: 'bg-yellow-500', width: 'w-3/5' },
					{ color: 'bg-lime-500', width: 'w-4/5' },
					{ color: 'bg-green-600', width: 'w-full' }
				][strength.score]
			: null
	);

	const meetsMinimum = $derived(strength ? strength.score >= minScore : true);
	// The first suggestion is the most relevant one; showing all of them turns
	// the form into a wall of text.
	const hint = $derived(strength ? (strength.warning ?? strength.suggestions[0] ?? null) : null);
</script>

{#if password.length > 0 && strength && meter}
	<div
		bind:this={ref}
		data-slot="password-strength"
		data-score={strength.score}
		class={cn('space-y-1', className)}
		{...restProps}
	>
		<div class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
			<div class={cn('h-full transition-all duration-300', meter.color, meter.width)}></div>
		</div>
		<div class="flex items-start justify-between gap-2 text-xs">
			<span class={cn('text-muted-foreground', !meetsMinimum && 'text-destructive')}>
				{PASSWORD_STRENGTH_LABELS[strength.score]}
			</span>
			{#if hint && !meetsMinimum}
				<span class="text-muted-foreground text-right">{hint}</span>
			{/if}
		</div>
	</div>
{/if}
