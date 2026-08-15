/**
 * How a tool call is described in the panel (#676).
 *
 * The client has no list of write tools — the server decides what needs a yes
 * (`toolApproval`). So the confirmation card cannot say "this files a review";
 * it says the tool's name and shows the arguments the model filled in, which
 * is the part a human can actually judge.
 */
const MAX_VALUE = 200;

/** `update_talk` → `Update talk`. */
export function toolLabel(name: string): string {
	const words = name.replace(/[_-]+/g, ' ').trim();
	if (!words) return name;
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ToolInputLine {
	key: string;
	value: string;
}

/**
 * The arguments, flattened to one readable line each. Long values are cut —
 * a pasted abstract must not push the confirm button off the screen.
 */
export function toolInputLines(input: unknown): ToolInputLine[] {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
	return Object.entries(input as Record<string, unknown>)
		.filter(([, value]) => value !== undefined && value !== null && value !== '')
		.map(([key, value]) => ({ key: toolLabel(key), value: formatValue(value) }));
}

function formatValue(value: unknown): string {
	const raw =
		typeof value === 'string'
			? value
			: typeof value === 'number' || typeof value === 'boolean'
				? String(value)
				: JSON.stringify(value);
	const text = (raw ?? '').replace(/\s+/g, ' ').trim();
	return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
}
