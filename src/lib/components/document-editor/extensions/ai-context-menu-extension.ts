import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface AIContextMenuOptions {
	onContextMenu: (params: {
		editor: Editor;
		x: number;
		y: number;
		selectedContent: Record<string, unknown> | null;
		documentContext: Record<string, unknown> | null;
	}) => void;
}

export const AIContextMenu = Extension.create<AIContextMenuOptions>({
	name: 'aiContextMenu',

	addOptions() {
		return {
			onContextMenu: () => {}
		};
	},

	addProseMirrorPlugins() {
		const { onContextMenu } = this.options;
		const editor = this.editor;

		return [
			new Plugin({
				key: new PluginKey('aiContextMenu'),
				props: {
					handleDOMEvents: {
						contextmenu: (view, event) => {
							// Prevent default browser context menu
							event.preventDefault();

							// Get the current selection
							const { from, to } = view.state.selection;
							const isEmpty = from === to;

							// Get mouse position
							const x = event.clientX;
							const y = event.clientY;

							// Extract selected content as JSON
							let selectedContent = null;
							if (!isEmpty) {
								// Get the selected slice
								const slice = view.state.doc.slice(from, to);

								// Convert to JSON
								selectedContent = slice.content.toJSON();

								// If it's a single node, unwrap it
								if (Array.isArray(selectedContent) && selectedContent.length === 1) {
									selectedContent = selectedContent[0];
								}
							} else {
								// No selection - get the node at cursor position
								const pos = view.posAtCoords({ left: x, top: y });
								if (pos) {
									const node = view.state.doc.nodeAt(pos.pos);
									if (node) {
										selectedContent = node.toJSON();
									}
								}
							}

							// Extract document context (surrounding text)
							let documentContext = null;
							const doc = view.state.doc;

							// Get broader context around the selection
							const contextRadius = 500; // characters before and after
							const docSize = doc.content.size;

							// Calculate context boundaries
							const contextFrom = Math.max(0, from - contextRadius);
							const contextTo = Math.min(docSize, to + contextRadius);

							// Get the context slice
							const contextSlice = doc.slice(contextFrom, contextTo);
							documentContext = {
								// Full document for better understanding (limited to reasonable size)
								fullDocument: doc.content.size < 10000 ? doc.toJSON() : null,
								// Surrounding context
								surroundingContent: contextSlice.content.toJSON(),
								// Position information
								selectionInfo: {
									from,
									to,
									contextFrom,
									contextTo,
									isEmpty
								}
							};

							// Store the current selection before opening menu
							// This keeps the selection visible in the editor
							editor.commands.focus();

							// Trigger the context menu callback
							onContextMenu({
								editor,
								x,
								y,
								selectedContent,
								documentContext
							});

							return true; // Prevent default handling
						}
					}
				}
			})
		];
	}
});
