/**
 * The assistant answers in markdown. The panel used to print that as
 * characters, so a room list arrived as pipes and `**` (#703).
 *
 * This is the same idea as `$lib/conference/prose` — a typed tree, text
 * escaped, links only when the scheme is http/https/mailto — plus GFM
 * tables, which is what the model actually emits for a list of rooms.
 * The HTML string is the pipeline the panel paints and the unit test
 * sends the live room table through.
 */
import { inlineNodes, proseBlocks, type Inline, type ProseBlock } from '$lib/conference/prose';

export type AssistantTable = {
	kind: 'table';
	headers: Inline[][];
	rows: Inline[][][];
};

export type AssistantBlock = ProseBlock | AssistantTable;

/**
 * Name what the user can see. The live leak this is written against listed
 * rooms as `| ID | Name |` and then explained the ids — numbers the user
 * never sees on the board and cannot type into a slot.
 */
export const ASSISTANT_NAME_NOT_ID =
	'Name rooms, talks, people, and other records by the names the user sees on the page. ' +
	'Never mention internal database IDs, and do not put an ID column in a table. ' +
	'A room is "Main Stage", not "room 1" or id 1.';

export function assistantBlocks(source: string | null | undefined): AssistantBlock[] {
	if (!source) return [];

	const lines = source.split(/\r?\n/);
	const blocks: AssistantBlock[] = [];
	let prose: string[] = [];

	const flushProse = () => {
		if (!prose.length) return;
		blocks.push(...proseBlocks(prose.join('\n')));
		prose = [];
	};

	for (let i = 0; i < lines.length; i++) {
		const table = readTable(lines, i);
		if (table) {
			flushProse();
			blocks.push(table.block);
			i = table.last;
			continue;
		}
		prose.push(lines[i]);
	}

	flushProse();
	return blocks;
}

/**
 * Markdown in, escaped HTML out. The only tags in the result are ones this
 * function wrote; every text node and every href is escaped, and a
 * `javascript:` target never becomes a link.
 */
export function renderAssistantMarkdown(source: string | null | undefined): string {
	return assistantBlocks(source).map(renderBlock).join('');
}

function readTable(lines: string[], start: number): { block: AssistantTable; last: number } | null {
	const header = cells(lines[start]);
	if (!header || start + 1 >= lines.length) return null;
	if (!isSeparator(lines[start + 1], header.length)) return null;

	const rows: string[][] = [];
	let last = start + 1;
	for (let i = start + 2; i < lines.length; i++) {
		if (!lines[i].trim()) break;
		const row = cells(lines[i]);
		if (!row || isSeparator(lines[i], row.length)) break;
		rows.push(fit(row, header.length));
		last = i;
	}

	return {
		block: {
			kind: 'table',
			headers: header.map(inlineNodes),
			rows: rows.map((row) => row.map(inlineNodes))
		},
		last
	};
}

function cells(line: string | undefined): string[] | null {
	if (line === undefined) return null;
	const trimmed = line.trim();
	if (!trimmed.includes('|')) return null;

	let inner = trimmed;
	if (inner.startsWith('|')) inner = inner.slice(1);
	if (inner.endsWith('|')) inner = inner.slice(0, -1);

	const parts = inner.split('|').map((cell) => cell.trim());
	return parts.length >= 2 ? parts : null;
}

function isSeparator(line: string, columns: number): boolean {
	const parts = cells(line);
	if (!parts || parts.length !== columns) return false;
	return parts.every((part) => /^:?-+:?$/.test(part) && part.includes('-'));
}

function fit(row: string[], columns: number): string[] {
	if (row.length === columns) return row;
	if (row.length > columns) return row.slice(0, columns);
	return [...row, ...Array.from({ length: columns - row.length }, () => '')];
}

function renderBlock(block: AssistantBlock): string {
	if (block.kind === 'table') {
		const head = `<thead><tr>${block.headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`;
		const body =
			block.rows.length === 0
				? ''
				: `<tbody>${block.rows
						.map(
							(row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`
						)
						.join('')}</tbody>`;
		return `<div class="overflow-x-auto rounded-md border border-border"><table>${head}${body}</table></div>`;
	}

	if (block.kind === 'heading') {
		const tag = `h${block.level}`;
		return `<${tag}>${renderInline(block.content)}</${tag}>`;
	}

	if (block.kind === 'rule') return '<hr />';

	if (block.kind === 'paragraph') {
		return `<p>${renderInline(block.content)}</p>`;
	}

	const tag = block.ordered ? 'ol' : 'ul';
	const items = block.items.map((item) => `<li>${renderInline(item)}</li>`).join('');
	return `<${tag}>${items}</${tag}>`;
}

function renderInline(nodes: Inline[]): string {
	return nodes
		.map((node) => {
			if (node.kind === 'strong') return `<strong>${escapeHtml(node.text)}</strong>`;
			if (node.kind === 'em') return `<em>${escapeHtml(node.text)}</em>`;
			if (node.kind === 'code') return `<code>${escapeHtml(node.text)}</code>`;
			if (node.kind === 'link') {
				return (
					`<a href="${escapeHtml(node.href)}" rel="noopener noreferrer nofollow" ` +
					`target="_blank">${escapeHtml(node.text)}</a>`
				);
			}
			return escapeHtml(node.text);
		})
		.join('');
}

function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
