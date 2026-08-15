<script lang="ts">
	/**
	 * The CFP-settings controls for speaker expenses (#512).
	 *
	 * Posted inside the same Save settings form as title and dates, so one
	 * click writes the whole call. Empty option is "not stated" — not a
	 * default of "not covered". The action reads these names through
	 * `speakerSupportFromForm`.
	 */
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Input } from '$lib/components/ui/input';
	import type { SpeakerSupport } from '$lib/conference/speaker-support';

	let { support }: { support: SpeakerSupport } = $props();

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
				value={support.admission ?? 'unset'}
				options={ADMISSION_OPTIONS}
				class="mt-1"
			/>
		</div>
		<div class="text-muted-foreground text-xs">
			<label for="cfp-travel-kind">Travel</label>
			<AppSelect
				id="cfp-travel-kind"
				name="travelKind"
				value={support.travel?.kind ?? 'unset'}
				options={EXPENSE_OPTIONS}
				class="mt-1"
			/>
		</div>
		<label class="text-muted-foreground text-xs">
			Travel, up to
			<Input
				name="travelAmount"
				value={support.travel?.amount ?? ''}
				class="mt-1"
				placeholder="€500, economy flight…"
			/>
		</label>
		<label class="text-muted-foreground text-xs">
			Conditions
			<Input
				name="supportConditions"
				value={support.conditions ?? ''}
				class="mt-1"
				placeholder="Reimbursed after the event"
			/>
		</label>
	</div>

	<div class="grid gap-2 sm:grid-cols-2">
		<div class="text-muted-foreground text-xs">
			<label for="cfp-travel-domestic-kind">Domestic travel</label>
			<AppSelect
				id="cfp-travel-domestic-kind"
				name="travelDomesticKind"
				value={support.travel?.domestic?.kind ?? 'unset'}
				options={EXPENSE_OPTIONS}
				class="mt-1"
			/>
		</div>
		<label class="text-muted-foreground text-xs">
			Domestic, up to
			<Input
				name="travelDomesticAmount"
				value={support.travel?.domestic?.amount ?? ''}
				class="mt-1"
			/>
		</label>
		<div class="text-muted-foreground text-xs">
			<label for="cfp-travel-international-kind">International travel</label>
			<AppSelect
				id="cfp-travel-international-kind"
				name="travelInternationalKind"
				value={support.travel?.international?.kind ?? 'unset'}
				options={EXPENSE_OPTIONS}
				class="mt-1"
			/>
		</div>
		<label class="text-muted-foreground text-xs">
			International, up to
			<Input
				name="travelInternationalAmount"
				value={support.travel?.international?.amount ?? ''}
				class="mt-1"
			/>
		</label>
	</div>

	<div class="grid gap-2 sm:grid-cols-2">
		<div class="text-muted-foreground text-xs">
			<label for="cfp-accommodation-kind">Accommodation</label>
			<AppSelect
				id="cfp-accommodation-kind"
				name="accommodationKind"
				value={support.accommodation?.kind ?? 'unset'}
				options={EXPENSE_OPTIONS}
				class="mt-1"
			/>
		</div>
		<label class="text-muted-foreground text-xs">
			Accommodation, up to
			<Input name="accommodationAmount" value={support.accommodation?.amount ?? ''} class="mt-1" />
		</label>
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
	</div>
</div>
