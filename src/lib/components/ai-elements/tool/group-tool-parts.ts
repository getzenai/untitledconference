/**
 * Consecutive tool parts become one run. Empty text and `step-start` are
 * transparent so they cannot split a lookup streak. An approval card is not
 * a tool line — it stays a single segment so it cannot fold (#720).
 */

export type ToolUIPartState =
	| 'input-streaming'
	| 'input-available'
	| 'output-available'
	| 'output-error'
	| 'output-denied'
	| 'approval-requested';

export interface GenericPart {
	type: string;
	state?: ToolUIPartState;
	input?: unknown;
	output?: unknown;
	errorText?: string;
	text?: string;
	[key: string]: unknown;
}

export interface ToolPart {
	type: string;
	state: Exclude<ToolUIPartState, 'approval-requested'>;
	input?: unknown;
	output?: unknown;
	errorText?: string;
}

export interface SingleSegment {
	kind: 'single';
	part: GenericPart;
	index: number;
}

export interface ToolGroupSegment {
	kind: 'tool-group';
	parts: ToolPart[];
	startIndex: number;
}

export type DisplaySegment = SingleSegment | ToolGroupSegment;

function isGroupableTool(part: GenericPart): boolean {
	return part.type.startsWith('tool-') && part.state !== 'approval-requested';
}

function isTransparentPart(part: GenericPart): boolean {
	if (part.type === 'step-start') return true;
	if (part.type === 'text' && (!part.text || part.text.trim() === '')) return true;
	return false;
}

/**
 * Where the folded "Used N tools" summary ends and the visible tail starts.
 * While work is in flight the last `tailCount` lines stay open; once the run
 * is done everything folds. Fewer than `minCollapse` earlier lines is not
 * worth a summary, so the split snaps to 0.
 */
export function toolGroupSplit(
	count: number,
	live: boolean,
	tailCount = 2,
	minCollapse = 2
): number {
	const candidate = count - (live ? tailCount : 0);
	return candidate < minCollapse ? 0 : candidate;
}

/**
 * Folded-run line. A hidden error or a hidden denial is named here —
 * "Used 3 tools" would otherwise swallow a write the user refused (#720).
 */
export function toolGroupSummary(parts: Pick<ToolPart, 'state'>[]): string {
	const n = parts.length;
	const noun = n === 1 ? 'tool' : 'tools';
	const errors = parts.filter((part) => part.state === 'output-error').length;
	const denied = parts.filter((part) => part.state === 'output-denied').length;
	const notes: string[] = [];
	if (errors > 0) notes.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
	if (denied > 0) notes.push(`${denied} not done`);
	return notes.length > 0 ? `Used ${n} ${noun} (${notes.join(', ')})` : `Used ${n} ${noun}`;
}

export function groupMessageParts(parts: GenericPart[]): DisplaySegment[] {
	const segments: DisplaySegment[] = [];
	let currentToolRun: ToolPart[] = [];
	let toolRunStartIndex = 0;

	const flushTools = () => {
		if (currentToolRun.length === 0) return;
		segments.push({
			kind: 'tool-group',
			parts: currentToolRun,
			startIndex: toolRunStartIndex
		});
		currentToolRun = [];
	};

	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		if (isGroupableTool(part)) {
			if (currentToolRun.length === 0) toolRunStartIndex = index;
			currentToolRun.push(part as ToolPart);
			continue;
		}
		if (isTransparentPart(part)) continue;
		flushTools();
		segments.push({ kind: 'single', part, index });
	}
	flushTools();
	return segments;
}
