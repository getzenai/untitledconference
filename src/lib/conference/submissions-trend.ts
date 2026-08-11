/**
 * The one sentence a submissions chart owes its reader: is it picking up?
 *
 * A thirty-day line answers that only if you read it. This compares the last
 * seven days against the seven before them, which is the comparison an organizer
 * makes in their head anyway — and it is a whole-week window on purpose, so a
 * conference whose call closes on a Friday is not read as "collapsing" every
 * weekend.
 *
 * The series is expected in chronological order with quiet days present as
 * zeroes, which is what the dashboard's zero-fill already guarantees. It takes
 * the bare shape rather than the server module's type so a component can import
 * it without pulling a server module along.
 */
export type TrendPoint = { count: number };

export type SubmissionsTrend = {
	recent: number;
	previous: number;
	/** Positive means the last seven days beat the seven before them. */
	delta: number;
	direction: 'up' | 'down' | 'flat';
};

export const TREND_WINDOW = 7;

/**
 * `null` when there is nothing honest to say: two full windows have to exist, or
 * the comparison is between a week and a fragment of one, which always reads as
 * a collapse. A chart on its fourth day should say nothing rather than lie.
 */
export function submissionsTrend(days: readonly TrendPoint[]): SubmissionsTrend | null {
	if (days.length < TREND_WINDOW * 2) return null;

	const sum = (slice: readonly TrendPoint[]) => slice.reduce((total, d) => total + d.count, 0);

	const recent = sum(days.slice(-TREND_WINDOW));
	const previous = sum(days.slice(-TREND_WINDOW * 2, -TREND_WINDOW));
	const delta = recent - previous;

	return {
		recent,
		previous,
		delta,
		direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
	};
}
