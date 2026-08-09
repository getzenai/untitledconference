import { serializerCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { Fragment, type Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { $prose, getMarkdown } from '@milkdown/kit/utils';

/** Characters of markdown before and after the selection sent as context. */
const CONTEXT_RADIUS = 500;

/** Documents larger than this are not sent to the AI in full. */
const MAX_FULL_DOCUMENT_SIZE = 10000;

export interface AIContextMenuEvent {
	x: number;
	y: number;
	/** Document positions the transformation result has to replace. */
	range: { from: number; to: number };
	selectedMarkdown: string;
	documentContext: {
		surroundingContent: string;
		fullDocument: string | null;
	};
}

const aiContextMenuKey = new PluginKey('documentEditorAiContextMenu');

/**
 * Serialize a document range to markdown.
 *
 * Deliberately not `getMarkdown(range)`: that keeps the parent nodes of open
 * positions, which turns a selection inside one paragraph into `<br />` noise.
 */
function serializeRange(ctx: Ctx, doc: ProseNode, range: { from: number; to: number }): string {
	const { schema } = doc.type;
	const { content } = doc.slice(range.from, range.to);

	// A selection inside a single text block slices down to inline content, which
	// is not a valid document on its own — wrap it in a paragraph first.
	const blocks = content.firstChild?.isInline
		? Fragment.from(schema.nodes.paragraph.createAndFill(null, content))
		: content;

	const fragment = schema.topNodeType.createAndFill(null, blocks);
	return fragment ? ctx.get(serializerCtx)(fragment).trim() : '';
}

/** Grow a range outwards to whole top level blocks. */
function toBlockRange(doc: ProseNode, from: number, to: number) {
	const clamp = (pos: number) => Math.max(0, Math.min(pos, doc.content.size));
	const start = doc.resolve(clamp(from));
	const end = doc.resolve(clamp(to));

	return {
		from: start.depth > 0 ? start.before(1) : 0,
		to: end.depth > 0 ? end.after(1) : doc.content.size
	};
}

/**
 * Opens the AI assistant on right click and hands out the selection as markdown.
 *
 * The range is always something markdown can describe on its own: the block under
 * the cursor when nothing is selected, the selection itself while it stays inside
 * one block, and whole blocks as soon as it spans several.
 */
export function aiContextMenuPlugin(onContextMenu: (event: AIContextMenuEvent) => void) {
	return $prose(
		(ctx: Ctx) =>
			new Plugin({
				key: aiContextMenuKey,
				props: {
					handleDOMEvents: {
						contextmenu: (view, event) => {
							event.preventDefault();

							const { doc, selection } = view.state;
							const { $from, $to, empty, from, to } = selection;

							let range: { from: number; to: number };
							if (empty) {
								range =
									$from.depth > 0
										? { from: $from.before(), to: $from.after() }
										: { from: 0, to: doc.content.size };
							} else if ($from.sameParent($to)) {
								range = { from, to };
							} else {
								range = toBlockRange(doc, from, to);
							}

							const contextRange = toBlockRange(
								doc,
								range.from - CONTEXT_RADIUS,
								range.to + CONTEXT_RADIUS
							);

							onContextMenu({
								x: event.clientX,
								y: event.clientY,
								range,
								selectedMarkdown: serializeRange(ctx, doc, range),
								documentContext: {
									surroundingContent: serializeRange(ctx, doc, contextRange),
									fullDocument:
										doc.content.size < MAX_FULL_DOCUMENT_SIZE ? getMarkdown()(ctx).trim() : null
								}
							});

							return true;
						}
					}
				}
			})
	);
}
