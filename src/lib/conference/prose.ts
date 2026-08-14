/**
 * Organizer-authored call text, parsed into a small typed tree the page renders
 * as text nodes.
 *
 * A real call for papers is long: the AI Engineer NYC call is ~2,000 words with
 * a heading per section, bold on the facts that decide whether you bother, rules
 * between sections, and links out to the conference and to past talks (#509).
 * Written into a box that knows only paragraphs and bullets, it arrives as one
 * undifferentiated run of grey text with the URLs sitting there as characters to
 * select and copy.
 *
 * So this understands the common subset of markdown — headings, bullet and
 * numbered lists, rules, bold, italic, code, links, bare URLs — and nothing
 * else. What it is NOT is a markdown-to-HTML renderer: it returns structured
 * values, never markup, and the page prints their `text` fields as text nodes.
 * That keeps the original guarantee of this file — no input can produce markup
 * on a public page — while the formatting an organizer types actually lands.
 * The one place a value reaches an attribute is a link's `href`, so a URL is
 * only kept when its scheme is http, https or mailto; anything else (including
 * `javascript:`) stays literal text.
 */

export type Inline =
	| { kind: 'text'; text: string }
	| { kind: 'strong'; text: string }
	| { kind: 'em'; text: string }
	| { kind: 'code'; text: string }
	| { kind: 'link'; text: string; href: string };

export type ProseBlock =
	| { kind: 'paragraph'; content: Inline[] }
	/** `#`, `##`, `###` — page-relative, since the call's own title is the `h2`. */
	| { kind: 'heading'; level: 3 | 4 | 5; content: Inline[] }
	| { kind: 'list'; ordered: boolean; items: Inline[][] }
	| { kind: 'rule' };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-·*+]\s+/;
const NUMBER = /^\s*\d{1,9}[.)]\s+/;
/** `---`, `***`, `___` on a line of their own. Checked before the bullet. */
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

const SAFE_SCHEME = /^(?:https?:\/\/|mailto:)/i;

/**
 * The inline shapes, tried in this order at each position. Every pattern is
 * sticky: it matches where the cursor stands or not at all, so one pass over the
 * line finds everything and a long call costs its length, not its length times
 * the number of links in it.
 *
 * Code comes first, so a backticked `**not bold**` stays as typed; the explicit
 * link before the bare URL, so the URL inside `[text](url)` is not read twice.
 */
const INLINE = [
	{ kind: 'code', re: /`([^`\n]+)`/y },
	{ kind: 'link', re: /\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)/y },
	{ kind: 'strong', re: /\*\*(?!\s)([^*\n]+?)\*\*|__(?!\s)([^_\n]+?)__/y },
	{
		kind: 'em',
		re: /(?<![*\w])\*(?!\s)([^*\n]+?)\*(?![*\w])|(?<![_\w])_(?!\s)([^_\n]+?)_(?![_\w])/y
	},
	{ kind: 'url', re: /\bhttps?:\/\/[^\s<>()[\]]+/y }
] as const;

/** Trailing punctuation belongs to the sentence, not to a bare URL. */
const TRAILING = /[.,;:!?'"]+$/;

function pushText(out: Inline[], text: string) {
	if (!text) return;
	const last = out[out.length - 1];
	if (last?.kind === 'text') last.text += text;
	else out.push({ kind: 'text', text });
}

/**
 * Parse one line's inline markup. Nesting is not supported on purpose: the
 * content of a link, of bold or of code is plain text, which is what an
 * organizer writing a call actually needs and keeps the tree flat enough that
 * the page can render it without recursion.
 */
export function inlineNodes(line: string): Inline[] {
	const out: Inline[] = [];
	let cursor = 0;
	let plain = 0;

	while (cursor < line.length) {
		const found = matchAt(line, cursor);

		if (!found) {
			cursor += 1;
			continue;
		}

		pushText(out, line.slice(plain, cursor));
		out.push(found.node);
		cursor += found.length;
		plain = cursor;
	}

	pushText(out, line.slice(plain));
	return out;
}

/** The first shape that starts exactly at `at`, or nothing. */
function matchAt(line: string, at: number): { node: Inline; length: number } | null {
	for (const shape of INLINE) {
		shape.re.lastIndex = at;
		const match = shape.re.exec(line);
		if (!match) continue;

		const node = inlineNode(shape.kind, match);
		if (node) return node;
	}

	return null;
}

function inlineNode(
	kind: (typeof INLINE)[number]['kind'],
	match: RegExpExecArray
): { node: Inline; length: number } | null {
	const whole = match[0];

	if (kind === 'code') return { node: { kind: 'code', text: match[1] }, length: whole.length };

	if (kind === 'link') {
		const href = match[2];
		// An unsafe or relative target is not a link; leaving the source literal
		// tells the organizer their link did not take, rather than silently
		// swallowing the text of it.
		if (!SAFE_SCHEME.test(href)) return null;
		return { node: { kind: 'link', text: match[1], href }, length: whole.length };
	}

	if (kind === 'url') {
		const href = whole.replace(TRAILING, '');
		return { node: { kind: 'link', text: href, href }, length: href.length };
	}

	const text = match[1] ?? match[2];
	return { node: { kind: kind === 'strong' ? 'strong' : 'em', text }, length: whole.length };
}

type Line =
	| { kind: 'blank' }
	| { kind: 'rule' }
	| { kind: 'heading'; level: 3 | 4 | 5; text: string }
	| { kind: 'item'; ordered: boolean; text: string }
	| { kind: 'text'; text: string };

/** What one trimmed line is, before anything is decided about its neighbours. */
function classify(line: string): Line {
	if (!line) return { kind: 'blank' };
	// Before the bullet: `***` is a rule, not a list of one asterisk.
	if (RULE.test(line)) return { kind: 'rule' };

	const heading = HEADING.exec(line);
	if (heading) {
		return {
			kind: 'heading',
			level: (2 + heading[1].length) as 3 | 4 | 5,
			text: heading[2].trim()
		};
	}

	if (BULLET.test(line)) return { kind: 'item', ordered: false, text: line.replace(BULLET, '') };
	if (NUMBER.test(line)) return { kind: 'item', ordered: true, text: line.replace(NUMBER, '') };

	return { kind: 'text', text: line };
}

/**
 * Split organizer text into blocks. Returns an empty array for empty or
 * whitespace-only input, so callers can test `.length` instead of trimming twice.
 */
export function proseBlocks(source: string | null | undefined): ProseBlock[] {
	if (!source) return [];

	const blocks: ProseBlock[] = [];
	let paragraph: string[] = [];
	let items: string[] = [];
	let ordered = false;

	const flushParagraph = () => {
		if (!paragraph.length) return;
		blocks.push({ kind: 'paragraph', content: inlineNodes(paragraph.join(' ')) });
		paragraph = [];
	};

	const flushList = () => {
		if (!items.length) return;
		blocks.push({ kind: 'list', ordered, items: items.map(inlineNodes) });
		items = [];
	};

	const flush = () => {
		flushParagraph();
		flushList();
	};

	for (const raw of source.split(/\r?\n/)) {
		const line = classify(raw.trim());

		if (line.kind === 'blank') {
			flush();
		} else if (line.kind === 'rule') {
			flush();
			blocks.push({ kind: 'rule' });
		} else if (line.kind === 'heading') {
			flush();
			blocks.push({ kind: 'heading', level: line.level, content: inlineNodes(line.text) });
		} else if (line.kind === 'item') {
			// A bullet ends a paragraph without needing a blank line between them —
			// which is how people actually type a lead-in followed by a list. A list
			// that changes marker is a new list, not a continuation.
			flushParagraph();
			if (items.length && line.ordered !== ordered) flushList();
			ordered = line.ordered;
			items.push(line.text);
		} else {
			flushList();
			paragraph.push(line.text);
		}
	}

	flush();
	return blocks;
}
