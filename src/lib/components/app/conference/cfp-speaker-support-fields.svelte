<script lang="ts">
	/**
	 * The CFP-settings controls for speaker expenses (#512).
	 *
	 * Posted inside the same Save settings form as title and dates, so one
	 * click writes the whole call. Empty option is "not stated" — not a
	 * default of "not covered". A dependent control is not rendered at all
	 * until its parent makes it meaningful (#557) — hiding it would still
	 * post a withdrawn amount. The action reads these names through
	 * `speakerSupportFromForm`.
	 */
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Input } from '$lib/components/ui/input';
	import { expenseIsCovered, type SpeakerSupport } from '$lib/conference/speaker-support';

	let { support }: { support: SpeakerSupport } = $props();

	let admission = $state(support.admission ?? 'unset');
	let travelKind = $state(support.travel?.kind ?? 'unset');
	let travelDomesticKind = $state(support.travel?.domestic?.kind ?? 'unset');
	let travelInternationalKind = $state(support.travel?.international?.kind ?? 'unset');
	let accommodationKind = $state(support.accommodation?.kind ?? 'unset');

	const travelCovered = $derived(expenseIsCovered(travelKind));
	const accommodationCovered = $derived(expenseIsCovered(accommodationKind));
	const anythingCovered = $derived(
		admission === 'free' || admission === 'discounted' || travelCovered || accommodationCovered
	);

	const ADMISSION_OPTIONS = [
		{ value: 'unset', label: 'Not stated' },
		{ value: 'free', label: 'Free for speakers' },
		{ value: 'discounted', label: 'Discounted for speakers' },
		{ value: 'none', label: 'Not covered' }
	];

	const EXPENSE_OPTIONS = [
		{ value: 'unset', label: 'Not stated' },
		{ value: 'none', label: 'Not covered' },
		{ value: 'up_to', label: 'Up to an amount' },
		{ value: 'case_by_case', label: 'Case by case' }
	];
</script>

<div class="space-y-3 border-t pt-3 sm:col-span-2" data-testid="cfp-speaker-support-fields">
	<h3 class="text-sm font-medium">Speaker expenses</h3>
	<p class="text-muted-foreground text-xs">
		What an accepted speaker does not have to pay. Leave a line unstated rather than guessing —
		silence is not “not covered”.
	</p>

	<div class="grid gap-2 sm:grid-cols-2">
		<div class="text-muted-foreground text-xs">
			<label for="cfp-admission">Admission</label>
			<AppSelect
				id="cfp-admission"
				name="admission"
				value={admission}
				options={ADMISSION_OPTIONS}
				class="mt-1"
				onValueChange={(value) => (admission = value)}
			/>
		</div>
		<div class="text-muted-foreground text-xs">
			<label for="cfp-travel-kind">Travel</label>
			<AppSelect
				id="cfp-travel-kind"
				name="travelKind"
				value={travelKind}
				options={EXPENSE_OPTIONS}
				class="mt-1"
				onValueChange={(value) => (travelKind = value)}
			/>
		</div>
		{#if travelKind === 'up_to'}
			<label class="text-muted-foreground text-xs">
				Travel, up to
				<Input
					name="travelAmount"
					value={support.travel?.amount ?? ''}
					class="mt-1"
					placeholder="€500, economy flight…"
				/>
			</label>
		{/if}
		{#if anythingCovered}
			<label class="text-muted-foreground text-xs">
				Conditions
				<Input
					name="supportConditions"
					value={support.conditions ?? ''}
					class="mt-1"
					placeholder="Reimbursed after the event"
				/>
			</label>
		{/if}
	</div>

	{#if travelCovered}
		<div class="grid gap-2 sm:grid-cols-2">
			<div class="text-muted-foreground text-xs">
				<label for="cfp-travel-domestic-kind">Domestic travel</label>
				<AppSelect
					id="cfp-travel-domestic-kind"
					name="travelDomesticKind"
					value={travelDomesticKind}
					options={EXPENSE_OPTIONS}
					class="mt-1"
					onValueChange={(value) => (travelDomesticKind = value)}
				/>
			</div>
			{#if travelDomesticKind === 'up_to'}
				<label class="text-muted-foreground text-xs">
					Domestic, up to
					<Input
						name="travelDomesticAmount"
						value={support.travel?.domestic?.amount ?? ''}
						class="mt-1"
					/>
				</label>
			{/if}
			<div class="text-muted-foreground text-xs">
				<label for="cfp-travel-international-kind">International travel</label>
				<AppSelect
					id="cfp-travel-international-kind"
					name="travelInternationalKind"
					value={travelInternationalKind}
					options={EXPENSE_OPTIONS}
					class="mt-1"
					onValueChange={(value) => (travelInternationalKind = value)}
				/>
			</div>
			{#if travelInternationalKind === 'up_to'}
				<label class="text-muted-foreground text-xs">
					International, up to
					<Input
						name="travelInternationalAmount"
						value={support.travel?.international?.amount ?? ''}
						class="mt-1"
					/>
				</label>
			{/if}
		</div>
	{/if}

	<div class="grid gap-2 sm:grid-cols-2">
		<div class="text-muted-foreground text-xs">
			<label for="cfp-accommodation-kind">Accommodation</label>
			<AppSelect
				id="cfp-accommodation-kind"
				name="accommodationKind"
				value={accommodationKind}
				options={EXPENSE_OPTIONS}
				class="mt-1"
				onValueChange={(value) => (accommodationKind = value)}
			/>
		</div>
		{#if accommodationKind === 'up_to'}
			<label class="text-muted-foreground text-xs">
				Accommodation, up to
				<Input
					name="accommodationAmount"
					value={support.accommodation?.amount ?? ''}
					class="mt-1"
				/>
			</label>
		{/if}
		{#if accommodationCovered}
			<label class="text-muted-foreground text-xs">
				Nights
				<Input
					name="accommodationNights"
					type="number"
					min="1"
					step="1"
					value={support.accommodation?.nights ?? ''}
					class="mt-1"
				/>
			</label>
			<div class="grid grid-cols-2 gap-2">
				<label class="text-muted-foreground text-xs">
					Domestic nights
					<Input
						name="accommodationDomesticNights"
						type="number"
						min="1"
						step="1"
						value={support.accommodation?.domesticNights ?? ''}
						class="mt-1"
					/>
				</label>
				<label class="text-muted-foreground text-xs">
					International nights
					<Input
						name="accommodationInternationalNights"
						type="number"
						min="1"
						step="1"
						value={support.accommodation?.internationalNights ?? ''}
						class="mt-1"
					/>
				</label>
			</div>
		{/if}
	</div>
</div>
