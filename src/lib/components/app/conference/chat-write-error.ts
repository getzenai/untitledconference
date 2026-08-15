/**
 * The refusal shape both chat panels have to read.
 *
 * A tool that refuses still finishes: the part arrives as `output-available`
 * with `{ error }` on it, and nothing behind the panel changed. Both the
 * agenda board and the reviewer queue have to tell that apart from a write,
 * so the test lives once and the sentence is theirs (#302).
 */
export function chatWriteError(output: unknown): string | null {
	if (typeof output !== 'object' || output === null) return null;
	const error = (output as { error?: unknown }).error;
	if (typeof error !== 'string' || error.trim() === '') return null;
	return error.trim();
}
