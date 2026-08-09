import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { MAX_CONTENT_NESTING_DEPTH, VALIDATION_ERRORS } from './validation-constants';

/**
 * mdast node types the Milkdown editor can represent.
 * This mirrors the commonmark + gfm presets configured in MilkdownEditor.svelte —
 * anything outside this set would be silently dropped or rendered as raw text.
 */
const SUPPORTED_NODE_TYPES = new Set([
	'root',
	'paragraph',
	'heading',
	'text',
	'emphasis',
	'strong',
	'delete',
	'inlineCode',
	'code',
	'blockquote',
	'list',
	'listItem',
	'thematicBreak',
	'break',
	'link',
	'image',
	'table',
	'tableRow',
	'tableCell',
	'footnoteDefinition',
	'footnoteReference'
]);

const SUPPORTED_NODE_LIST = [...SUPPORTED_NODE_TYPES].filter((type) => type !== 'root').join(', ');

interface MdastNode {
	type: string;
	children?: MdastNode[];
}

const processor = unified().use(remarkParse).use(remarkGfm);

function parseMarkdown(markdown: string): MdastNode {
	return processor.parse(markdown) as unknown as MdastNode;
}

function inspect(node: MdastNode, depth: number): { unsupported?: string; depth: number } {
	if (!SUPPORTED_NODE_TYPES.has(node.type)) {
		return { unsupported: node.type, depth };
	}

	let maxDepth = depth;
	for (const child of node.children ?? []) {
		const result = inspect(child, depth + 1);
		if (result.unsupported) {
			return result;
		}
		maxDepth = Math.max(maxDepth, result.depth);
	}

	return { depth: maxDepth };
}

/**
 * Validate markdown against the constructs the editor can round-trip.
 *
 * Used for AI generated content: whatever comes back from the provider has to
 * survive a markdown -> ProseMirror -> markdown round trip, otherwise inserting
 * it into the document loses information.
 */
export function validateMarkdownContent(content: unknown): {
	isValid: boolean;
	markdown?: string;
	error?: string;
	details?: string;
} {
	if (typeof content !== 'string') {
		return {
			isValid: false,
			error: 'Content must be a markdown string',
			details: `Received type: ${Array.isArray(content) ? 'array' : typeof content}`
		};
	}

	const markdown = content.trim();

	if (markdown.length === 0) {
		return {
			isValid: false,
			error: 'Content must be a markdown string',
			details: 'Received an empty string'
		};
	}

	let tree: MdastNode;
	try {
		tree = parseMarkdown(markdown);
	} catch (error) {
		return {
			isValid: false,
			error: 'Invalid markdown content',
			details: error instanceof Error ? error.message : 'Unknown parser error'
		};
	}

	const { unsupported, depth } = inspect(tree, 0);

	if (unsupported) {
		const details =
			unsupported === 'html'
				? 'Raw HTML is not supported. Use markdown syntax instead of HTML tags.'
				: `Unsupported markdown construct "${unsupported}". Supported constructs are: ${SUPPORTED_NODE_LIST}`;

		return { isValid: false, error: 'Invalid markdown content', details };
	}

	if (depth > MAX_CONTENT_NESTING_DEPTH) {
		return {
			isValid: false,
			error: 'Invalid markdown content',
			details: VALIDATION_ERRORS.CONTENT_TOO_DEEP
		};
	}

	return { isValid: true, markdown };
}
