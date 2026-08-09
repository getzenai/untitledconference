import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';

const toolbarStateKey = new PluginKey('documentEditorToolbarState');

/**
 * Reports editor state to the toolbar on every update, including selection-only
 * changes, so the format toggles reflect the caret position.
 */
export function toolbarStatePlugin(onStateChange: (state: EditorState) => void) {
	return $prose(
		() =>
			new Plugin({
				key: toolbarStateKey,
				view: (view) => {
					onStateChange(view.state);
					return { update: (updatedView) => onStateChange(updatedView.state) };
				}
			})
	);
}
