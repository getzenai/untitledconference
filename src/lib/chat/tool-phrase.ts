/**
 * A readable line for a tool call, derived from the `verb_noun` name (#720).
 *
 * Do not keep a per-tool map: the registry grows every week and a hand-written
 * list goes stale as `undefined`. The phrase is the verb (or "Looking up" for
 * list/get) plus the rest of the name. A name with no object is just the
 * verb — "Refreshing", not "Refreshing refresh". Context is a name, title
 * or id from the arguments when one is present.
 */

import type { ToolUIPartState } from '$lib/components/ai-elements/tool/group-tool-parts';

const LOOKUP = new Set(['list', 'get']);

const CONTEXT_KEYS = ['name', 'title', 'slug', 'conferenceSlug', 'id'] as const;

export function toolObject(name: string): string {
	const words = name.replace(/[_-]+/g, ' ').trim().split(/\s+/);
	return words.slice(1).join(' ');
}

function capitalize(text: string): string {
	if (!text) return text;
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function gerund(verb: string): string {
	if (verb.endsWith('ie')) return `${verb.slice(0, -2)}ying`;
	if (verb.endsWith('e') && !verb.endsWith('ee')) return `${verb.slice(0, -1)}ing`;
	return `${verb}ing`;
}

function past(verb: string): string {
	if (verb === 'set') return 'Set';
	if (verb === 'run') return 'Ran';
	if (verb === 'send') return 'Sent';
	if (verb === 'find') return 'Found';
	if (verb.endsWith('y') && verb.length > 1 && !/[aeiou]y$/.test(verb)) {
		return `${verb.slice(0, -1)}ied`;
	}
	if (verb.endsWith('e')) return `${verb}d`;
	return `${verb}ed`;
}

function withObject(head: string, object: string): string {
	return object ? `${head} ${object}` : head;
}

function live(state: ToolUIPartState): boolean {
	return state === 'input-streaming' || state === 'input-available';
}

/** Name + state → one short phrase. Never `undefined`. */
export function toolPhrase(name: string, state: ToolUIPartState): string {
	const object = toolObject(name);
	const verb = (name.split(/[_-]/)[0] ?? name).toLowerCase();

	if (state === 'output-denied') return `${capitalize(object || verb)} — not done`;
	if (state === 'output-error') {
		return LOOKUP.has(verb)
			? withObject("Couldn't look up", object)
			: withObject(`Couldn't ${verb}`, object);
	}

	if (LOOKUP.has(verb)) {
		if (live(state)) return withObject('Looking up', object);
		return object ? capitalize(object) : 'Looked up';
	}
	if (live(state)) return withObject(capitalize(gerund(verb)), object);
	return withObject(capitalize(past(verb)), object);
}

/** A name, title or id from the arguments, when the model filled one in. */
export function toolContext(input: unknown): string | null {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
	const row = input as Record<string, unknown>;
	for (const key of CONTEXT_KEYS) {
		const value = row[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
		if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	}
	return null;
}
