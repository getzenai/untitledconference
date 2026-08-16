/**
 * A tool already running when the user stops cannot be un-written.
 * One that has not started yet must not start (#731).
 */
import type { Tool } from 'ai';

export function refuseNewToolsAfterAbort(
	tools: Record<string, Tool>,
	signal: AbortSignal
): Record<string, Tool> {
	return Object.fromEntries(
		Object.entries(tools).map(([name, definition]) => {
			const execute = definition.execute;
			if (!execute) return [name, definition];
			return [
				name,
				{
					...definition,
					execute: async (input: never, options: never) => {
						if (signal.aborted) {
							return { error: 'Stopped before this tool started.' };
						}
						return execute(input, options);
					}
				}
			];
		})
	);
}
