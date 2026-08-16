/**
 * The verdict on one finished turn.
 *
 * `length` with nothing to show is not an answer, so it must not be reported as
 * one. `no_tool_call` says the model read the question and chose prose — that is
 * #660, and the printed text is what the user would have seen. A truncated turn
 * produced no choice at all; calling it #660 sends the next reader to the model
 * when the fault is the budget that cut it off (#700).
 *
 * Exported so the classification can be tested without a gateway: every other
 * part of this script needs a key, and the part that decides what a run means
 * is the part worth pinning.
 *
 * @param {{ calls: number, names: string[], expect: string, finish: string }} turn
 * @returns {'tool_call' | 'wrong_tool' | 'truncated' | 'no_tool_call'}
 */
export function classify({ calls, names, expect, finish }) {
	if (calls > 0) return names.includes(expect) ? 'tool_call' : 'wrong_tool';
	return finish === 'length' ? 'truncated' : 'no_tool_call';
}
