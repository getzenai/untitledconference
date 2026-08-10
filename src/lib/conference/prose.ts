/**
 * Organizer-authored plain text, rendered as the two shapes it is ever written in.
 *
 * The call for papers carries a block of text the organizer maintains (what the
 * programme is looking for, what a submitter should know before starting). It is
 * NOT markdown: it is public text on a page anyone can read, and a markdown
 * renderer is an HTML-injection surface plus a dependency, in exchange for
 * formatting nobody asked for.
 *
 * Two shapes cover what the prototype's box actually contains:
 *  - a blank line starts a new paragraph;
 *  - consecutive lines starting with `-` or `·` are one bullet list.
 *
 * Everything else stays literal, and the page renders the pieces as text nodes,
 * so no input can produce markup.
 */

export type ProseBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] };

const BULLET = /^\s*[-·*]\s+/;

/**
 * Split organizer text into blocks. Returns an empty array for empty or
 * whitespace-only input, so callers can test `.length` instead of trimming twice.
 */
export function proseBlocks(source: string | null | undefined): ProseBlock[] {
	if (!source) return [];

	const blocks: ProseBlock[] = [];
	let paragraph: string[] = [];
	let list: string[] = [];

	const flush = () => {
		if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
		if (list.length) blocks.push({ kind: 'list', items: list });
		paragraph = [];
		list = [];
	};

	for (const raw of source.split(/\r?\n/)) {
		const line = raw.trim();

		if (!line) {
			flush();
			continue;
		}

		if (BULLET.test(line)) {
			// A bullet ends a paragraph without needing a blank line between them —
			// which is how people actually type a lead-in followed by a list.
			if (paragraph.length) {
				blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
				paragraph = [];
			}
			list.push(line.replace(BULLET, ''));
			continue;
		}

		if (list.length) {
			blocks.push({ kind: 'list', items: list });
			list = [];
		}
		paragraph.push(line);
	}

	flush();
	return blocks;
}
