/**
 * When a speaker task is due, and whether that date is already late.
 *
 * A due *date* is a calendar day, not the instant the organizer clicked Accept.
 * `setDate(+0)` kept that millisecond, and `dueOn < now()` then painted
 * "Confirm participation" overdue before the speaker could have done anything
 * (#865). Offset 0 means "due today" — green until midnight UTC, red after.
 * Offsets of 7 and 14 stay the accept instant plus that many days; those
 * deadlines are still in the future the moment the task is created.
 */

export function taskDueDate(
	dueOn: Date | null,
	offsetDays: number | null,
	from: Date
): Date | null {
	if (dueOn) return dueOn;
	if (offsetDays === null) return null;
	if (offsetDays === 0) {
		return new Date(
			Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 59, 59, 999)
		);
	}
	const due = new Date(from);
	due.setDate(due.getDate() + offsetDays);
	return due;
}

/** Same comparison Home, the portal list, and the task page must all use. */
export function isTaskOverdue(
	dueOn: Date | string | null | undefined,
	at: Date = new Date()
): boolean {
	if (!dueOn) return false;
	const due = dueOn instanceof Date ? dueOn : new Date(dueOn);
	if (Number.isNaN(due.getTime())) return false;
	return due < at;
}
