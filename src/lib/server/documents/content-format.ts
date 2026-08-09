/**
 * Document content used to be stored as ProseMirror (TipTap) JSON.
 * Since the migration to Milkdown the storage format is markdown, but rows
 * written before the migration still hold the old JSON document.
 *
 * `toMarkdown` is the single read path for `documents.content`: it passes
 * markdown through untouched and converts legacy ProseMirror documents on the fly.
 */

interface ProseMirrorMark {
	type?: string;
	attrs?: Record<string, unknown>;
}

interface ProseMirrorNode {
	type?: string;
	attrs?: Record<string, unknown>;
	content?: ProseMirrorNode[];
	marks?: ProseMirrorMark[];
	text?: string;
}

function isProseMirrorDoc(value: unknown): value is ProseMirrorNode {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		(value as ProseMirrorNode).type === 'doc'
	);
}

function escapeMarkdown(text: string): string {
	return text.replace(/([\\`*_[\]<>])/g, '\\$1');
}

function hasMark(node: ProseMirrorNode, type: string): boolean {
	return (node.marks ?? []).some((mark) => mark.type === type);
}

function serializeInline(nodes: ProseMirrorNode[]): string {
	return nodes
		.map((node) => {
			if (node.type === 'hardBreak') {
				return '\\\n';
			}
			if (node.type !== 'text' || typeof node.text !== 'string') {
				return serializeInline(node.content ?? []);
			}

			let text = hasMark(node, 'code')
				? `\`${node.text}\``
				: escapeMarkdown(node.text).replace(/\n/g, ' ');

			if (hasMark(node, 'strike')) text = `~~${text}~~`;
			if (hasMark(node, 'bold')) text = `**${text}**`;
			if (hasMark(node, 'italic')) text = `*${text}*`;

			const link = (node.marks ?? []).find((mark) => mark.type === 'link');
			if (link) {
				text = `[${text}](${String(link.attrs?.href ?? '')})`;
			}

			return text;
		})
		.join('');
}

function rawText(nodes: ProseMirrorNode[]): string {
	return nodes.map((node) => node.text ?? rawText(node.content ?? [])).join('');
}

function withMarker(marker: string, body: string): string {
	const padding = ' '.repeat(marker.length);
	return body
		.split('\n')
		.map((line, index) => {
			if (index === 0) return marker + line;
			return line.length > 0 ? padding + line : '';
		})
		.join('\n');
}

function serializeList(node: ProseMirrorNode, ordered: boolean): string {
	const start = ordered ? Number(node.attrs?.start ?? 1) || 1 : 0;

	return (node.content ?? [])
		.map((item, index) => {
			const marker = ordered ? `${start + index}. ` : '- ';
			return withMarker(marker, serializeBlocks(item.content ?? []));
		})
		.join('\n');
}

function serializeBlock(node: ProseMirrorNode): string {
	switch (node.type) {
		case 'paragraph':
			return serializeInline(node.content ?? []);
		case 'heading': {
			const level = Math.min(Math.max(Number(node.attrs?.level ?? 1) || 1, 1), 6);
			return `${'#'.repeat(level)} ${serializeInline(node.content ?? [])}`;
		}
		case 'codeBlock': {
			const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
			return `\`\`\`${language}\n${rawText(node.content ?? [])}\n\`\`\``;
		}
		case 'horizontalRule':
			return '---';
		case 'blockquote':
			return serializeBlocks(node.content ?? [])
				.split('\n')
				.map((line) => (line.length > 0 ? `> ${line}` : '>'))
				.join('\n');
		case 'bulletList':
			return serializeList(node, false);
		case 'orderedList':
			return serializeList(node, true);
		default:
			return node.content ? serializeBlocks(node.content) : serializeInline([node]);
	}
}

function serializeBlocks(nodes: ProseMirrorNode[]): string {
	return nodes
		.map(serializeBlock)
		.filter((block) => block.length > 0)
		.join('\n\n');
}

/**
 * Convert a legacy ProseMirror/TipTap document to markdown.
 */
export function proseMirrorJsonToMarkdown(doc: unknown): string {
	if (!isProseMirrorDoc(doc)) {
		return '';
	}
	return serializeBlocks(doc.content ?? []).trim();
}

/**
 * Read `documents.content` as markdown, converting legacy ProseMirror JSON.
 */
export function toMarkdown(stored: unknown): string {
	if (stored === null || stored === undefined) {
		return '';
	}

	if (typeof stored === 'string') {
		const trimmed = stored.trim();
		if (!trimmed.startsWith('{')) {
			return stored;
		}

		try {
			const parsed: unknown = JSON.parse(trimmed);
			return isProseMirrorDoc(parsed) ? proseMirrorJsonToMarkdown(parsed) : stored;
		} catch {
			return stored;
		}
	}

	return proseMirrorJsonToMarkdown(stored);
}
