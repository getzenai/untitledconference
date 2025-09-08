import { Extension } from '@tiptap/core';

export const TabHandler = Extension.create({
	name: 'tabHandler',

	addKeyboardShortcuts() {
		return {
			Tab: ({ editor }) => {
				// Check if we're in a list context
				if (editor.can().sinkListItem('listItem')) {
					return editor.commands.sinkListItem('listItem');
				}

				// Just prevent focus loss without inserting anything
				return true;
			},
			'Shift-Tab': ({ editor }) => {
				// Check if we can lift the list item
				if (editor.can().liftListItem('listItem')) {
					return editor.commands.liftListItem('listItem');
				}

				// Return true to prevent focus loss but don't insert anything
				return true;
			}
		};
	}
});
