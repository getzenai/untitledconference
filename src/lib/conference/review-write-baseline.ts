/**
 * The saved scorecard a tab thinks it is editing (#748).
 *
 * Two tabs that loaded the same review both believe they hold the latest.
 * The second Save is last-write-wins unless the POST names this snapshot
 * and the server refuses when it no longer matches.
 */
export function reviewWriteBaseline(input: {
	status: string;
	comment: string;
	scores: Record<number, string>;
}): string {
	const scores: Record<string, string> = {};
	for (const id of Object.keys(input.scores)
		.map(Number)
		.filter((id) => Number.isInteger(id))
		.sort((a, b) => a - b)) {
		scores[String(id)] = input.scores[id] ?? '';
	}
	return JSON.stringify({ status: input.status, comment: input.comment, scores });
}

export function scoresFromCriteria(
	criteria: {
		id: number;
		kind: string;
		value: number | null;
		valueText: string | null;
	}[]
): Record<number, string> {
	const scores: Record<number, string> = {};
	for (const criterion of criteria) {
		scores[criterion.id] =
			criterion.kind === 'rating'
				? criterion.value === null
					? ''
					: String(criterion.value)
				: (criterion.valueText ?? '');
	}
	return scores;
}
