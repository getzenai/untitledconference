import { Extension } from '@tiptap/core';

export const ListIndent = Extension.create({
	name: 'listIndent',

	addKeyboardShortcuts() {
		return {
			Tab: ({ editor }) => {
				const { state } = editor.view;
				const { selection } = state;
				const { $from } = selection;

				// Check if we're in a list item
				const listItem = $from.node($from.depth);
				if (listItem.type.name !== 'listItem') {
					return false;
				}

				// Get the parent list type
				const parentList = $from.node($from.depth - 1);
				const listType = parentList.type.name === 'bulletList' ? 'bulletList' : 'orderedList';

				// Use standard wrapInList command for indentation
				// This creates a nested list without parent-child constraints
				if (listType === 'bulletList') {
					return editor.commands.wrapInList('bulletList');
				} else {
					return editor.commands.wrapInList('orderedList');
				}
			},

			'Shift-Tab': ({ editor }) => {
				const { state } = editor.view;
				const { selection } = state;
				const { $from } = selection;

				// Check if we're in a list item
				const listItem = $from.node($from.depth);
				if (listItem.type.name !== 'listItem') {
					return false;
				}

				// Try to outdent by lifting the list item
				return editor.chain().focus().liftListItem('listItem').run();
			}
		};
	}
});
