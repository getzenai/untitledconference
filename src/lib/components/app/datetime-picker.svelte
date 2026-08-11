<script lang="ts">
	/**
	 * A deadline in the app's own hand (#124).
	 *
	 * `<input type="datetime-local">` is the loudest native control left: Safari
	 * draws a stepper, Chrome a grid, both in the browser's language rather than
	 * the conference's. This is the same trigger-and-popover as the date picker,
	 * with the clock next to the calendar inside it.
	 *
	 * The wire is unchanged. The hidden input carries the same `name` and the
	 * same `YYYY-MM-DDTHH:mm` — local wall time, no zone suffix — that the native
	 * field posted, so the page's `new Date(raw).toISOString()` on submit and the
	 * server's `when()` on the far side keep reading what they always read.
	 *
	 * The clock stays a `type="time"` input on purpose. Every minute has to be
	 * reachable (a call closing at 23:59 is the common case, not a rounded hour),
	 * and a dropdown fine enough for that is a list of 1440 items. It sits inside
	 * our popover, styled by our input, which is where the complaint actually
	 * was: the date.
	 */
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import type { DateValue } from '@internationalized/date';
	import { dayOf, formatDayTime, joinDayTime, timeOf, toCalendarDate } from './date-value';

	let {
		name,
		id = name,
		value = '',
		placeholder = 'Pick a date and time',
		size = 'default',
		class: className,
		disabled = false,
		'aria-label': ariaLabel
	}: {
		name: string;
		id?: string;
		/** The stored moment as `YYYY-MM-DDTHH:mm`, or empty when there is none. */
		value?: string | null;
		placeholder?: string;
		size?: 'default' | 'sm';
		class?: string;
		disabled?: boolean;
		'aria-label'?: string;
	} = $props();

	// The two halves are edited separately and only ever rejoined, so a
	// half-finished moment (a day picked, no time yet) can exist on screen
	// without posting a midnight nobody chose.
	let pickedDay = $state<string | undefined>(undefined);
	let pickedTime = $state<string | undefined>(undefined);
	let open = $state(false);

	const day = $derived(pickedDay ?? dayOf(value));
	const time = $derived(pickedTime ?? timeOf(value));

	const current = $derived(joinDayTime(day, time));
	const selected = $derived(toCalendarDate(day));
	const label = $derived(formatDayTime(current));

	const chooseDay = (next: DateValue | undefined) => {
		pickedDay = next ? next.toString() : '';
		// A day with no time posts nothing (see joinDayTime), so leaving the clock
		// empty would silently discard the day just picked. Seed it with a time the
		// organizer can see on the trigger and correct: 09:00, because 00:00 reads
		// like a deadline already missed. Typed times are never overwritten.
		if (!time) pickedTime = '09:00';
	};

	const clear = () => {
		pickedDay = '';
		pickedTime = '';
		open = false;
	};
</script>

<input type="hidden" {name} value={current} />

<Popover.Root bind:open>
	<Popover.Trigger {disabled}>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				{size}
				variant="outline"
				{disabled}
				aria-label={ariaLabel}
				data-testid="datetime-picker-{name}"
				class={cn(
					'w-full justify-between font-normal',
					!label && 'text-muted-foreground',
					className
				)}
			>
				{label || placeholder}
				<CalendarIcon class="size-4 opacity-60" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-auto p-0" align="start">
		<Calendar
			type="single"
			value={selected}
			captionLayout="dropdown"
			onValueChange={chooseDay}
			data-testid="datetime-picker-calendar-{name}"
		/>
		<div class="border-border flex items-center gap-2 border-t p-2">
			<Input
				type="time"
				step="60"
				value={time}
				aria-label="Time"
				class="h-8 w-32"
				data-testid="datetime-picker-time-{name}"
				oninput={(event) => (pickedTime = event.currentTarget.value)}
			/>
			{#if day || time}
				<Button
					variant="ghost"
					size="sm"
					class="ml-auto"
					onclick={clear}
					data-testid="datetime-picker-clear-{name}"
				>
					Clear
				</Button>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
